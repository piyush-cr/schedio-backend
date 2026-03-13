import { AttendanceStats, IAttendanceStats, StatsType } from "../models/AttendanceStats";

/**
 * Create or update stats record
 */
async function createOrUpdate(
    userId: string,
    type: StatsType,
    filterKeys: { date?: string, startDate?: string },
    statsData: any
): Promise<IAttendanceStats> {
    const filter: any = { userId, type, ...filterKeys };
    const update = {
        $set: {
            ...filterKeys,
            stats: statsData
        }
    };

    return await AttendanceStats.findOneAndUpdate(
        filter,
        update,
        { new: true, upsert: true }
    );
}

/**
 * Find daily stats by date
 */
async function findDailyStats(userId: string, date: string): Promise<IAttendanceStats | null> {
    return await AttendanceStats.findOne({
        userId,
        type: StatsType.DAILY,
        date
    });
}

/**
 * Find weekly stats by start date
 */
async function findWeeklyStats(userId: string, startDate: string): Promise<IAttendanceStats | null> {
    return await AttendanceStats.findOne({
        userId,
        type: StatsType.WEEKLY,
        startDate
    });
}

/**
 * Find monthly stats by start date (usually 1st of month)
 */
async function findMonthlyStats(userId: string, startDate: string): Promise<IAttendanceStats | null> {
    return await AttendanceStats.findOne({
        userId,
        type: StatsType.MONTHLY,
        startDate
    });
}

export default {
    createOrUpdate,
    findDailyStats,
    findWeeklyStats,
    findMonthlyStats
};
