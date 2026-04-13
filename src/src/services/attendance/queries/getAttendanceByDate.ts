import attendanceCrud from "../../../crud/attendance.crud";
import { formatTimeTo12Hour } from "../_shared/time";

export interface GetAttendanceByDateParams {
  userId: string;
  date: string;
}

export interface AttendanceByDateResult {
  date: string;
  clockInTime: string | null;
  clockOutTime: string | null;
  clockInImageUrl: string | null;
  clockOutImageUrl: string | null;
  status: string;
  totalWorkMinutes: number;
}

/**
 * Get attendance record for a specific date
 */
export async function getAttendanceByDate(
  params: GetAttendanceByDateParams
): Promise<AttendanceByDateResult | null> {
  const { userId, date } = params;

  const attendance = await attendanceCrud.findByUserIdAndDate(userId, date);

  if (!attendance) return null;

  return {
    date: attendance.date,
    clockInTime: attendance.clockInTime
      ? formatTimeTo12Hour(attendance.clockInTime)
      : null,
    clockOutTime: attendance.clockOutTime
      ? formatTimeTo12Hour(attendance.clockOutTime)
      : null,
    clockInImageUrl: attendance.clockInImageUrl ?? null,
    clockOutImageUrl: attendance.clockOutImageUrl ?? null,
    status: attendance.status,
    totalWorkMinutes: attendance.totalWorkMinutes ?? 0,
  };
}
