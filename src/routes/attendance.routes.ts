<<<<<<< HEAD
import { Router } from "express";
import { authenticate } from "../middleware/auth";
import { requireSenior, requireSeniorOrJunior } from "../middleware/rbac";
import { validateRequest } from "../middleware/validate";
import { upload } from "../utils/fileUpload";
import attendanceController from "../controllers/attendance.controller";
import { checkInSchema, checkOutSchema } from "../validations/attendance.validations";
import { dateQuerySchema, weekStartQuerySchema, monthYearQuerySchema, paginationSchema, userIdParamSchema, attendanceQuerySchema } from "../validations/common.validations";


const router = Router();
/**
 * @swagger
 * /api/attendance/check-in:
 *   post:
 *     summary: Check in for attendance
 *     tags: [Attendance]
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - latitude
 *               - longitude
 *             properties:
 *               photo:
 *                 type: string
 *                 format: binary
 *                 description: Check-in photo
 *               latitude:
 *                 type: number
 *                 minimum: -90
 *                 maximum: 90
 *                 example: 40.7128
 *               longitude:
 *                 type: number
 *                 minimum: -180
 *                 maximum: 180
 *                 example: -74.0060
 *               timestamp:
 *                 type: number
 *                 description: Unix timestamp in milliseconds (optional, defaults to current time)
 *                 example: 1640995200000
 *     responses:
 *       200:
 *         description: Check-in successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Check-in successful"
 *                 data:
 *                   type: object
 *                   properties:
 *                     clockInTime:
 *                       type: number
 *                     latitude:
 *                       type: number
 *                     longitude:
 *                       type: number
 *                     clockInImageUrl:
 *                       type: string
 *                       nullable: true
 *                     status:
 *                       type: string
 *                     totalHoursThisWeek:
 *                       type: number
 *       400:
 *         description: Validation error or check-in failed
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post(
  "/check-in",
  authenticate,
  requireSeniorOrJunior,
  upload.fields([{ name: "photo", maxCount: 1 }, { name: "image", maxCount: 1 }]),
  validateRequest({ body: checkInSchema }),
  attendanceController.checkIn
);

/**
 * @swagger
 * /api/attendance/check-out:
 *   post:
 *     summary: Check out from attendance
 *     tags: [Attendance]
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - latitude
 *               - longitude
 *             properties:
 *               latitude:
 *                 type: number
 *                 minimum: -90
 *                 maximum: 90
 *                 example: 40.7128
 *               longitude:
 *                 type: number
 *                 minimum: -180
 *                 maximum: 180
 *                 example: -74.0060
 *               timestamp:
 *                 type: number
 *                 description: Unix timestamp in milliseconds (optional, defaults to current time)
 *                 example: 1640995200000
 *               isAuto:
 *                 type: boolean
 *                 description: Whether this is an automatic check-out
 *                 default: false
 *                 example: false
 *     responses:
 *       200:
 *         description: Check-out successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Check-out successful"
 *                 data:
 *                   type: object
 *                   properties:
 *                     latitude:
 *                       type: number
 *                     longitude:
 *                       type: number
 *                     totalWorkMinutes:
 *                       type: number
 *                     overtimeMinutes:
 *                       type: number
 *                     totalGeofenceBreachMinutes:
 *                       type: number
 *                     status:
 *                       type: string
 *                     clockOutTime:
 *                       type: string
 *       400:
 *         description: Validation error or check-out failed
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post(
  "/check-out",
  authenticate,
  requireSeniorOrJunior,
  upload.fields([{ name: "photo", maxCount: 1 }, { name: "image", maxCount: 1 }]),
  validateRequest({ body: checkOutSchema }),
  attendanceController.checkOut
);

/**
 * @swagger
 * /api/attendance/weekly:
 *   get:
 *     summary: Get weekly attendance report
 *     tags: [Attendance]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: weekStart
 *         schema:
 *           type: string
 *           format: date
 *           example: "2024-01-01"
 *         description: Start date of the week (YYYY-MM-DD format). If not provided, uses current week.
 *     responses:
 *       200:
 *         description: Weekly attendance data retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     weekRange:
 *                       type: string
 *                     totalHoursThisWeek:
 *                       type: number
 *                     dailyLogs:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           date:
 *                             type: string
 *                           dayOfWeek:
 *                             type: string
 *                           clockInTime:
 *                             type: number
 *                             nullable: true
 *                           clockInImageUrl:
 *                             type: string
 *                             nullable: true
 *                           clockOutTime:
 *                             type: number
 *                             nullable: true
 *                           totalWorkMinutes:
 *                             type: number
 *                           status:
 *                             type: string
 *                     averageClockInTime:
 *                       type: string
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get(
  "/weekly",
  authenticate,
  requireSeniorOrJunior,
  validateRequest({ query: weekStartQuerySchema }),
  attendanceController.getWeeklyAttendance
);

/**
 * @swagger
 * /api/attendance/monthly:
 *   get:
 *     summary: Get monthly attendance report
 *     tags: [Attendance]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: month
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 12
 *           example: 1
 *         description: Month number (1-12). If not provided, uses current month.
 *       - in: query
 *         name: year
 *         schema:
 *           type: integer
 *           example: 2024
 *         description: Year. If not provided, uses current year.
 *     responses:
 *       200:
 *         description: Monthly attendance data retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     month:
 *                       type: string
 *                     startDate:
 *                       type: string
 *                       format: date
 *                     endDate:
 *                       type: string
 *                       format: date
 *                     totalHoursThisMonth:
 *                       type: number
 *                     averageClockInTime:
 *                       type: string
 *                     totalWorkingDays:
 *                       type: number
 *                     presentDays:
 *                       type: number
 *                     absentDays:
 *                       type: number
 *                     dailyLogs:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           date:
 *                             type: string
 *                           dayOfWeek:
 *                             type: string
 *                           clockInTime:
 *                             type: number
 *                             nullable: true
 *                           clockInImageUrl:
 *                             type: string
 *                             nullable: true
 *                           clockOutTime:
 *                             type: number
 *                             nullable: true
 *                           totalWorkMinutes:
 *                             type: number
 *                           status:
 *                             type: string
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get(
  "/monthly",
  authenticate,
  requireSeniorOrJunior,
  validateRequest({ query: monthYearQuerySchema }),
  attendanceController.getMonthlyAttendance
);


/**
 * @swagger
 * /api/attendance/today:
 *   get:
 *     summary: Get today's attendance record
 *     tags: [Attendance]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Today's attendance data retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     date:
 *                       type: string
 *                     clockedIn:
 *                       type: boolean
 *                     clockedOut:
 *                       type: boolean
 *                     clockInTime:
 *                       type: number
 *                       nullable: true
 *                     clockInImageUrl:
 *                       type: string
 *                       nullable: true
 *                     clockOutTime:
 *                       type: number
 *                       nullable: true
 *                     status:
 *                       type: string
 *                     totalWorkMinutes:
 *                       type: number
 *                     overtimeMinutes:
 *                       type: number
 *                     totalGeofenceBreachMinutes:
 *                       type: number
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get(
  "/today",
  authenticate,
  requireSeniorOrJunior,
  attendanceController.getTodayAttendance
);


/**
 * @swagger
 * /api/attendance/day:
 *   get:
 *     summary: Get attendance record for a particular day
 *     tags: [Attendance]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: date
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *           example: "2024-01-15"
 *         description: Attendance date in YYYY-MM-DD format
 *     responses:
 *       200:
 *         description: Attendance record retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   nullable: true
 *       400:
 *         description: Date is required
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get(
  "/day",
  authenticate,
  requireSeniorOrJunior,
  validateRequest({ query: dateQuerySchema.required({ date: true }) }),
  attendanceController.getAttendanceByDate
);


/**
 * @swagger
 * /api/attendance/users:
 *   get:
 *     summary: Get users for attendance view (Admin/Senior only) - Paginated
 *     tags: [Attendance]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Items per page
 *     responses:
 *       200:
 *         description: Paginated list of users with today's attendance status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     users:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           name:
 *                             type: string
 *                           email:
 *                             type: string
 *                           role:
 *                             type: string
 *                           today:
 *                             type: object
 *                             properties:
 *                               clockedIn:
 *                                 type: boolean
 *                               clockedOut:
 *                                 type: boolean
 *                               status:
 *                                 type: string
 *                               totalWorkMinutes:
 *                                 type: number
 *                               overtimeMinutes:
 *                                 type: number
 *                               totalGeofenceBreachMinutes:
 *                                 type: number
 *                     pagination:
 *                       type: object
 *                       properties:
 *                         total:
 *                           type: integer
 *                         page:
 *                           type: integer
 *                         limit:
 *                           type: integer
 *                         totalPages:
 *                           type: integer
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Requires Admin or Senior role
 *       500:
 *         description: Internal server error
 */
