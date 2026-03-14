import mongoose from "mongoose";
import { Response } from "express";
import { AuthRequest } from "../middleware/auth";
import adminService from "../services/admin.service";
import { ApiError } from "../utils/ApiError";

export async function createUser(req: AuthRequest, res: Response) {
  const adminId = req.user!.userId;
  if (!adminId) {
    throw new ApiError("Unauthorized", 401);
  }

  if (req.body.role === "ADMIN") {
    return res.status(403).json({
      success: false,
      message: "Creating an Admin user is not allowed"
    });
  }

  const user = await adminService.createUserByAdmin(adminId, req.body);
  if (!user.success) {
    return res.status(400).json({
      success: user.success,
      message: user.message,
      data: user.data,
    });
  }

  return res.status(201).json({
    success: true,
    message: "User created",
    data: user.user,
    tempPassword: user.tempPassword,
  });
}


export async function changeUserPassword(req: AuthRequest, res: Response) {
  try {
    const adminId = req.user!.userId;
    const { userId } = req.params;
    const { password } = req.body;

    if (adminId === userId) {
      return res.status(403).json({
        success: false,
        message: "You cannot change your own password through the admin interface"
      });
    }

    await adminService.adminChangeUserPassword(adminId, userId, password);

    return res.json({
      success: true,
      message: "Password updated successfully",
    });
  } catch (error: any) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
}

export async function updateUser(req: AuthRequest, res: Response) {
  try {
    const adminId = req.user!.userId;
    const { userId } = req.params;

    if (req.body.role === "ADMIN") {
      return res.status(403).json({
        success: false,
        message: "Promoting users to Admin is not allowed"
      });
    }

    const user = await adminService.updateUserByAdmin(
      adminId,
      userId,
      req.body
    );

    return res.json({
      success: true,
      message: "User updated successfully",
      data: user,
    });
  } catch (error: any) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
}


export async function getAllUsers(req: AuthRequest, res: Response) {
  try {
    const { role, teamId, search, page = "1", limit = "20" } = req.query;

    const result = await adminService.getAllUsersByAdmin({
      role: role as string,
      teamId: teamId as string,
      search: search as string,
      page: Number(page),
      limit: Number(limit),
    });

    return res.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
}

export async function getUserById(req: AuthRequest, res: Response) {
  try {
    const { userId } = req.params;

    const user = await adminService.getUserByAdmin(userId);

    return res.json({
      success: true,
      data: user,
    });
  } catch (error: any) {
    return res.status(404).json({
      success: false,
      message: error.message,
    });
  }
}

export async function deleteUser(req: AuthRequest, res: Response) {
  try {
    const adminId = req.user!.userId;
    const { userId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID",
      });
    }

    if (adminId === userId) {
      return res.status(403).json({
        success: false,
        message: "You cannot delete yourself",
      });
    }

    await adminService.deleteUserByAdmin(adminId, userId);

    return res.json({
      success: true,
      message: "User deleted successfully",
    });
  } catch (error: any) {
    const msg = error.message;
    if (msg === "User not found") {
      return res.status(404).json({ success: false, message: msg });
    }
    if (msg === "Cannot delete another admin" || msg === "You cannot delete yourself") {
      return res.status(403).json({ success: false, message: msg });
    }
    return res.status(400).json({
      success: false,
      message: msg,
    });
  }
}
