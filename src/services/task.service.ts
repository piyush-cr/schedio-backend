import mongoose from "mongoose";
import { Priority, TaskStatus, UserRole, UserPosition } from "../types";
import { TaskRBAC } from "../rbac/task.rbac";
import { TaskPolicy, TaskAction } from "../policies/tasks.policies";
import {
  CreateTaskInput,
  DeleteTaskParams,
  GetTaskByIdParams,
  GetTasksParams,
  UpdateTaskParams,
} from "../types/tasks.types";
import { sendNotification } from "../firebase/messaging";
import userCrud from "../crud/user.crud";
import taskCrud from "../crud/task.crud";
import auditLogCrud from "../crud/auditLog.crud";
import { executeWithTransaction } from "../utils/transaction";

async function createTask(
  input: CreateTaskInput,
  assignedById: string,
  role: UserRole
) {
  if (!TaskPolicy.can(role, TaskAction.CREATE)) {
    throw new Error("Not allowed to create tasks");
  }

  const assignedUser = await userCrud.findById(input.assignedToId);
  if (!assignedUser) {
    throw new Error("Assigned user not found");
  }

  if (role === UserRole.SENIOR) {
    // Seniors can assign to Junior roles OR users with Intern position
    const isJuniorRole = assignedUser.role === UserRole.JUNIOR;
    const isInternPosition = assignedUser.position === UserPosition.INTERN;

    if (!isJuniorRole && !isInternPosition) {
      throw new Error("Seniors can only assign tasks to Junior or Intern users");
    }

    // Seniors can only assign within their own team
    const seniorUser = await userCrud.findById(assignedById);
    if (!seniorUser || seniorUser.teamId !== assignedUser.teamId) {
      throw new Error("You can only assign tasks to users in your own team");
    }
  }

  if (role === UserRole.ADMIN) {
    // Admins cannot assign tasks to other Admins
    if (assignedUser.role === UserRole.ADMIN) {
      throw new Error("Admins can only assign tasks to Senior, Junior, or Intern users");
    }
  }

  const normalize = (str: string) => str.replace(/\s+/g, "").toLowerCase();

  const title = input.title ? normalize(input.title) : null;
  const description = input.description ? normalize(input.description) : null;

  const orConditions: any[] = [];

  if (title) {
    orConditions.push({
      $expr: {
        $eq: [
          {
            $toLower: {
              $replaceAll: { input: "$title", find: " ", replacement: "" },
            },
          },
          title,
        ],
      },
    });
  }

  if (description) {
    orConditions.push({
      $expr: {
        $eq: [
          {
            $toLower: {
              $replaceAll: {
                input: "$description",
                find: " ",
                replacement: "",
              },
            },
          },
          description,
        ],
      },
    });
  }

  const newTask = await executeWithTransaction(async (session) => {
    // Check for duplicates within transaction
    if (orConditions.length > 0) {
      const duplicates = await taskCrud.findDuplicateCheck(orConditions, session);
      if (duplicates.length > 0) {
        throw new Error("Task with similar title or description already exists");
      }
    }

    const newTaskData = {
      title: input.title,
      description: input.description,
      assignedToId: new mongoose.Types.ObjectId(input.assignedToId),
      assignedById: new mongoose.Types.ObjectId(assignedById),
      priority: input.priority ?? Priority.LOW,
      status: TaskStatus.TODO,
      deadline: input.deadline,
    };

    // 🔹 If parentTaskId exists → create SUBTASK
    if (input.parentTaskId) {
      const filter = TaskRBAC.single(input.parentTaskId, assignedById, role);
      //@ts-ignore
      const parentTask = await taskCrud.findOne(filter, session);
      if (!parentTask) throw new Error("Parent task not found or access denied");

      const updatedTask = await taskCrud.pushSubtask(
        input.parentTaskId,
        {
          title: input.title,
          assignedToId: assignedUser._id,
          assignedById: new mongoose.Types.ObjectId(assignedById),
        },
        session
      );

      if (!updatedTask) {
        throw new Error("Failed to create subtask");
      }

      if (assignedUser.fcmToken) {
        await sendNotification({
          token: assignedUser.fcmToken,
          title: "New Subtask Assigned",
          body: `You have been assigned a subtask: ${input.title} under ${parentTask.title}`,
          data: {
            taskId: parentTask._id.toString(),
            type: "SUBTASK_ASSIGNED",
          },
        });
      }

      return {
        success: true,
        message: "Subtask created",
        task: await enrichTaskWithUsers(updatedTask),
      };
    }

    // 🔹 Else create NORMAL TASK
    const newTask = await taskCrud.create(newTaskData, session);

    await auditLogCrud.create(
      {
        action: "TASK_CREATED",
        performedBy: assignedById,
        targetUser: input.assignedToId,
        resource: "Task",
        resourceId: newTask._id,
        metadata: {
          title: input.title,
          priority: input.priority ?? Priority.LOW,
          deadline: input.deadline,
        },
      },
      session
    );

    if (assignedUser.fcmToken) {
      await sendNotification({
        token: assignedUser.fcmToken,
        title: "New Task Assigned",
        body: `You have been assigned a new task: ${input.title}`,
        data: {
          taskId: newTask._id.toString(),
          type: "TASK_ASSIGNED",
        },
      });
    }

    return newTask;
  });

  const enrichedTask = await enrichTaskWithUsers(newTask);

  return {
    success: true,
    task: enrichedTask,
  };
}

