import { Response, NextFunction } from "express";
import attendanceService from "../services/attendance.service";
import { AuthRequest } from "../middleware/auth";
import { MulterRequest } from "../types";
import { deleteLocalFile } from "../utils/deleteFile";
import { BadRequestError, UnauthorizedError } from "../utils/ApiError";

async function checkIn(
    req: AuthRequest & MulterRequest,
    res: Response,
    next: NextFunction
): Promise<void> {
    if (!req.file && req.files) {
        const files = req.files as { [fieldname: string]: Express.Multer.File[] };
        req.file = files["photo"]?.[0] || files["image"]?.[0];
    }

    try {
        const userId = req.user?.userId;
        if (!userId) throw new UnauthorizedError("User is unauthorized");
        const result = await attendanceService.checkIn({
            userId,
            latitude: Number(req.body.latitude),
            longitude: Number(req.body.longitude),
            timestamp: Number(req.body.timestamp),
            localFilePath: req.file?.path || "",
            metadata: req.body.metadata,
        });

        res.status(200).json({
            success: true,
            message: "Check-in successful. Image upload is being processed.",
            data: result,
        });
    } catch (error) {
        if (req.file?.path) await deleteLocalFile(req.file.path).catch(console.error);
        next(error);
    }
}

async function checkOut(
    req: AuthRequest & MulterRequest,
    res: Response,
    next: NextFunction
): Promise<void> {
    if (!req.file && req.files) {
        const files = req.files as { [fieldname: string]: Express.Multer.File[] };
        req.file = files["photo"]?.[0] || files["image"]?.[0];
    }

    try {
        const userId = req.user?.userId;
        if (!userId) throw new UnauthorizedError("User is unauthorized");

        const result = await attendanceService.checkOut({
            userId,
            latitude: Number(req.body.latitude),
            longitude: Number(req.body.longitude),
            timestamp: Number(req.body.timestamp),
            isAuto: req.body.isAuto ?? false,
            localFilePath: req.file?.path || "",
        });

        res.status(200).json({
            success: true,
            message: "Check-out successful. Image upload is being processed.",
            data: result,
        });
    } catch (error) {
        if (req.file?.path) await deleteLocalFile(req.file.path).catch(console.error);
        next(error);
    }
}

async function getWeeklyAttendance(
    req: AuthRequest,
    res: Response,
    next: NextFunction
): Promise<void> {
    try {
        const userId = req.user?.userId;
        if (!userId) throw new UnauthorizedError("User is unauthorized");

        const result = await attendanceService.getWeeklyAttendance({
            userId,
            weekStart: req.query.weekStart as string | undefined,
        });

        res.status(200).json({ success: true, data: result });
    } catch (error) {
        next(error);
    }
}

async function getMonthlyAttendance(
    req: AuthRequest,
    res: Response,
    next: NextFunction
): Promise<void> {
    try {
        const userId = req.user?.userId;
        if (!userId) throw new UnauthorizedError("User is unauthorized");

        const { month, year } = req.query;

        const result = await attendanceService.getMonthlyAttendance({
            userId,
            month: month ? Number(month) : undefined,
            year: year ? Number(year) : undefined,
        });

        res.status(200).json({ success: true, data: result });
    } catch (error) {
        next(error);
    }
}

async function getTodayAttendance(
    req: AuthRequest,
    res: Response,
    next: NextFunction
): Promise<void> {
    try {
        const userId = req.user?.userId;
        if (!userId) throw new UnauthorizedError("User is unauthorized");

        const result = await attendanceService.getTodayAttendance(userId);

        res.status(200).json({ success: true, data: result });
    } catch (error) {
        next(error);
    }
}

async function getAttendanceByDate(
    req: AuthRequest,
    res: Response,
    next: NextFunction
): Promise<void> {
    try {
        const userId = req.user?.userId;
        if (!userId) throw new UnauthorizedError("User is unauthorized");

        // already validated by zod dateQuerySchema.required({ date: true })
        const date = req.query.date as string;

        const attendance = await attendanceService.getAttendanceByDate({ userId, date });

        res.status(200).json({ success: true, data: attendance });
    } catch (error) {
        next(error);
    }
}

async function getUsersForAttendanceView(
    req: AuthRequest,
    res: Response,
    next: NextFunction
): Promise<void> {
    try {
        const userId = req.user?.userId;
        if (!userId) throw new UnauthorizedError("User is unauthorized");

        // page/limit already validated + defaulted by paginationSchema
        const { page, limit } = req.query;

        const result = await attendanceService.getUsersForAttendanceView({
            requesterId: userId,
            role: req.user!.role!,
            page: Number(page),
            limit: Number(limit),
        });

        if (!result.success) throw new BadRequestError(result.message);

        res.status(200).json({ success: true, data: result.data });
    } catch (error) {
        next(error);
    }
}

async function getUserAttendanceForSenior(
    req: AuthRequest,
    res: Response,
    next: NextFunction
): Promise<void> {
    try {
        const userId = req.user?.userId;
        if (!userId) throw new UnauthorizedError("User is unauthorized");

        // userId param already validated by userIdParamSchema
        const { userId: targetUserId } = req.params;
        const { weekStart, month, year, startDate, endDate, page, limit } = req.query;

        const data = await attendanceService.getUserAttendanceForSenior({
            requester: { userId, role: req.user!.role! },
            targetUserId,
            weekStart: weekStart as string | undefined,
            month: month ? Number(month) : undefined,
            year: year ? Number(year) : undefined,
            startDate: startDate as string | undefined,
            endDate: endDate as string | undefined,
            page: page ? Number(page) : undefined,
            limit: limit ? Number(limit) : undefined,
        });

        res.status(200).json({ success: true, data });
    } catch (error) {
        next(error);
    }
}

async function reportGeofenceBreach(
    req: AuthRequest,
    res: Response,
    next: NextFunction
): Promise<void> {
    try {
        const userId = req.user?.userId;
        if (!userId) throw new UnauthorizedError("User is unauthorized");

        const { latitude, longitude } = req.body;
        if (latitude === undefined || longitude === undefined) {
            throw new BadRequestError("latitude and longitude are required");
        }

        const result = await attendanceService.autoCheckoutByGeofence(
            userId,
            Number(latitude),
            Number(longitude)
        );

        res.status(200).json({ success: true, data: result });
    } catch (error) {
        next(error);
    }
}

async function clearGeofenceBreach(
    req: AuthRequest,
    res: Response,
    next: NextFunction
): Promise<void> {
    try {
        const userId = req.user?.userId;
        if (!userId) throw new UnauthorizedError("User is unauthorized");

        const result = await attendanceService.clearGeofenceBreach(userId);

        res.status(200).json({ success: true, data: result });
    } catch (error) {
        next(error);
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
    getUserAttendanceForSenior,
    reportGeofenceBreach,
    clearGeofenceBreach,
};

export default attendanceController;