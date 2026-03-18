export interface UploadCheckInImageJobData {
    userId: string;
    attendanceId: string;
    localFilePath: string; // Local file path to upload
    date: string;
}

export interface SendAttendanceNotificationJobData {
    userId: string;
    type: 'CHECK_IN' | 'CHECK_OUT' | 'LATE_ARRIVAL' | 'CHECKOUT_REMINDER';
    data: {
        userName: string;
        timestamp: number;
        status?: string;
        totalWorkMinutes?: number;
    };
}

export interface CalculateAttendanceStatsJobData {
    userId: string;
    date: string;
    type: 'DAILY' | 'WEEKLY' | 'MONTHLY';
}

export type AttendanceJobData =
    | UploadCheckInImageJobData
    | SendAttendanceNotificationJobData
    | CalculateAttendanceStatsJobData;
