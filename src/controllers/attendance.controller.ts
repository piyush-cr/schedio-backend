import { Response } from "express";
import attendanceService from "../services/attendance.service";
import { AuthRequest } from "../middleware/auth";
import { MulterRequest } from "../types";
import { deleteLocalFile } from "../utils/deleteFile";

async function checkIn(
    req: AuthRequest & MulterRequest,
    res: Response
) {
    if (!req.file && req.files) {
        const files = req.files as { [fieldname: string]: Express.Multer.File[] };
        req.file = files['photo']?.[0] || files['image']?.[0];
    }

    try {
        const localFilePath = req.file?.path || '';

        const result = await attendanceService.checkIn({
            userId: req.user!.userId,
            latitude: Number(req.body.latitude),
            longitude: Number(req.body.longitude),
            timestamp: Number(req.body.timestamp),
            localFilePath,
            metadata: req.body.metadata
        });

        return res.status(200).json({
            success: true,
            message: "Check-in successful. Image upload is being processed.",
            data: result,
        });
    } catch (error: any) {
        if (req.file?.path) {
            await deleteLocalFile(req.file.path).catch(console.error);
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
        const localFilePath = req.file?.path || '';

        const result = await attendanceService.checkOut({
            userId: req.user!.userId,
            latitude: Number(req.body.latitude),
            longitude: Number(req.body.longitude),
            timestamp: Number(req.body.timestamp),
            isAuto: req.body.isAuto ?? false,
            localFilePath,
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
        const { month, year } = req.query as any;

        console.log("month", month);
        console.log("year", year);

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
        const { page, limit } = req.query as any;

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
        const { weekStart, month, year, startDate, endDate, page, limit } = req.query as any;

        const data = await attendanceService.getUserAttendanceForSenior({
            requester: {
                userId: req.user!.userId,
                role: req.user!.role!,
            },
            targetUserId: userId,
            weekStart,
            month,
            year,
            startDate,
            endDate,
            page,
            limit,
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