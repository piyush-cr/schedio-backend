import { Router } from "express";
import { authenticate } from "../middleware/auth";
import { requireSenior, requireAnyRole } from "../middleware/rbac";
import taskController from "../controllers/task.controller";

const router = Router();

/**
 * @swagger
 * components:
 *   securitySchemes:
 *     cookieAuth:
 *       type: apiKey
 *       in: cookie
 *       name: accessToken
 *
 *   schemas:
 *     Task:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *           example: 65a1f2b9e3c8f2a1a1234567
 *         title:
 *           type: string
 *           example: Build dashboard UI
 *         description:
 *           type: string
 *           example: Create UI using ShadCN
 *         status:
 *           type: string
 *           enum: [PENDING, IN_PROGRESS, COMPLETED]
 *         priority:
 *           type: string
 *           enum: [LOW, MEDIUM, HIGH]
 *         assignedTo:
 *           type: string
 *         assignedBy:
 *           type: string
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 *
 *     ApiResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *         message:
 *           type: string
 */

/**
 * @swagger
 * /api/tasks:
 *   post:
 *     summary: Create a task
 *     description: Admins and Senior users can create tasks. Admins can assign to anyone (Senior/Junior), Seniors can only assign to Juniors in their team.
 *     tags: [Tasks]
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [title, assignedToId]
 *             properties:
 *               title:
 *                 type: string
 *               description:
 *                 type: string
 *               priority:
 *                 type: string
 *                 enum: [LOW, MEDIUM, HIGH]
 *               assignedToId:
 *                 type: string
 *     responses:
 *       201:
 *         description: Task created successfully
 *       400:
 *         description: Validation error
 *       403:
 *         description: Access denied
 */
router.post(
  "/",
  authenticate,
  requireSenior,
  taskController.createTask
);

/**
 * @swagger
 * /api/tasks:
 *   get:
 *     summary: Get tasks (role-based)
 *     description: Admins see all tasks, Seniors see tasks assigned by or to them, Juniors see tasks assigned to them.
 *     tags: [Tasks]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           example: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           example: 10
 *     responses:
 *       200:
 *         description: Tasks fetched successfully
 */
router.get(
  "/",
  authenticate,
  requireAnyRole,
  taskController.getTasks
);

/**
 * @swagger
 * /api/tasks/{taskId}:
 *   get:
 *     summary: Get task by ID
 *     description: Accessible by Admin, assigned junior, or assigning senior.
 *     tags: [Tasks]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: taskId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Task fetched successfully
 *       403:
 *         description: Access denied
 *       404:
 *         description: Task not found
 */
router.get(
  "/:taskId",
  authenticate,
  requireAnyRole,
  taskController.getTaskById
);

/**
 * @swagger
 * /api/tasks/{taskId}:
 *   patch:
 *     summary: Update task
 *     description: Admins and Seniors can update all fields, juniors can update status only.
 *     tags: [Tasks]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: taskId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Task updated
 *       403:
 *         description: Access denied
 *       404:
 *         description: Task not found
 */
router.patch(
  "/:taskId",
  authenticate,
  requireAnyRole,
  taskController.updateTask
);

/**
 * @swagger
 * /api/tasks/{taskId}:
 *   delete:
 *     summary: Delete task
 *     description: Only Admins and Seniors can delete tasks.
 *     tags: [Tasks]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: taskId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Task deleted
 *       403:
 *         description: Access denied
 *       404:
 *         description: Task not found
 */
router.delete(
  "/:taskId",
  authenticate,
  requireSenior,
  taskController.deleteTask
);

export default router;
