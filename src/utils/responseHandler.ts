// utils/responseHandler.ts
import { Response } from "express";

export const sendError = (res: Response, status: number, message: string) =>
  res.status(status).json({ success: false, message });

export const sendSuccess = (res: Response, data: object, status = 200) =>
  res.status(status).json({ success: true, ...data });