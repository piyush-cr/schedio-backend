import userCrud from "../../crud/user.crud";
import { UserRole } from "../../types";
import { getWeeklyAttendance } from "../attendance";
import { ForbiddenError, NotFoundError } from "../../utils/ApiError";

export const attendanceAdminService = {
    getUsersList: async (role: UserRole, teamId?: string) => {
        return userCrud.findUsersForAttendance(role, teamId);
    },

    getUserAttendance: async (
        requester: { role: UserRole; teamId?: string },
        targetUserId: string
    ) => {
        const user = await userCrud.findUserById(targetUserId);
        if (!user) throw new NotFoundError("User not found");

        if (
            requester.role === UserRole.SENIOR &&
            user.teamId !== requester.teamId
        ) {
            throw new ForbiddenError("Access denied");
        }

        const attendance = await getWeeklyAttendance({
            userId: targetUserId
        });

        return { user, attendance };
    },
};
