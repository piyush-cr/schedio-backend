import { UpdateQuery, ClientSession } from "mongoose";
import mongoose from "mongoose";
import type { QueryFilter } from "mongoose";
import { Attendance, IAttendance } from "../models/Attendance";
import {
  AttendanceCreateInput,
  AttendanceFilter,
  AttendanceUpdateInput,
} from "../types/attendance.types";
import { toObjectId } from "../utils/mongoUtils";


const OPEN_ATTENDANCE_LIMIT = 1000;


interface AttendanceSummary {
  totalMinutes: number;
  daysCount: number;
}

interface FindOpenAttendancesFilter {
  date?: string;
}


function buildQuery(filter: AttendanceFilter): any {
  const query: any = {};

  if (filter.userId) {
    query.userId = toObjectId(filter.userId);
  }

  // Fix: use else-if so date is not overwritten by startDate/endDate
  if (filter.date) {
    query.date = filter.date;
  } else if (filter.startDate || filter.endDate) {
    query.date = {};
    if (filter.startDate) query.date.$gte = filter.startDate;
    if (filter.endDate) query.date.$lte = filter.endDate;
  }

  if (filter.status) {
    query.status = filter.status;
  }

  return query;
}

// ─── CRUD Functions ───────────────────────────────────────────────────────────

async function findMany(filter: AttendanceFilter = {}): Promise<IAttendance[]> {
  const query = buildQuery(filter);
  return Attendance.find(query).sort({ date: -1 });
}

async function findManyPaginated(
  filter: AttendanceFilter = {},
  options: { page: number; limit: number }
): Promise<IAttendance[]> {
  const query = buildQuery(filter);
  const { page, limit } = options;
  const skip = (page - 1) * limit;
  // Removed .lean() to keep return type consistent with IAttendance[]
  return Attendance.find(query).sort({ date: -1 }).skip(skip).limit(limit);
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
  // Guard against invalid ObjectId to avoid Mongoose cast errors
  if (!mongoose.isValidObjectId(attendanceId)) return null;

  let query = Attendance.findById(attendanceId);

  if (options.populate) {
    query = query.populate("userId", "-password");
  }

  return query;
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
    //@ts-ignore
    return updated;
  } catch (error: any) {
    if (error.code === 11000) {
      throw new Error("Already checked in today");
    }
    throw error;
  }
}

async function updateById(
  attendanceId: string,
  update: UpdateQuery<AttendanceUpdateInput>,
  session?: ClientSession
): Promise<IAttendance | null> {
  if (!mongoose.isValidObjectId(attendanceId)) return null;

  const options: any = { new: true, runValidators: true };
  if (session) options.session = session;

  return Attendance.findByIdAndUpdate(attendanceId, update, options);
}

async function updateByUserIdAndDate(
  userId: string,
  date: string,
  update: UpdateQuery<AttendanceUpdateInput>
): Promise<IAttendance | null> {
  return Attendance.findOneAndUpdate(
    { userId: toObjectId(userId), date } as any,
    update,
    { new: true, runValidators: true }
  ) as any;
}

async function deleteById(attendanceId: string): Promise<boolean> {
  if (!mongoose.isValidObjectId(attendanceId)) return false;
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

async function getSummary(
  filter: AttendanceFilter
): Promise<AttendanceSummary[]> {
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
    {
      $project: {
        _id: 0,
        totalMinutes: 1,
        daysCount: 1,
      },
    },
  ]);
}

/**
 * Find open attendances (clocked in but not out).
 * Pass a `date` to filter by a specific day, or omit to get all open across all dates.
 */


async function findOpenAttendances(
  filter: FindOpenAttendancesFilter = {}
): Promise<IAttendance[]> {
  const query: QueryFilter<IAttendance> = {
    clockInTime: { $exists: true, $ne: null },
    $or: [
      { clockOutTime: { $exists: false } },
      { clockOutTime: null },
      { clockOutTime: 0 },
    ],
  };

  if (filter.date) {
    query.date = filter.date;
  }

  return Attendance.find(query)
    .populate("userId", "-password")
    .limit(OPEN_ATTENDANCE_LIMIT)
    .lean();
}


const attendanceCrud = {
  findMany,
  findManyPaginated,
  create,
  findById,
  findByUserIdAndDate,
  findOneAndUpdate,
  updateById,
  updateByUserIdAndDate,
  deleteById,
  deleteByUserIdAndDate,
  count,
  getSummary,
  findOpenAttendances,
};

export default attendanceCrud;