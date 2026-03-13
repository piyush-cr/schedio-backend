import crypto from "crypto";
import { User } from "../models/User";
import { AuditLog } from "../models/AuditLog";
import userCrud from "../crud/user.crud";
import { ApiError } from "../utils/ApiError";
import { UserRole } from "../types";

export async function createUserByAdmin(adminId: string, data: any) {
  if (!data.email && !data.employeeId) {
    throw new ApiError(
      "Either email or employeeId must be provided",
      400
    );
  }

  // if (data.role === UserRole.SENIOR && data.teamId) {
  //   const existingSenior = await User.findOne({
  //     role: UserRole.SENIOR,
  //     teamId: data.teamId,
  //   });

  //   if (existingSenior) {
  //     return {
  //       success: false,
  //       message: "A Senior user already exists in this team. Only one senior is allowed per team.",
  //     };
  //   }
  // }

  const existingUser = await User.findOne({
    $or: [{ email: data.email }, { employeeId: data.employeeId }],
  });

  console.log(existingUser)
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


    await AuditLog.create({
      action: "USER_CREATED",
      performedBy: adminId,
      targetUser: user._id,
      metadata: {
        role: user.role,
        teamId: user.teamId,
      },
    });

    const userObj = user.toObject();
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
  const user = await User.findById(userId).select("+password");

  if (!user) {
    throw new Error("User not found");
  }

  user.password = newPassword;


  await user.save();

  return { success: true };
}

/**
 * UPDATE USER
 */
async function updateUserByAdmin(
  adminId: string,
  userId: string,
  updates: any
) {
  const user = await User.findById(userId);

  if (!user) {
    throw new Error("User not found");
  }

  // If role is being updated to SENIOR or teamId is changing for a SENIOR
  // if (
  //   (updates.role === UserRole.SENIOR && updates.teamId) || // Changing role to SENIOR with teamId
  //   (updates.role === UserRole.SENIOR && user.teamId && !updates.teamId) || // Changing role to SENIOR keep existing teamId
  //   (user.role === UserRole.SENIOR && updates.teamId) // Existing SENIOR changing teamId
  // ) {
  //   const targetTeamId = updates.teamId || user.teamId;

  //   // If checking specifically for this user, we need to make sure we don't count the user themselves 
  //   // if they are already the senior in that team (though logic implies we are checking for conflicts)

  //   // Actually simpler check:
  //   // If we are assigning a teamId and the resulting user will be a SENIOR
  //   const newRole = updates.role || user.role;
  //   if (newRole === UserRole.SENIOR && targetTeamId) {
  //     const existingSenior = await User.findOne({
  //       role: UserRole.SENIOR,
  //       teamId: targetTeamId,
  //       _id: { $ne: user._id } // exclude self
  //     });

  //     if (existingSenior) {
  //       throw new Error("A Senior user already exists in this team.");
  //     }
  //   }
  // }

  Object.assign(user, updates);
  await user.save();

  await AuditLog.create({
    action: "USER_UPDATED",
    performedBy: adminId,
    targetUser: user._id,
    metadata: updates,
  });

  const userObj = user.toObject();
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

  const users = await User.find(filter)
    .select("-password")
    .skip((page - 1) * limit)
    .limit(limit)
    .sort({ createdAt: -1 });

  const total = await User.countDocuments(filter);

  return {
    users,
    total,
    page,
    limit,
  };
}

/**
 * GET USER BY ID
 */
async function getUserByAdmin(userId: string) {
  const user = await User.findById(userId).select("-password");

  if (!user) {
    throw new Error("User not found");
  }

  return user;
}

/**
 * DELETE USER BY ADMIN
 */
async function deleteUserByAdmin(adminId: string, userId: string) {
  const user = await User.findById(userId);

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

  await AuditLog.create({
    action: "USER_DELETED",
    performedBy: adminId,
    targetUser: user._id,
    resource: "User",
    resourceId: user._id,
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
