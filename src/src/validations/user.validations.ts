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
  geofenceBreachTime: z.number().min(0).optional().default(15),
  password: z.string(),
  officeLat: z.number().min(-90).max(90).optional(),
  officeLng: z.number().min(-180).max(180).optional(),
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
  geofenceBreachTime: z.number().min(0).optional(),
  officeLat: z.number().min(-90).max(90).optional(),
  officeLng: z.number().min(-180).max(180).optional(),
});

export const changePasswordSchema = z.object({
  password: z.string().min(6),
});
