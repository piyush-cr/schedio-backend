import { Response } from "express";
import attendanceService from "../services/attendance.service";
import { AuthRequest } from "../middleware/auth";
import { MulterRequest } from "../types";
import { checkInSchema, checkOutSchema } from "../validations/attendance.validations";
import { getFileUrl, } from "../utils/fileUpload";
import { deleteLocalFile } from "../utils/deleteFile";
import { z } from "zod";

async function checkIn(
    req: AuthRequest & MulterRequest,
    res: Response
) {
    if (!req.file && req.files) {
        const files = req.files as { [fieldname: string]: Express.Multer.File[] };
        req.file = files['photo']?.[0] || files['image']?.[0];
    }

    try {
        const validatedData = checkInSchema.parse(req.body);

        // Don't upload to ImageKit yet - pass the local file path to the service
        // The worker will handle the upload asynchronously
        const localFilePath = req.file?.path || '';

        const result = await attendanceService.checkIn({
            userId: req.user!.userId,
            latitude: Number(validatedData.latitude),
            longitude: Number(validatedData.longitude),
            timestamp: Number(validatedData.timestamp),
            localFilePath, // Pass local path instead of ImageKit URL
            metadata: validatedData.metadata
        });

        return res.status(200).json({
            success: true,
            message: "Check-in successful. Image upload is being processed.",
            data: result,
        });
    } catch (error: any) {
        // if (req.file?.path) {
        //     await deleteLocalFile(req.file.path).catch(console.error);
        // }
        if (error instanceof z.ZodError) {
            return res.status(400).json({
                success: false,
                message: "Validation error",
                errors: error.errors,
            });
        }
        return res.status(400).json({
            success: false,
            message: error.message || "Check-in failed",
        });
    }
}


export async function checkOut(
    req: AuthRequest & MulterRequest,
    res: Response
) {
    if (!req.file && req.files) {
        const files = req.files as { [fieldname: string]: Express.Multer.File[] };
        req.file = files['photo']?.[0] || files['image']?.[0];
    }

    try {
        console.log("the data body", req.body, req.file?.path)
        const validatedData = checkOutSchema.parse(req.body);

        // Don't upload to ImageKit yet - pass the local file path to the service
        // The worker will handle the upload asynchronously
        const localFilePath = req.file?.path || '';

        const result = await attendanceService.checkOut({
            userId: req.user!.userId,
            latitude: Number(validatedData.latitude),
            longitude: Number(validatedData.longitude),
            timestamp: Number(validatedData.timestamp),
            isAuto: validatedData.isAuto ?? false,
            localFilePath, // Pass local path instead of ImageKit URL
        });

        return res.status(200).json({
            success: true,
            message: "Check-out successful. Image upload is being processed.",
            data: result,
        });

    } catch (error: any) {
        if (req.file?.path) {
            await deleteLocalFile(req.file.path).catch(console.error);
        }

        if (error instanceof z.ZodError) {
            return res.status(400).json({
                success: false,
                message: "Validation error",
                errors: error.errors,
            });
        }

        return res.status(400).json({
            success: false,
            message: error.message || "Check-out failed",
        });
    }
}

async function getWeeklyAttendance(
    req: AuthRequest,
    res: Response
) {
    try {
        const result = await attendanceService.getWeeklyAttendance({
            userId: req.user!.userId,
            weekStart: req.query.weekStart as string | undefined,
        });

        return res.status(200).json({
            success: true,
            data: result,
        });

    } catch (error) {
        console.error("Get weekly attendance error:", error);

        return res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
}


async function getMonthlyAttendance(
    req: AuthRequest,
    res: Response
) {
    try {
        const month =
            typeof req.query.month === "string"
                ? Number(req.query.month)
                : undefined;

        const year =
            typeof req.query.year === "string"
                ? Number(req.query.year)
                : undefined;

        if (Number(req.query.month) == 0) {
            return res.status(200).json({
                success: true,
                message: "0 based month indexing is not allowed",
            });
        }
        const result = await attendanceService.getMonthlyAttendance({
            userId: req.user!.userId,
            month,
            year,
        });

        return res.status(200).json({
            success: true,
            data: result,
        });

    } catch (error) {
        console.error("Get monthly attendance error:", error);

        return res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
}


async function getTodayAttendance(
    req: AuthRequest,
    res: Response
) {
    try {
        const result = await attendanceService.getTodayAttendance(
            req.user!.userId
        );
        return res.status(200).json({
            success: true,
            data: result,
        });
    } catch (error) {
        console.error("Get today attendance error:", error);
        return res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
}


async function getAttendanceByDate(
    req: AuthRequest,
    res: Response
) {
    try {
        const { date } = req.query;
        if (typeof date !== "string") {
            return res.status(400).json({
                success: false,
                message: "date query param is required (YYYY-MM-DD)",
            });
        }
        const attendance = await attendanceService.getAttendanceByDate({
            userId: req.user!.userId,
            date,
        });

        return res.status(200).json({
            success: true,
            data: attendance,
        });

    } catch (error) {
        console.error("Get day attendance error:", error);
        return res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
}


async function getUsersForAttendanceView(
    req: AuthRequest,
    res: Response
) {
    try {
        const page = req.query.page ? parseInt(req.query.page as string) : 1;
        const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;

        const result = await attendanceService.getUsersForAttendanceView({
            requesterId: req.user!.userId,
            role: req.user!.role!,
            page,
            limit
        });

        if (!result.success) {
            return res.status(400).json({
                success: false,
                message: result.message,
            });
        }

        return res.status(200).json({
            success: true,
            data: result.data,
        });
    } catch (error) {
        console.error("Get users error:", error);

        return res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
}

export async function getUserAttendanceForSenior(
    req: AuthRequest,
    res: Response
) {
    try {
        const { userId } = req.params;
        if (!userId) {
            return res.status(400).json({
                success: false,
                message: "userId is required",
            });
        }
        const data = await attendanceService.getUserAttendanceForSenior({
            requester: {
                userId: req.user!.userId,
                role: req.user!.role!,
            },
            targetUserId: userId,
            weekStart:
                typeof req.query.weekStart === "string"
                    ? req.query.weekStart
                    : undefined,
            month:
                typeof req.query.month === "string"
                    ? Number(req.query.month)
                    : undefined,
            year:
                typeof req.query.year === "string"
                    ? Number(req.query.year)
                    : undefined,
            startDate:
                typeof req.query.startDate === "string"
                    ? req.query.startDate
                    : undefined,
            endDate:
                typeof req.query.endDate === "string"
                    ? req.query.endDate
                    : undefined,
            page:
                typeof req.query.page === "string"
                    ? Number(req.query.page)
                    : undefined,
            limit:
                typeof req.query.limit === "string"
                    ? Number(req.query.limit)
                    : undefined,
        });


        return res.status(200).json({
            success: true,
            data,
        });

    } catch (error: any) {
        console.error("Get user attendance (admin) error:", error);

        return res.status(403).json({
            success: false,
            message: error.message || "Access denied",
        });
    }
}

const attendanceController = {
    checkIn,
    checkOut,
    getWeeklyAttendance,
    getMonthlyAttendance,
    getTodayAttendance,
    getAttendanceByDate,
    getUsersForAttendanceView,
    getUserAttendanceForSenior
}

export default attendanceController