import { Request, Response, NextFunction } from "express";
import {
  verifyToken,
  verifyRefreshToken,
  generateToken,
  generateRefreshToken,
} from "../utils/auth";
import { JWTPayload } from "../types";
import { UnauthorizedError, NotFoundError, ApiError } from "../utils/ApiError";
import userCrud from "../crud/user.crud";

export interface AuthRequest extends Request {
  user?: JWTPayload;
}

export async function authenticate(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const token =
      req.cookies?.access_token ||
      (req.headers.authorization?.startsWith("Bearer ")
        ? req.headers.authorization.split(" ")[1]
        : undefined);

    if (token) {
      try {
        const decoded = verifyToken(token);
        req.user = decoded;
        next();
        return;
      } catch {
        // Token invalid/expired — fall through to refresh token logic
      }
    }

    const refreshToken =
      req.cookies?.refresh_token || req.headers["x-refresh-token"];

    if (!refreshToken) {
      throw new UnauthorizedError(
        "Authentication required (access token and refresh token missing)"
      );
    }

    try {
      const decoded = verifyRefreshToken(refreshToken as string);

      const user = await userCrud.findById(decoded.userId);
      if (!user) {
        throw new NotFoundError("User not found");
      }

      const tokenPayload = {
        userId: user._id.toString(),
        employeeId: user.employeeId,
        role: user.role,
        email: user.email,
      };

      const newAccessToken = generateToken(tokenPayload);
      const newRefreshToken = generateRefreshToken(tokenPayload);

      res.cookie("access_token", newAccessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: 24 * 60 * 60 * 1000,
      });

      res.cookie("refresh_token", newRefreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });

      req.user = tokenPayload;
      next();
    } catch (error) {
      // Re-throw ApiErrors so errorHandler catches them
      if (error instanceof ApiError) throw error;
      throw new UnauthorizedError("Invalid or expired refresh token");
    }
  } catch (error) {
    next(error); // Pass all errors to errorHandler
  }
}