import { format } from "date-fns";
import attendanceCrud from "../../../crud/attendance.crud";
import userCrud from "../../../crud/user.crud";
// import { validateCheckoutAndGetStatus } from "../_shared/status";
import { timeStringToMinutes, timestampToMinutesInTimezone } from "../_shared/time";
import { logger } from "../../../utils/logger";

export interface AutoCheckoutByShiftResult {
  processed: number;
}

/**
 * Auto-checkout for users with a specific shift end time.
 * Filters users by their shiftEnd time and auto-checks them out if they haven't checked out yet.
 * 
 * @param targetShiftEnd - The shift end time to filter users (e.g., "18:00" for 6 PM, "20:00" for 8 PM)
 */
export async function autoCheckoutByShift(targetShiftEnd: string): Promise<AutoCheckoutByShiftResult> {
  const today = format(new Date(), "yyyy-MM-dd");
  const timezone = "Asia/Kolkata";
  const now = Date.now();

  const openAttendances = await attendanceCrud.findOpenAttendances({ date: today });

  if (openAttendances.length === 0) {
    logger.info(`[AutoCheckoutByShift] No open attendances found for ${today}`);
    return { processed: 0 };
  }

  let processedCount = 0;
  const clockOutTime = now;

  const updates = openAttendances.map(async (attendance) => {
    // Get user shift info
    let shiftStart: string | undefined;
    let shiftEnd: string | undefined;

    const populatedUserId = attendance.userId as any;
    if (
      populatedUserId &&
      typeof populatedUserId === "object" &&
      "shiftStart" in populatedUserId
    ) {
      shiftStart = populatedUserId.shiftStart;
      shiftEnd = populatedUserId.shiftEnd;
    } else {
      const userId = attendance.userId.toString();
      const user = await userCrud.findById(userId);
      if (user) {
        shiftStart = user.shiftStart;
        shiftEnd = user.shiftEnd;
      }
    }

    // Skip if user doesn't have shiftEnd defined or doesn't match target shift
    if (!shiftEnd || shiftEnd !== targetShiftEnd) {
      return;
    }

    // Verify shift has ended
    const shiftEndMinutes = timeStringToMinutes(shiftEnd);
    const currentMinutes = timestampToMinutesInTimezone(now, timezone);

    if (currentMinutes < shiftEndMinutes) {
      logger.info(`[AutoCheckoutByShift] Shift not yet ended for user with shiftEnd ${shiftEnd}`);
      return;
    }

    const totalWorkMinutes = Math.floor(
      (clockOutTime - (attendance.clockInTime || clockOutTime)) / (1000 * 60)
    );


    await attendanceCrud.updateById(attendance._id.toString(), {
      clockOutTime,
      totalWorkMinutes,
      isAutoCheckOut: true,
      clockOutImageUrl: attendance.clockInImageUrl,
    });

    processedCount++;
    logger.info(`[AutoCheckoutByShift] Auto-checked out user ${attendance.userId} with shiftEnd ${shiftEnd}`);
  });

  await Promise.all(updates);

  logger.info(
    `[AutoCheckoutByShift] Processed ${processedCount} auto-checkouts for shiftEnd ${targetShiftEnd}`
  );
  return { processed: processedCount };
}
