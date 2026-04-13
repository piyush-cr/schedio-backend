import { Router, Request, Response } from 'express';
import { logger } from '../utils/logger';

const router = Router();

/**
 * @swagger
 * /jobs/health:
 *   get:
 *     summary: Check if cron jobs are running
 *     tags: [Jobs]
 *     responses:
 *       200:
 *         description: Cron jobs are active
 */
router.get('/health', (_req: Request, res: Response) => {
    res.status(200).json({
        success: true,
        message: 'Cron jobs are active',
        data: {
            type: 'cron-based',
            note: 'All background jobs now run directly via node-cron schedules'
        }
    });
});

export default router;
