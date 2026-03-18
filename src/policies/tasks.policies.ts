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
      [UserRole.JUNIOR]: [TaskAction.READ, TaskAction.UPDATE],
      [UserRole.ADMIN]: Object.values(TaskAction),
    };

    return matrix[role]?.includes(action) ?? false;
  }
}
