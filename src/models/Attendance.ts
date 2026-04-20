import mongoose, { Schema, Document } from 'mongoose';
import { AttendanceRecord, AttendanceStatus } from '../types';

export interface IAttendance extends Document, Omit<AttendanceRecord, 'id'> {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Schema.Types.ObjectId;
  metadata?: any;
  geofenceBreachTime?: number | null;
  isAutoCheckOut?: boolean;
  geofenceBreachedAt?: number | null;
  totalGeofenceBreachMinutes?: number;
  overtimeMinutes?: number;
  clockInImageUrl?: string;
  checkoutReminderSentAt?: number | null;
}

const AttendanceSchema = new Schema<IAttendance>(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    date: {
      type: String,
      required: true,
      match: /^\d{4}-\d{2}-\d{2}$/,
    },

    clockInTime: Number,
    clockInLat: { type: Number, min: -90, max: 90 },
    clockInLng: { type: Number, min: -180, max: 180 },
    clockInImageUrl: {
      type: String,
      trim: true,
      maxlength: 500,
      default: null,
    },

    clockOutTime: Number,
    clockOutLat: { type: Number, min: -90, max: 90 },
    clockOutLng: { type: Number, min: -180, max: 180 },
    clockOutImageUrl: {
      type: String,
      trim: true,
      maxlength: 500,
      default: null,
    },

    totalWorkMinutes: {
      type: Number,
      default: 0,
      min: 0,
    },

    status: {
      type: String,
      enum: Object.values(AttendanceStatus),
      default: AttendanceStatus.ABSENT,
      index: true,
    },

    isAutoCheckOut: {
      type: Boolean,
      default: false,
    },

    geofenceBreachedAt: { type: Number, default: null },
    totalGeofenceBreachMinutes: { type: Number, default: 0 },
    overtimeMinutes: { type: Number, default: 0 },
    checkoutReminderSentAt: { type: Number, default: null },
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true },
);

AttendanceSchema.index({ userId: 1, date: 1 }, { unique: true });
AttendanceSchema.index({ userId: 1, date: -1 });
AttendanceSchema.index({ userId: 1, status: 1, date: -1 });

export const Attendance = mongoose.model<IAttendance>(
  'Attendance',
  AttendanceSchema,
);