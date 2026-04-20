import { format } from 'date-fns';
import { UserRole } from '../../../types';
import { GeoPoint, isInsideGeofence } from '../../../lib/geofencing';
import attendanceCrud from '../../../crud/attendance.crud';
import userCrud from '../../../crud/user.crud';
import { DEFAULT_GEOFENCE_RADIUS } from '../_shared/geofence';
import { sendNotification } from '../../../firebase/messaging';
import mongoose from 'mongoose';
import {
  timeStringToMinutes,
  timestampToMinutesInTimezone,
} from '../_shared/time';

export interface GeofenceBreachResult {
  action: 'ALERT' | 'CHECK_OUT' | 'BREACH_STARTED' | 'BREACH_ONGOING' | 'NONE';
  message: string;
  totalGeofenceBreachMinutes?: number;
  remainingMinutes?: number;
}

/**
 * Handles geofence breach reported by the mobile app.
 * Uses cumulative breach tracking: geofenceBreachedAt + totalGeofenceBreachMinutes.
 *
 * 1. During shift timings: Alert admin and notify user (no checkout).
 * 2. After shift timings: Track cumulative breach. If total >= user.geofenceBreachTime, auto-checkout.
 */
export async function autoCheckoutByGeofence(
  userId: string,
  latitude: number,
  longitude: number,
): Promise<GeofenceBreachResult> {
  const timestamp = Date.now();
  const date = format(timestamp, 'yyyy-MM-dd');
  const timezone = 'Asia/Kolkata';

  const user = await userCrud.findById(userId);
  if (!user) {
    throw new Error('User not found');
  }

  // 1. Check if user is clocked in today
  const attendance = await attendanceCrud.findByUserIdAndDate(userId, date);
  if (!attendance || attendance.clockOutTime) {
    return { action: 'NONE', message: 'User is not currently clocked in.' };
  }

  const DEFAULT_OFFICE_LAT = 30.7068572;
  const DEFAULT_OFFICE_LNG = 76.6904494;

  const officeLat = user.officeLat ?? DEFAULT_OFFICE_LAT;
  const officeLng = user.officeLng ?? DEFAULT_OFFICE_LNG;

  const userLocation: GeoPoint = { lat: latitude, lng: longitude };
  const officeGeofence = {
    center: { lat: officeLat, lng: officeLng },
    radius: DEFAULT_GEOFENCE_RADIUS,
  };

  if (isInsideGeofence(userLocation, officeGeofence)) {
    return { action: 'NONE', message: 'User is inside office range.' };
  }

  // 3. Determine if shift is ongoing
  const currentMinutes = timestampToMinutesInTimezone(timestamp, timezone);
  const shiftEndMinutes = user.shiftEnd
    ? timeStringToMinutes(user.shiftEnd)
    : 1080;
  const isShiftOngoing = currentMinutes <= shiftEndMinutes;

  if (isShiftOngoing) {
    // Case A: Shift is ongoing -> Send Alerts only
    // Throttle alerts to once every 15 minutes
    const lastSummarySent = attendance.checkoutReminderSentAt || 0;
    const cooldownMs = 55 * 60 * 1000; // 15 minutes

    if (timestamp - lastSummarySent > cooldownMs) {
      await attendanceCrud.updateById(attendance._id.toString(), {
        checkoutReminderSentAt: timestamp,
      });

      if (user.fcmToken) {
        await sendNotification({
          token: user.fcmToken,
          title: 'Out of Range Alert',
          body: 'You have moved out of the office geofence during your shift timings.',
          data: { type: 'GEOFENCE_ALERT', userId },
        });
      }

      const adminUsers = await userCrud.findMany({
        role: { $in: [UserRole.ADMIN, UserRole.SENIOR] } as any,
        _id: { $ne: new mongoose.Types.ObjectId(userId) },
        ...(user.teamId ? { teamId: user.teamId } : {}),
      });
      console.log(
        'this is admin users',
        adminUsers
      )
      for (const admin of adminUsers) {
        if (admin.fcmToken) {
          await sendNotification({
            token: admin.fcmToken,
            title: 'Employee Out of Range',
            body: `${user.name} has moved out of the office geofence during their shift.`,
            data: { type: 'GEOFENCE_BREACH_REPORT', targetUserId: userId },
          });
        }
      }

      return {
        action: 'ALERT',
        message: 'Alerts sent to user and administrators.',
      };
    } else {
      return {
        action: 'ALERT',
        message: 'Alert throttled (already sent recently).',
      };
    }
  }

  // Case B: Shift has ended -> Cumulative breach tracking
  const geofenceBreachThreshold = user.geofenceBreachTime ?? 15; // minutes
  const totalBreachSoFar = attendance.totalGeofenceBreachMinutes ?? 0;
  const activeBreachStart = attendance.geofenceBreachedAt as number | null;

  // Calculate effective total
  let effectiveBreachMinutes = totalBreachSoFar;
  if (activeBreachStart) {
    effectiveBreachMinutes += (timestamp - activeBreachStart) / (1000 * 60);
  }

  if (effectiveBreachMinutes >= geofenceBreachThreshold) {
    // Threshold exceeded — execute auto-checkout
    return await executeGeofenceCheckout(
      userId,
      attendance,
      latitude,
      longitude,
      timestamp,
      user,
      effectiveBreachMinutes,
    );
  }

  // Start or continue breach session
  if (!activeBreachStart) {
    await attendanceCrud.updateById(attendance._id.toString(), {
      geofenceBreachedAt: timestamp,
      checkoutReminderSentAt: timestamp, // ← ADD THIS — prevents cron from sending duplicate reminder
    });

    // Notify user
    if (user.fcmToken) {
      await sendNotification({
        token: user.fcmToken,
        title: 'Geofence Alert',
        body: `You left the office area after your shift. You will be auto-checked out after ${geofenceBreachThreshold} total minutes outside.`,
        data: { type: 'GEOFENCE_BREACH_WARNING', userId },
      });
    }

    const remaining = geofenceBreachThreshold - effectiveBreachMinutes;
    return {
      action: 'BREACH_STARTED',
      message: `Geofence breach started. ${Math.round(remaining)} minutes remaining before auto-checkout.`,
      totalGeofenceBreachMinutes:
        Math.round(effectiveBreachMinutes * 100) / 100,
      remainingMinutes: Math.round(remaining * 100) / 100,
    };
  }

  const remaining = geofenceBreachThreshold - effectiveBreachMinutes;
  return {
    action: 'BREACH_ONGOING',
    message: `Geofence breach ongoing. ${Math.round(remaining)} minutes remaining.`,
    totalGeofenceBreachMinutes: Math.round(effectiveBreachMinutes * 100) / 100,
    remainingMinutes: Math.round(remaining * 100) / 100,
  };
}

