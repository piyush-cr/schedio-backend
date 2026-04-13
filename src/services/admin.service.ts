import crypto from "crypto";
import userCrud from "../crud/user.crud";
import auditLogCrud from "../crud/auditLog.crud";
import { ApiError } from "../utils/ApiError";
import { UserRole } from "../types";

export async function createUserByAdmin(adminId: string, data: any) {
  if (!data.email && !data.employeeId) {
    throw new ApiError(
      "Either email or employeeId must be provided",
      400
    );
  }

  const existingUser = await userCrud.findOneByEmailOrEmployeeId(
    data.email,
    data.employeeId
  );

  if (existingUser) {
    return {
      success: false,
      message: "can't create user already exists",
      data: existingUser,
    };
  }
  else {
    const plainPassword = data.password || crypto.randomBytes(6).toString("hex");

    const user = await userCrud.create({
      ...data,
      password: plainPassword,
    })

    await auditLogCrud.create({
      action: "USER_CREATED",
      performedBy: adminId,
      targetUser: user._id,
      metadata: {
        role: user.role,
        teamId: user.teamId,
      },
    });

    const userObj = user.toObject ? user.toObject() : user;
    //@ts-ignore
    delete userObj.password;

    return {
      success: true,
      user: userObj,
      tempPassword: plainPassword,
    };
  }
}



async function adminChangeUserPassword(
  adminId: string,
  userId: string,
  newPassword: string
) {
  const user = await userCrud.findById(userId);

  if (!user) {
    throw new Error("User not found");
  }

  await userCrud.updatePassword(userId, newPassword);

  await auditLogCrud.create({
    action: "USER_PASSWORD_CHANGED",
    performedBy: adminId,
    targetUser: userId,
    metadata: {},
  });

  return { success: true };
}

async function updateUserByAdmin(
  adminId: string,
  userId: string,
  updates: any
) {
  const user = await userCrud.findById(userId);

  if (!user) {
    throw new Error("User not found");
  }

  const updatedUser = await userCrud.updateById(userId, updates);

  await auditLogCrud.create({
    action: "USER_UPDATED",
    performedBy: adminId,
    targetUser: userId,
    metadata: updates,
  });

  if (!updatedUser) {
    throw new Error("User update failed");
  }

  const userObj = updatedUser.toObject ? updatedUser.toObject() : updatedUser;
  //@ts-ignore
  delete userObj.password;

  return userObj;
}

/**
 * GET ALL USERS
 */
async function getAllUsersByAdmin(query: {
  role?: string;
  teamId?: string;
  search?: string;
  page?: number;
  limit?: number;
}) {
  const { role, teamId, search, page = 1, limit = 20 } = query;

  const filter: any = {};

  if (role) filter.role = role;
  if (teamId) filter.teamId = teamId;

  if (search) {
    filter.$or = [
      { name: { $regex: search, $options: "i" } },
      { email: { $regex: search, $options: "i" } },
      { employeeId: { $regex: search, $options: "i" } },
    ];
  }

  const [users, total] = await Promise.all([
    userCrud.findManyPaginated(filter, { page, limit }),
    userCrud.count(filter),
  ]);

  return {
    users,
    total,
    page,
    limit,
  };
}

async function getUserByAdmin(userId: string) {
  const user = await userCrud.findById(userId);

  if (!user) {
    throw new Error("User not found");
  }

  const userObj = user.toObject ? user.toObject() : user;
  delete userObj.password;
  return userObj;
}

async function deleteUserByAdmin(adminId: string, userId: string) {
  const user = await userCrud.findById(userId);

  if (!user) {
    throw new Error("User not found");
  }

  if (adminId === userId) {
    throw new Error("You cannot delete yourself");
  }

  if (user.role === UserRole.ADMIN) {
    throw new Error("Cannot delete another admin");
  }

  await userCrud.deleteById(userId);

  await auditLogCrud.create({
    action: "USER_DELETED",
    performedBy: adminId,
    targetUser: userId,
    resource: "User",
    resourceId: userId,
  });

  return { success: true };
}

const adminService = {
  createUserByAdmin,
  adminChangeUserPassword,
  updateUserByAdmin,
  getAllUsersByAdmin,
  getUserByAdmin,
  deleteUserByAdmin,
};

export default adminService;
