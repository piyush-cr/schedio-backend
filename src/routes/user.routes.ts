import { Router, Response } from "express";
import { authenticate, AuthRequest } from "../middleware/auth";
import { requireSenior, requireAnyRole } from "../middleware/rbac";
import userCrud from "../crud/user.crud";
import { UserRole } from "../types";
import { logout } from "../controllers/auth.controller";
import attendanceCrud from "../crud/attendance.crud";
import { format } from "date-fns";

const router = Router();


/**
 * @swagger
 * /api/users/{userId}:
 *   get:
 *     summary: Get user by ID
 *     description: Admin can access any user, Senior can access users in their team, users can access their own profile
 *     tags: [Users]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID
 *         example: "507f1f77bcf86cd799439011"
 *     responses:
 *       200:
 *         description: User retrieved successfully
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
 *                     _id:
 *                       type: string
 *                     employeeId:
 *                       type: string
 *                     name:
 *                       type: string
 *                     email:
 *                       type: string
 *                     role:
 *                       $ref: '#/components/schemas/UserRole'
 *                     teamId:
 *                       type: string
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: Forbidden - User doesn't have access to this user
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: User not found
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
  "/:userId",
  authenticate,
  requireAnyRole, // ADMIN, SENIOR, JUNIOR and INTERN — inner logic enforces self/team access
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { userId } = req.params;
      const currentUser = req.user!;

      // Admin can access any user.
      // Senior can access users within their team.
      // JUNIOR / INTERN (employee-like roles) can only access their own profile.
      if (
        currentUser.role !== UserRole.ADMIN &&
        currentUser.userId !== userId
      ) {
        console.log("this is userid", userId);
        const user = await userCrud.findById(userId);
        const currentUserData = await userCrud.findById(currentUser.userId);

        if (
          currentUser.role === UserRole.SENIOR &&
          user?.teamId !== currentUserData?.teamId
        ) {
          res.status(403).json({
            success: false,
            message: "Access denied",
          });
          return;
        }
      }

      const user = await userCrud.findById(userId);
      if (!user) {
        res.status(404).json({
          success: false,
          message: "User not found",
        });
        return;
      }

      const userObj = user.toObject ? user.toObject() : user;
      const { password, ...userWithoutPassword } = userObj;

      res.json({
        success: true,
        data: userWithoutPassword,
      });
    } catch (error) {
      console.error("Get user error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  }
);

/**
 * @swagger
 * /api/users/team/status:
 *   get:
 *     summary: Get team status
 *     description: Admin can see all users, Senior can see their team members - who is clocked in, who is outside the geofence
 *     tags: [Users]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Team status retrieved successfully
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
 *                     teamId:
 *                       type: string
 *                       nullable: true
 *                       description: Team ID for seniors, 'ALL' for admins viewing all users
 *                       example: "TEAM_A"
 *                     totalMembers:
 *                       type: integer
 *                       description: Total number of members returned
 *                       example: 5
 *                     members:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           _id:
 *                             type: string
 *                           employeeId:
 *                             type: string
 *                           name:
 *                             type: string
 *                           email:
 *                             type: string
 *                           role:
 *                             $ref: '#/components/schemas/UserRole'
 *                           teamId:
 *                             type: string
 *                           isClockedIn:
 *                             type: boolean
 *                             description: Whether the user is currently clocked in
 *                           isInOffice:
 *                             type: boolean
 *                             description: Whether the user is within the office geofence (based on clock-in location)
 *                           attendanceStatus:
 *                             type: string
 *                             nullable: true
 *                             enum: [PRESENT, LATE, HALF_DAY, ABSENT]
 *                             description: Current attendance status for today
 *                           clockInTime:
 *                             type: number
 *                             nullable: true
 *                             description: Clock-in timestamp (milliseconds since epoch)
 *                           totalWorkMinutes:
 *                             type: integer
 *                             description: Total work minutes accumulated today
 *                             example: 480
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: Forbidden - Only Admin and Senior users can access this endpoint
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
  "/team/status",
  authenticate,
  requireSenior,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const currentRole = req.user!.role;
      const currentUserId = req.user!.userId;

      let teamMembers;
      let teamId: string | null = null;

      if (currentRole === UserRole.ADMIN) {
        // Admin can see all users
        teamMembers = await userCrud.findMany({});
        teamId = 'ALL'; // Indicate admin is viewing all users
      } else {
        // Senior can only see their team
        const currentUser = await userCrud.findById(currentUserId);

        if (!currentUser?.teamId) {
          res.json({
            success: true,
            data: {
              teamId: null,
              members: [],
            },
          });
          return;
        }

        teamId = currentUser.teamId;
        teamMembers = await userCrud.findMany({
          teamId: currentUser.teamId,
        });
      }


      // Get today's date for attendance lookup
      const today = format(new Date(), "yyyy-MM-dd");

      // Fetch attendance records for all team members for today
      const attendanceRecords = await attendanceCrud.findMany({
        date: today,
      });

      // Create a map for quick lookup userId -> attendance record
      const attendanceMap = new Map();
      attendanceRecords.forEach(record => {
        attendanceMap.set(record.userId.toString(), record);
      });

      // Helper function to check if user is within geofence
      const isInGeofence = (userLat: number, userLng: number, officeLat: number, officeLng: number, radiusMeters: number = 100) => {
        const R = 6371e3; // Earth's radius in meters
        const φ1 = (userLat * Math.PI) / 180;
        const φ2 = (officeLat * Math.PI) / 180;
        const Δφ = ((officeLat - userLat) * Math.PI) / 180;
        const Δλ = ((officeLng - userLng) * Math.PI) / 180;

        const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
          Math.cos(φ1) * Math.cos(φ2) *
          Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        const distance = R * c;

        return distance <= radiusMeters;
      };

      const membersWithStatus = teamMembers.map((user) => {
        const userObj = user.toObject ? user.toObject() : user;
        const { password, ...userWithoutPassword } = userObj;

        // Get attendance record for this user
        const attendance = attendanceMap.get(user._id.toString());

        // Check if user is clocked in (has clockInTime but no clockOutTime)
        const isClockedIn = attendance ?
          (!!attendance.clockInTime && !attendance.clockOutTime) : false;

        // Check if user is in office geofence
        let isInOffice = false;
        if (attendance && isClockedIn && user.officeLat && user.officeLng) {
          // Check clock-in location
          if (attendance.clockInLat && attendance.clockInLng) {
            isInOffice = isInGeofence(
              attendance.clockInLat,
              attendance.clockInLng,
              user.officeLat,
              user.officeLng,
              100
            );
          }
        }

        return {
          ...userWithoutPassword,
          isClockedIn,
          isInOffice,
          attendanceStatus: attendance?.status || null,
          clockInTime: attendance?.clockInTime || null,
          totalWorkMinutes: attendance?.totalWorkMinutes || 0,
        };
      });

      res.json({
        success: true,
        data: {
          teamId: teamId,
          members: membersWithStatus,
          totalMembers: membersWithStatus.length,
        },
      });
    } catch (error) {
      console.error("Get team status error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  }
);

/**
 * @swagger
 * /api/users/fcm-token:
 *   post:
 *     summary: Register FCM token
 *     tags: [Users]
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - fcmToken
 *             properties:
 *               fcmToken:
 *                 type: string
 *     responses:
 *       200:
 *         description: FCM token registered successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 */
router.post(
  "/fcm-token",
  authenticate,
  async (req: AuthRequest, res: Response) => {
    try {
      const { fcmToken } = req.body;
      if (!fcmToken || typeof fcmToken !== "string") {
        return res
          .status(400)
          .json({ success: false, message: "fcmToken is required" });
      }

      await userCrud.updateById(req.user!.userId, { fcmToken });

      return res.status(200).json({
        success: true,
        message: "FCM token registered successfully",
      });
    } catch (error) {
      console.error("Register FCM token error:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  }
);

export default router;
