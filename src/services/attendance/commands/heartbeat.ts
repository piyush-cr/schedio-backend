import { format } from 'date-fns';
import { GeoPoint, isInsideGeofence } from '../../../lib/geofencing';
import attendanceCrud from '../../../crud/attendance.crud';
import userCrud from '../../../crud/user.crud';
import { DEFAULT_GEOFENCE_RADIUS } from '../_shared/geofence';
import {
  timeStringToMinutes,
  timestampToMinutesInTimezone,
} from '../_shared/time';

const TIMEZONE = 'Asia/Kolkata';

export interface HeartbeatInput {
  userId: string;
  latitude: number;
  longitude: number;
  fcmToken?: string;
}

const DEFAULT_OFFICE_LAT = 30.7068572;
const DEFAULT_OFFICE_LNG = 76.6904494;

export interface HeartbeatResult {
  checkedIn: boolean;
  insideGeofence: boolean;
  shiftOngoing: boolean;
  overtimeMinutes: number;
  totalGeofenceBreachMinutes: number;
  remainingBreachMinutes: number;
  shouldCheckout: boolean;
  message: string;
}

export async function heartbeat(
  input: HeartbeatInput,
): Promise<HeartbeatResult> {
  const { userId, latitude, longitude, fcmToken } = input;
  const now = Date.now();
  const today = format(now, 'yyyy-MM-dd');

  console.log(`[Heartbeat] ===== Heartbeat received =====`);
  console.log(
    `[Heartbeat] userId=${userId} lat=${latitude} lng=${longitude} time=${new Date(now).toISOString()}`,
  );

  // 1. Update user liveness + FCM token
  const userUpdate: any = { statusUpdatedAt: now };
  if (fcmToken) {
    userUpdate.fcmToken = fcmToken;
  }
  await userCrud.updateById(userId, userUpdate);
  console.log(
    `[Heartbeat] statusUpdatedAt updated to ${new Date(now).toISOString()}`,
  );

  const user = await userCrud.findById(userId);
  if (!user) {
    throw new Error('User not found');
  }

  console.log(
    `[Heartbeat] User loaded — shiftEnd=${user.shiftEnd} officeLat=${user.officeLat} officeLng=${user.officeLng} geofenceBreachTime=${user.geofenceBreachTime}`,
  );

  // 2. Check if user is checked in today
  const attendance = await attendanceCrud.findByUserIdAndDate(userId, today);
  if (!attendance || !attendance.clockInTime || attendance.clockOutTime) {
    console.log(
      `[Heartbeat] Not checked in or already checked out — attendance=${!!attendance} clockInTime=${attendance?.clockInTime} clockOutTime=${attendance?.clockOutTime}`,
    );
    return {
      checkedIn: false,
      insideGeofence: false,
      shiftOngoing: false,
      overtimeMinutes: 0,
      totalGeofenceBreachMinutes: 0,
      remainingBreachMinutes: 0,
      shouldCheckout: false,
      message: 'Not currently checked in.',
    };
  }

  console.log(
    `[Heartbeat] Attendance found — id=${attendance._id} clockInTime=${attendance.clockInTime} geofenceBreachedAt=${attendance.geofenceBreachedAt} totalGeofenceBreachMinutes=${attendance.totalGeofenceBreachMinutes}`,
  );

  // 3. Determine geofence status
  let insideGeofence = true;
  const officeLat = user.officeLat ?? DEFAULT_OFFICE_LAT;
  const officeLng = user.officeLng ?? DEFAULT_OFFICE_LNG;

  const userLocation: GeoPoint = { lat: latitude, lng: longitude };
  const officeGeofence = {
    center: { lat: officeLat, lng: officeLng },
    radius: DEFAULT_GEOFENCE_RADIUS,
  };
  insideGeofence = isInsideGeofence(userLocation, officeGeofence);
  console.log(
    `[Heartbeat] Geofence check — officeLat=${officeLat} officeLng=${officeLng} (${user.officeLat ? 'from DB' : 'default fallback'}) insideGeofence=${insideGeofence}`,
  );

  // 4. Determine shift status
  const currentMinutes = timestampToMinutesInTimezone(now, TIMEZONE);
  const shiftEndMinutes = user.shiftEnd
    ? timeStringToMinutes(user.shiftEnd)
    : 1080;
  const shiftOngoing = currentMinutes <= shiftEndMinutes;

  console.log(
    `[Heartbeat] Shift status — currentMinutes=${currentMinutes} shiftEndMinutes=${shiftEndMinutes} shiftOngoing=${shiftOngoing}`,
  );

  // 5. Calculate overtime
  let overtimeMinutes = 0;
  if (!shiftOngoing && user.shiftEnd) {
    overtimeMinutes = Math.max(0, currentMinutes - shiftEndMinutes);
    console.log(`[Heartbeat] Overtime — overtimeMinutes=${overtimeMinutes}`);
  }

  // 6. Geofence breach tracking (cumulative)
  const geofenceBreachThreshold = user.geofenceBreachTime ?? 15;
  let totalBreachMinutes = attendance.totalGeofenceBreachMinutes ?? 0;
  const activeBreachStart = attendance.geofenceBreachedAt as number | null;

  console.log(
    `[Heartbeat] Breach state before update — totalBreachMinutes=${totalBreachMinutes} activeBreachStart=${activeBreachStart ? new Date(activeBreachStart).toISOString() : 'null'} geofenceBreachThreshold=${geofenceBreachThreshold}`,
  );

  if (insideGeofence) {
    if (activeBreachStart) {
      const sessionMinutes = (now - activeBreachStart) / (1000 * 60);
      totalBreachMinutes += sessionMinutes;
      console.log(
        `[Heartbeat] User back inside — flushing breach session. sessionMinutes=${sessionMinutes.toFixed(2)} newTotalBreachMinutes=${totalBreachMinutes.toFixed(2)}`,
      );
      await attendanceCrud.updateById(attendance._id.toString(), {
        geofenceBreachedAt: null,
        totalGeofenceBreachMinutes: totalBreachMinutes,
      });
    } else {
      console.log(
        `[Heartbeat] User inside geofence — no active breach to flush`,
      );
    }
  } else {
    if (!activeBreachStart) {
      console.log(
        `[Heartbeat] User outside geofence — starting new breach session at ${new Date(now).toISOString()}`,
      );
      await attendanceCrud.updateById(attendance._id.toString(), {
        geofenceBreachedAt: now,
      });
    } else {
      // Ongoing breach — compute effective total for response only, do NOT persist yet
      // Persisting happens when user re-enters (flush) or on checkout
      const activeSessionMinutes = (now - activeBreachStart) / (1000 * 60);
      totalBreachMinutes = totalBreachMinutes + activeSessionMinutes;
      console.log(
        `[Heartbeat] User still outside — activeSessionMinutes=${activeSessionMinutes.toFixed(2)} effectiveTotal=${totalBreachMinutes.toFixed(2)} (not persisted yet)`,
      );
    }
  }

  // 7. Determine if app should trigger checkout
  const breachExceeded = totalBreachMinutes >= geofenceBreachThreshold;
  const shouldCheckout = !shiftOngoing && !insideGeofence && breachExceeded;

  console.log(
    `[Heartbeat] Checkout decision — breachExceeded=${breachExceeded} shiftOngoing=${shiftOngoing} insideGeofence=${insideGeofence} shouldCheckout=${shouldCheckout}`,
  );

  const remainingBreachMinutes = Math.max(
    0,
    geofenceBreachThreshold - totalBreachMinutes,
  );

  const result: HeartbeatResult = {
    checkedIn: true,
    insideGeofence,
    shiftOngoing,
    overtimeMinutes,
    totalGeofenceBreachMinutes: Math.round(totalBreachMinutes * 100) / 100,
    remainingBreachMinutes: Math.round(remainingBreachMinutes * 100) / 100,
    shouldCheckout,
    message: shouldCheckout
      ? 'Geofence breach limit exceeded after shift. Please check out.'
      : insideGeofence
        ? 'Inside geofence. All good.'
        : shiftOngoing
          ? 'Outside geofence during shift. Alert sent.'
          : `Outside geofence after shift. ${Math.round(remainingBreachMinutes)} min remaining before auto-checkout.`,
  };

  console.log(`[Heartbeat] Result — ${JSON.stringify(result)}`);
  console.log(`[Heartbeat] ===== Heartbeat done =====`);

  return result;
}
