import { format } from 'date-fns';
import mongoose from 'mongoose';
import attendanceCrud from '../../../crud/attendance.crud';
import userCrud from '../../../crud/user.crud';
import {
  timeStringToMinutes,
  timestampToMinutesInTimezone,
} from '../_shared/time';
import { sendNotification } from '../../../firebase/messaging';
import { UserRole } from '../../../types';

const DEFAULT_GEOFENCE_BREACH_TIME_MINUTES = 15;
const TIMEZONE = 'Asia/Kolkata';
const STALE_THRESHOLD_MS = 1 * 60 * 1000;
const REMINDER_COOLDOWN_MS = 24 * 60 * 60 * 1000;

export interface UnifiedAutoCheckoutResult {
  notified: number;
  checkedOut: number;
}

export async function unifiedAutoCheckout(): Promise<UnifiedAutoCheckoutResult> {
  const today = format(new Date(), 'yyyy-MM-dd');
  const now = Date.now();
  const currentMinutes = timestampToMinutesInTimezone(now, TIMEZONE);

  console.log(`[UnifiedAutoCheckout] ===== Cron started =====`);
  console.log(
    `[UnifiedAutoCheckout] now=${new Date(now).toISOString()} today=${today} currentMinutes=${currentMinutes}`,
  );

  const openAttendances = await attendanceCrud.findOpenAttendances({
    date: today,
  });
  console.log(
    `[UnifiedAutoCheckout] Found ${openAttendances.length} open attendance(s)`,
  );

  if (openAttendances.length === 0) {
    return { notified: 0, checkedOut: 0 };
  }

  let notifiedCount = 0;
  let checkedOutCount = 0;

  for (const attendance of openAttendances) {
    const attendanceId = attendance._id.toString();
    console.log(
      `\n[UnifiedAutoCheckout] --- Processing attendance ${attendanceId} ---`,
    );

    // Always resolve userId first
    //@ts-ignore
    const populatedUserId = attendance.userId as mongoose.Types.ObjectId & {
      _id: mongoose.Types.ObjectId;
      shiftStart?: string;
      shiftEnd?: string;
      geofenceBreachTime?: number;
      fcmToken?: string;
      statusUpdatedAt?: Date | number;
      name?: string;
    };

    const userId =
      populatedUserId &&
        typeof populatedUserId === 'object' &&
        '_id' in populatedUserId
        ? populatedUserId._id.toString()
        : attendance.userId.toString();

    // Always fetch user fresh from DB — never trust populated field for statusUpdatedAt
    // because heartbeat writes statusUpdatedAt directly and the populated snapshot is stale
    console.log(
      `[UnifiedAutoCheckout] Fetching fresh user from DB — userId=${userId}`,
    );
    const user = await userCrud.findById(userId);

    if (!user) {
      console.warn(
        `[UnifiedAutoCheckout] User not found for userId=${userId} — skipping`,
      );
      continue;
    }

    const shiftStart = user.shiftStart;
    const shiftEnd = user.shiftEnd;
    const geofenceBreachTime =
      user.geofenceBreachTime ?? DEFAULT_GEOFENCE_BREACH_TIME_MINUTES;
    const fcmToken = user.fcmToken;
    const statusUpdatedAt = user.statusUpdatedAt; // fresh from DB, not from populated field

    console.log(
      `[UnifiedAutoCheckout] User — name=${user.name} shiftStart=${shiftStart} shiftEnd=${shiftEnd} geofenceBreachTime=${geofenceBreachTime} hasFcmToken=${!!fcmToken} statusUpdatedAt=${statusUpdatedAt ? new Date(statusUpdatedAt).toISOString() : 'never'}`,
    );

    if (!shiftEnd) {
      console.log(`[UnifiedAutoCheckout] No shiftEnd defined — skipping`);
      continue;
    }

    const shiftEndMinutes = timeStringToMinutes(shiftEnd);
    console.log(
      `[UnifiedAutoCheckout] Shift timing — shiftEndMinutes=${shiftEndMinutes} currentMinutes=${currentMinutes}`,
    );

    if (currentMinutes < shiftEndMinutes) {
      console.log(
        `[UnifiedAutoCheckout] Shift not ended yet (currentMinutes=${currentMinutes} < shiftEndMinutes=${shiftEndMinutes}) — skipping`,
      );
      continue;
    }

    const minutesSinceShiftEnd = currentMinutes - shiftEndMinutes;
    console.log(
      `[UnifiedAutoCheckout] Shift ended ${minutesSinceShiftEnd} minute(s) ago`,
    );

    // Liveness check — always computed from fresh DB user
    const statusUpdatedAtMs = statusUpdatedAt
      ? new Date(statusUpdatedAt).getTime()
      : null;
    const msSinceLastHeartbeat =
      statusUpdatedAtMs !== null ? now - statusUpdatedAtMs : null;
    const isUserAlive =
      statusUpdatedAtMs !== null && msSinceLastHeartbeat! < STALE_THRESHOLD_MS;

    console.log(
      `[UnifiedAutoCheckout] Liveness — statusUpdatedAtMs=${statusUpdatedAtMs} msSinceLastHeartbeat=${msSinceLastHeartbeat ?? 'N/A'} STALE_THRESHOLD_MS=${STALE_THRESHOLD_MS} isUserAlive=${isUserAlive}`,
    );

    // Geofence breach
    const geofenceBreachedAt = attendance.geofenceBreachedAt as number | null;
    const totalGeofenceBreachMinutes =
      attendance.totalGeofenceBreachMinutes ?? 0;
    const isCurrentlyBreaching =
      geofenceBreachedAt !== null && geofenceBreachedAt !== undefined;
    const activeSessionMinutes = isCurrentlyBreaching
      ? (now - geofenceBreachedAt!) / (1000 * 60)
      : 0;
    const effectiveBreachMinutes =
      totalGeofenceBreachMinutes + activeSessionMinutes;
    const geofenceBreachExceeded =
      isCurrentlyBreaching && effectiveBreachMinutes >= geofenceBreachTime;

    console.log(
      `[UnifiedAutoCheckout] Geofence — geofenceBreachedAt=${geofenceBreachedAt ? new Date(geofenceBreachedAt).toISOString() : 'null'} isCurrentlyBreaching=${isCurrentlyBreaching} totalGeofenceBreachMinutes=${totalGeofenceBreachMinutes} activeSessionMinutes=${activeSessionMinutes.toFixed(2)} effectiveBreachMinutes=${effectiveBreachMinutes.toFixed(2)} threshold=${geofenceBreachTime} geofenceBreachExceeded=${geofenceBreachExceeded}`,
    );

    const shouldCheckout =
      (!isUserAlive && minutesSinceShiftEnd > 0) || geofenceBreachExceeded;

    console.log(
      `[UnifiedAutoCheckout] Checkout decision — shouldCheckout=${shouldCheckout} { offlineAfterShift=${!isUserAlive && minutesSinceShiftEnd > 0}, geofenceBreachExceeded=${geofenceBreachExceeded} }`,
    );

    if (shouldCheckout) {
      const reason = geofenceBreachExceeded
        ? 'cumulative_geofence_breach'
        : 'user_offline_after_shift';

      console.log(
        `[UnifiedAutoCheckout] Executing auto-checkout — userId=${userId} reason=${reason}`,
      );

      try {
        await executeAutoCheckout(
          attendance,
          now,
          shiftEnd,
          userId,
          attendance.clockInImageUrl,
          totalGeofenceBreachMinutes + activeSessionMinutes,
          reason,
        );
        checkedOutCount++;
        console.log(
          `[UnifiedAutoCheckout] Auto-checkout successful — userId=${userId}`,
        );
      } catch (err) {
        console.error(
          `[UnifiedAutoCheckout] Auto-checkout FAILED — userId=${userId}`,
          err,
        );
        continue;
      }

      if (fcmToken) {
        try {
          await sendNotification({
            token: fcmToken,
            title: 'Auto Check-out',
            body: geofenceBreachExceeded
              ? `You have been automatically checked out after spending ${geofenceBreachTime} minutes outside the work zone.`
              : `You have been automatically checked out as your shift ended and you appear to be offline.`,
            data: { type: 'AUTO_CHECKOUT', userId, reason },
          });
          console.log(
            `[UnifiedAutoCheckout] User notification sent — userId=${userId}`,
          );
        } catch (err) {
          console.error(
            `[UnifiedAutoCheckout] Error sending user notification — userId=${userId}`,
            err,
          );
        }
      } else {
        console.log(
          `[UnifiedAutoCheckout] No FCM token — skipping user notification for userId=${userId}`,
        );
      }

      try {
        const adminUsers = await userCrud.findMany({
          role: { $in: [UserRole.ADMIN, UserRole.SENIOR] } as any,
          _id: { $ne: new mongoose.Types.ObjectId(userId) },
        });
        console.log(
          `[UnifiedAutoCheckout] Notifying ${adminUsers.length} admin(s)`,
        );
        for (const admin of adminUsers) {
          if (admin.fcmToken) {
            await sendNotification({
              token: admin.fcmToken,
              title: 'Employee Auto Check-out',
              body: `User has been auto-checked out. Reason: ${geofenceBreachExceeded
                ? 'geofence breach'
                : 'offline after shift'
                }.`,
              data: {
                type: 'ADMIN_AUTO_CHECKOUT_NOTIFICATION',
                targetUserId: userId,
                reason,
              },
            });
          }
        }
      } catch (error) {
        console.error(`[UnifiedAutoCheckout] Error notifying admins`, error);
      }
    } else if (minutesSinceShiftEnd > 0 && isUserAlive) {
      console.log(
        `[UnifiedAutoCheckout] User alive but shift ended — checking reminder cooldown`,
      );

      const lastReminderSentAt = attendance.checkoutReminderSentAt as
        | number
        | null;
      const reminderAlreadySent =
        lastReminderSentAt !== null &&
        now - lastReminderSentAt < REMINDER_COOLDOWN_MS;

      console.log(
        `[UnifiedAutoCheckout] Reminder — lastReminderSentAt=${lastReminderSentAt ? new Date(lastReminderSentAt).toISOString() : 'never'} reminderAlreadySent=${reminderAlreadySent}`,
      );

      if (!reminderAlreadySent && fcmToken) {
        const remainingBreachMinutes =
          geofenceBreachTime - effectiveBreachMinutes;
        try {
          await sendNotification({
            token: fcmToken,
            title: 'Check-out Reminder',
            body:
              remainingBreachMinutes <= 5
                ? `You haven't checked out yet. You will be auto-checked out in ${Math.ceil(remainingBreachMinutes)} minute(s).`
                : 'Your shift has ended! Please check out now to avoid auto check-out.',
            data: {
              type: 'CHECKOUT_REMINDER',
              userId,
              remainingMinutes: Math.ceil(remainingBreachMinutes).toString(),
            },
          });

          await attendanceCrud.updateById(attendance._id.toString(), {
            checkoutReminderSentAt: now,
          });

          notifiedCount++;
          console.log(
            `[UnifiedAutoCheckout] Reminder sent and persisted — userId=${userId}`,
          );
        } catch (err) {
          console.error(
            `[UnifiedAutoCheckout] Error sending reminder — userId=${userId}`,
            err,
          );
        }
      } else if (!fcmToken) {
        console.log(
          `[UnifiedAutoCheckout] No FCM token — skipping reminder for userId=${userId}`,
        );
      } else {
        console.log(
          `[UnifiedAutoCheckout] Reminder already sent — skipping userId=${userId}`,
        );
      }
    } else {
      console.log(
        `[UnifiedAutoCheckout] No action — shouldCheckout=${shouldCheckout} isUserAlive=${isUserAlive} minutesSinceShiftEnd=${minutesSinceShiftEnd}`,
      );
    }
  }

  console.log(
    `\n[UnifiedAutoCheckout] ===== Cron finished — Notified: ${notifiedCount}, Auto-checked out: ${checkedOutCount} =====`,
  );
  return { notified: notifiedCount, checkedOut: checkedOutCount };
}

