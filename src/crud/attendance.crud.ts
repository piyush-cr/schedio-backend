import { UpdateQuery, ClientSession } from "mongoose";
import mongoose from "mongoose";
import { Attendance, IAttendance } from "../models/Attendance";
import {
  AttendanceCreateInput,
  AttendanceFilter,
  AttendanceUpdateInput,
} from "../types/attendance.types";
import { toObjectId } from "../utils/mongoUtils";

function buildQuery(filter: AttendanceFilter): any {
  const query: any = {};

  if (filter.userId) {
    query.userId = toObjectId(filter.userId);
  }

  if (filter.date) {
    query.date = filter.date; // exact yyyy-MM-dd
  }

  if (filter.startDate || filter.endDate) {
    query.date = {};
    if (filter.startDate) query.date.$gte = filter.startDate;
    if (filter.endDate) query.date.$lte = filter.endDate;
  }

  if (filter.status) {
    query.status = filter.status;
  }

  return query;
}


async function findMany(filter: AttendanceFilter = {}): Promise<IAttendance[]> {
  const query = buildQuery(filter);
  return Attendance.find(query).sort({ date: -1 });
}
async function create(
  data: AttendanceCreateInput,
  session?: ClientSession
): Promise<IAttendance> {
  const attendanceData: any = {
    ...data,
    userId: new mongoose.Types.ObjectId(data.userId),
  };
  if (session) {
    const [attendance] = await Attendance.create([attendanceData], { session });
    return attendance;
  }
  const attendance = new Attendance(attendanceData);
  return attendance.save();
}

async function findById(
  attendanceId: string,
  options: { populate?: boolean } = {}
): Promise<IAttendance | null> {
  let query = Attendance.findById(attendanceId);

  if (options.populate) {
    query = query.populate("userId", "-password");
  }

  return query;
}

async function getSummary(filter: AttendanceFilter) {
  const match = buildQuery(filter);

  return Attendance.aggregate([
    { $match: match },
    {
      $group: {
        _id: null,
        totalMinutes: { $sum: "$totalWorkMinutes" },
        daysCount: { $sum: 1 },
      },
    },
  ]);
}


async function findByUserIdAndDate(
  userId: string,
  date: string,
  session?: ClientSession
): Promise<IAttendance | null> {
  const query = Attendance.findOne({
    userId: mongoose.isValidObjectId(userId)
      ? new mongoose.Types.ObjectId(userId)
      : userId,
    date,
  } as any);
  if (session) query.session(session);
  return query;
}

async function findOneAndUpdate(
  filter: {
    userId: string;
    date: string;
    clockInTime?: { $exists: boolean };
  },
  update: UpdateQuery<AttendanceUpdateInput>,
  options: { new?: boolean; upsert?: boolean; session?: ClientSession } = {}
): Promise<IAttendance> {
  const query: any = {
    userId: toObjectId(filter.userId),
    date: filter.date,
  };

  // enforce condition AT DB LEVEL
  if (filter.clockInTime?.$exists === false) {
    query.clockInTime = { $exists: false };
  }

  try {
    const dbOptions: any = {
      new: options.new ?? true,
      runValidators: true,
      upsert: options.upsert ?? false,
    };
    if (options.session) dbOptions.session = options.session;

    const updated = await Attendance.findOneAndUpdate(query, update, dbOptions);

    if (!updated) {
      throw new Error("Already checked in today");
    }

    return updated;
  } catch (error: any) {
    if (error.code === 11000) {
      throw new Error("Already checked in today");
    }
    throw error;
  }
}


async function findOpenAttendances(date: string): Promise<IAttendance[]> {
  return Attendance.find({
    date,
    clockInTime: { $exists: true },
    clockOutTime: { $exists: false },
  })
    .populate("userId", "-password")
    .limit(1000);
}

async function findAllOpenAttendances(): Promise<IAttendance[]> {
  return Attendance.find({
    clockInTime: { $exists: true, $ne: null },
    $or: [
      { clockOutTime: { $exists: false } },
      { clockOutTime: null },
    ],
  })
    .populate("userId", "-password")
    .limit(1000);
}

async function updateById(
  attendanceId: string,
  update: UpdateQuery<AttendanceUpdateInput>,
  session?: ClientSession
): Promise<IAttendance | null> {
  const options: any = {
    new: true,
    runValidators: true,
  };
  if (session) options.session = session;
  return Attendance.findByIdAndUpdate(attendanceId, update, options);
}

async function updateByUserIdAndDate(
  userId: string,
  date: string,
  update: UpdateQuery<AttendanceUpdateInput>
): Promise<IAttendance | null> {
  return Attendance.findOneAndUpdate(
    {
      userId: toObjectId(userId),
      date,
    } as any,
    update,
    {
      new: true,
      runValidators: true,
    }
  ) as any;
}

async function deleteById(attendanceId: string): Promise<boolean> {
  const result = await Attendance.findByIdAndDelete(attendanceId);
  return !!result;
}


async function deleteByUserIdAndDate(
  userId: string,
  date: string
): Promise<boolean> {
  const result = await Attendance.findOneAndDelete({
    userId: toObjectId(userId),
    date,
  } as any);
  return !!result;
}



async function count(filter: AttendanceFilter = {}): Promise<number> {
  const query = buildQuery(filter);
  return Attendance.countDocuments(query);
}

async function findManyPaginated(
  filter: AttendanceFilter = {},
  options: { page: number; limit: number }
): Promise<IAttendance[]> {
  const query = buildQuery(filter);
  const { page, limit } = options;
  const skip = (page - 1) * limit;
  return Attendance.find(query)
    .sort({ date: -1 })
    .skip(skip)
    .limit(limit)
    .lean();
}

const attendanceCrud = {
  findMany,
  create,
  deleteById,
  deleteByUserIdAndDate,
  count,
  updateById,
  findById,
  findByUserIdAndDate,
  findOneAndUpdate,
  findOpenAttendances,
  findAllOpenAttendances,
  updateByUserIdAndDate,
  findManyPaginated,
  getSummary
};

export default attendanceCrud;
