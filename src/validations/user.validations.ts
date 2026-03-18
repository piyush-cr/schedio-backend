import z from "zod";
import { UserPosition } from "../types";

export const createUserSchema = z.object({
  employeeId: z.string().min(3),
  name: z.string().min(2),
  email: z.string().email(),
  phone: z
    .string()
    .regex(
      /^\+[1-9]\d{7,14}$/,
      "Invalid phone number. Use E.164 format, e.g. +15551234567"
    ),
  role: z.enum(["SENIOR", "JUNIOR"]),
  position: z.nativeEnum(UserPosition).optional(),
  teamId: z.string().optional(),
  shiftStart: z.string().optional(),
  shiftEnd: z.string().optional(),
  password: z.string(),
});

export const updateUserSchema = z.object({
  name: z.string().min(2).optional(),
  phone: z
    .string()
    .regex(
      /^\+[1-9]\d{7,14}$/,
      "Invalid phone number. Use E.164 format, e.g. +15551234567"
    )
    .optional(),
  position: z.nativeEnum(UserPosition).optional(),
  teamId: z.string().optional(),
  shiftStart: z.string().optional(),
  shiftEnd: z.string().optional(),
});

export const changePasswordSchema = z.object({
  password: z.string().min(6),
});
