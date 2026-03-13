import { ClientSession } from "mongoose";
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

  return q.lean();
}

async function countWithFilter(filter: TaskFilter, session?: ClientSession) {
  const query = Taskmodel.countDocuments(filter);
  if (session) query.session(session);
  return query;
}

async function findOne(filter: TaskFilter, session?: ClientSession) {
  const query = Taskmodel.findOne(filter);
  if (session) query.session(session);
  return query.lean();
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

  return Taskmodel.findOneAndUpdate(filter, data, options).lean();
}

async function deleteOne(filter: any, session?: ClientSession) {
  const options: any = {};
  if (session) options.session = session;

  const res = await Taskmodel.deleteOne(filter, options);
  return res.deletedCount === 1;
}

const taskCrud = {
  create,
  findWithFilter,
  countWithFilter,
  findOne,
  updateOne,
  deleteOne,
};

export default taskCrud;

