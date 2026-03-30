import { format } from "date-fns";
import { AttendanceStatus } from "../../../types";
import { CheckInInput } from "../../../types/attendance.types";
import { GeoPoint, isInsideGeofence } from "../../../lib/geofencing";
import userCrud from "../../../crud/user.crud";
import attendanceCrud from "../../../crud/attendance.crud";
import { calculateStatus, formatTimeTo12Hour } from "../_shared";
import { DEFAULT_GEOFENCE_RADIUS } from "../_shared/geofence";
import { appQueue } from "../../../jobs/queues/app.queue";
import { NotFoundError, BadRequestError, ForbiddenError } from "../../../utils/ApiError";
import { uploadFile } from "../../../utils/imagekit";

export interface CheckInResult {
  clockInTime: string;
  latitude: number;
  longitude: number;
  clockInImageUrl: string | null;
  status: AttendanceStatus;
  totalHoursThisWeek: number;
}

export async function checkIn(input: CheckInInput): Promise<CheckInResult> {
  const { userId, latitude, longitude, localFilePath } = input;
  const timestamp = Date.now();
  const date = format(timestamp, "yyyy-MM-dd");

  const user = await userCrud.findById(userId);
  if (!user) throw new NotFoundError("User not found");

  if (user.officeLat && user.officeLng) {
    const userLocation: GeoPoint = { lat: latitude, lng: longitude };
    const officeGeofence = {
      center: { lat: user.officeLat, lng: user.officeLng },
      radius: DEFAULT_GEOFENCE_RADIUS,
    };

    if (!isInsideGeofence(userLocation, officeGeofence)) {
      throw new ForbiddenError("You are outside the office geofence");
    }
  }

  const status = calculateStatus(timestamp, user.shiftStart, user.shiftEnd, "Asia/Kolkata", 20);

  const { executeWithTransaction, createAuditLogEntry } = await import(
    "../../../utils/transaction"
  );

  const attendance = await executeWithTransaction(async (session) => {
    const existing = await attendanceCrud.findByUserIdAndDate(userId, date, session);

    if (existing?.clockInTime) throw new BadRequestError("Already checked in today");
    const uploadImage = await uploadFile(localFilePath!)

    const attendanceRecord = await attendanceCrud.findOneAndUpdate(
      { userId, date, clockInTime: { $exists: false } },
      {
        $set: {
          clockInTime: timestamp,
          clockInLat: latitude,
          clockInLng: longitude,
          clockInImageUrl: uploadImage.url,
          status,
        },
        $setOnInsert: { userId, date },
      },
      { new: true, upsert: true, session }
    );

    await createAuditLogEntry(
      {
        action: "CHECK_IN",
        performedBy: userId,
        targetUser: userId,
        resource: "Attendance",
        resourceId: attendanceRecord._id,
        metadata: { location: { latitude, longitude }, status, timestamp },
      },
      session
    );

    return attendanceRecord;
  });

  const weekStart = new Date(date);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());

  const weekStartStr = weekStart.toISOString().split("T")[0];
  const weekEndStr = new Date(weekStart.getTime() + 6 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0];
  const summary = await attendanceCrud.getSummary({
    userId,
    startDate: weekStartStr,
    endDate: weekEndStr,
  });

  const totalHoursThisWeek = Math.round(((summary[0]?.totalMinutes || 0) / 60) * 100) / 100;
  // if (attendance && localFilePath) {
  //   appQueue
  //     .add("UPLOAD_CHECKIN_IMAGE", {
  //       userId,
  //       attendanceId: attendance._id.toString(),
  //       localFilePath,
  //       date,
  //     })
  //     .catch((err) => console.error("[checkIn] Failed to queue image upload:", err));
  // }

  // appQueue
  //   .add("SEND_ATTENDANCE_NOTIFICATION", {
  //     userId,
  //     type: status === AttendanceStatus.LATE ? "LATE_ARRIVAL" : "CHECK_IN",
  //     data: { userName: user.name, timestamp, status },
  //   })
  //   .catch((err) => console.error("[checkIn] Failed to queue notification:", err));

  return {
    clockInTime: formatTimeTo12Hour(timestamp),
    latitude,
    longitude,
    clockInImageUrl: attendance?.clockInImageUrl || null,
    status: attendance?.status || status,
    totalHoursThisWeek
  };
}