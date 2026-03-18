import { appQueue } from './queues/app.queue';
import { setupAppWorker } from './workers/app.worker';
import { hasBullMQRedis } from '../db/redis';
import { logger } from '../utils/logger';

export { appQueue };

export const initJobs = async () => {
    if (!hasBullMQRedis) {
        logger.warn('REDIS_URL not set – background jobs and worker disabled');
        return;
    }
    logger.info('Initializing background jobs...');
    setupAppWorker();

    // Schedule midnight auto-checkout: runs every day at 00:00 IST
    try {
        await appQueue.add(
            'MIDNIGHT_AUTO_CHECKOUT',
            {},
            {
                repeat: {
                    pattern: '0 0 * * *',   // every day at 00:00
                    tz: 'Asia/Kolkata',
                },
                jobId: 'midnight-auto-checkout', // prevent duplicate schedules
            }
        );
        logger.info('Midnight auto-checkout job scheduled (00:00 IST daily)');
    } catch (error) {
        logger.error('Failed to schedule midnight auto-checkout:', error);
    }
    
    // Schedule shift reminders check: runs every 15 minutes
    try {
        await appQueue.add(
            'CHECK_SHIFT_REMINDERS',
            {},
            {
                repeat: {
                    every: 15 * 60 * 1000,
                },
                jobId: 'check-shift-reminders',
            }
        );
        logger.info('Shift reminders check job scheduled (every 15 mins)');
    } catch (error) {
        logger.error('Failed to schedule shift reminders job:', error);
    }
};
