import mongoose from "mongoose";
import { UserRole } from "../types";

export class TaskRBAC {
  static list(userId: string, role: UserRole, teamMemberIds: string[] = []) {
    const uid = new mongoose.Types.ObjectId(userId);

    if (role === UserRole.ADMIN) {
      return {};
    }

    if (role === UserRole.SENIOR) {
      const juniorIds = teamMemberIds.map(id => new mongoose.Types.ObjectId(id));
      return {
        $or: [
          { assignedById: uid },
          { assignedToId: uid },
          { "subTasks.assignedToId": uid },
          { "subTasks.assignedById": uid },
          { assignedToId: { $in: juniorIds } }
        ],
      };
    }

    // JUNIOR (covers both EMPLOYEE and INTERN positions)
    if (role === UserRole.JUNIOR) {
      return {
        $or: [
          { assignedById: uid },
          { assignedToId: uid },
          { "subTasks.assignedToId": uid },
          { "subTasks.assignedById": uid }
        ],
      };
    }

    return {
      $or: [
        { "subTasks.assignedToId": uid }
      ]
    };
  }

  static single(taskId: string, userId: string, role: UserRole) {
    const tid = new mongoose.Types.ObjectId(taskId);
    const uid = new mongoose.Types.ObjectId(userId);

    if (role === UserRole.ADMIN) {
      return { _id: tid };
    }

    if (role === UserRole.SENIOR) {
      return {
        _id: tid,
        $or: [
          { assignedById: uid },
          { assignedToId: uid },
          { "subTasks.assignedToId": uid },
          { "subTasks.assignedById": uid }
        ],
      };
    }

    // JUNIOR (covers both EMPLOYEE and INTERN positions)
    if (role === UserRole.JUNIOR) {
      return {
        _id: tid,
        $or: [
          { assignedById: uid },
          { assignedToId: uid },
          { "subTasks.assignedToId": uid },
          { "subTasks.assignedById": uid }
        ],
      };
    }

    return {
      _id: tid,
      $or: [
        { assignedToId: uid },
        { "subTasks.assignedToId": uid }
      ]
    };
  }

  static update(taskId: string, userId: string, role: UserRole) {
    return this.single(taskId, userId, role);
  }

  static delete(taskId: string, userId: string, role: UserRole) {
    return this.single(taskId, userId, role);
  }
}
