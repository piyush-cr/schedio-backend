import cron from 'node-cron';
import { appQueue } from './queues/app.queue';
import { setupAppWorker } from './workers/app.worker';
import { hasBullMQRedis } from '../db/redis';
import { logger } from '../utils/logger';

export { appQueue };


export const initCrons = async () => {
    console.log("crons setuped for ")
    // 6:10 PM auto-checkout for users with 6 PM shift end (18:00)
    cron.schedule('10 18 * * *', async () => {
        logger.info('[Cron] Triggering 6:10 PM auto-checkout for 6 PM shift users...');
        try {
            const { autoCheckoutByShift } = await import('../services/attendance/commands/autoCheckoutByShift');
            await autoCheckoutByShift('18:00');
            logger.info('[Cron] 6:10 PM auto-checkout completed');
        } catch (error) {
        logger.error('[Cron] Failed to run 6:10 PM auto-checkout:', error);
        }
    }, { timezone: 'Asia/Kolkata' });
    logger.info('6:10 PM auto-checkout scheduled for 18:00 shift users (daily)');

    // 8:10 PM auto-checkout for users with 8 PM shift end (20:00)
    cron.schedule('10 20 * * *', async () => {
        logger.info('[Cron] Triggering 8:10 PM auto-checkout for 8 PM shift users...');
        try {
            const { autoCheckoutByShift } = await import('../services/attendance/commands/autoCheckoutByShift');
            await autoCheckoutByShift('20:00');
            logger.info('[Cron] 8:10 PM auto-checkout completed');
        } catch (error) {
            logger.error('[Cron] Failed to run 8:10 PM auto-checkout:', error);
        }
    }, { timezone: 'Asia/Kolkata' });
    logger.info('8:10 PM auto-checkout scheduled for 20:00 shift users (daily)');
}



export const initJobs = async () => {
    if (!hasBullMQRedis) {
        logger.warn('REDIS_URL not set – background jobs and worker disabled');
        return;
    }
    logger.info('Initializing background jobs...');
    setupAppWorker();

    // Clean up any existing BullMQ repeatable jobs to prevent duplicates & reduce Redis usage
    try {
        const repeatableJobs = await appQueue.getJobSchedulers();
        for (const job of repeatableJobs) {
            await appQueue.removeJobScheduler(job.key);
        }
        if (repeatableJobs.length > 0) {
            logger.info(`Cleared ${repeatableJobs.length} existing BullMQ repeatable jobs`);
        }
    } catch (e) {
        logger.warn('Could not clear repeatable jobs:', e);
    }

    // ─── Use node-cron instead of BullMQ repeatable jobs to minimize Redis usage ───

    // Midnight auto-checkout: runs every day at 00:00 IST
    cron.schedule('0 0 * * *', async () => {
        logger.info('[Cron] Triggering midnight auto-checkout...');
        try {
            await appQueue.add('MIDNIGHT_AUTO_CHECKOUT', {});
            logger.info('[Cron] Midnight auto-checkout job queued');
        } catch (error) {
            logger.error('[Cron] Failed to queue midnight auto-checkout:', error);
        }
    }, { timezone: 'Asia/Kolkata' });
    logger.info('Midnight auto-checkout scheduled via node-cron (00:00 IST daily)');

    // Periodic auto-checkout: runs every 30 minutes to catch per-user shift ends
    cron.schedule('*/30 * * * *', async () => {
        logger.info('[Cron] Triggering periodic auto-checkout...');
        try {
            await appQueue.add('AUTO_CHECKOUT', {});
            logger.info('[Cron] Auto-checkout job queued');
        } catch (error) {
            logger.error('[Cron] Failed to queue auto-checkout:', error);
        }
    }, { timezone: 'Asia/Kolkata' });
    logger.info('Periodic auto-checkout scheduled via node-cron (every 30 min)');

    // Shift reminders check: runs every 15 minutes
    cron.schedule('*/15 * * * *', async () => {
        logger.info('[Cron] Triggering shift reminders check...');
        try {
            await appQueue.add('CHECK_SHIFT_REMINDERS', {});
            logger.info('[Cron] Shift reminders job queued');
        } catch (error) {
            logger.error('[Cron] Failed to queue shift reminders:', error);
        }
    }, { timezone: 'Asia/Kolkata' });
    logger.info('Shift reminders check scheduled via node-cron (every 15 min)');

    // ─── Shift-specific auto-checkout cron jobs (direct execution, no worker) ───

    // 6:10 PM auto-checkout for users with 6 PM shift end (18:00)
    cron.schedule('10 18 * * *', async () => {
        logger.info('[Cron] Triggering 6:10 PM auto-checkout for 6 PM shift users...');
        try {
            const { autoCheckoutByShift } = await import('../services/attendance/commands/autoCheckoutByShift');
            await autoCheckoutByShift('18:00');
            logger.info('[Cron] 6:10 PM auto-checkout completed');
        } catch (error) {
            logger.error('[Cron] Failed to run 6:10 PM auto-checkout:', error);
        }
    }, { timezone: 'Asia/Kolkata' });
    logger.info('6:10 PM auto-checkout scheduled for 18:00 shift users (daily)');

    // 8:10 PM auto-checkout for users with 8 PM shift end (20:00)
    cron.schedule('10 20 * * *', async () => {
        logger.info('[Cron] Triggering 8:10 PM auto-checkout for 8 PM shift users...');
        try {
            const { autoCheckoutByShift } = await import('../services/attendance/commands/autoCheckoutByShift');
            await autoCheckoutByShift('20:00');
            logger.info('[Cron] 8:10 PM auto-checkout completed');
        } catch (error) {
            logger.error('[Cron] Failed to run 8:10 PM auto-checkout:', error);
        }
    }, { timezone: 'Asia/Kolkata' });
    logger.info('8:10 PM auto-checkout scheduled for 20:00 shift users (daily)');
};
