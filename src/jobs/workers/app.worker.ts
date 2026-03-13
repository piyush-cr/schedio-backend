import "dotenv/config"
import { Worker, Job } from 'bullmq';
import { redisConfig } from '../../db/redis';
import { APP_QUEUE_NAME } from '../queues/app.queue';
import { logger } from '../../utils/logger';
import { redisConnection } from '../../db/redis';
import attendanceStatsCrud from '../../crud/attendanceStats.crud';
import { StatsType } from '../../models/AttendanceStats';

export const setupAppWorker = () => {
    // Temporarily suppress console warnings during worker initialization
    const originalConsoleError = console.error;
    console.error = (...args: any[]) => {
        const msg = args[0]?.toString() || '';
        // Suppress the eviction policy warning
        if (msg.includes('Eviction policy')) return;
        originalConsoleError.apply(console, args);
    };

    const worker = new Worker(
        APP_QUEUE_NAME,
        async (job: Job) => {
            logger.info(`Processing job ${job.id} of type ${job.name}`);

            try {
                switch (job.name) {
                    case 'TEST_JOB':
                        await processTestJob(job);
                        break;
                    case 'UPLOAD_CHECKIN_IMAGE':
                        await uploadCheckInImage(job);
                        break;
                    case 'UPLOAD_CHECKOUT_IMAGE':
                        await uploadCheckOutImage(job);
                        break;
                    case 'SEND_PUSH_NOTIFICATION':
                        await sendPushNotification(job);
                        break;
                    case 'SEND_ATTENDANCE_NOTIFICATION':
                        await sendAttendanceNotification(job);
                        break;
                    case 'CALCULATE_ATTENDANCE_STATS':
                        await calculateAttendanceStats(job);
                        break;
                    case 'MIDNIGHT_AUTO_CHECKOUT':
                        await processMidnightAutoCheckout(job);
                        break;
                    // Add more cases here
                    default:
                        logger.warn(`Unknown job type: ${job.name}`);
                }
            } catch (error) {
                logger.error(`Job ${job.id} failed:`, error);
                throw error;
            }
        },
        {
            connection: redisConfig,
            concurrency: 5,
            limiter: {
                max: 10,
                duration: 1000,
            },
        }
    );

    // Restore console.error after a short delay
    setTimeout(() => {
        console.error = originalConsoleError;
    }, 2000);

    worker.on('completed', (job) => {
        logger.info(`Job ${job.id} completed successfully`);
    });

    worker.on('failed', (job, err) => {
        logger.error(`Job ${job?.id} failed with error: ${err?.message}`);
    });

    logger.info(`Worker for queue ${APP_QUEUE_NAME} started`);

    return worker;
};

const processTestJob = async (job: Job) => {
    logger.info('Processing test job with data:', job.data);
    // Simulate work
    await new Promise((resolve) => setTimeout(resolve, 1000));
    logger.info('Test job completed');
};

const processMidnightAutoCheckout = async (_job: Job) => {
    logger.info('[MidnightAutoCheckout] Starting midnight auto-checkout job...');
    try {
        const attendanceService = (await import('../../services/attendance.service')).default;
        const result = await attendanceService.midnightAutoCheckout();
        logger.info(`[MidnightAutoCheckout] Completed. Processed: ${result.processed}`);
    } catch (error) {
        logger.error('[MidnightAutoCheckout] Failed:', error);
        throw error;
    }
};

const uploadCheckInImage = async (job: Job) => {
    logger.info('Uploading check-in image:', job.data);
    const { userId, attendanceId, localFilePath, date } = job.data;

    try {
        // Import utilities dynamically
        const { getFileUrl } = await import('../../utils/fileUpload');
        const attendanceCrud = (await import('../../crud/attendance.crud')).default;

        // Upload to ImageKit (via getFileUrl)
        logger.info(`Uploading file from ${localFilePath} to ImageKit...`);
        const imageUrl = await getFileUrl(localFilePath);
        logger.info(`Upload successful, URL: ${imageUrl}`);

        // Update attendance record with image URL
        await attendanceCrud.updateById(attendanceId, {
            clockInImageUrl: imageUrl
        });

        logger.info(`Image uploaded and attendance record updated for user ${userId} on ${date}`);

        // Clean up local file after successful upload
        try {
            const { deleteLocalFile } = await import('../../utils/deleteFile');
            await deleteLocalFile(localFilePath);
            logger.info(`Local file ${localFilePath} deleted`);
        } catch (cleanupError) {
            logger.warn('Failed to delete local file:', cleanupError);
        }
    } catch (error) {
        logger.error('Failed to upload image:', error);
        throw error; // BullMQ will retry the job
    }
};

