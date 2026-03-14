import z from "zod";
import { UserRole, UserPosition } from "../types";

export const registerSchema = z.object({
  employeeId: z.string().min(3, "Employee ID must be at least 3 characters"),
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  phone: z
    .string()
    .regex(
      /^\+[1-9]\d{7,14}$/,
      "Invalid phone number. Use E.164 format, e.g. +15551234567"
    ),
  role: z.nativeEnum(UserRole),
  position: z.nativeEnum(UserPosition).optional(),
  teamId: z.string().optional(),
  officeLat: z.number().optional(),
  officeLng: z.number().optional(),
  shiftStart: z.string().optional(),
  shiftEnd: z.string().optional(),
});

export const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});
