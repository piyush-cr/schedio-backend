import { format } from "date-fns";
import mongoose from "mongoose";
import attendanceCrud from "../../../crud/attendance.crud";
import userCrud from "../../../crud/user.crud";
import { validateCheckoutAndGetStatus } from "../_shared/status";
import { timeStringToMinutes, timestampToMinutesInTimezone } from "../_shared/time";
import { sendNotification } from "../../../firebase/messaging";
import { UserRole } from "../../../types";


const DEFAULT_GEOFENCE_BREACH_TIME_MINUTES = 15;

export interface UnifiedAutoCheckoutResult {
  notified: number;
  checkedOut: number;
}

/**
 * Unified auto-checkout service that:
 * 1. Sends notification to users who haven't checked out after shift end
 * 2. Auto-checks out users whose geofenceBreachTime has elapsed
 * 
 * This runs every 5 minutes and handles both notification and checkout logic.
 */
export async function unifiedAutoCheckout(): Promise<UnifiedAutoCheckoutResult> {
  const today = format(new Date(), "yyyy-MM-dd");
  const timezone = "Asia/Kolkata";
  const now = Date.now();
  const currentMinutes = timestampToMinutesInTimezone(now, timezone);

  const openAttendances = await attendanceCrud.findOpenAttendances({ date: today });
console.log(openAttendances)
  if (openAttendances.length === 0) {
    return { notified: 0, checkedOut: 0 };
  }

  let notifiedCount = 0;
  let checkedOutCount = 0;

  for (const attendance of openAttendances) {
    // Get user info
    let shiftStart: string | undefined;
    let shiftEnd: string | undefined;
    let geofenceBreachTime: number = DEFAULT_GEOFENCE_BREACH_TIME_MINUTES;
    let fcmToken: string | undefined;
    let userId: string;
    let userName: string;
    //@ts-ignore
    const populatedUserId = attendance.userId as mongoose.Types.ObjectId & {
      _id: mongoose.Types.ObjectId;
      shiftStart?: string;
      shiftEnd?: string;
      geofenceBreachTime?: number;
      fcmToken?: string;
      name?: string;
    };


    if (
      populatedUserId &&
      typeof populatedUserId === "object" &&
      "shiftStart" in populatedUserId
    ) {
      shiftStart = populatedUserId.shiftStart;
      shiftEnd = populatedUserId.shiftEnd;
      geofenceBreachTime = populatedUserId.geofenceBreachTime ?? DEFAULT_GEOFENCE_BREACH_TIME_MINUTES;
      fcmToken = populatedUserId.fcmToken;
      userId = populatedUserId._id.toString();
    } else {
      userId = attendance.userId.toString();
      const user = await userCrud.findById(userId);
      if (user) {
        shiftStart = user.shiftStart;
        shiftEnd = user.shiftEnd;
        geofenceBreachTime = user.geofenceBreachTime ?? DEFAULT_GEOFENCE_BREACH_TIME_MINUTES;
        fcmToken = user.fcmToken;
        userName = user.name;
      }
    }

    // Skip if no shift end time defined
    if (!shiftEnd) {
      continue;
    }

    const shiftEndMinutes = timeStringToMinutes(shiftEnd);
    const minutesSinceShiftEnd = currentMinutes - shiftEndMinutes;

    // Check if shift has ended
    if (minutesSinceShiftEnd <= 0) {
      continue; // Shift hasn't ended yet
    }

    // Check if geofenceBreachTime has elapsed - auto checkout
    if (minutesSinceShiftEnd >= geofenceBreachTime) {
      // Auto-checkout the user
      await executeAutoCheckout(attendance, now, shiftStart, shiftEnd, userId,attendance.clockInImageUrl,geofenceBreachTime);
      checkedOutCount++;

      // Send notification about auto-checkout
      if (fcmToken) {
        await sendNotification({
          token: fcmToken,
          title: "Auto Check-out",
          body: `You have been automatically checked out as ${geofenceBreachTime} minutes have passed since your shift ended.`,
          data: { type: "AUTO_CHECKOUT", userId, reason: "geofence_breach_time_elapsed" }
        });
      }

      // Notify admins about the auto-checkout
      try {
        const adminUsers = await userCrud.findMany({
          role: { $in: [UserRole.ADMIN, UserRole.SENIOR] },
        });

        for (const admin of adminUsers) {
          if (admin.fcmToken) {
            await sendNotification({
              token: admin.fcmToken,
              title: "Employee Auto Check-out",
              body: `User has been automatically checked out after ${geofenceBreachTime} minutes of shift end.`,
              data: {
                type: "ADMIN_AUTO_CHECKOUT_NOTIFICATION",
                targetUserId: userId,
                geofenceBreachTime: geofenceBreachTime.toString()
              }
            });
          }
        }
      } catch (error) {
        console.error("[UnifiedAutoCheckout] Error notifying admins:", error);
      }
    }
    // Check if we should send a reminder notification (within the breach time window)
    else if (minutesSinceShiftEnd > 0) {
      const remainingMinutes = geofenceBreachTime - minutesSinceShiftEnd;

      // Send notification at specific intervals: immediately after shift ends, at 5 min remaining, and at 2 min remaining
      const shouldNotify =
        minutesSinceShiftEnd <= 1 || // Just after shift ended
        remainingMinutes <= 5 ||     // 5 minutes or less remaining
        remainingMinutes <= 2;       // 2 minutes or less remaining

      if (shouldNotify && fcmToken) {
        await sendNotification({
          token: fcmToken,
          title: "Check-out Reminder",
          body: remainingMinutes <= 5
            ? `You haven't checked out yet. You will be auto-checked out in ${remainingMinutes} minute(s) if you don't check out manually.`
            : "Your shift has ended! Please check out now to avoid auto check-out.",
          data: {
            type: "CHECKOUT_REMINDER",
            userId,
            remainingMinutes: remainingMinutes.toString(),
            geofenceBreachTime: geofenceBreachTime.toString()
          }
        });
        notifiedCount++;
      }
    }
  }

  console.log(
    `[UnifiedAutoCheckout] Notified: ${notifiedCount}, Auto-checked out: ${checkedOutCount}`
  );
  return { notified: notifiedCount, checkedOut: checkedOutCount };
}