async function getTasks({
  userId,
  role,
  page = 1,
  limit = 10,
  status,
  priority,
  assignedToId,
  assignedById,
  search,
}: GetTasksParams) {
  const skip = (page - 1) * limit;

  // Fetch current user to check position (needed for intern position check)
  const currentUser = await userCrud.findById(userId);
  const isInternPosition = currentUser?.position === UserPosition.INTERN;

  // Seniors can see all tasks of their team regardless of who assigned them
  let teamJuniorIds: string[] = [];
  if (role === UserRole.SENIOR) {
    if (currentUser && currentUser.teamId) {
      const juniorsAndInterns = await userCrud.findMany({
        teamId: currentUser.teamId,
        role: { $in: [UserRole.JUNIOR] },
      } as any);
      teamJuniorIds = juniorsAndInterns.map((u) => u._id.toString());
    }
  }

  const filter: any = TaskRBAC.list(userId, role, teamJuniorIds);

  if (status) filter.status = status;
  if (priority) filter.priority = priority;
  if (assignedToId) filter.assignedToId = new mongoose.Types.ObjectId(assignedToId);
  if (assignedById) filter.assignedById = new mongoose.Types.ObjectId(assignedById);
  if (search) {
    filter.$or = [
      { title: { $regex: search, $options: "i" } },
      { description: { $regex: search, $options: "i" } },
    ];
  }

  const [tasks, total] = await Promise.all([
    //@ts-ignore
    taskCrud.findWithFilter(filter, { skip, limit, sort: { createdAt: -1 } }),
    //@ts-ignore
    taskCrud.countWithFilter(filter),
  ]);

  // Collect all user IDs across tasks and subtasks
  const userIds = new Set<string>();
  tasks.forEach((task: any) => {
    userIds.add(task.assignedToId.toString());
    userIds.add(task.assignedById.toString());

    if (task.subTasks && Array.isArray(task.subTasks)) {
      task.subTasks.forEach((st: any) => {
        userIds.add(st.assignedToId.toString());
        userIds.add(st.assignedById.toString());
      });
    }
  });

  const users = await userCrud.findMany({
    _id: { $in: Array.from(userIds).map((id) => new mongoose.Types.ObjectId(id)) },
  });

  const userMap = new Map();
  users.forEach((user) => {
    const userObj = user.toObject ? user.toObject() : user;
    userMap.set(user._id.toString(), {
      name: userObj.name,
      email: userObj.email,
      employeeId: userObj.employeeId,
    });
  });

  // Junior role OR intern position → can only see their own subtasks
  const isRestrictedViewer = role === UserRole.JUNIOR || isInternPosition;

  const enrichedTasks = tasks.map((task: any) => {
    const taskObj = task.toObject ? task.toObject() : task;
    const assignedTo = userMap.get(taskObj.assignedToId.toString());
    const assignedBy = userMap.get(taskObj.assignedById.toString());

    let filteredSubTasks = taskObj.subTasks || [];
    if (isRestrictedViewer && Array.isArray(filteredSubTasks)) {
      filteredSubTasks = filteredSubTasks.filter(
        (st: any) => st.assignedToId?.toString() === userId
      );
    }

    if (filteredSubTasks && Array.isArray(filteredSubTasks)) {
      taskObj.subTasks = filteredSubTasks.map((st: any) => ({
        ...st,
        assignedTo: userMap.get(st.assignedToId.toString()),
        assignedBy: userMap.get(st.assignedById.toString()),
      }));
    }

    return mapTaskWithUsers(taskObj, assignedTo, assignedBy);
  });

  return {
    data: enrichedTasks,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      hasNext: page * limit < total,
      hasPrev: page > 1,
    },
  };
}

