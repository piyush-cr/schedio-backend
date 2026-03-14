
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

async function createTask(req: AuthRequest, res: Response) {
    try {
        const assignedById = req.user!.userId;
        const role = req.user!.role as UserRole;

        const task = await taskService.createTask(req.body, assignedById, role);

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
            page: req.query.page,
            limit: req.query.limit,
            status: req.query.status,
            priority: req.query.priority,
            assignedToId: req.query.assignedToId,
            assignedById: req.query.assignedById,
            search: req.query.search,
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
            updateData: req.body,
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

        params.updateData = req.body;

        const updated = await taskService.updateTask(params);

        return res.status(200).json({
            success: true,
            message: "Task updated successfully",
            data: updated,
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
