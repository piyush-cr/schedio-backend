import mongoose, { Schema, Document } from "mongoose";

export enum StatsType {
    DAILY = 'DAILY',
    WEEKLY = 'WEEKLY',
    MONTHLY = 'MONTHLY'
}

export interface IAttendanceStats extends Document {
    userId: mongoose.Types.ObjectId;
    type: StatsType;
    date?: string; // For DAILY
    startDate?: string; // For WEEKLY/MONTHLY
    endDate?: string; // For WEEKLY/MONTHLY
    stats: {
        totalWorkMinutes?: number;
        totalHours?: number;
        averageClockInTime?: string;
        presentDays?: number;
        lateDays?: number;
        halfDays?: number;
        absentDays?: number;
        totalDays?: number;
        recordCount?: number;
        status?: string; // For DAILY
        isComplete?: boolean; // For DAILY
    };
    createdAt: Date;
    updatedAt: Date;
}

const AttendanceStatsSchema = new Schema<IAttendanceStats>(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },
        type: {
            type: String,
            enum: Object.values(StatsType),
            required: true,
            index: true,
        },
        date: {
            type: String, // YYYY-MM-DD
            index: true,
        },
        startDate: {
            type: String, // YYYY-MM-DD
        },
        endDate: {
            type: String, // YYYY-MM-DD
        },
        stats: {
            type: Schema.Types.Mixed,
            required: true,
        },
    },
    { timestamps: true }
);

// Compound index for efficient lookup
AttendanceStatsSchema.index({ userId: 1, type: 1, date: 1 });
AttendanceStatsSchema.index({ userId: 1, type: 1, startDate: 1 });

export const AttendanceStats = mongoose.model<IAttendanceStats>(
    "AttendanceStats",
    AttendanceStatsSchema
);