async function getTaskById({ taskId, userId, role }: GetTaskByIdParams) {
  if (!mongoose.Types.ObjectId.isValid(taskId)) {
    throw new Error("Task not found");
  }

  const filter = TaskRBAC.single(taskId, userId, role);
  //@ts-ignore
  const task = await taskCrud.findOne(filter);

  if (!task) {
    throw new Error("Task not found or access denied");
  }

  return await enrichTaskWithUsers(task);
}

async function updateTask({
  taskId,
  userId,
  role,
  updateData,
}: UpdateTaskParams) {
  if (!TaskPolicy.can(role, TaskAction.UPDATE)) {
    throw new Error("Not allowed to update tasks");
  }

  const updated = await executeWithTransaction(async (session) => {
    // 🔹 If updating a SUBTASK
    if (updateData.subTaskId) {
      const filter = TaskRBAC.single(taskId, userId, role);
      //@ts-ignore
      const task = await taskCrud.findOne(filter, session);
      if (!task) throw new Error("Task not found or access denied");

      const subtask = task.subTasks?.find(
        (st: any) => st._id.toString() === updateData.subTaskId
      );
      if (!subtask) throw new Error("Subtask not found");

      const updatedTask = await taskCrud.updateSubtask(
        taskId,
        updateData.subTaskId,
        {
          title: updateData.title,
          isCompleted: updateData.isCompleted,
        },
        session
      );

      if (!updatedTask) {
        throw new Error("Subtask not found or update failed");
      }

      // Notify assigner when subtask is completed
      if (updateData.isCompleted && subtask.assignedById) {
        const assigner = await userCrud.findById(subtask.assignedById.toString());
        if (assigner && assigner.fcmToken) {
          await sendNotification({
            token: assigner.fcmToken,
            title: "Subtask Completed",
            body: `Subtask "${subtask.title}" has been completed.`,
            data: {
              taskId: task._id.toString(),
              type: "SUBTASK_COMPLETED",
            },
          });
        }
      }

      return await enrichTaskWithUsers(updatedTask);
    }

    // 🔹 Else update NORMAL TASK
    const filter = TaskRBAC.update(taskId, userId, role);
    //@ts-ignore
    const updated = await taskCrud.updateOne(filter, updateData, session);

    if (!updated) {
      throw new Error("Task not found or access denied");
    }

    // Notify assigner on status change
    if (updateData.status && updated.assignedById) {
      if (
        updateData.status === TaskStatus.COMPLETED ||
        updateData.status === TaskStatus.IN_PROGRESS
      ) {
        const assigner = await userCrud.findById(updated.assignedById.toString());
        const assignee = await userCrud.findById(updated.assignedToId.toString());
        if (assigner && assigner.fcmToken) {
          const action =
            updateData.status === TaskStatus.COMPLETED ? "submitted" : "accepted";
          await sendNotification({
            token: assigner.fcmToken,
            title: `Task ${action}`,
            body: `${assignee?.name || "A user"} has ${action} the task: ${updated.title}`,
            data: {
              taskId: updated._id.toString(),
              type: `TASK_${updateData.status}`,
            },
          });
        }
      }
    }

    await auditLogCrud.create(
      {
        action: "TASK_UPDATED",
        performedBy: userId,
        resource: "Task",
        resourceId: updated._id,
        metadata: {
          updates: updateData,
        },
      },
      session
    );

    return updated;
  });

  return await enrichTaskWithUsers(updated);
}

