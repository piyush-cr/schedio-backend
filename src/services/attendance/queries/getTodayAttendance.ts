import { format } from "date-fns";
import { AttendanceStatus } from "../../../types";
import attendanceCrud from "../../../crud/attendance.crud";
import { formatTimeTo12Hour } from "../_shared/time";

export interface TodayAttendanceResult {
  date: string;
  clockedIn: boolean;
  clockedOut: boolean;
  clockInTime: string | null;
  clockInImageUrl: string | null;
  clockOutTime: string | null;
  clockOutImageUrl: string | null;
  status: AttendanceStatus;
  totalWorkMinutes: number;
}

/**
 * Get today's attendance status for a user
 */
export async function getTodayAttendance(
  userId: string
): Promise<TodayAttendanceResult> {
  const today = format(new Date(), "yyyy-MM-dd");

  const attendance = await attendanceCrud.findByUserIdAndDate(userId, today);

  let totalWorkMinutes = attendance?.totalWorkMinutes || 0;

  if (attendance?.clockInTime && !attendance?.clockOutTime) {
    const clockIn = new Date(attendance.clockInTime);
    const diffMs = Date.now() - clockIn.getTime();
    totalWorkMinutes = Math.max(Math.floor(diffMs / 60000), 0);
  }

  return {
    date: today,
    clockedIn: !!attendance?.clockInTime,
    clockedOut: !!attendance?.clockOutTime,
    clockInTime: attendance?.clockInTime
      ? formatTimeTo12Hour(attendance.clockInTime)
      : null,
    clockInImageUrl: attendance?.clockInImageUrl || null,
    clockOutTime: attendance?.clockOutTime
      ? formatTimeTo12Hour(attendance.clockOutTime)
      : null,
    clockOutImageUrl: attendance?.clockOutImageUrl || null,
    status:
      attendance?.status === AttendanceStatus.LATE ||
      attendance?.status === AttendanceStatus.HALF_DAY ||
      attendance?.status === AttendanceStatus.NOT_FULL_DAY
        ? AttendanceStatus.PRESENT
        : attendance?.status || AttendanceStatus.ABSENT,
    totalWorkMinutes,
  };
}
