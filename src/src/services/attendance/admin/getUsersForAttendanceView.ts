import { startOfWeek, format } from "date-fns";
import { UserRole } from "../../../types";
import userCrud from "../../../crud/user.crud";
import attendanceCrud from "../../../crud/attendance.crud";
import { getTodayAttendance } from "../queries/getTodayAttendance";
import { assertAdminOrSenior, getSeniorTeamFilter } from "../_shared/permissions";
import { normalizePagination } from "../_shared/pagination";
import { Types } from "mongoose";

export interface GetUsersForAttendanceViewParams {
  requesterId: string;
  role: string;
  page?: number;
  limit?: number;
}

export interface UserAttendanceItem {
  id: Types.ObjectId;
  name: string;
  email: string;
  role: string;
  today: ReturnType<typeof getTodayAttendance> extends Promise<infer T>
    ? T
    : never;
  weeklyTotal: number;
}

export interface GetUsersForAttendanceViewResult {
  success: boolean;
  message?: string;
  data?: {
    users: UserAttendanceItem[];
    pagination: {
      total: number;
      page: number;
      limit: number;
      totalPages: number;
    };
  };
}

/**
 * Get paginated list of users with attendance info (for admin/senior view)
 */
export async function getUsersForAttendanceView(
  params: GetUsersForAttendanceViewParams
): Promise<GetUsersForAttendanceViewResult> {
  const { requesterId, role, page = 1, limit = 10 } = params;

  const authCheck = assertAdminOrSenior(role);
  if (!authCheck.valid) {
    return {
      success: false,
      message: authCheck.message,
    };
  }

  let filter: any = {};
  if (role === UserRole.SENIOR) {
    const teamFilter = await getSeniorTeamFilter(requesterId);
    if (!teamFilter.valid) {
      return {
        success: false,
        message: teamFilter.message,
      };
    }
    filter = teamFilter.filter;
  }

  const total = await userCrud.count(filter);
  const pagination = normalizePagination({ page, limit }, total);

  const users = await userCrud.findManyPaginated(filter, {
    page,
    limit,
  });

  const now = new Date();
  const weekStart = startOfWeek(now, { weekStartsOn: 0 });
  const weekStartStr = format(weekStart, "yyyy-MM-dd");
  const weekEndStr = format(now, "yyyy-MM-dd");

  const usersWithAttendance = await Promise.all(
    users.map(async (user) => {
      const [today, weeklyRecords] = await Promise.all([
        getTodayAttendance(user._id.toString()),
        attendanceCrud.findMany({
          userId: user._id.toString(),
          startDate: weekStartStr,
          endDate: weekEndStr,
        }),
      ]);

      const weeklyMinutes = weeklyRecords.reduce((sum, record) => {
        let minutes = record.totalWorkMinutes || 0;

        if (
          record.date === today.date &&
          record.clockInTime &&
          !record.clockOutTime
        ) {
          minutes = today.totalWorkMinutes;
        }

        return sum + minutes;
      }, 0);

      const weeklyTotalHours = Math.round((weeklyMinutes / 60) * 100) / 100;

      return {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        today,
        weeklyTotal: weeklyTotalHours,
      };
    })
  );

  return {
    success: true,
    data: {
      users: usersWithAttendance,
      pagination: {
        total,
        page: pagination.page,
        limit: pagination.limit,
        totalPages: pagination.totalPages,
      },
    },
  };
}
