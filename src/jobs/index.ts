import cron from 'node-cron';
import { logger } from '../utils/logger';
import { autoCheckout } from '../services/attendance/commands/autoCheckout';
import { unifiedAutoCheckout } from '../services/attendance/commands/unifiedAutoCheckout';
import { checkShiftReminders } from '../services/attendance/commands/checkShiftReminders';
import { withLock } from '../utils/lock';


export const initCron = (): void => {
    logger.info('Initializing cron jobs...');


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

    // cron.schedule(
    //     '*/30 * * * *',
    //     () =>
    //         withLock('autoCheckout', async () => {
    //             await autoCheckout();
    //         }),
    //     { timezone: 'Asia/Kolkata' },
    // );
    // logger.info('Auto-checkout safety net scheduled (every 30 min)');

    // cron.schedule(
    //     '*/15 * * * *',
    //     () =>
    //         withLock('shiftReminders', async () => {
    //             await checkShiftReminders();
    //         }),
    //     { timezone: 'Asia/Kolkata' },
    // );
    // logger.info('Shift reminders scheduled (every 15 min)');

    // ── Shift-specific auto-checkout (disabled — handled by unified job above) ──
    // Uncomment and adapt if you ever need to target specific shift times directly.
    //
    // cron.schedule('10 18 * * *', () =>
    //     withLock('autoCheckout', () => autoCheckoutByShift('18:00')),
    //     { timezone: 'Asia/Kolkata' },
    // );
    //
    // cron.schedule('10 20 * * *', () =>
    //     withLock('autoCheckout', () => autoCheckoutByShift('20:00')),
    //     { timezone: 'Asia/Kolkata' },
    // );

    logger.info('All cron jobs initialized');
};