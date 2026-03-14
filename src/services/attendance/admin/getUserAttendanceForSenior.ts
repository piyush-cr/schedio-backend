import userCrud from "../../../crud/user.crud";
import { getTodayAttendance } from "../queries/getTodayAttendance";
import { getWeeklyAttendance } from "../reports/getWeeklyAttendance";
import { getMonthlyAttendance } from "../reports/getMonthlyAttendance";
import { getAttendanceLogs, GetAttendanceLogsResult } from "../queries/getAttendanceLogs";
import { assertNotJunior } from "../_shared/permissions";

export interface GetUserAttendanceForSeniorParams {
  requester: {
    userId: string;
    role: string;
  };
  targetUserId: string;
  weekStart?: string;
  month?: number;
  year?: number;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
}

export interface GetUserAttendanceForSeniorResult {
  success?: boolean;
  message?: string;
  user?: {
    id: string;
    name: string;
    email: string;
    role: string;
    shiftStart?: string;
  };
  attendance?: {
    today: ReturnType<typeof getTodayAttendance> extends Promise<infer T>
      ? T
      : never;
    weekly: ReturnType<typeof getWeeklyAttendance> extends Promise<infer T>
      ? T
      : never;
    monthly: ReturnType<typeof getMonthlyAttendance> extends Promise<infer T>
      ? T
      : never;
    customRange: ReturnType<typeof getAttendanceLogs> extends Promise<infer T>
      ? T
      : never;
  };
}

/**
 * Get comprehensive attendance for a target user (used by senior/admin)
 */
export async function getUserAttendanceForSenior(
  params: GetUserAttendanceForSeniorParams
): Promise<GetUserAttendanceForSeniorResult> {
  const {
    requester,
    targetUserId,
    weekStart,
    month,
    year,
    startDate,
    endDate,
    page,
    limit,
  } = params;

  const authCheck = assertNotJunior(requester.role);
  if (!authCheck.valid) {
    return {
      success: false,
      message: authCheck.message,
    };
  }

  const user = await userCrud.findById(targetUserId);
  if (!user) {
    throw new Error("User not found");
  }

  const [today, weekly, monthly] = await Promise.all([
    getTodayAttendance(targetUserId),
    getWeeklyAttendance({
      userId: targetUserId,
      weekStart,
    }),
    getMonthlyAttendance({
      userId: targetUserId,
      month,
      year,
    }),
  ]);

  let customRange = null;
  if (startDate || endDate || page || limit) {
    customRange = await getAttendanceLogs({
      userId: targetUserId,
      startDate,
      endDate,
      page,
      limit,
    });
  }

  return {
    user: {
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      role: user.role,
      shiftStart: user.shiftStart,
    },
    attendance: {
      today,
      weekly,
      monthly,
      customRange: customRange ?? { logs: [], pagination: { total: 0, page: 1, limit: 10, totalPages: 1 } } as GetAttendanceLogsResult,
    },
  };
}
