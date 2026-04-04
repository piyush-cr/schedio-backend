import { logger } from "./logger";

export const locks = {
    unifiedAutoCheckout: false,
    autoCheckout: false,
    shiftReminders: false,
};

export async function withLock<T>(
    name: keyof typeof locks,
    fn: () => Promise<T>,
): Promise<void> {
    if (locks[name]) {
        logger.warn(`[Cron][${name}] Skipping — previous run still in progress`);
        return;
    }

    locks[name] = true;
    const start = Date.now();

    try {
        await fn();
        logger.info(`[Cron][${name}] Completed in ${Date.now() - start}ms`);
    } catch (error) {
        logger.error(`[Cron][${name}] Failed after ${Date.now() - start}ms:`, error);
    } finally {
        locks[name] = false;
    }
}