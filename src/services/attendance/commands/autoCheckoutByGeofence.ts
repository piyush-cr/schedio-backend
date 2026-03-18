import { format } from "date-fns";
import { UserRole } from "../../../types";
import { GeoPoint, isInsideGeofence } from "../../../lib/geofencing";
import attendanceCrud from "../../../crud/attendance.crud";
import userCrud from "../../../crud/user.crud";
import { validateCheckoutAndGetStatus } from "../_shared/status";
import { DEFAULT_GEOFENCE_RADIUS } from "../_shared/geofence";
import { queueNotification } from "../../../jobs/queues/app.queue";
import { timeStringToMinutes, timestampToMinutesInTimezone } from "../_shared/time";

export interface GeofenceBreachResult {
  action: "ALERT" | "CHECK_OUT" | "NONE";
  message: string;
}

/**
 * Handles geofence breach reported by the mobile app.
 * 1. During shift timings: Alert admin and notify user.
 * 2. After shift timings: Auto-checkout if user is clocked in.
 */
export async function autoCheckoutByGeofence(
  userId: string,
  latitude: number,
  longitude: number
): Promise<GeofenceBreachResult> {
  const timestamp = Date.now();
  const date = format(timestamp, "yyyy-MM-dd");
  const timezone = "Asia/Kolkata";

  const user = await userCrud.findById(userId);
  if (!user) {
    throw new Error("User not found");
  }

  // 1. Check if user is clocked in today
  const attendance = await attendanceCrud.findByUserIdAndDate(userId, date);
  if (!attendance || attendance.clockOutTime) {
    return { action: "NONE", message: "User is not currently clocked in." };
  }

  // 2. Check geofence
  if (user.officeLat && user.officeLng) {
    const userLocation: GeoPoint = { lat: latitude, lng: longitude };
    const officeGeofence = {
      center: { lat: user.officeLat, lng: user.officeLng },
      radius: DEFAULT_GEOFENCE_RADIUS, // Typically 10-50m
    };

    if (isInsideGeofence(userLocation, officeGeofence)) {
      return { action: "NONE", message: "User is inside office range." };
    }
  } else {
    return { action: "NONE", message: "Office location not set for this user." };
  }

  // 3. Determine if shift is ongoing
  const currentMinutes = timestampToMinutesInTimezone(timestamp, timezone);
  const shiftEndMinutes = user.shiftEnd ? timeStringToMinutes(user.shiftEnd) : 1080; // Default 6 PM

  const isShiftOngoing = currentMinutes <= shiftEndMinutes;

  if (isShiftOngoing) {
    // Case A: Shift is ongoing -> Send Alerts
    
    // Notify User
    if (user.fcmToken) {
      await queueNotification({
        token: user.fcmToken,
        title: "Out of Range Alert",
        body: "You have moved out of the office geofence during your shift timings.",
        data: { type: "GEOFENCE_ALERT", userId }
      });
    }

    // Notify Admins/Seniors
    const adminUsers = await userCrud.findMany({ 
        role: { $in: [UserRole.ADMIN, UserRole.SENIOR] } as any,
        teamId: user.teamId
    });

    for (const admin of adminUsers) {
      if (admin.fcmToken) {
        await queueNotification({
          token: admin.fcmToken,
          title: "Employee Out of Range",
          body: `${user.name} has moved out of the office geofence during their shift.`,
          data: { type: "GEOFENCE_BREACH_REPORT", targetUserId: userId }
        });
      }
    }

    return { action: "ALERT", message: "Alerts sent to user and administrators." };
  } else {
    // Case B: Shift has ended -> Auto Checkout
    const { executeWithTransaction, createAuditLogEntry } = await import("../../../utils/transaction");

    await executeWithTransaction(async (session) => {
      const clockInTime = attendance.clockInTime || timestamp;
      const totalWorkMinutes = Math.floor((timestamp - clockInTime) / (1000 * 60));

      const checkoutValidation = validateCheckoutAndGetStatus({
        clockInTimestamp: clockInTime,
        clockOutTimestamp: timestamp,
        shiftStart: user.shiftStart,
        shiftEnd: user.shiftEnd,
      });

      await attendanceCrud.updateById(
        attendance._id.toString(),
        {
          clockOutTime: timestamp,
          clockOutLat: latitude,
          clockOutLng: longitude,
          totalWorkMinutes,
          status: checkoutValidation.status,
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
            status: checkoutValidation.status,
            timestamp,
            reason: "geofence_after_shift",
          },
        },
        session
      );
    });

    // Notify user of auto-checkout
    if (user.fcmToken) {
      await queueNotification({
        token: user.fcmToken,
        title: "Auto Check-out",
        body: "You have been automatically checked out as you left the office range after shift timings.",
        data: { type: "AUTO_CHECKOUT", userId }
      });
    }

    return { action: "CHECK_OUT", message: "User auto-checked out successfully." };
  }
}
