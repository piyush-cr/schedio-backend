import { format } from "date-fns";
import { AttendanceStatus } from "../../../types";
import { CheckOutInput } from "../../../types/attendance.types";
import { GeoPoint, isInsideGeofence } from "../../../lib/geofencing";
import userCrud from "../../../crud/user.crud";
import attendanceCrud from "../../../crud/attendance.crud";
import { validateCheckoutAndGetStatus, formatTimeTo12Hour } from "../_shared";
import { appQueue } from "../../../jobs/queues/app.queue";

export interface CheckOutResult {
  clockOutTime: string;
  latitude: number;
  longitude: number;
  totalWorkMinutes: number;
  status: AttendanceStatus;
}

/**
 * Check out for a user
 */
export async function checkOut(input: CheckOutInput): Promise<CheckOutResult> {
  const { userId, latitude, longitude, localFilePath } = input;
  const timestamp = input.timestamp ?? Date.now();
  const date = format(timestamp, "yyyy-MM-dd");

  const user = await userCrud.findById(userId);
  if (!user) {
    throw new Error("User not found");
  }

  const attendance = await attendanceCrud.findByUserIdAndDate(userId, date);
  if (!attendance) {
    throw new Error("No check-in record found for today. Please check in first.");
  }

  if (attendance.clockOutTime) {
    throw new Error("Already checked out today");
  }

  if (user.officeLat && user.officeLng) {
    const userLocation: GeoPoint = {
      lat: latitude,
      lng: longitude,
    };

    const officeGeofence = {
      center: {
        lat: user.officeLat,
        lng: user.officeLng,
      },
      radius: 100,
    };

    const userTimezone = "Asia/Kolkata";
    const currentHourInUserTZ = new Date(timestamp).toLocaleString("en-US", {
      timeZone: userTimezone,
      hour: "numeric",
      hour12: false,
    });
    const currentHour = parseInt(currentHourInUserTZ);

    if (!isInsideGeofence(userLocation, officeGeofence)) {
      if (currentHour < 18) {
        throw new Error(
          "You are outside the office geofence (100m radius)"
        );
      }
    }
  }

  const clockInTime = attendance.clockInTime || timestamp;
  const totalWorkMinutes = Math.floor((timestamp - clockInTime) / (1000 * 60));

  const { executeWithTransaction, createAuditLogEntry } = await import(
    "../../../utils/transaction"
  );

  const result = await executeWithTransaction(async (session) => {
    const userTimezoneForValidation = "Asia/Kolkata";

    console.log("User shift config:", {
      userId,
      shiftStart: user.shiftStart,
      shiftEnd: user.shiftEnd,
      timezone: userTimezoneForValidation,
      clockInTime: new Date(clockInTime).toISOString(),
      clockOutTime: new Date(timestamp).toISOString(),
      totalWorkMinutes,
    });

    const checkoutValidation = validateCheckoutAndGetStatus({
      clockInTimestamp: clockInTime,
      clockOutTimestamp: timestamp,
      shiftStart: user.shiftStart,
      shiftEnd: user.shiftEnd,
      graceMinutes: 5,
      timezone: userTimezoneForValidation,
    });

    console.log("Checkout validation result:", checkoutValidation);

    if (!checkoutValidation.canCheckout) {
      throw new Error(
        checkoutValidation.errorMessage ||
          "Checkout not allowed at this time."
      );
    }

    let finalStatus = checkoutValidation.status;

    if (
      attendance.status === AttendanceStatus.LATE &&
      checkoutValidation.status === AttendanceStatus.HALF_DAY
    ) {
      finalStatus = AttendanceStatus.HALF_DAY;
    }

    const updatedAttendance = await attendanceCrud.updateById(
      attendance._id.toString(),
      {
        clockOutTime: timestamp,
        clockOutLat: latitude,
        clockOutLng: longitude,
        clockOutImageUrl: "",
        totalWorkMinutes,
        status: finalStatus,
      },
      session
    );

    if (updatedAttendance && localFilePath) {
      await appQueue
        .add("UPLOAD_CHECKOUT_IMAGE", {
          userId,
          attendanceId: updatedAttendance._id.toString(),
          localFilePath,
          date,
        })
        .catch((err) =>
          console.error("Failed to queue checkout image upload job:", err)
        );
    }

    await appQueue
      .add("SEND_ATTENDANCE_NOTIFICATION", {
        userId,
        type: "CHECK_OUT",
        data: {
          userName: user.name,
          timestamp,
          status: updatedAttendance?.status,
          totalWorkMinutes,
        },
      })
      .catch((err) => console.error("Failed to queue notification job:", err));

    await appQueue
      .add("CALCULATE_ATTENDANCE_STATS", {
        userId,
        date,
        types: ["DAILY", "WEEKLY", "MONTHLY"],
      })
      .catch((err) =>
        console.error("Failed to queue stats calculation job:", err)
      );

    await createAuditLogEntry(
      {
        action: "CHECK_OUT",
        performedBy: userId,
        targetUser: userId,
        resource: "Attendance",
        resourceId: attendance._id,
        metadata: {
          location: { latitude, longitude },
          totalWorkMinutes,
          status: finalStatus,
          timestamp,
        },
      },
      session
    );

    return {
      clockOutTime: formatTimeTo12Hour(timestamp),
      latitude: latitude,
      longitude: longitude,
      totalWorkMinutes,
      status:
        updatedAttendance?.status === AttendanceStatus.LATE ||
        updatedAttendance?.status === AttendanceStatus.HALF_DAY ||
        updatedAttendance?.status === AttendanceStatus.NOT_FULL_DAY
          ? AttendanceStatus.PRESENT
          : updatedAttendance?.status,
    };
  });
//@ts-ignore
  return result;
}
