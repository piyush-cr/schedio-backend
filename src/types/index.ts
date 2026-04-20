import { Request } from "express";
import mongoose from "mongoose";

export enum UserRole {
  SENIOR = "SENIOR",
  JUNIOR = "JUNIOR",
  ADMIN = "ADMIN",
}

export enum UserPosition {
  EMPLOYEE = "EMPLOYEE",
  INTERN = "INTERN",
}

export enum AttendanceStatus {
  PRESENT = 'PRESENT',
  ABSENT = 'ABSENT',
  LATE = 'LATE',
  HALF_DAY = 'HALF_DAY',
}

export enum Priority {
  HIGH = 'HIGH',
  LOW = 'LOW'
}

export enum TaskStatus {
  TODO = 'TODO',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  REVIEW = 'REVIEW'
}

export enum WorkStatus {
  ON_TIME = 'ON_TIME',
  LATE = 'LATE',
  ABSENT = 'ABSENT',
  INCOMPLETE = 'INCOMPLETE',
  HOLIDAY = 'HOLIDAY'
}

// User / Employee Profile
export interface EmployeeProfile {
  id: string;
  employeeId: string;
  name: string;
  email: string;
  phone: string;

  // Auth
  password: string;
  role: UserRole;

  position?: UserPosition;

  // Org / Work
  teamId?: string;
  officeLat?: number;
  officeLng?: number;
  shiftStart?: string;
  shiftEnd?: string;
  geofenceBreachTime?: number; // Minutes to wait before auto-checkout after shift ends (default: 15)

  // Admin onboarding
  isPasswordTemporary?: boolean;
  passwordResetToken?: string;
  passwordResetExpires?: Date;
  invitedBy?: string; // admin userId

  // Meta
  createdAt: Date;
  updatedAt: Date;
}


// Attendance Record
export interface AttendanceRecord {
  id: string;
  userId: mongoose.Schema.Types.ObjectId;
  date: string; // Format: "yyyy-MM-dd"

  clockInTime?: number; // Unix Timestamp (milliseconds)
  clockInLat?: number;
  clockInLng?: number;
  clockInImageUrl?: string;

  clockOutTime?: number;
  clockOutLat?: number;
  clockOutLng?: number;
  clockOutImageUrl?: string;

  totalWorkMinutes: number;
  overtimeMinutes?: number;
  totalGeofenceBreachMinutes?: number;
  status: AttendanceStatus;
  isAutoCheckOut?: boolean;
  geofenceBreachTime?: number | null;
  geofenceBreachedAt?: number | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  assignedToId: mongoose.Schema.Types.ObjectId;
  assignedById: mongoose.Schema.Types.ObjectId;
  priority: Priority;
  status: TaskStatus;
  deadline: string;
  createdAt: string;
  updatedAt: string;
}

export interface WeeklySummary {
  weekRange: string;
  totalHoursThisWeek: number;
  dailyLogs: AttendanceRecord[];
  averageClockInTime: string;
}

// Daily Log
export interface DailyLog {
  date: string; // "2026-01-08"
  dayOfWeek: string; // "Thursday"
  checkIn?: LogDetail;
  checkOut?: LogDetail;
  totalHours: number;
  workStatus: WorkStatus;
}

export interface LogDetail {
  time: number; // Unix Timestamp
  locationName?: string;
  photoUrl?: string;
  isAutomatic: boolean;
  latitude: number;
  longitude: number;
}
export interface JWTPayload {
  userId: string;
  email: string;

  employeeId?: string;
  role?: string;
}



export interface MulterRequest extends Request {
  file?: Express.Multer.File;
  files?: { [fieldname: string]: Express.Multer.File[] } | Express.Multer.File[];
}