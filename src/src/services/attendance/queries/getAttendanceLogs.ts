import { format } from "date-fns";
import attendanceCrud from "../../../crud/attendance.crud";
import { normalizePagination } from "../_shared/pagination";

export interface GetAttendanceLogsParams {
  userId: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
}

export interface AttendanceLog {
  date: string;
  dayOfWeek: string;
  clockInTime: number | null;
  clockInImageUrl: string | null;
  clockOutTime: number | null;
  totalWorkMinutes: number;
  status: string;
}

export interface GetAttendanceLogsResult {
  logs: AttendanceLog[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

/**
 * Get paginated attendance logs for a user with optional date range
 */
export async function getAttendanceLogs(
  params: GetAttendanceLogsParams
): Promise<GetAttendanceLogsResult> {
  const { userId, startDate, endDate, page = 1, limit = 10 } = params;

  const filter: any = {
    userId,
  };

  if (startDate || endDate) {
    filter.date = {};
    if (startDate) filter.date.$gte = startDate;
    if (endDate) filter.date.$lte = endDate;
  }

  const total = await attendanceCrud.count(filter);

  const records = await attendanceCrud.findManyPaginated(filter, {
    page,
    limit,
  });

  const pagination = normalizePagination({ page, limit }, total);
  const now = new Date();

  const logs: AttendanceLog[] = records.map((record) => {
    let effectiveWorkMinutes = record.totalWorkMinutes || 0;

    if (record.clockInTime && !record.clockOutTime) {
      effectiveWorkMinutes = Math.max(
        Math.floor((now.getTime() - record.clockInTime) / 60000),
        0
      );
    }

    return {
      date: record.date,
      dayOfWeek: format(new Date(record.date), "EEEE"),
      clockInTime: record.clockInTime || null,
      clockInImageUrl: record.clockInImageUrl || null,
      clockOutTime: record.clockOutTime || null,
      totalWorkMinutes: effectiveWorkMinutes,
      status: record.status,
    };
  });

  return {
    logs,
    pagination: {
      total,
      page: pagination.page,
      limit: pagination.limit,
      totalPages: pagination.totalPages,
    },
  };
}