const uploadCheckOutImage = async (job: Job) => {
    logger.info('Uploading check-out image:', job.data);
    const { userId, attendanceId, localFilePath, date } = job.data;

    try {
        // Import utilities dynamically
        const { getFileUrl } = await import('../../utils/fileUpload');
        const attendanceCrud = (await import('../../crud/attendance.crud')).default;

        // Upload to ImageKit (via getFileUrl)
        logger.info(`Uploading file from ${localFilePath} to ImageKit...`);
        const imageUrl = await getFileUrl(localFilePath);
        logger.info(`Upload successful, URL: ${imageUrl}`);

        // Update attendance record with image URL
        await attendanceCrud.updateById(attendanceId, {
            clockOutImageUrl: imageUrl
        });

        logger.info(`Image uploaded and attendance record (checkout) updated for user ${userId} on ${date}`);

        // Clean up local file after successful upload
        try {
            const { deleteLocalFile } = await import('../../utils/deleteFile');
            await deleteLocalFile(localFilePath);
            logger.info(`Local file ${localFilePath} deleted`);
        } catch (cleanupError) {
            logger.warn('Failed to delete local file:', cleanupError);
        }
    } catch (error) {
        logger.error('Failed to upload checkout image:', error);
        throw error; // BullMQ will retry the job
    }
};

const sendAttendanceNotification = async (job: Job) => {
    logger.info('Sending attendance notification:', job.data);
    const { userId, type, title, body, data } = job.data;

    try {
        const userCrud = (await import('../../crud/user.crud')).default;
        const { sendNotification } = await import('../../firebase/messaging');

        const user = await userCrud.findById(userId);
        if (!user || !user.fcmToken) {
            logger.warn(`Skipping notification for user ${userId}: No FCM token found`);
            return;
        }

        await sendNotification({
            token: user.fcmToken,
            title: title || 'Attendance Update',
            body: body || `Update on your attendance: ${type}`,
            data: data || { type: 'ATTENDANCE_UPDATE' },
        });

        logger.info(`Notification sent to user ${userId} (${user.email}): ${type}`);
    } catch (error) {
        logger.error(`Failed to send attendance notification to user ${userId}:`, error);
        throw error;
    }
};

const sendPushNotification = async (job: Job) => {
    logger.info('Sending push notification:', job.data);
    const { token, title, body, data } = job.data;

    try {
        const { sendNotification } = await import('../../firebase/messaging');

        await sendNotification({
            token,
            title,
            body,
            data,
        });

        logger.info(`Push notification sent to token: ${token.substring(0, 10)}...`);
    } catch (error) {
        logger.error('Failed to send push notification:', error);
        throw error;
    }
};

const calculateAttendanceStats = async (job: Job) => {
    logger.info('Calculating attendance stats:', job.data);
    const { userId, date, type } = job.data;

    try {
        // Import dependencies dynamically
        const attendanceCrud = (await import('../../crud/attendance.crud')).default;
        const { AttendanceStatus } = await import('../../types');
        const { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth } = await import('date-fns');

        const currentDate = new Date(date);

        switch (type) {
            case 'DAILY':
                await calculateDailyStats(userId, date, attendanceCrud);
                break;

            case 'WEEKLY':
                await calculateWeeklyStats(userId, currentDate, attendanceCrud, { format, startOfWeek, endOfWeek, AttendanceStatus });
                break;

            case 'MONTHLY':
                await calculateMonthlyStats(userId, currentDate, attendanceCrud, { format, startOfMonth, endOfMonth, AttendanceStatus });
                break;

            default:
                logger.warn(`Unknown stats type: ${type}`);
        }

        logger.info(`Stats calculated successfully for user ${userId}: ${type}`);
    } catch (error) {
        logger.error('Failed to calculate attendance stats:', error);
        throw error;
    }
};

