import { format } from 'date-fns';
import { AttendanceStatus } from '../../../types';
import { CheckOutInput } from '../../../types/attendance.types';
import { GeoPoint, isInsideGeofence } from '../../../lib/geofencing';
import userCrud from '../../../crud/user.crud';
import attendanceCrud from '../../../crud/attendance.crud';
import { validateCheckoutAndGetStatus, formatTimeTo12Hour } from '../_shared';
import { DEFAULT_GEOFENCE_RADIUS } from '../_shared/geofence';
// import { appQueue } from "../../../jobs/queues/app.queue";
import {
  timeStringToMinutes,
  timestampToMinutesInTimezone,
} from '../_shared/time';
import { uploadFile } from '../../../utils/imagekit';
import { deleteLocalFile } from '../../../utils/deleteFile';

export interface CheckOutResult {
  clockOutTime: string;
  latitude: number;
  longitude: number;
  totalWorkMinutes: number;
  status: AttendanceStatus;
  overtimeMinutes: number;
  totalGeofenceBreachMinutes: number;
}

/**
 * Check out for a user
 */
export async function checkOut(input: CheckOutInput): Promise<CheckOutResult> {
  const { userId, latitude, longitude, localFilePath } = input;
  const timestamp = input.timestamp ?? Date.now();
  const date = format(timestamp, 'yyyy-MM-dd');

  const user = await userCrud.findById(userId);
  if (!user) throw new Error('User not found');

  const attendance = await attendanceCrud.findByUserIdAndDate(userId, date);
  if (!attendance)
    throw new Error(
      'No check-in record found for today. Please check in first.',
    );
  if (attendance.clockOutTime) throw new Error('Already checked out today');

  if (user.officeLat && user.officeLng) {
    const userLocation: GeoPoint = { lat: latitude, lng: longitude };
    const officeGeofence = {
      center: { lat: user.officeLat, lng: user.officeLng },
      radius: DEFAULT_GEOFENCE_RADIUS,
    };

    if (!isInsideGeofence(userLocation, officeGeofence)) {
      const shiftEndMinutes = user.shiftEnd
        ? timeStringToMinutes(user.shiftEnd)
        : 1080;
      const currentMinutes = timestampToMinutesInTimezone(
        timestamp,
        'Asia/Kolkata',
      );
      if (currentMinutes < shiftEndMinutes) {
        throw new Error(
          `You are outside the office geofence (${DEFAULT_GEOFENCE_RADIUS}m radius)`,
        );
      }
    }
  }

  const clockInTime = attendance.clockInTime || timestamp;
  const totalWorkMinutes = Math.floor((timestamp - clockInTime) / (1000 * 60));

  // --- Overtime calculation ---
  let overtimeMinutes = 0;
  if (user.shiftEnd) {
    const shiftEndMinutes = timeStringToMinutes(user.shiftEnd);
    const clockOutMinutes = timestampToMinutesInTimezone(
      timestamp,
      'Asia/Kolkata',
    );
    overtimeMinutes = Math.max(0, clockOutMinutes - shiftEndMinutes);
  }

  // --- Flush any active geofence breach session ---
  let totalGeofenceBreachMinutes =
    (attendance as any).totalGeofenceBreachMinutes ?? 0;
  if ((attendance as any).geofenceBreachedAt) {
    const sessionMinutes =
      (timestamp - (attendance as any).geofenceBreachedAt) / (1000 * 60);
    totalGeofenceBreachMinutes += sessionMinutes;
  }

  const { executeWithTransaction, createAuditLogEntry } =
    await import('../../../utils/transaction');

  const result = await executeWithTransaction(async (session) => {
    const timezone = 'Asia/Kolkata';

    const checkoutValidation = validateCheckoutAndGetStatus({
      clockInTimestamp: clockInTime,
      clockOutTimestamp: timestamp,
      shiftStart: user.shiftStart,
      shiftEnd: user.shiftEnd,
      graceMinutes: 5,
      timezone,
    });

    if (!checkoutValidation.canCheckout) {
      throw new Error(
        checkoutValidation.errorMessage || 'Checkout not allowed at this time.',
      );
    }

    let finalStatus = checkoutValidation.status;
    if (
      attendance.status === AttendanceStatus.LATE &&
      checkoutValidation.status === AttendanceStatus.HALF_DAY
    ) {
      finalStatus = AttendanceStatus.HALF_DAY;
    }

    const imageUrl = await uploadFile(localFilePath!);

    const updatedAttendance = await attendanceCrud.updateById(
      attendance._id.toString(),
      {
        clockOutTime: timestamp,
        clockOutLat: latitude,
        clockOutLng: longitude,
        clockOutImageUrl: imageUrl.url,
        totalWorkMinutes,
        overtimeMinutes, // new
        totalGeofenceBreachMinutes, // new - flushed final value
        geofenceBreachedAt: null, // new - close any open breach session
      },
      session,
    );

    await createAuditLogEntry(
      {
        action: 'CHECK_OUT',
        performedBy: userId,
        targetUser: userId,
        resource: 'Attendance',
        resourceId: attendance._id,
        metadata: {
          location: { latitude, longitude },
          totalWorkMinutes,
          overtimeMinutes, // new
          totalGeofenceBreachMinutes, // new
          status: finalStatus,
          timestamp,
        },
      },
      session,
    );

    await deleteLocalFile(localFilePath!);

    return {
      clockOutTime: formatTimeTo12Hour(timestamp),
      latitude,
      longitude,
      totalWorkMinutes,
      overtimeMinutes,
      totalGeofenceBreachMinutes,
      status: updatedAttendance?.status || finalStatus,
    };
  });

  //@ts-ignore
  return result;
}
