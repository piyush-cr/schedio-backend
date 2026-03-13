import mongoose from "mongoose";
import { Priority, TaskStatus, UserRole } from "../types";
import { TaskRBAC } from "../rbac/task.rbac";
import { TaskPolicy, TaskAction } from "../policies/tasks.policies";
import {
  CreateTaskInput,
  DeleteTaskParams,
  GetTaskByIdParams,
  GetTasksParams,
  UpdateTaskParams,
} from "../types/tasks.types";
import { queueNotification } from "../jobs/queues/app.queue";
import { Taskmodel } from "../models/Task";
import userCrud from "../crud/user.crud";
import taskCrud from "../crud/task.crud";

import { sendNotification } from "../firebase/messaging";

import {
  executeWithTransaction,
  createAuditLogEntry,
} from "../utils/transaction";

async function createTask(
  input: CreateTaskInput,
  assignedById: string,
  role: UserRole
) {
  if (!TaskPolicy.can(role, TaskAction.CREATE)) {
    throw new Error("Not allowed to create tasks");
  }

  // Hierarchical Assignment Rules
  const assignedUser = await userCrud.findById(input.assignedToId);
  if (!assignedUser) {
    throw new Error("Assigned user not found");
  }

  if (role === UserRole.SENIOR) {
    // Seniors can only assign to Juniors/Interns
    if (
      assignedUser.role !== UserRole.JUNIOR &&
      assignedUser.role !== UserRole.INTERN
    ) {
      throw new Error("Seniors can only assign tasks to Junior or Intern users");
    }

    // Seniors can only assign to Juniors in their own team
    const seniorUser = await userCrud.findById(assignedById);
    if (!seniorUser || seniorUser.teamId !== assignedUser.teamId) {
      throw new Error("You can only assign tasks to Juniors in your own team");
    }
  }

  if (role === UserRole.ADMIN) {
    // Admins can assign to Senior, Junior, or Intern
    if (
      assignedUser.role !== UserRole.SENIOR && 
      assignedUser.role !== UserRole.JUNIOR &&
      assignedUser.role !== UserRole.INTERN
    ) {
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

  // Use transaction for atomic task creation
  const newTask = await executeWithTransaction(async (session) => {
    // Check for duplicates with session lock
    if (orConditions.length > 0) {
      const tasks = await Taskmodel.find({ $or: orConditions }).session(
        session
      );
      if (tasks[0]) {
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
    const parentTask = await Taskmodel.findOne(filter);
    if (!parentTask) throw new Error("Parent task not found or access denied");

    parentTask.subTasks.push({
      title: input.title,
      assignedToId: assignedUser._id,
      assignedById: new mongoose.Types.ObjectId(assignedById),
    });

    await parentTask.save();

    // Notify assigned user about subtask
    if (assignedUser.fcmToken) {
      await queueNotification({
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
      task: await enrichTaskWithUsers(parentTask)
    };
  }

  // 🔹 Else create NORMAL TASK
  const newTask = await taskCrud.create(newTaskData,   session);
  await createAuditLogEntry(
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
  
  // Queue notification to assigned user
   if (assignedUser.fcmToken) {
     await queueNotification({
      token: assignedUser.fcmToken,
    title: "New Task Assigned",
    body: `You have been assigned a new task: ${input.title}`,
    data: {
      taskId: newTask._id.toString(),
      type: "TASK_ASSIGNED",
    },

  })
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


  //Senior can see all tasks of his team regardless of who assigned them
  let teamJuniorIds: string[] = [];
  if (role === UserRole.SENIOR) {
    const user = await userCrud.findById(userId);
    if (user && user.teamId) {
      const juniorsAndInterns = await userCrud.findMany({
        teamId: user.teamId,
        role: { $in: [UserRole.JUNIOR, UserRole.INTERN] },
      } as any);
      teamJuniorIds = juniorsAndInterns.map((u) => u._id.toString());
    }
  }

  const filter: any = TaskRBAC.list(userId, role, teamJuniorIds);

  if (status) {
    filter.status = status;
  }
  if (priority) {
    filter.priority = priority;
  }
  if (assignedToId) {
    filter.assignedToId = new mongoose.Types.ObjectId(assignedToId);
  }
  if (assignedById) {
    filter.assignedById = new mongoose.Types.ObjectId(assignedById);
  }
  if (search) {
    filter.$or = [
      { title: { $regex: search, $options: "i" } },
      { description: { $regex: search, $options: "i" } },
    ];
  }

  const [tasks, total] = await Promise.all([
    //@ts-ignore
    taskCrud.findWithFilter(filter, {
      skip,
      limit,
      sort: { createdAt: -1 },
    }),
    //@ts-ignore
    taskCrud.countWithFilter(filter),
  ]);

  // Fetch user information for all tasks (including subtasks)
  const userIds = new Set<string>();
  tasks.forEach((task: any) => {
    userIds.add(task.assignedToId.toString());
    userIds.add(task.assignedById.toString());

    // Add subtask user IDs
    if (task.subTasks && Array.isArray(task.subTasks)) {
      task.subTasks.forEach((st: any) => {
        userIds.add(st.assignedToId.toString());
        userIds.add(st.assignedById.toString());
      });
    }
  });

  const users = await userCrud.findMany({
    _id: { $in: Array.from(userIds).map(id => new mongoose.Types.ObjectId(id)) }
  });

  // Create a map for quick lookup
  const userMap = new Map();
  users.forEach(user => {
    const userObj = user.toObject ? user.toObject() : user;
    userMap.set(user._id.toString(), {
      name: userObj.name,
      email: userObj.email,
      employeeId: userObj.employeeId
    });
  });

  // Enrich tasks with user information
  const enrichedTasks = tasks.map((task: any) => {
    const taskObj = task.toObject ? task.toObject() : task;
    const assignedTo = userMap.get(taskObj.assignedToId.toString());
    const assignedBy = userMap.get(taskObj.assignedById.toString());

    // Filter subtasks for junior users - they can only see subtasks assigned to them
    let filteredSubTasks = taskObj.subTasks || [];
    if (
      (role === UserRole.JUNIOR || role === UserRole.INTERN) &&
      Array.isArray(filteredSubTasks)
    ) {
      filteredSubTasks = filteredSubTasks.filter((st: any) => 
        st.assignedToId?.toString() === userId
      );
    }

    // Enrich subtasks with user information
    if (filteredSubTasks && Array.isArray(filteredSubTasks)) {
      taskObj.subTasks = filteredSubTasks.map((st: any) => {
        return {
          ...st,
          assignedTo: userMap.get(st.assignedToId.toString()),
          assignedBy: userMap.get(st.assignedById.toString())
        };
      });
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
    const filter = TaskRBAC.update(taskId, userId, role);
    const task = await Taskmodel.findOne(filter);
    if (!task) throw new Error("Task not found or access denied");

    const subTask = task.subTasks.id(updateData.subTaskId);
    if (!subTask) throw new Error("Subtask not found");

    if (updateData.title) subTask.title = updateData.title;
    if (typeof updateData.isCompleted === "boolean") {
      subTask.isCompleted = updateData.isCompleted;
      subTask.completedAt = updateData.isCompleted ? new Date() : null;

      // Notify assigner when subtask is completed
      if (updateData.isCompleted) {
        const assigner = await userCrud.findById(subTask.assignedById.toString());
        if (assigner && assigner.fcmToken) {
          await queueNotification({
            token: assigner.fcmToken,
            title: "Subtask Completed",
            body: `Subtask "${subTask.title}" has been completed.`,
            data: {
              taskId: task._id.toString(),
              type: "SUBTASK_COMPLETED",
            },
          });
        }
      }
    }

    await task.save();
    return await enrichTaskWithUsers(task);
  }

  // 🔹 Else update NORMAL TASK
  const filter = TaskRBAC.update(taskId, userId, role);
  //@ts-ignore
  const updated = await taskCrud.updateOne(filter, updateData,session);

    if (!updated) {
      throw new Error("Task not found or access denied");
    }

    // Create audit log for update
    await createAuditLogEntry(
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

  // Use transaction for atomic delete with audit log
  await executeWithTransaction(async (session) => {
    const filter = TaskRBAC.delete(taskId, userId, role);
    //@ts-ignore
    const deleted = await taskCrud.deleteOne(filter, session);

    if (!deleted) {
      throw new Error("Task not found or access denied");
    }

    // Create audit log for deletion
    await createAuditLogEntry(
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
    _id: { $in: Array.from(userIds).map(id => new mongoose.Types.ObjectId(id)) }
  });

  const userMap = new Map();
  users.forEach(user => {
    const userObj = user.toObject ? user.toObject() : user;
    userMap.set(user._id.toString(), {
      name: userObj.name,
      email: userObj.email,
      employeeId: userObj.employeeId
    });
  });

  const assignedTo = userMap.get(task.assignedToId.toString());
  const assignedBy = userMap.get(task.assignedById.toString());

  const taskObj = task.toObject ? task.toObject() : task;
  if (taskObj.subTasks && Array.isArray(taskObj.subTasks)) {
    taskObj.subTasks = taskObj.subTasks.map((st: any) => {
      return {
        ...st,
        assignedTo: userMap.get(st.assignedToId.toString()),
        assignedBy: userMap.get(st.assignedById.toString())
      };
    });
  }

  return mapTaskWithUsers(taskObj, assignedTo, assignedBy);
}

function mapTaskWithUsers(task: any, assignedTo: any, assignedBy: any) {
  return {
    id: task._id.toString(),
    title: task.title,
    description: task.description,
    assignedToId: task.assignedToId.toString(),
    assignedTo: assignedTo ? {
      name: assignedTo.name,
      email: assignedTo.email,
      employeeId: assignedTo.employeeId
    } : null,
    assignedById: task.assignedById.toString(),
    assignedBy: assignedBy ? {
      name: assignedBy.name,
      email: assignedBy.email,
      employeeId: assignedBy.employeeId
    } : null,
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
