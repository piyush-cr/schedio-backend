
import { Response } from "express";
import { AuthRequest } from "../middleware/auth";
import { Priority, UserRole } from "../types";
import taskService from "../services/task.service";
import {
    UpdateTaskInput,
    GetTasksParams,
    GetTaskByIdParams,
    UpdateTaskParams,
    DeleteTaskParams,
} from "../types/tasks.types";
import {
    createTaskSchema,
    updateTaskSchema,
} from "../validations/tasks.validations";
import { z } from "zod";

async function createTask(req: AuthRequest, res: Response) {
    try {
        const validatedData = createTaskSchema.parse(req.body);

        const assignedById = req.user!.userId;
        const role = req.user!.role as UserRole;


        const task = await taskService.createTask(validatedData, assignedById, role);

        if (!task.success) {
            return res.status(400).json({
                success: task.success,
                message: task.message,
                data: task.data,
            });
        }
        return res.status(201).json({
            success: task.success,
            message: "Task created successfully",
            data: task.task,
        });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ success: false, errors: error.errors });
        }
        return res
            .status(400)
            .json({ success: false, message: (error as Error).message });
    }
}

async function getTasks(req: AuthRequest, res: Response) {
    try {
        const params: GetTasksParams = {
            userId: req.user!.userId,
            role: req.user!.role as UserRole,
            page: Math.max(Number(req.query.page) || 1, 1),
            limit: Math.min(Math.max(Number(req.query.limit) || 10, 1), 100),
            status: req.query.status as string,
            priority: req.query.priority as Priority,
            assignedToId: req.query.assignedToId as string,
            assignedById: req.query.assignedById as string,
            search: req.query.search as string,
        };

        const result = await taskService.getTasks(params);

        return res.status(200).json({
            success: true,
            ...result,
        });
    } catch (error) {
        return res
            .status(400)
            .json({ success: false, message: (error as Error).message });
    }
}

async function getTaskById(req: AuthRequest, res: Response) {
    try {
        const params: GetTaskByIdParams = {
            taskId: req.params.taskId,
            userId: req.user!.userId,
            role: req.user!.role as UserRole,
        };

        const task = await taskService.getTaskById(params);

        return res.status(200).json({ success: true, data: task });
    } catch (error) {
        const msg = (error as Error).message;
        const status = msg.includes("access")
            ? 403
            : msg.includes("not found")
                ? 404
                : 400;
        return res.status(status).json({ success: false, message: msg });
    }
}

async function updateTask(req: AuthRequest, res: Response) {
    try {
        const params: UpdateTaskParams = {
            taskId: req.params.taskId,
            userId: req.user!.userId,
            role: req.user!.role as UserRole,
            updateData: req.body as UpdateTaskInput,
        };

        // Restriction: JUNIOR can only update 'status'
        if (req.user!.role === UserRole.JUNIOR) {
            const allowedUpdates = ["status"];
            const actualUpdates = Object.keys(req.body);
            const invalidUpdates = actualUpdates.filter(
                (key) => !allowedUpdates.includes(key)
            );

            if (invalidUpdates.length > 0) {
                return res.status(403).json({
                    success: false,
                    message: `Juniors are only allowed to update task status. Invalid fields: ${invalidUpdates.join(", ")}`,
                });
            }
        }

        // Validate body
        const validatedData = updateTaskSchema.parse(req.body);
        params.updateData = validatedData;

        const updated = await taskService.updateTask(params);

        return res.status(200).json({
            success: true,
            message: "Task updated successfully",
            data: updated,
        });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ success: false, errors: error.errors });
        }
        const msg = (error as Error).message;
        const status = msg.includes("access")
            ? 403
            : msg.includes("not found")
                ? 404
                : 400;
        return res.status(status).json({ success: false, message: msg });
    }
}

async function deleteTask(req: AuthRequest, res: Response) {
    try {
        const params: DeleteTaskParams = {
            taskId: req.params.taskId,
            userId: req.user!.userId,
            role: req.user!.role as UserRole,
        };

        const result = await taskService.deleteTask(params);

        return res.status(200).json({
            success: true,
            message: result.message,
        });
    } catch (error) {
        const msg = (error as Error).message;
        const status = msg.includes("access")
            ? 403
            : msg.includes("not found")
                ? 404
                : 400;
        return res.status(status).json({ success: false, message: msg });
    }
}

const taskController = {
    createTask,
    getTasks,
    getTaskById,
    updateTask,
    deleteTask,
};

export default taskController;
