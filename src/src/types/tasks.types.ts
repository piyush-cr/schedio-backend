import { Priority, TaskStatus, UserRole } from ".";

export interface CreateTaskInput {
  title: string;
  description?: string;
  assignedToId: string;
  priority?: Priority;
  deadline?: string;
  parentTaskId?: string; // if present → create subtask
}

export interface UpdateTaskInput {
  title?: string;
  description?: string;
  status?: TaskStatus;
  priority?: Priority;
  deadline?: string;
  assignedToId?: string;
  subTaskId?: string;    // if present → updating subtask
  isCompleted?: boolean;
}

export interface GetTasksParams {
  userId: string;
  role: UserRole;
  page?: number;
  limit?: number;
  status?: TaskStatus;
  priority?: Priority;
  assignedToId?: string;
  assignedById?: string;
  search?: string;
}

export interface GetTaskByIdParams {
  taskId: string;
  userId: string;
  role: UserRole;
}

export interface UpdateTaskParams {
  taskId: string;
  userId: string;
  role: UserRole;
  updateData: UpdateTaskInput;
}

export interface DeleteTaskParams {
  taskId: string;
  userId: string;
  role: UserRole;
}
