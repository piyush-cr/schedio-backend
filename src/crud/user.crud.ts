import { ClientSession, UpdateQuery } from "mongoose";
import { User, IUser } from "../models/User";
import {
  UserCreateInput,
  UserFilter,
  UserUpdateInput,
} from "../types/user.types";
import { UserRole } from "../types";

async function create(data: UserCreateInput): Promise<IUser> {
  try {
    const user = new User(data);
    return user.save();
  } catch (error) {
    throw new Error("User couldn't be created");
  }
}

async function findById(userId: string): Promise<IUser | null> {
  return User.findById(userId);
}

async function findByEmail(email: string): Promise<IUser | null> {
  return User.findOne({ email }).select("+password");
}

async function findByEmployeeId(employeeId: string): Promise<IUser | null> {
  return User.findOne({ employeeId });
}

async function findMany(filter: UserFilter = {}): Promise<IUser[]> {
  return User.find(filter).select("-password");
}

async function updateById(
  userId: string,
  update: UpdateQuery<UserUpdateInput>,
  session?: ClientSession
): Promise<IUser | null> {
  const options: any = {
    new: true,
    runValidators: true,
  };
  if (session) options.session = session;
  return User.findByIdAndUpdate(userId, update, options);
}

async function updatePassword(
  userId: string,
  password: string,
  session?: ClientSession
): Promise<IUser | null> {
  const user = await User.findById(userId);
  if (!user) return null;
  user.password = password;
  return user.save({ session });
}

async function deleteById(userId: string): Promise<void> {
  await User.findByIdAndDelete(userId);
}

async function validatePassword(
  email: string,
  password: string
): Promise<IUser | null> {
  const user = await User.findOne({ email: email.toLowerCase() }).select("+password");
  
  if (!user) {
    console.log("User not found for email:", email);
    return null;
  }
  
  console.log("User found:", user.email);
  console.log("Password hash exists:", !!user.password);
  console.log("Password hash:", user.password?.substring(0, 20) + "...");
  
  const isValid = await user.comparePassword(password);
  console.log("Password valid:", isValid);
  
  return isValid ? user : null;
}

async function findUsersForAttendance(role: UserRole, teamId?: string) {
  const filter = role === UserRole.SENIOR ? { teamId } : {};

  return await User.find(filter)
    .select("_id name employeeId role teamId");
}

async function findUserById(userId: string) {
  return await User.findById(userId)
    .select("_id name employeeId role teamId");
}

async function findManyPaginated(
  filter: UserFilter = {},
  options: { page: number; limit: number }
): Promise<IUser[]> {
  const { page, limit } = options;
  const skip = (page - 1) * limit;
  return User.find(filter)
    .select("-password")
    .skip(skip)
    .limit(limit);
}

async function count(filter: UserFilter = {}): Promise<number> {
  return User.countDocuments(filter);
}

async function findOneByEmailOrEmployeeId(
  email?: string,
  employeeId?: string
): Promise<IUser | null> {
  const query: any = {};
  if (email) query.email = email;
  if (employeeId) query.employeeId = employeeId;

  if (Object.keys(query).length === 0) {
    return null;
  }

  return User.findOne(query);
}

const userCrud = {
  create,
  findById,
  findByEmail,
  findByEmployeeId,
  findMany,
  updateById,
  updatePassword,
  deleteById,
  validatePassword,
  findUsersForAttendance,
  findUserById,
  findManyPaginated,
  count,
  findOneByEmailOrEmployeeId,
};

export default userCrud;