router.get(
  "/users",
  authenticate,
  requireSenior,
  validateRequest({ query: paginationSchema }),
  attendanceController.getUsersForAttendanceView
);

/**
 * @swagger
 * /api/attendance/user/{userId}:
 *   get:
 *     summary: Get user attendance details (Admin only)
 *     tags: [Attendance]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID of the user to fetch attendance for
 *       - in: query
 *         name: weekStart
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date of the week (YYYY-MM-DD)
 *       - in: query
 *         name: month
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 12
 *         description: Month number (1-12)
 *       - in: query
 *         name: year
 *         schema:
 *           type: integer
 *         description: Year
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date for custom range (YYYY-MM-DD)
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         description: End date for custom range (YYYY-MM-DD)
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number for custom range
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Limit items per page for custom range
 *     responses:
 *       200:
 *         description: User attendance details including today, weekly, monthly and optional custom range data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     user:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: string
 *                         name:
 *                           type: string
 *                         email:
 *                           type: string
 *                         role:
 *                           type: string
 *                         shiftStart:
 *                           type: string
 *                     attendance:
 *                       type: object
 *                       properties:
 *                         today:
 *                           type: object
 *                         weekly:
 *                           type: object
 *                         monthly:
 *                           type: object
 *                         customRange:
 *                           type: object
 *                           nullable: true
 *                           properties:
 *                             logs:
 *                               type: array
 *                             pagination:
 *                               type: object
 *                               properties:
 *                                 total:
 *                                   type: integer
 *                                 page:
 *                                   type: integer
 *                                 limit:
 *                                   type: integer
 *                                 totalPages:
 *                                   type: integer
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Requires Admin role
 *       400:
 *         description: User ID is required
 *       500:
 *         description: Internal server error
 */
