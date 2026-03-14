

import { format, eachDayOfInterval, startOfMonth, endOfMonth } from "date-fns";
import { AttendanceStatus } from "../../../types";
import attendanceCrud from "../../../crud/attendance.crud";
import { formatTimeTo12Hour } from "../_shared/time";

export interface GetMonthlyAttendanceParams {
  userId: string;
  month?: number;
  year?: number;
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

export interface GetMonthlyAttendanceResult {
  month: string;
  startDate: string;
  endDate: string;
  totalHoursThisMonth: number;
  averageClockInTime: string;
  totalWorkingDays: number;
  presentDays: number;
  absentDays: number;
  lateDays: number;
  halfDays: number;
  notFullDays: number;
  dailyLogs: DailyLog[];
}

/**
 * Get monthly attendance report for a user
 */
export async function getMonthlyAttendance(
  params: GetMonthlyAttendanceParams
): Promise<GetMonthlyAttendanceResult> {
  const { userId, month, year } = params;

  const now = new Date();
  const todayStr = format(now, "yyyy-MM-dd");

  const targetYear = year ?? now.getFullYear();
  const targetMonth = month !== undefined ? month - 1 : now.getMonth();

  const referenceDate = new Date(targetYear, targetMonth, 1);
  const monthStartDate = startOfMonth(referenceDate);
  const monthStartStr = format(monthStartDate, "yyyy-MM-dd");

  const monthEndDate = endOfMonth(referenceDate);
  const monthEndStr = format(monthEndDate, "yyyy-MM-dd");

  const monthlyRecords = await attendanceCrud.findMany({
    userId,
    startDate: monthStartStr,
    endDate: monthEndStr,
  });

  const recordsByDate = new Map<string, any>();
  monthlyRecords.forEach((r) => recordsByDate.set(r.date, r));

  const isCurrentMonth =
    targetYear === now.getFullYear() && targetMonth === now.getMonth();
  const rangeEnd = isCurrentMonth ? now : monthEndDate;

  const allDays = eachDayOfInterval({
    start: monthStartDate,
    end: rangeEnd,
  });

  const dailyLogs: DailyLog[] = [];
  let totalMinutes = 0;
  const clockInMinutesArray: number[] = [];

  let presentDays = 0;
  let lateDays = 0;
  let halfDays = 0;
  let notFullDays = 0;
  let absentDays = 0;

  for (const day of allDays) {
    const dateStr = format(day, "yyyy-MM-dd");
    const dayOfWeek = format(day, "EEEE");
    const record = recordsByDate.get(dateStr);

    if (record) {
      const isLiveToday =
        record.clockInTime &&
        !record.clockOutTime &&
        dateStr === todayStr;

      let effectiveWorkMinutes = record.totalWorkMinutes || 0;

      if (isLiveToday) {
        effectiveWorkMinutes = Math.max(
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
        case AttendanceStatus.NOT_FULL_DAY:
          presentDays++;
          notFullDays++;
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
        totalWorkMinutes: effectiveWorkMinutes,
        status:
          record.status === AttendanceStatus.LATE ||
          record.status === AttendanceStatus.HALF_DAY ||
          record.status === AttendanceStatus.NOT_FULL_DAY
            ? AttendanceStatus.PRESENT
            : record.status,
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

  const totalHoursThisMonth = Math.round((totalMinutes / 60) * 100) / 100;

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

  const monthLabel = format(monthStartDate, "MMMM yyyy");

  return {
    month: monthLabel,
    startDate: monthStartStr,
    endDate: monthEndStr,
    totalHoursThisMonth,
    averageClockInTime,
    totalWorkingDays: allDays.length,
    presentDays,
    absentDays,
    lateDays,
    halfDays,
    notFullDays,
    dailyLogs,
  };
}
