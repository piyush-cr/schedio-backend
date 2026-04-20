import cron from 'node-cron';
import { logger } from '../utils/logger';
import { unifiedAutoCheckout } from '../services/attendance/commands/unifiedAutoCheckout';
import { checkShiftReminders } from '../services/attendance/commands/checkShiftReminders';
import { withLock } from '../utils/lock';


export const initCron = (): void => {
    logger.info('Initializing cron jobs...');

    // Unified auto-checkout: cleanup for offline users (every 5 min)
    cron.schedule(
        '*/5 * * * *',
        () =>
            withLock('unifiedAutoCheckout', async () => {
                const result = await unifiedAutoCheckout();
                logger.info(
                    `[Cron][unifiedAutoCheckout] Notified: ${result.notified}, Checked out: ${result.checkedOut}`,
                );
            }),
        { timezone: 'Asia/Kolkata' },
    );
    logger.info('Unified auto-checkout scheduled (every 5 min)');

    // Shift reminders: check-in/check-out reminders (every 15 min)
    cron.schedule(
        '*/15 * * * *',
        () =>
            withLock('shiftReminders', async () => {
                await checkShiftReminders();
            }),
        { timezone: 'Asia/Kolkata' },
    );
    logger.info('Shift reminders scheduled (every 15 min)');


    logger.info('All cron jobs initialized');
};