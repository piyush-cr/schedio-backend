import { format } from "date-fns";
import { UserRole } from "../../../types";
import { GeoPoint, isInsideGeofence } from "../../../lib/geofencing";
import attendanceCrud from "../../../crud/attendance.crud";
import userCrud from "../../../crud/user.crud";
import { validateCheckoutAndGetStatus } from "../_shared/status";
import { DEFAULT_GEOFENCE_RADIUS } from "../_shared/geofence";
import { appQueue, queueNotification } from "../../../jobs/queues/app.queue";
import { timeStringToMinutes, timestampToMinutesInTimezone } from "../_shared/time";

const GEOFENCE_CHECKOUT_DELAY_MS = 15 * 60 * 1000; // 15 minutes

export interface GeofenceBreachResult {
  action: "ALERT" | "CHECK_OUT" | "SCHEDULED" | "NONE";
  message: string;
}

/**
 * Handles geofence breach reported by the mobile app.
 * 1. During shift timings: Alert admin and notify user.
 * 2. After shift timings: Record breach time and schedule a 15-min delayed checkout.
 *    If user re-enters within 15 min, breach is cleared via /clear-geofence-breach.
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
      radius: DEFAULT_GEOFENCE_RADIUS,
    };

    if (isInsideGeofence(userLocation, officeGeofence)) {
      return { action: "NONE", message: "User is inside office range." };
    }
  } else {
    return { action: "NONE", message: "Office location not set for this user." };
  }

  // 3. Determine if shift is ongoing
  const currentMinutes = timestampToMinutesInTimezone(timestamp, timezone);
  const shiftEndMinutes = user.shiftEnd ? timeStringToMinutes(user.shiftEnd) : 1080;

  const isShiftOngoing = currentMinutes <= shiftEndMinutes;

  if (isShiftOngoing) {
    // Case A: Shift is ongoing -> Send Alerts
    if (user.fcmToken) {
      await queueNotification({
        token: user.fcmToken,
        title: "Out of Range Alert",
        body: "You have moved out of the office geofence during your shift timings.",
        data: { type: "GEOFENCE_ALERT", userId }
      });
    }

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
    // Case B: Shift has ended -> 15-min delayed checkout

    // If breach time already exists and 15 min have passed, execute checkout immediately
    if (attendance.geofenceBreachTime) {
      const elapsed = timestamp - attendance.geofenceBreachTime;
      if (elapsed >= GEOFENCE_CHECKOUT_DELAY_MS) {
        // Execute the auto-checkout
        return await executeGeofenceCheckout(userId, attendance, latitude, longitude, timestamp, user);
      }
      // Otherwise still waiting — already scheduled
      return { action: "SCHEDULED", message: "Geofence breach already recorded. Waiting for 15-minute delay." };
    }

    // Record breach time and schedule a delayed BullMQ job
    await attendanceCrud.updateById(attendance._id.toString(), {
      geofenceBreachTime: timestamp,
    });

    await appQueue.add(
      "GEOFENCE_DELAYED_CHECKOUT",
      {
        userId,
        attendanceId: attendance._id.toString(),
        latitude,
        longitude,
      },
      {
        delay: GEOFENCE_CHECKOUT_DELAY_MS,
        jobId: `geofence-delayed-${userId}-${date}`,
      }
    );

    // Notify user
    if (user.fcmToken) {
      await queueNotification({
        token: user.fcmToken,
        title: "Geofence Alert",
        body: "You left the office area after your shift. You will be auto-checked out in 15 minutes if you don't return.",
        data: { type: "GEOFENCE_BREACH_WARNING", userId }
      });
    }

    return { action: "SCHEDULED", message: "Geofence breach recorded. Auto-checkout scheduled in 15 minutes." };
  }
}

/**
 * Clear geofence breach (user re-entered the geofence).
 * Removes the scheduled delayed checkout job.
 */
export async function clearGeofenceBreach(userId: string): Promise<{ cleared: boolean }> {
  const date = format(Date.now(), "yyyy-MM-dd");
  const attendance = await attendanceCrud.findByUserIdAndDate(userId, date);

  if (!attendance || !attendance.geofenceBreachTime) {
    return { cleared: false };
  }

  await attendanceCrud.updateById(attendance._id.toString(), {
    geofenceBreachTime: null,
  });

  // Try to remove the delayed job
  try {
    const job = await appQueue.getJob(`geofence-delayed-${userId}-${date}`);
    if (job) {
      await job.remove();
    }
  } catch (e) {
    console.warn("[ClearGeofenceBreach] Could not remove delayed job:", e);
  }

  return { cleared: true };
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
  user: any
): Promise<GeofenceBreachResult> {
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
        geofenceBreachTime: null,
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
          reason: "geofence_after_shift_15min_delay",
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
      body: "You have been automatically checked out after being outside the office range for 15 minutes.",
      data: { type: "AUTO_CHECKOUT", userId }
    });
  }

  return { action: "CHECK_OUT", message: "User auto-checked out successfully after 15-minute delay." };
}
