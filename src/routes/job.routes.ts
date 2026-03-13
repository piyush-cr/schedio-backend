import { Router, Request, Response } from 'express';
import { appQueue } from '../jobs/queues/app.queue';
import { logger } from '../utils/logger';

const router = Router();

/**
 * @swagger
 * /jobs/test:
 *   post:
 *     summary: Trigger a test background job
 *     tags: [Jobs]
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Job added successfully
 */
router.post('/test', async (req: Request, res: Response) => {
    try {
        const data = req.body || {};
        const job = await appQueue.add('TEST_JOB', {
            ...data,
            timestamp: new Date().toISOString()
        });

        logger.info(`Test job added with ID: ${job.id}`);

        res.status(200).json({
            success: true,
            message: 'Test job added to queue',
            data: {
                jobId: job.id,
                queueName: job.name
            }
        });
    } catch (error) {
        logger.error('Failed to add job to queue:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to add job to queue'
        });
    }
});

export default router;
