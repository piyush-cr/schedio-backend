import "dotenv/config"

import { Queue } from 'bullmq';
import { hasBullMQRedis, redisConfig } from '../../db/redis';

export const APP_QUEUE_NAME = 'app-job-queue';

const noopAdd = async () => ({ id: 'noop', name: '' });

export const appQueue = hasBullMQRedis && redisConfig
    ? new Queue(APP_QUEUE_NAME, {
        connection: redisConfig,
        defaultJobOptions: {
            attempts: 3,
            backoff: { type: 'exponential', delay: 1000 },
            removeOnComplete: true,
            removeOnFail: true,
        },
    })
    : ({ add: noopAdd } as unknown as Queue);

export const queueNotification = async (payload: { token: string; title: string; body: string; data?: unknown }) => {
    return await appQueue.add('SEND_PUSH_NOTIFICATION', payload);
};

export const queueAttendanceNotification = async (payload: { userId: string; type: string; title?: string; body?: string; data?: unknown }) => {
    return await appQueue.add('SEND_ATTENDANCE_NOTIFICATION', payload);
};
