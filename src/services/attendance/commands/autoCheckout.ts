import { format } from "date-fns";
import { AttendanceStatus } from "../../../types";
import attendanceCrud from "../../../crud/attendance.crud";
import userCrud from "../../../crud/user.crud";
import { validateCheckoutAndGetStatus } from "../_shared/status";

export interface AutoCheckoutResult {
  processed: number;
}

/**
 * Auto-checkout for all open attendances at 6 PM
 */
export async function autoCheckout(): Promise<AutoCheckoutResult> {
  const today = format(new Date(), "yyyy-MM-dd");
  const currentHour = new Date().getHours();

  if (currentHour < 18) {
    console.log("[AutoCheckout] Skipping - before 6 PM");
    return { processed: 0 };
  }

  const openAttendances = await attendanceCrud.findOpenAttendances(today);

  if (openAttendances.length === 0) {
    return { processed: 0 };
  }

  const clockOutTime = Date.now();
  const updates = openAttendances.map(async (attendance) => {
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
    });
  });

  await Promise.all(updates);

  console.log(
    `[AutoCheckout] Processed ${updates.length} auto-checkouts`
  );
  return { processed: updates.length };
}
