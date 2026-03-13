import { UpdateQuery } from "mongoose";
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
    throw new Error("User couldn't be created")
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
  update: UpdateQuery<UserUpdateInput>
): Promise<IUser | null> {
  return User.findByIdAndUpdate(userId, update, {
    new: true,
    runValidators: true,
  });
}

async function updatePassword(userId: string, password: string): Promise<void> {
  const user = await User.findById(userId).select("+password");
  if (!user) throw new Error("User not found");

  user.password = password;
  await user.save();
}

async function deleteById(userId: string): Promise<void> {
  await User.findByIdAndDelete(userId);
}

async function validatePassword(
  email: string,
  password: string
): Promise<IUser | null> {
  const user = await User.findOne({ email }).select("+password");
  console.log("this is user")
  if (!user) return null;

  console.log(password)
  const isValid = await user.comparePassword(password);
  console.log(isValid)
  return isValid ? user : null;
}

async function findUsersForAttendance(role: UserRole, teamId?: string) {
  const filter =
    role === UserRole.SENIOR ? { teamId } : {};

  return await User.find(filter).select(
    "_id name employeeId role teamId"
  );
}

async function findUserById(userId: string) {
  return await User.findById(userId).select(
    "_id name employeeId role teamId"
  );
}

async function findManyPaginated(
  filter: UserFilter = {},
  options: { page: number; limit: number }
): Promise<IUser[]> {
  const { page, limit } = options;
  const skip = (page - 1) * limit;
  return User.find(filter).select("-password").skip(skip).limit(limit);
}

async function count(filter: UserFilter = {}): Promise<number> {
  return User.countDocuments(filter);
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
  count
};

export default userCrud;
