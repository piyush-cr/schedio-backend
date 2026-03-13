import userCrud from "../../crud/user.crud";
import attendanceCrud from "../../crud/attendance.crud";
import { UserRole } from "../../types";

export const attendanceAdminService = {
    getUsersList: async (role: UserRole, teamId?: string) => {
        return userCrud.findUsersForAttendance(role, teamId);
    },

    getUserAttendance: async (
        requester: { role: UserRole; teamId?: string },
        targetUserId: string
    ) => {
        const user = await userCrud.findUserById(targetUserId);
        if (!user) throw new Error("User not found");

        if (
            requester.role === UserRole.SENIOR &&
            user.teamId !== requester.teamId
        ) {
            throw new Error("Access denied");
        }

        const attendance = await attendanceCrud.findWeekly(targetUserId);

        return { user, attendance };
    },
};
