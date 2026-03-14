import mongoose, { ClientSession } from "mongoose";
import { Taskmodel } from "../models/Task";

/* Infer Mongoose types (version-proof) */
type TaskFilter = Parameters<typeof Taskmodel.find>[0];
type TaskUpdate = Parameters<typeof Taskmodel.findOneAndUpdate>[1];

interface FindOptions {
  skip?: number;
  limit?: number;
  sort?: Record<string, 1 | -1>;
  session?: ClientSession;
}

interface SubtaskData {
  title: string;
  assignedToId: string | mongoose.Types.ObjectId;
  assignedById: string | mongoose.Types.ObjectId;
}

interface SubtaskUpdate {
  title?: string;
  isCompleted?: boolean;
}

async function create(
  data: Parameters<typeof Taskmodel.create>[0],
  session?: ClientSession
) {
  if (session) {
    const [task] = await Taskmodel.create([data], { session });
    return task.toObject();
  }
  const task = await Taskmodel.create(data);
  return task.toObject();
}

async function findWithFilter(filter: TaskFilter, options: FindOptions = {}) {
  const q = Taskmodel.find(filter);

  if (options.skip) q.skip(options.skip);
  if (options.limit) q.limit(options.limit);
  if (options.sort) q.sort(options.sort);
  if (options.session) q.session(options.session);

  return q;
}

async function countWithFilter(filter: TaskFilter, session?: ClientSession) {
  const query = Taskmodel.countDocuments(filter);
  if (session) query.session(session);
  return query;
}

async function findOne(filter: TaskFilter, session?: ClientSession) {
  const query = Taskmodel.findOne(filter);
  if (session) query.session(session);
  return query;
}

async function updateOne(
  filter: TaskFilter,
  data: TaskUpdate,
  session?: ClientSession
) {
  const options: any = {
    new: true,
    runValidators: true,
  };
  if (session) options.session = session;

  return Taskmodel.findOneAndUpdate(filter, data, options);
}

async function deleteOne(filter: any, session?: ClientSession) {
  const options: any = {};
  if (session) options.session = session;

  const res = await Taskmodel.deleteOne(filter, options);
  return res.deletedCount === 1;
}

async function findDuplicateCheck(
  orConditions: any[],
  session?: ClientSession
): Promise<any[]> {
  const query = Taskmodel.find({ $or: orConditions });
  if (session) query.session(session);
  return query;
}

async function pushSubtask(
  taskId: string,
  subtaskData: SubtaskData,
  session?: ClientSession
): Promise<any | null> {
  const update = {
    $push: {
      subTasks: {
        title: subtaskData.title,
        assignedToId:
          typeof subtaskData.assignedToId === "string"
            ? new mongoose.Types.ObjectId(subtaskData.assignedToId)
            : subtaskData.assignedToId,
        assignedById:
          typeof subtaskData.assignedById === "string"
            ? new mongoose.Types.ObjectId(subtaskData.assignedById)
            : subtaskData.assignedById,
      },
    },
  };

  const options: any = { new: true, runValidators: true };
  if (session) options.session = session;

  return await Taskmodel.findOneAndUpdate({ _id: taskId }, update, options);
}

async function updateSubtask(
  taskId: string,
  subTaskId: string,
  updateData: SubtaskUpdate,
  session?: ClientSession
): Promise<any | null> {
  const update: any = {};

  if (updateData.title) {
    update.$set = { ...update.$set, "subTasks.$[sub].title": updateData.title };
  }

  if (typeof updateData.isCompleted === "boolean") {
    update.$set = {
      ...update.$set,
      "subTasks.$[sub].isCompleted": updateData.isCompleted,
      "subTasks.$[sub].completedAt": updateData.isCompleted ? new Date() : null,
    };
  }

  const options: any = {
    new: true,
    runValidators: true,
    arrayFilters: [{ "sub._id": subTaskId }],
  };
  if (session) options.session = session;

  return await Taskmodel.findOneAndUpdate(
    { _id: taskId, "subTasks._id": subTaskId },
    update,
    options
  );
}

const taskCrud = {
  create,
  findWithFilter,
  countWithFilter,
  findOne,
  updateOne,
  deleteOne,
  findDuplicateCheck,
  pushSubtask,
  updateSubtask,
};

export default taskCrud;