router.get(
  "/user/:userId",
  authenticate,
  requireSenior,
  validateRequest({ params: userIdParamSchema, query: attendanceQuerySchema }),
  attendanceController.getUserAttendanceForSenior
);

router.post(
  "/report-geofence-breach",
  authenticate,
  requireSeniorOrJunior,
  attendanceController.reportGeofenceBreach
);

router.post(
  "/clear-geofence-breach",
  authenticate,
  requireSeniorOrJunior,
  attendanceController.clearGeofenceBreach
);

/**
 * @swagger
 * /api/attendance/heartbeat:
 *   post:
 *     summary: Status heartbeat from mobile app (poll every ~20 seconds)
 *     description: |
 *       Called by the mobile app to report user liveness, location, and FCM token.
 *       Tracks cumulative geofence breach time and signals when the app should trigger checkout.
 *     tags: [Attendance]
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - latitude
 *               - longitude
 *             properties:
 *               latitude:
 *                 type: number
 *                 minimum: -90
 *                 maximum: 90
 *                 example: 28.6139
 *               longitude:
 *                 type: number
 *                 minimum: -180
 *                 maximum: 180
 *                 example: 77.2090
 *               fcmToken:
 *                 type: string
 *                 description: Firebase Cloud Messaging token for push notifications
 *     responses:
 *       200:
 *         description: Heartbeat processed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     checkedIn:
 *                       type: boolean
 *                     insideGeofence:
 *                       type: boolean
 *                     shiftOngoing:
 *                       type: boolean
 *                     overtimeMinutes:
 *                       type: number
 *                     totalGeofenceBreachMinutes:
 *                       type: number
 *                     remainingBreachMinutes:
 *                       type: number
 *                     shouldCheckout:
 *                       type: boolean
 *                     message:
 *                       type: string
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 */
router.post(
  "/heartbeat",
  authenticate,
  requireSeniorOrJunior,
  attendanceController.heartbeat
);

