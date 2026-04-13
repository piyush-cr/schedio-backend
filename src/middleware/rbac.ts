import { Response, NextFunction } from "express";
import { UserRole } from "../types";
import { AuthRequest } from "./auth";

export function requireRole(...allowedRoles: UserRole[]) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: "Authentication required",
      });
      return;
    }

    if (!allowedRoles.includes(req.user.role as UserRole)) {
      res.status(403).json({
        success: false,
        message: `Access denied. Required role: ${allowedRoles.join(" or ")}`,
      });
      return;
    }

    next();
  };
}

export const requireAdmin = requireRole(UserRole.ADMIN);

export const requireSenior = requireRole(UserRole.SENIOR, UserRole.ADMIN);

export const requireSeniorOrJunior = requireRole(
  UserRole.SENIOR,
  UserRole.JUNIOR
);

export const requireAnyRole = requireRole(
  UserRole.ADMIN,
  UserRole.SENIOR,
  UserRole.JUNIOR
);

export function canAccessResource(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void {
  if (!req.user) {
    res.status(401).json({
      success: false,
      message: "Authentication required",
    });
    return;
  }

  if (req.user.role === UserRole.ADMIN || req.user.role === UserRole.SENIOR) {
    next();
    return;
  }

  const resourceUserId =
    (req as any).params?.userId || (req as any).body?.userId;
  if (resourceUserId && resourceUserId === req.user.userId) {
    next();
    return;
  }

  res.status(403).json({
    success: false,
    message: "Access denied. You can only access your own resources",
  });
}
