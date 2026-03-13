import { Request, Response, NextFunction } from "express";
import {
  verifyToken,
  verifyRefreshToken,
  generateToken,
  generateRefreshToken,
} from "../utils/auth";
import { JWTPayload } from "../types";
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

    // const token=req.headers.authorization?.split(" ")
    const token =
      req.cookies?.access_token
      ||
      (req.headers.authorization && req.headers.authorization.startsWith("Bearer ")
        ? req.headers.authorization.split(" ")[1]
        : undefined);
    console.log(token)
    if (token) {
      const decoded = verifyToken(token);
      req.user = decoded;
      next();
      return;
    }

    const refreshToken =
      req.cookies?.refresh_token || req.headers["x-refresh-token"];

    if (!refreshToken) {
      res.status(401).json({
        success: false,
        message:
          "Authentication required (access token and refresh token missing)",
      });
      return;
    }

    try {
      const decoded = verifyRefreshToken(refreshToken);

      const user = await userCrud.findById(decoded.userId);
      if (!user) {
        res.status(401).json({
          success: false,
          message: "User not found",
        });
        return;
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
      return;
    } catch (error) {
      res.status(401).json({
        success: false,
        message: "Invalid or expired refresh token",
      });
      return;
    }
  } catch (error) {
    console.error("Authentication error:", error);
    res.status(500).json({
      success: false,
      message: "Authentication error",
    });
    return;
  }
}
