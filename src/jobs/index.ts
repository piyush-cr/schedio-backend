import { appQueue } from './queues/app.queue';
import { setupAppWorker } from './workers/app.worker';
import { logger } from '../utils/logger';

export { appQueue };

export const initJobs = async () => {
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
};
