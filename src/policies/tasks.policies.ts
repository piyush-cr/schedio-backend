import { UserRole } from "../types";

export enum TaskAction {
  READ = "READ",
  UPDATE = "UPDATE",
  DELETE = "DELETE",
  CREATE = "CREATE",
}

export class TaskPolicy {
  static can(role: UserRole, action: TaskAction) {
    if (role === UserRole.ADMIN) return true;

    const matrix: Record<UserRole, TaskAction[]> = {
      [UserRole.SENIOR]: [
        TaskAction.CREATE,
        TaskAction.READ,
        TaskAction.UPDATE,
        TaskAction.DELETE,
      ],
      /**
       * JUNIOR covers both employee and intern positions.
       * Interns have the same task permissions as regular juniors.
       * Fine-grained position-based restrictions can be added here if needed.
       */
      [UserRole.JUNIOR]: [TaskAction.READ, TaskAction.UPDATE],
      [UserRole.ADMIN]: Object.values(TaskAction),
    };

    return matrix[role]?.includes(action) ?? false;
  }
}
