import { format, eachDayOfInterval, subDays } from "date-fns";
import { AttendanceStatus } from "../../../types";
import attendanceCrud from "../../../crud/attendance.crud";
import { getLastDateOfWeek } from "../../../utils/dateUtils";
import { formatTimeTo12Hour } from "../_shared/time";

export interface GetWeeklyAttendanceParams {
  userId: string;
  weekStart?: string;
}

export interface WeeklyAttendanceCounts {
  presentDays: number;
  lateDays: number;
  halfDays: number;
  absentDays: number;
}

export interface DailyLog {
  date: string;
  dayOfWeek: string;
  clockInTime: string | null;
  clockInImageUrl: string | null;
  clockOutTime: string | null;
  clockOutImageUrl: string | null;
  totalWorkMinutes: number;
  status: AttendanceStatus;
}

export interface GetWeeklyAttendanceResult {
  weekRange: string;
  totalHoursThisWeek: number;
  averageClockInTime: string;
  counts: WeeklyAttendanceCounts;
  dailyLogs: DailyLog[];
}

/**
 * Get weekly attendance report for a user
 */
export async function getWeeklyAttendance(
  params: GetWeeklyAttendanceParams
): Promise<GetWeeklyAttendanceResult> {
  const { userId, weekStart } = params;

  const now = new Date();
  const todayStr = format(now, "yyyy-MM-dd");

  let weekLast = getLastDateOfWeek(weekStart);
  if (weekLast > now) {
    weekLast = now;
  }

  const weekStartDate = subDays(weekLast, 6);
  weekStartDate.setHours(0, 0, 0, 0);

  const weekStartStr = format(weekStartDate, "yyyy-MM-dd");
  const weekEndStr = format(weekLast, "yyyy-MM-dd");

  const records = await attendanceCrud.findMany({
    userId,
    startDate: weekStartStr,
    endDate: weekEndStr,
  });

  const recordsByDate = new Map<string, any>();
  records.forEach((r) => recordsByDate.set(r.date, r));

  const daysInRange = eachDayOfInterval({
    start: weekStartDate,
    end: weekLast,
  });

  const dailyLogs: DailyLog[] = [];
  let totalMinutes = 0;
  const clockInMinutesArray: number[] = [];

  let presentDays = 0;
  let lateDays = 0;
  let halfDays = 0;
  let absentDays = 0;

  for (const day of daysInRange) {
    const dateStr = format(day, "yyyy-MM-dd");
    const dayOfWeek = format(day, "EEEE");
    const record = recordsByDate.get(dateStr);

    if (record) {
      let displayMinutes = record.totalWorkMinutes || 0;

      const isLiveToday =
        record.clockInTime &&
        !record.clockOutTime &&
        dateStr === todayStr;

      if (isLiveToday) {
        displayMinutes = Math.max(
          Math.floor((now.getTime() - record.clockInTime) / 60000),
          0
        );
      } else {
        totalMinutes += record.totalWorkMinutes || 0;
      }

      switch (record.status) {
        case AttendanceStatus.PRESENT:
          presentDays++;
          break;
        case AttendanceStatus.LATE:
          presentDays++;
          lateDays++;
          break;
        case AttendanceStatus.HALF_DAY:
          presentDays++;
          halfDays++;
          break;
        case AttendanceStatus.ABSENT:
          absentDays++;
          break;
      }

      if (record.clockInTime && record.clockOutTime) {
        const d = new Date(record.clockInTime);
        clockInMinutesArray.push(d.getHours() * 60 + d.getMinutes());
      }

      dailyLogs.push({
        date: dateStr,
        dayOfWeek,
        clockInTime: record.clockInTime
          ? formatTimeTo12Hour(record.clockInTime)
          : null,
        clockInImageUrl: record.clockInImageUrl || null,
        clockOutTime: record.clockOutTime
          ? formatTimeTo12Hour(record.clockOutTime)
          : null,
        clockOutImageUrl: record.clockOutImageUrl || null,
        totalWorkMinutes: displayMinutes,
        status: record.status,
      });
    } else {
      if (dateStr !== todayStr) {
        absentDays++;
      }
      dailyLogs.push({
        date: dateStr,
        dayOfWeek,
        clockInTime: null,
        clockInImageUrl: null,
        clockOutTime: null,
        clockOutImageUrl: null,
        totalWorkMinutes: 0,
        status: AttendanceStatus.ABSENT,
      });
    }
  }

  const totalHoursThisWeek = Math.round((totalMinutes / 60) * 100) / 100;

  let averageClockInTime = "N/A";
  if (clockInMinutesArray.length > 0) {
    const avgMinutes =
      clockInMinutesArray.reduce((s, m) => s + m, 0) /
      clockInMinutesArray.length;

    const hours = Math.floor(avgMinutes / 60);
    const minutes = Math.floor(avgMinutes % 60);

    averageClockInTime = `${hours.toString().padStart(2, "0")}:${minutes
      .toString()
      .padStart(2, "0")}`;
  }

  const weekRange = `${format(weekStartDate, "dd MMM")} - ${format(weekLast, "dd MMM")}`;

  return {
    weekRange,
    totalHoursThisWeek,
    averageClockInTime,
    counts: {
      presentDays,
      lateDays,
      halfDays,
      absentDays,
    },
    dailyLogs,
  };
}