export default router;
=======
import { Router } from "express";
import { authenticate } from "../middleware/auth";
import { requireSenior, requireSeniorOrJunior } from "../middleware/rbac";
import { validateRequest } from "../middleware/validate";
import { upload } from "../utils/fileUpload";
import attendanceController from "../controllers/attendance.controller";
import { checkInSchema, checkOutSchema } from "../validations/attendance.validations";
import { dateQuerySchema, weekStartQuerySchema, monthYearQuerySchema, paginationSchema, userIdParamSchema, attendanceQuerySchema } from "../validations/common.validations";


const router = Router();
/**
 * @swagger
 * /api/attendance/check-in:
 *   post:
 *     summary: Check in for attendance
 *     tags: [Attendance]
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - latitude
 *               - longitude
 *             properties:
 *               photo:
 *                 type: string
 *                 format: binary
 *                 description: Check-in photo
 *               latitude:
 *                 type: number
 *                 minimum: -90
 *                 maximum: 90
 *                 example: 40.7128
 *               longitude:
 *                 type: number
 *                 minimum: -180
 *                 maximum: 180
 *                 example: -74.0060
 *               timestamp:
 *                 type: number
 *                 description: Unix timestamp in milliseconds (optional, defaults to current time)
 *                 example: 1640995200000
 *     responses:
 *       200:
 *         description: Check-in successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Check-in successful"
 *                 data:
 *                   type: object
 *                   properties:
 *                     clockInTime:
 *                       type: number
 *                     latitude:
 *                       type: number
 *                     longitude:
 *                       type: number
 *                     clockInImageUrl:
 *                       type: string
 *                       nullable: true
 *                     status:
 *                       type: string
 *                     totalHoursThisWeek:
 *                       type: number
 *       400:
 *         description: Validation error or check-in failed
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post(
  "/check-in",
  authenticate,
  requireSeniorOrJunior,
  upload.fields([{ name: "photo", maxCount: 1 }, { name: "image", maxCount: 1 }]),
  validateRequest({ body: checkInSchema }),
  attendanceController.checkIn
);

/**
 * @swagger
 * /api/attendance/check-out:
 *   post:
 *     summary: Check out from attendance
 *     tags: [Attendance]
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - latitude
 *               - longitude
 *             properties:
 *               latitude:
 *                 type: number
 *                 minimum: -90
 *                 maximum: 90
 *                 example: 40.7128
 *               longitude:
 *                 type: number
 *                 minimum: -180
 *                 maximum: 180
 *                 example: -74.0060
 *               timestamp:
 *                 type: number
 *                 description: Unix timestamp in milliseconds (optional, defaults to current time)
 *                 example: 1640995200000
 *               isAuto:
 *                 type: boolean
 *                 description: Whether this is an automatic check-out
 *                 default: false
 *                 example: false
 *     responses:
 *       200:
 *         description: Check-out successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Check-out successful"
 *                 data:
 *                   type: object
 *       400:
 *         description: Validation error or check-out failed
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post(
  "/check-out",
  authenticate,
  requireSeniorOrJunior,
  upload.fields([{ name: "photo", maxCount: 1 }, { name: "image", maxCount: 1 }]),
  validateRequest({ body: checkOutSchema }),
  attendanceController.checkOut
);

/**
 * @swagger
 * /api/attendance/weekly:
 *   get:
 *     summary: Get weekly attendance report
 *     tags: [Attendance]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: weekStart
 *         schema:
 *           type: string
 *           format: date
 *           example: "2024-01-01"
 *         description: Start date of the week (YYYY-MM-DD format). If not provided, uses current week.
 *     responses:
 *       200:
 *         description: Weekly attendance data retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     weekRange:
 *                       type: string
 *                     totalHoursThisWeek:
 *                       type: number
 *                     dailyLogs:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           date:
 *                             type: string
 *                           dayOfWeek:
 *                             type: string
 *                           clockInTime:
 *                             type: number
 *                             nullable: true
 *                           clockInImageUrl:
 *                             type: string
 *                             nullable: true
 *                           clockOutTime:
 *                             type: number
 *                             nullable: true
 *                           totalWorkMinutes:
 *                             type: number
 *                           status:
 *                             type: string
 *                     averageClockInTime:
 *                       type: string
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get(
  "/weekly",
  authenticate,
  requireSeniorOrJunior,
  validateRequest({ query: weekStartQuerySchema }),
  attendanceController.getWeeklyAttendance
);

/**
 * @swagger
 * /api/attendance/monthly:
 *   get:
 *     summary: Get monthly attendance report
 *     tags: [Attendance]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: month
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 12
 *           example: 1
 *         description: Month number (1-12). If not provided, uses current month.
 *       - in: query
 *         name: year
 *         schema:
 *           type: integer
 *           example: 2024
 *         description: Year. If not provided, uses current year.
 *     responses:
 *       200:
 *         description: Monthly attendance data retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     month:
 *                       type: string
 *                     startDate:
 *                       type: string
 *                       format: date
 *                     endDate:
 *                       type: string
 *                       format: date
 *                     totalHoursThisMonth:
 *                       type: number
 *                     averageClockInTime:
 *                       type: string
 *                     totalWorkingDays:
 *                       type: number
 *                     presentDays:
 *                       type: number
 *                     absentDays:
 *                       type: number
 *                     dailyLogs:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           date:
 *                             type: string
 *                           dayOfWeek:
 *                             type: string
 *                           clockInTime:
 *                             type: number
 *                             nullable: true
 *                           clockInImageUrl:
 *                             type: string
 *                             nullable: true
 *                           clockOutTime:
 *                             type: number
 *                             nullable: true
 *                           totalWorkMinutes:
 *                             type: number
 *                           status:
 *                             type: string
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get(
  "/monthly",
  authenticate,
  requireSeniorOrJunior,
  validateRequest({ query: monthYearQuerySchema }),
  attendanceController.getMonthlyAttendance
);


/**
 * @swagger
 * /api/attendance/today:
 *   get:
 *     summary: Get today's attendance record
 *     tags: [Attendance]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Today's attendance data retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     date:
 *                       type: string
 *                     clockedIn:
 *                       type: boolean
 *                     clockedOut:
 *                       type: boolean
 *                     clockInTime:
 *                       type: number
 *                       nullable: true
 *                     clockInImageUrl:
 *                       type: string
 *                       nullable: true
 *                     clockOutTime:
 *                       type: number
 *                       nullable: true
 *                     status:
 *                       type: string
 *                     totalWorkMinutes:
 *                       type: number
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get(
  "/today",
  authenticate,
  requireSeniorOrJunior,
  attendanceController.getTodayAttendance
);


/**
 * @swagger
 * /api/attendance/day:
 *   get:
 *     summary: Get attendance record for a particular day
 *     tags: [Attendance]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: date
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *           example: "2024-01-15"
 *         description: Attendance date in YYYY-MM-DD format
 *     responses:
 *       200:
 *         description: Attendance record retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   nullable: true
 *       400:
 *         description: Date is required
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get(
  "/day",
  authenticate,
  requireSeniorOrJunior,
  validateRequest({ query: dateQuerySchema.required({ date: true }) }),
  attendanceController.getAttendanceByDate
);


/**
 * @swagger
 * /api/attendance/users:
 *   get:
 *     summary: Get users for attendance view (Admin/Senior only) - Paginated
 *     tags: [Attendance]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Items per page
 *     responses:
 *       200:
 *         description: Paginated list of users with today's attendance status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     users:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           name:
 *                             type: string
 *                           email:
 *                             type: string
 *                           role:
 *                             type: string
 *                           today:
 *                             type: object
 *                             properties:
 *                               clockedIn:
 *                                 type: boolean
 *                               clockedOut:
 *                                 type: boolean
 *                               status:
 *                                 type: string
 *                               totalWorkMinutes:
 *                                 type: number
 *                     pagination:
 *                       type: object
 *                       properties:
 *                         total:
 *                           type: integer
 *                         page:
 *                           type: integer
 *                         limit:
 *                           type: integer
 *                         totalPages:
 *                           type: integer
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Requires Admin or Senior role
 *       500:
 *         description: Internal server error
 */
