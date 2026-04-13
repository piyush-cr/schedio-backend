import dotenv from "dotenv";
dotenv.config();
import { connectDB } from "./db/db";
import { setupAppWorker } from "./jobs/workers/app.worker";
import { logger } from "./utils/logger";

const startWorker = async () => {
    try {
        logger.info("Starting standalone worker...");

        const { hasBullMQRedis } = await import('./db/redis');
        if (!hasBullMQRedis) {
            logger.warn("Redis not configured (set UPSTASH_REDIS_REST_URL + TOKEN, or REDIS_URL) – worker exiting");
            process.exit(0);
        }

        await connectDB();
        setupAppWorker();

        logger.info("Standalone worker started successfully");

        // Keep process alive
        process.on('SIGTERM', async () => {
            logger.info('Worker received SIGTERM');
            process.exit(0);
        });

    } catch (error) {
        logger.error("Failed to start worker:", error);
        process.exit(1);
    }
};

startWorker();