// Helper function to calculate daily stats
const calculateDailyStats = async (userId: string, date: string, attendanceCrud: any) => {
    const attendance = await attendanceCrud.findByUserIdAndDate(userId, date);

    if (!attendance) {
        logger.info(`No attendance record found for user ${userId} on ${date}`);
        return;
    }

    const stats = {
        date,
        userId,
        clockInTime: attendance.clockInTime || null,
        clockOutTime: attendance.clockOutTime || null,
        totalWorkMinutes: attendance.totalWorkMinutes || 0,
        status: attendance.status,
        isComplete: !!attendance.clockOutTime,
    };


    // Store in MongoDB
    try {
        await attendanceStatsCrud.createOrUpdate(
            userId,
            StatsType.DAILY,
            { date },
            stats
        );
        logger.info(`Daily stats stored for user ${userId} on ${date}`);
    } catch (dbError) {
        logger.error('Failed to store daily stats in DB:', dbError);
    }

    // Cache in Redis (24 hours)
    try {
        const redisKey = `stats:daily:${userId}:${date}`;
        if (!redisConnection.isOpen) {
            await redisConnection.connect();
        }
        await redisConnection.set(redisKey, JSON.stringify(stats), { EX: 86400 });
        logger.info(`Daily stats cached in Redis: ${redisKey}`);
    } catch (cacheError) {
        logger.error('Failed to cache daily stats in Redis:', cacheError);
    }
};

// Helper function to calculate weekly stats
const calculateWeeklyStats = async (
    userId: string,
    currentDate: Date,
    attendanceCrud: any,
    utils: { format: any; startOfWeek: any; endOfWeek: any; AttendanceStatus: any }
) => {
    const { format, startOfWeek, endOfWeek, AttendanceStatus } = utils;

    // Calculate week boundaries (Sunday to Saturday)
    const weekStart = startOfWeek(currentDate, { weekStartsOn: 0 });
    const weekEnd = endOfWeek(currentDate, { weekStartsOn: 0 });

    const weekStartStr = format(weekStart, 'yyyy-MM-dd');
    const weekEndStr = format(weekEnd, 'yyyy-MM-dd');

    // Fetch weekly records
    const weeklyRecords = await attendanceCrud.findMany({
        userId,
        startDate: weekStartStr,
        endDate: weekEndStr,
    });

    // Calculate comprehensive stats
    let totalMinutes = 0;
    let presentDays = 0;
    let lateDays = 0;
    let halfDays = 0;
    let absentDays = 0;
    const clockInMinutesArray: number[] = [];

    weeklyRecords.forEach((record: any) => {
        // Only count finalized records (with clockOutTime) for total hours
        if (record.clockOutTime && record.totalWorkMinutes) {
            totalMinutes += record.totalWorkMinutes;
        }

        // Count days by status (only finalized records)
        if (record.clockOutTime) {
            switch (record.status) {
                case AttendanceStatus.PRESENT:
                    presentDays++;
                    break;
                case AttendanceStatus.LATE:
                    presentDays++;
                    lateDays++;
                    break;
                case AttendanceStatus.HALF_DAY:
                    presentDays++;
                    halfDays++;
                    break;
                case AttendanceStatus.ABSENT:
                    absentDays++;
                    break;
            }
        }

        // Calculate average clock-in time (only finalized records)
        if (record.clockInTime && record.clockOutTime) {
            const d = new Date(record.clockInTime);
            clockInMinutesArray.push(d.getHours() * 60 + d.getMinutes());
        }
    });

    const totalHoursThisWeek = Math.round((totalMinutes / 60) * 100) / 100;

    // Calculate average clock-in time
    let averageClockInTime = 'N/A';
    if (clockInMinutesArray.length > 0) {
        const avgMinutes =
            clockInMinutesArray.reduce((s, m) => s + m, 0) /
            clockInMinutesArray.length;

        const hours = Math.floor(avgMinutes / 60);
        const minutes = Math.floor(avgMinutes % 60);

        averageClockInTime = `${hours.toString().padStart(2, '0')}:${minutes
            .toString()
            .padStart(2, '0')}`;
    }

    const weeklyStats = {
        userId,
        weekStart: weekStartStr,
        weekEnd: weekEndStr,
        totalHoursThisWeek,
        averageClockInTime,
        counts: {
            presentDays,
            lateDays,
            halfDays,
            absentDays,
            totalDays: presentDays + lateDays + halfDays + absentDays,
        },
        recordCount: weeklyRecords.length,
    };


    // Store in MongoDB
    try {
        await attendanceStatsCrud.createOrUpdate(
            userId,
            StatsType.WEEKLY,
            { startDate: weekStartStr },
            weeklyStats
        );
        logger.info(`Weekly stats stored for user ${userId} starting ${weekStartStr}`);
    } catch (dbError) {
        logger.error('Failed to store weekly stats in DB:', dbError);
    }

    // Cache in Redis (7 days)
    try {
        const redisKey = `stats:weekly:${userId}:${weekStartStr}`;
        if (!redisConnection.isOpen) {
            await redisConnection.connect();
        }
        await redisConnection.set(redisKey, JSON.stringify(weeklyStats), { EX: 604800 });
        logger.info(`Weekly stats cached in Redis: ${redisKey}`);
    } catch (cacheError) {
        logger.error('Failed to cache weekly stats in Redis:', cacheError);
    }
};

