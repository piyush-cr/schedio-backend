<<<<<<< HEAD
import dotenv from 'dotenv';
dotenv.config();
import { connectDB } from "./db/db";
import { seedAdminUser } from "./seeds/admin.seed";
import { logger } from "./utils/logger";
import app from "./app";
import { initCron } from "./jobs";

const PORT = process.env.PORT || 3000;

const startServer = async (): Promise<void> => {
  try {
    await connectDB();
    await seedAdminUser();

    // Initialize background jobs
    initCron()


    // await runSeed()
    app.listen(PORT, () => {
      logger.info(`Server is running on port ${PORT}`);
      logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
      logger.info(`Health check: http://localhost:${PORT}/health`);
      logger.info(`Auth endpoints: http://localhost:${PORT}/api/auth`);
      logger.info(`Swagger docs at http://localhost:${PORT}/api-docs`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();
=======
import dotenv from 'dotenv';
dotenv.config();
import { connectDB } from "./db/db";
import { seedAdminUser } from "./seeds/admin.seed";
import { logger } from "./utils/logger";
import app from "./app";
// import { runSeed } from './seeds/seed';
import { initCron } from "./jobs";

const PORT = process.env.PORT || 3000;

const startServer = async (): Promise<void> => {
  try {
    await connectDB();
    await seedAdminUser();

    // Initialize background jobs
    initCron()

    // await runSeed()
    app.listen(PORT, () => {
      logger.info(`Server is running on port ${PORT}`);
      logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
      logger.info(`Health check: http://localhost:${PORT}/health`);
      logger.info(`Auth endpoints: http://localhost:${PORT}/api/auth`);
      logger.info(`Swagger docs at http://localhost:${PORT}/api-docs`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();
>>>>>>> a0b9806cb8726afe5c21c423d73ce7f3047d053c
