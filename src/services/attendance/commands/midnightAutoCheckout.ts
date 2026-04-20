import attendanceCrud from "../../../crud/attendance.crud";
import userCrud from "../../../crud/user.crud";
import { timeStringToMinutes, timestampToMinutesInTimezone } from "../_shared/time";

export interface MidnightAutoCheckoutResult {
  processed: number;
}

/**
 * Midnight auto-checkout: closes ALL open attendance records.
 * Sets clockOutTime to 23:59:59 of check-in day so the record
 * stays on the correct date. No time restriction.
 */
export async function midnightAutoCheckout(): Promise<MidnightAutoCheckoutResult> {
  const openAttendances = await attendanceCrud.findOpenAttendances();

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

    // --- Overtime calculation ---
    let overtimeMinutes = 0;
    if (shiftEnd) {
      const shiftEndMinutes = timeStringToMinutes(shiftEnd);
      const clockOutMinutes = timestampToMinutesInTimezone(clockOutTime, "Asia/Kolkata");
      overtimeMinutes = Math.max(0, clockOutMinutes - shiftEndMinutes);
    }

    // Flush any active geofence breach session
    let totalGeofenceBreachMinutes = attendance.totalGeofenceBreachMinutes ?? 0;
    if (attendance.geofenceBreachedAt) {
      const sessionMinutes = (clockOutTime - (attendance.geofenceBreachedAt as number)) / (1000 * 60);
      totalGeofenceBreachMinutes += sessionMinutes;
    }

    return attendanceCrud.updateById(attendance._id.toString(), {
      clockOutTime,
      totalWorkMinutes,
      overtimeMinutes,
      totalGeofenceBreachMinutes: Math.round(totalGeofenceBreachMinutes * 100) / 100,
      geofenceBreachedAt: null,
      isAutoCheckOut: true,
      clockOutImageUrl: attendance.clockInImageUrl,
    });
  });

  await Promise.all(updates);

  console.log(
    `[MidnightAutoCheckout] Processed ${updates.length} auto-checkouts`
  );
  return { processed: updates.length };
}