/**
 * Execute the actual auto-checkout for a user
 */
async function executeAutoCheckout(
  attendance: {
    _id: mongoose.Types.ObjectId;
    clockInTime?: number;
    userId: mongoose.Types.ObjectId;
  },
  clockOutTime: number,
  shiftStart: string | undefined,
  shiftEnd: string | undefined,
  userId: string,
  clockInImageUrl:string,
  geofenceBreachTime: number
): Promise<void> {
  const { executeWithTransaction, createAuditLogEntry } = await import("../../../utils/transaction");

  await executeWithTransaction(async (session) => {
    const totalWorkMinutes = Math.floor(
      (clockOutTime - (attendance.clockInTime || clockOutTime)) / (1000 * 60)
    );

    const checkoutValidation = validateCheckoutAndGetStatus({
      clockInTimestamp: attendance.clockInTime || clockOutTime,
      clockOutTimestamp: clockOutTime,
      shiftStart,
      shiftEnd,
    });

    await attendanceCrud.updateById(
      attendance._id.toString(),
      {
        clockOutTime,
        totalWorkMinutes,
        isAutoCheckOut: true,
        geofenceBreachTime: geofenceBreachTime,
        clockOutImageUrl:clockInImageUrl
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
          totalWorkMinutes,
          status: checkoutValidation.status,
          timestamp: clockOutTime,
          reason: "unified_auto_checkout_geofence_breach_time",
        },
      },
      session
    );
  });
}