// Helper function to calculate monthly stats
const calculateMonthlyStats = async (
    userId: string,
    currentDate: Date,
    attendanceCrud: any,
    utils: { format: any; startOfMonth: any; endOfMonth: any; AttendanceStatus: any }
) => {
    const { format, startOfMonth, endOfMonth, AttendanceStatus } = utils;

    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(currentDate);

    const monthStartStr = format(monthStart, 'yyyy-MM-dd');
    const monthEndStr = format(monthEnd, 'yyyy-MM-dd');

    // Fetch monthly records
    const monthlyRecords = await attendanceCrud.findMany({
        userId,
        startDate: monthStartStr,
        endDate: monthEndStr,
    });

    // Calculate comprehensive stats
    let totalMinutes = 0;
    let presentDays = 0;
    let lateDays = 0;
    let halfDays = 0;
    let absentDays = 0;
    const clockInMinutesArray: number[] = [];

    monthlyRecords.forEach((record: any) => {
        if (record.clockOutTime && record.totalWorkMinutes) {
            totalMinutes += record.totalWorkMinutes;
        }

        if (record.clockOutTime) {
            switch (record.status) {
                case AttendanceStatus.PRESENT:
                    presentDays++;
                    break;
                case AttendanceStatus.LATE:
                    lateDays++;
                    break;
                case AttendanceStatus.HALF_DAY:
                    halfDays++;
                    break;
                case AttendanceStatus.ABSENT:
                    absentDays++;
                    break;
            }
        }

        if (record.clockInTime && record.clockOutTime) {
            const d = new Date(record.clockInTime);
            clockInMinutesArray.push(d.getHours() * 60 + d.getMinutes());
        }
    });

    const totalHoursThisMonth = Math.round((totalMinutes / 60) * 100) / 100;

    let averageClockInTime = 'N/A';
    if (clockInMinutesArray.length > 0) {
        const avgMinutes =
            clockInMinutesArray.reduce((s, m) => s + m, 0) /
            clockInMinutesArray.length;

        const hours = Math.floor(avgMinutes / 60);
        const minutes = Math.floor(avgMinutes % 60);

        averageClockInTime = `${hours.toString().padStart(2, '0')}:${minutes
            .toString()
            .padStart(2, '0')}`;
    }

    const monthlyStats = {
        userId,
        month: format(currentDate, 'MMMM yyyy'),
        monthStart: monthStartStr,
        monthEnd: monthEndStr,
        totalHoursThisMonth,
        averageClockInTime,
        counts: {
            presentDays,
            lateDays,
            halfDays,
            absentDays,
            totalDays: presentDays + lateDays + halfDays + absentDays,
        },
        recordCount: monthlyRecords.length,
    };


    // Store in MongoDB
    try {
        await attendanceStatsCrud.createOrUpdate(
            userId,
            StatsType.MONTHLY,
            { startDate: monthStartStr },
            monthlyStats
        );
        logger.info(`Monthly stats stored for user ${userId} starting ${monthStartStr}`);
    } catch (dbError) {
        logger.error('Failed to store monthly stats in DB:', dbError);
    }

    // Cache in Redis (30 days)
    try {
        const redisKey = `stats:monthly:${userId}:${monthStartStr}`;
        if (!redisConnection.isOpen) {
            await redisConnection.connect();
        }
        await redisConnection.set(redisKey, JSON.stringify(monthlyStats), { EX: 2592000 });
        logger.info(`Monthly stats cached in Redis: ${redisKey}`);
    } catch (cacheError) {
        logger.error('Failed to cache monthly stats in Redis:', cacheError);
    }
};
