import { format } from "date-fns";
import attendanceCrud from "../../../crud/attendance.crud";
import userCrud from "../../../crud/user.crud";
import { timeStringToMinutes, timestampToMinutesInTimezone } from "../_shared/time";

export interface AutoCheckoutResult {
  processed: number;
}

/**
 * Auto-checkout for open attendances whose shift has ended.
 * Runs periodically (every 30 min via node-cron) and checks per-user shiftEnd.
 */
export async function autoCheckout(): Promise<AutoCheckoutResult> {
  const today = format(new Date(), "yyyy-MM-dd");
  const timezone = "Asia/Kolkata";
  const now = Date.now();

  const openAttendances = await attendanceCrud.findOpenAttendances({ date: today });

  if (openAttendances.length === 0) {
    return { processed: 0 };
  }

  const clockOutTime = now;

  const results = await Promise.all(openAttendances.map(async (attendance) => {
    // Get user shift info
    let shiftEnd: string | undefined;

    const populatedUserId = attendance.userId as any;
    if (
      populatedUserId &&
      typeof populatedUserId === "object" &&
      "shiftStart" in populatedUserId
    ) {
      shiftEnd = populatedUserId.shiftEnd;
    } else {
      const userId = attendance.userId.toString();
      const user = await userCrud.findById(userId);
      if (user) {
        shiftEnd = user.shiftEnd;
      }
    }

    // Per-user shift check: skip if shift not over yet
    const shiftEndMinutes = shiftEnd
      ? timeStringToMinutes(shiftEnd)
      : 1080; // default 18:00
    const currentMinutes = timestampToMinutesInTimezone(now, timezone);

    if (currentMinutes < shiftEndMinutes) {
      return false; // shift not over for this user, skip
    }

    const totalWorkMinutes = Math.floor(
      (clockOutTime - (attendance.clockInTime || clockOutTime)) / (1000 * 60)
    );

    // --- Overtime calculation ---
    let overtimeMinutes = 0;
    if (shiftEnd) {
      const shiftEndMins = timeStringToMinutes(shiftEnd);
      const clockOutMins = timestampToMinutesInTimezone(now, "Asia/Kolkata");
      overtimeMinutes = Math.max(0, clockOutMins - shiftEndMins);
    }

    await attendanceCrud.updateById(attendance._id.toString(), {
      clockOutTime,
      totalWorkMinutes,
      overtimeMinutes,
      isAutoCheckOut: true,
    });

    return true; // successfully processed
  }));

  const processedCount = results.filter(r => r).length;

  console.log(
    `[AutoCheckout] Processed ${processedCount} auto-checkouts`
  );
  return { processed: processedCount };
}
