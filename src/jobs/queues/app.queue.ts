import "dotenv/config"

import { Queue } from 'bullmq';
import { redisConfig } from '../../db/redis';

export const APP_QUEUE_NAME = 'app-job-queue';

export const appQueue = new Queue(APP_QUEUE_NAME, {
    connection: redisConfig,
    defaultJobOptions: {
        attempts: 3,
        backoff: {
            type: 'exponential',
            delay: 1000,
        },
        removeOnComplete: 100, // Keep last 100 completed jobs
        removeOnFail: 500, // Keep last 500 failed jobs for debugging
    },
});

export const queueNotification = async (payload: { token: string; title: string; body: string; data?: any }) => {
    return await appQueue.add('SEND_PUSH_NOTIFICATION', payload);
};

export const queueAttendanceNotification = async (payload: { userId: string; type: string; title?: string; body?: string; data?: any }) => {
    return await appQueue.add('SEND_ATTENDANCE_NOTIFICATION', payload);
};