async function deleteTask({ taskId, userId, role }: DeleteTaskParams) {
  if (!TaskPolicy.can(role, TaskAction.DELETE)) {
    throw new Error("Not allowed to delete tasks");
  }

  await executeWithTransaction(async (session) => {
    const filter = TaskRBAC.delete(taskId, userId, role);
    const deleted = await taskCrud.deleteOne(filter, session);

    if (!deleted) {
      throw new Error("Task not found or access denied");
    }

    await auditLogCrud.create(
      {
        action: "TASK_DELETED",
        performedBy: userId,
        resource: "Task",
        resourceId: new mongoose.Types.ObjectId(taskId),
        metadata: {
          deletedAt: new Date(),
        },
      },
      session
    );

    return deleted;
  });

  return { message: "Task deleted successfully" };
}

function mapTask(task: any) {
  return {
    id: task._id.toString(),
    title: task.title,
    description: task.description,
    assignedToId: task.assignedToId.toString(),
    assignedById: task.assignedById.toString(),
    priority: task.priority,
    status: task.status,
    deadline: task.deadline,
    subTasks: task.subTasks || [],
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
  };
}

async function enrichTaskWithUsers(task: any) {
  const userIds = new Set<string>();
  userIds.add(task.assignedToId.toString());
  userIds.add(task.assignedById.toString());

  if (task.subTasks && Array.isArray(task.subTasks)) {
    task.subTasks.forEach((st: any) => {
      userIds.add(st.assignedToId.toString());
      userIds.add(st.assignedById.toString());
    });
  }

  const users = await userCrud.findMany({
    _id: { $in: Array.from(userIds).map((id) => new mongoose.Types.ObjectId(id)) },
  });

  const userMap = new Map();
  users.forEach((user) => {
    const userObj = user.toObject ? user.toObject() : user;
    userMap.set(user._id.toString(), {
      name: userObj.name,
      email: userObj.email,
      employeeId: userObj.employeeId,
    });
  });

  const assignedTo = userMap.get(task.assignedToId.toString());
  const assignedBy = userMap.get(task.assignedById.toString());

  const taskObj = task.toObject ? task.toObject() : task;
  if (taskObj.subTasks && Array.isArray(taskObj.subTasks)) {
    taskObj.subTasks = taskObj.subTasks.map((st: any) => ({
      ...st,
      assignedTo: userMap.get(st.assignedToId.toString()),
      assignedBy: userMap.get(st.assignedById.toString()),
    }));
  }

  return mapTaskWithUsers(taskObj, assignedTo, assignedBy);
}

function mapTaskWithUsers(task: any, assignedTo: any, assignedBy: any) {
  return {
    id: task._id.toString(),
    title: task.title,
    description: task.description,
    assignedToId: task.assignedToId.toString(),
    assignedTo: assignedTo
      ? {
          name: assignedTo.name,
          email: assignedTo.email,
          employeeId: assignedTo.employeeId,
        }
      : null,
    assignedById: task.assignedById.toString(),
    assignedBy: assignedBy
      ? {
          name: assignedBy.name,
          email: assignedBy.email,
          employeeId: assignedBy.employeeId,
        }
      : null,
    priority: task.priority,
    status: task.status,
    deadline: task.deadline,
    subTasks: task.subTasks || [],
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
  };
}

const taskService = {
  createTask,
  mapTask,
  deleteTask,
  updateTask,
  getTaskById,
  getTasks,
};

export default taskService;