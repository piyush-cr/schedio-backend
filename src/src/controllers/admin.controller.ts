import { Response, NextFunction } from "express";
import { AuthRequest } from "../middleware/auth";
import adminService from "../services/admin.service";
import {
  BadRequestError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
} from "../utils/ApiError";

export async function createUser(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const adminId = req.user?.userId;

    if (!adminId) throw new UnauthorizedError("User is unauthorized");
    if (req.body.role === "ADMIN") throw new ForbiddenError("Creating an Admin user is not allowed");

    const user = await adminService.createUserByAdmin(adminId, req.body);

    if (!user.success) throw new BadRequestError(user.message);

    res.status(201).json({
      success: true,
      message: "User created",
      data: user.user,
      tempPassword: user.tempPassword,
    });
  } catch (error) {
    return next(error);
  }
}

export async function changeUserPassword(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const adminId = req.user?.userId;
    const { userId } = req.params;
    const { password } = req.body;

    if (!adminId) throw new UnauthorizedError("User is unauthorized");
    if (adminId === userId) throw new ForbiddenError("You cannot change your own password through the admin interface");

    await adminService.adminChangeUserPassword(adminId, userId, password);

    res.json({
      success: true,
      message: "Password updated successfully",
    });
  } catch (error) {
    return next(error);
  }
}

export async function updateUser(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const adminId = req.user?.userId;
    const { userId } = req.params;

    if (!adminId) throw new UnauthorizedError("User is unauthorized");
    if (adminId === userId) throw new ForbiddenError("You cannot update your own account through the admin interface");
    if (req.body.role === "ADMIN") throw new ForbiddenError("Promoting users to Admin is not allowed");

    const user = await adminService.updateUserByAdmin(adminId, userId, req.body);

    res.json({
      success: true,
      message: "User updated successfully",
      data: user,
    });
  } catch (error) {
    return next(error);
  }
}

export async function getAllUsers(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { role, teamId, search, page, limit } = req.query;

    const result = await adminService.getAllUsersByAdmin({
      role: role as string,
      teamId: teamId as string,
      search: search as string,
      page: Number(page),
      limit: Number(limit),
    });

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    return next(error);
  }
}

export async function getUserById(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { userId } = req.params;

    const user = await adminService.getUserByAdmin(userId);

    if (!user) throw new NotFoundError("User not found");

    res.json({
      success: true,
      data: user,
    });
  } catch (error) {
    return next(error);
  }
}

export async function deleteUser(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const adminId = req.user?.userId;
    const { userId } = req.params;

    if (!adminId) throw new UnauthorizedError("User is unauthorized");
    if (adminId === userId) throw new ForbiddenError("You cannot delete yourself");

    await adminService.deleteUserByAdmin(adminId, userId);

    res.json({
      success: true,
      message: "User deleted successfully",
    });
  } catch (error) {
    return next(error);
  }
}