<<<<<<< HEAD
import userCrud from '../crud/user.crud';
import { UserFilter, UserUpdateInput, IUser } from '../types/user.types';
import { ApiError } from '../utils/ApiError';

async function getMe(userId: string): Promise<IUser> {
  const user = await userCrud.findById(userId);
  if (!user) {
    throw new ApiError('User not found', 404);
  }
  return user;
}

/**
 * Update a user's own profile fields.
 * `phone` is updatable; `role` changes are NOT permitted here (admin-only).
 *
 * INTERN users are treated exactly like any other employee-like role —
 * they can update their own `name`, `phone`, and `fcmToken`.
 */
async function updateProfile(
  userId: string,
  updates: Pick<UserUpdateInput, 'name' | 'phone' | 'fcmToken'>,
): Promise<IUser> {
  const user = await userCrud.updateById(userId, updates);
  if (!user) {
    throw new ApiError('User not found', 404);
  }
  return user;
}

async function listUsers(
  filter: UserFilter = {},
  options: { page: number; limit: number } = { page: 1, limit: 20 },
): Promise<{ users: IUser[]; total: number; page: number; limit: number }> {
  const [users, total] = await Promise.all([
    userCrud.findManyPaginated(filter, options),
    userCrud.count(filter),
  ]);
  return { users, total, page: options.page, limit: options.limit };
}

async function getFcmToken(userId: string): Promise<string | null> {
  const user = await userCrud.findById(userId);
  if (!user) {
    throw new ApiError('User not found', 404);
  }
  return user.fcmToken;
}

const userService = { getMe, updateProfile, listUsers,getFcmToken };
export default userService;
=======
import userCrud from "../crud/user.crud";
import { UserFilter, UserUpdateInput, IUser } from "../types/user.types";
import { ApiError } from "../utils/ApiError";

async function getMe(userId: string): Promise<IUser> {
  const user = await userCrud.findById(userId);
  if (!user) {
    throw new ApiError("User not found", 404);
  }
  return user;
}

/**
 * Update a user's own profile fields.
 * `phone` is updatable; `role` changes are NOT permitted here (admin-only).
 *
 * INTERN users are treated exactly like any other employee-like role —
 * they can update their own `name`, `phone`, and `fcmToken`.
 */
async function updateProfile(
  userId: string,
  updates: Pick<UserUpdateInput, "name" | "phone" | "fcmToken">
): Promise<IUser> {
  const user = await userCrud.updateById(userId, updates);
  if (!user) {
    throw new ApiError("User not found", 404);
  }
  return user;
}

async function listUsers(
  filter: UserFilter = {},
  options: { page: number; limit: number } = { page: 1, limit: 20 }
): Promise<{ users: IUser[]; total: number; page: number; limit: number }> {
  const [users, total] = await Promise.all([
    userCrud.findManyPaginated(filter, options),
    userCrud.count(filter),
  ]);
  return { users, total, page: options.page, limit: options.limit };
}

const userService = { getMe, updateProfile, listUsers };
export default userService;
>>>>>>> a0b9806cb8726afe5c21c423d73ce7f3047d053c
