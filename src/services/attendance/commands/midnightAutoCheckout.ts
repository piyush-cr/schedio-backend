import { AttendanceStatus } from "../../../types";
import attendanceCrud from "../../../crud/attendance.crud";
import userCrud from "../../../crud/user.crud";
import { validateCheckoutAndGetStatus } from "../_shared/status";

export interface MidnightAutoCheckoutResult {
  processed: number;
}

/**
 * Midnight auto-checkout: closes ALL open attendance records.
 * Sets clockOutTime to 23:59:59 of check-in day so the record
 * stays on the correct date. No time restriction.
 */
export async function midnightAutoCheckout(): Promise<MidnightAutoCheckoutResult> {
  const openAttendances = await attendanceCrud.findAllOpenAttendances();

  if (openAttendances.length === 0) {
    console.log("[MidnightAutoCheckout] No open attendances found");
    return { processed: 0 };
  }

  const updates = openAttendances.map(async (attendance) => {
    const checkInDate = attendance.date;
    const endOfDay = new Date(`${checkInDate}T23:59:59`).getTime();
    const clockOutTime = endOfDay;

    const totalWorkMinutes = Math.floor(
      (clockOutTime - (attendance.clockInTime || clockOutTime)) / (1000 * 60)
    );

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

    const checkoutValidation = validateCheckoutAndGetStatus({
      clockInTimestamp: attendance.clockInTime || clockOutTime,
      clockOutTimestamp: clockOutTime,
      shiftStart,
      shiftEnd,
    });

    return attendanceCrud.updateById(attendance._id.toString(), {
      clockOutTime,
      totalWorkMinutes,
      status: checkoutValidation.status,
      isAutoCheckOut: true,
      clockOutImageUrl: "",
    });
  });

  await Promise.all(updates);

  console.log(
    `[MidnightAutoCheckout] Processed ${updates.length} auto-checkouts`
  );
  return { processed: updates.length };
}