/**
 * Clear geofence breach (user re-entered the geofence).
 * Flushes the active breach session time into totalGeofenceBreachMinutes.
 */
export async function clearGeofenceBreach(
  userId: string,
): Promise<{ cleared: boolean; totalGeofenceBreachMinutes: number }> {
  const date = format(Date.now(), 'yyyy-MM-dd');
  const now = Date.now();
  const attendance = await attendanceCrud.findByUserIdAndDate(userId, date);

  if (!attendance || !attendance.geofenceBreachedAt) {
    return {
      cleared: false,
      totalGeofenceBreachMinutes: attendance?.totalGeofenceBreachMinutes ?? 0,
    };
  }

  // Flush active session into cumulative total
  const activeBreachStart = attendance.geofenceBreachedAt as number;
  const sessionMinutes = (now - activeBreachStart) / (1000 * 60);
  const newTotal =
    (attendance.totalGeofenceBreachMinutes ?? 0) + sessionMinutes;

  await attendanceCrud.updateById(attendance._id.toString(), {
    geofenceBreachedAt: null,
    totalGeofenceBreachMinutes: Math.round(newTotal * 100) / 100,
  });

  return {
    cleared: true,
    totalGeofenceBreachMinutes: Math.round(newTotal * 100) / 100,
  };
}

/**
 * Execute the actual geofence auto-checkout
 */
async function executeGeofenceCheckout(
  userId: string,
  attendance: any,
  latitude: number,
  longitude: number,
  timestamp: number,
  user: any,
  finalBreachMinutes: number,
): Promise<GeofenceBreachResult> {
  const { executeWithTransaction, createAuditLogEntry } =
    await import('../../../utils/transaction');
  const { timeStringToMinutes: tsm, timestampToMinutesInTimezone: ttm } =
    await import('../_shared/time');

  await executeWithTransaction(async (session) => {
    const clockInTime = attendance.clockInTime || timestamp;
    const totalWorkMinutes = Math.floor(
      (timestamp - clockInTime) / (1000 * 60),
    );

    // Overtime calculation
    let overtimeMinutes = 0;
    if (user.shiftEnd) {
      const shiftEndMinutes = tsm(user.shiftEnd);
      const clockOutMinutes = ttm(timestamp, 'Asia/Kolkata');
      overtimeMinutes = Math.max(0, clockOutMinutes - shiftEndMinutes);
    }

    await attendanceCrud.updateById(
      attendance._id.toString(),
      {
        clockOutTime: timestamp,
        clockOutLat: latitude,
        clockOutLng: longitude,
        totalWorkMinutes,
        overtimeMinutes,
        isAutoCheckOut: true,
        geofenceBreachedAt: null,
        totalGeofenceBreachMinutes: Math.round(finalBreachMinutes * 100) / 100,
      },
      session,
    );

    await createAuditLogEntry(
      {
        action: 'AUTO_CHECK_OUT',
        performedBy: userId,
        targetUser: userId,
        resource: 'Attendance',
        resourceId: attendance._id,
        metadata: {
          location: { latitude, longitude },
          totalWorkMinutes,
          overtimeMinutes,
          totalGeofenceBreachMinutes: finalBreachMinutes,
          timestamp,
          reason: 'cumulative_geofence_breach',
        },
      },
      session,
    );
  });

  // Notify user of auto-checkout
  if (user.fcmToken) {
    await sendNotification({
      token: user.fcmToken,
      title: 'Auto Check-out',
      body: `You have been automatically checked out after spending ${Math.round(finalBreachMinutes)} minutes outside the office range.`,
      data: { type: 'AUTO_CHECKOUT', userId },
    });
  }

  const adminUsers = await userCrud.findMany({
    role: { $in: [UserRole.ADMIN, UserRole.SENIOR] } as any,
    _id: { $ne: new mongoose.Types.ObjectId(userId) },
  });

  for (const admin of adminUsers) {
    if (admin.fcmToken) {
      await sendNotification({
        token: admin.fcmToken,
        title: 'Employee Auto Check-out',
        body: `${user.name} has been auto-checked out after ${Math.round(finalBreachMinutes)} minutes outside the office range.`,
        data: {
          type: 'ADMIN_AUTO_CHECKOUT_NOTIFICATION',
          targetUserId: userId,
          reason: 'cumulative_geofence_breach',
        },
      });
    }
  }
  return {
    action: 'CHECK_OUT',
    message: `User auto-checked out after ${Math.round(finalBreachMinutes)} minutes of cumulative geofence breach.`,
    totalGeofenceBreachMinutes: Math.round(finalBreachMinutes * 100) / 100,
  };
}