async function executeAutoCheckout(
  attendance: any,
  clockOutTime: number,
  shiftEnd: string | undefined,
  userId: string,
  clockInImageUrl: string | undefined,
  finalGeofenceBreachMinutes: number,
  reason: string,
): Promise<void> {
  const { executeWithTransaction, createAuditLogEntry } =
    await import('../../../utils/transaction');

  console.log(
    `[executeAutoCheckout] Starting — attendanceId=${attendance._id} userId=${userId} reason=${reason} clockOutTime=${new Date(clockOutTime).toISOString()}`,
  );

  await executeWithTransaction(async (session) => {
    const totalWorkMinutes = Math.floor(
      (clockOutTime - (attendance.clockInTime || clockOutTime)) / (1000 * 60),
    );

    let overtimeMinutes = 0;
    if (shiftEnd) {
      const shiftEndMinutes = timeStringToMinutes(shiftEnd);
      const clockOutMinutes = timestampToMinutesInTimezone(
        clockOutTime,
        TIMEZONE,
      );
      overtimeMinutes = Math.max(0, clockOutMinutes - shiftEndMinutes);
    }

    console.log(
      `[executeAutoCheckout] Calculated — totalWorkMinutes=${totalWorkMinutes} overtimeMinutes=${overtimeMinutes} finalGeofenceBreachMinutes=${finalGeofenceBreachMinutes.toFixed(2)}`,
    );

    await attendanceCrud.updateById(
      attendance._id.toString(),
      {
        clockOutTime,
        totalWorkMinutes,
        overtimeMinutes,
        isAutoCheckOut: true,
        totalGeofenceBreachMinutes:
          Math.round(finalGeofenceBreachMinutes * 100) / 100,
        geofenceBreachedAt: null,
        clockOutImageUrl: clockInImageUrl || undefined,
      },
      session,
    );

    console.log(`[executeAutoCheckout] Attendance updated`);

    await createAuditLogEntry(
      {
        action: 'AUTO_CHECK_OUT',
        performedBy: userId,
        targetUser: userId,
        resource: 'Attendance',
        resourceId: attendance._id,
        metadata: {
          totalWorkMinutes,
          overtimeMinutes,
          totalGeofenceBreachMinutes: finalGeofenceBreachMinutes,
          timestamp: clockOutTime,
          reason,
        },
      },
      session,
    );

    console.log(`[executeAutoCheckout] Audit log created`);
  });
}