router.get(
  "/users",
  authenticate,
  requireSenior,
  validateRequest({ query: paginationSchema }),
  attendanceController.getUsersForAttendanceView
);

/**
 * @swagger
 * /api/attendance/user/{userId}:
 *   get:
 *     summary: Get user attendance details (Admin only)
 *     tags: [Attendance]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID of the user to fetch attendance for
 *       - in: query
 *         name: weekStart
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date of the week (YYYY-MM-DD)
 *       - in: query
 *         name: month
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 12
 *         description: Month number (1-12)
 *       - in: query
 *         name: year
 *         schema:
 *           type: integer
 *         description: Year
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date for custom range (YYYY-MM-DD)
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         description: End date for custom range (YYYY-MM-DD)
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number for custom range
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Limit items per page for custom range
 *     responses:
 *       200:
 *         description: User attendance details including today, weekly, monthly and optional custom range data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     user:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: string
 *                         name:
 *                           type: string
 *                         email:
 *                           type: string
 *                         role:
 *                           type: string
 *                         shiftStart:
 *                           type: string
 *                     attendance:
 *                       type: object
 *                       properties:
 *                         today:
 *                           type: object
 *                         weekly:
 *                           type: object
 *                         monthly:
 *                           type: object
 *                         customRange:
 *                           type: object
 *                           nullable: true
 *                           properties:
 *                             logs:
 *                               type: array
 *                             pagination:
 *                               type: object
 *                               properties:
 *                                 total:
 *                                   type: integer
 *                                 page:
 *                                   type: integer
 *                                 limit:
 *                                   type: integer
 *                                 totalPages:
 *                                   type: integer
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Requires Admin role
 *       400:
 *         description: User ID is required
 *       500:
 *         description: Internal server error
 */
router.get(
  "/user/:userId",
  authenticate,
  requireSenior,
  validateRequest({ params: userIdParamSchema, query: attendanceQuerySchema }),
  attendanceController.getUserAttendanceForSenior
);

router.post(
  "/report-geofence-breach",
  authenticate,
  requireSeniorOrJunior,
  attendanceController.reportGeofenceBreach
);

router.post(
  "/clear-geofence-breach",
  authenticate,
  requireSeniorOrJunior,
  attendanceController.clearGeofenceBreach
);

export default router;
>>>>>>> a0b9806cb8726afe5c21c423d73ce7f3047d053c
