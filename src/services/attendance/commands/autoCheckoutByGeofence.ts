import { format } from "date-fns";
import { AttendanceStatus } from "../../../types";
import { GeoPoint, isInsideGeofence } from "../../../lib/geofencing";
import attendanceCrud from "../../../crud/attendance.crud";
import userCrud from "../../../crud/user.crud";
import { validateCheckoutAndGetStatus } from "../_shared/status";
import { DEFAULT_GEOFENCE_RADIUS } from "../_shared/geofence";

export interface AutoCheckoutByGeofenceResult {
  clockOutTime: number;
  latitude: number;
  longitude: number;
  totalWorkMinutes: number;
  status: AttendanceStatus;
}

/**
 * Auto-checkout triggered when user leaves office geofence after 6 PM
 */
export async function autoCheckoutByGeofence(
  userId: string,
  latitude: number,
  longitude: number
): Promise<AutoCheckoutByGeofenceResult> {
  const timestamp = Date.now();
  const date = format(timestamp, "yyyy-MM-dd");
  const currentHour = new Date(timestamp).getHours();

  if (currentHour < 18) {
    throw new Error("Auto-checkout only available after 6 PM");
  }

  const user = await userCrud.findById(userId);
  if (!user) {
    throw new Error("User not found");
  }

  if (user.officeLat && user.officeLng) {
    const userLocation: GeoPoint = {
      lat: latitude,
      lng: longitude,
    };

    const officeGeofence = {
      center: {
        lat: user.officeLat,
        lng: user.officeLng,
      },
      radius: DEFAULT_GEOFENCE_RADIUS,
    };

    if (isInsideGeofence(userLocation, officeGeofence)) {
      throw new Error(
        "User is still within office geofence. Cannot auto-checkout."
      );
    }
  }

  const { executeWithTransaction, createAuditLogEntry } = await import(
    "../../../utils/transaction"
  );

  const result = await executeWithTransaction(async (session) => {
    const attendance = await attendanceCrud.findByUserIdAndDate(
      userId,
      date,
      session
    );

    if (!attendance) {
      throw new Error("No check-in record found for today");
    }

    if (attendance.clockOutTime) {
      throw new Error("User already checked out");
    }

    const clockInTime = attendance.clockInTime || timestamp;
    const totalWorkMinutes = Math.floor(
      (timestamp - clockInTime) / (1000 * 60)
    );

    const checkoutValidation = validateCheckoutAndGetStatus({
      clockInTimestamp: clockInTime,
      clockOutTimestamp: timestamp,
      shiftStart: user.shiftStart,
      shiftEnd: user.shiftEnd,
    });

    let status = checkoutValidation.status;

    const updatedAttendance = await attendanceCrud.updateById(
      attendance._id.toString(),
      {
        clockOutTime: timestamp,
        clockOutLat: latitude,
        clockOutLng: longitude,
        totalWorkMinutes,
        status,
      },
      session
    );

    await createAuditLogEntry(
      {
        action: "AUTO_CHECK_OUT",
        performedBy: userId,
        targetUser: userId,
        resource: "Attendance",
        resourceId: attendance._id,
        metadata: {
          location: { latitude, longitude },
          totalWorkMinutes,
          status,
          timestamp,
          reason: "geofence",
        },
      },
      session
    );

    return {
      clockOutTime: timestamp,
      latitude,
      longitude,
      totalWorkMinutes,
      status: updatedAttendance?.status,
    };
  });

  return result;
}
