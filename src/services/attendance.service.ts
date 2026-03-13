import { AttendanceStatus, UserRole } from "../types";
import { Geofence, GeoPoint, isInsideGeofence } from "../lib/geofencing";
import { CheckInInput, CheckOutInput } from "../types/attendance.types";
import userCrud from "../crud/user.crud";
import attendanceCrud from "../crud/attendance.crud";
import {
  format,
  startOfWeek,
  eachDayOfInterval,
  startOfMonth,
  endOfMonth,
  subDays
} from "date-fns";
import { getLastDateOfWeek } from "../utils/dateUtils";
import { appQueue } from "../jobs/queues/app.queue";

function calculateShiftDuration(
  shiftStart?: string,
  shiftEnd?: string
): number | null {
  if (!shiftStart || !shiftEnd) {
    return null;
  }

  // Parse shift times (format: "HH:mm")
  const [startHour, startMinute] = shiftStart.split(":").map(Number);
  const [endHour, endMinute] = shiftEnd.split(":").map(Number);

  // Validate shift time format
  if (
    isNaN(startHour) ||
    isNaN(startMinute) ||
    isNaN(endHour) ||
    isNaN(endMinute) ||
    startHour < 0 ||
    startHour > 23 ||
    startMinute < 0 ||
    startMinute > 59 ||
    endHour < 0 ||
    endHour > 23 ||
    endMinute < 0 ||
    endMinute > 59
  ) {
    return null;
  }

  // Calculate duration in minutes
  const startMinutes = startHour * 60 + startMinute;
  const endMinutes = endHour * 60 + endMinute;

  // Handle shifts that span midnight
  let duration = endMinutes - startMinutes;
  if (duration < 0) {
    duration += 24 * 60; // Add 24 hours
  }

  return duration;
}



function getTimeInTimezone(timestamp: number, timezone: string): { hours: number; minutes: number } {
  const date = new Date(timestamp);
  const timeStr = date.toLocaleString('en-US', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });

  const [hours, minutes] = timeStr.split(':').map(Number);
  return { hours, minutes };
}

/**
 * Format time in HH:mm format from timestamp in specified timezone
 * @param timestamp - Unix timestamp in milliseconds  
 * @param timezone - IANA timezone name
 * @returns Time string in HH:mm format
 */
function formatTimeInTimezone(timestamp: number, timezone: string): string {
  const date = new Date(timestamp);
  const formatted = date.toLocaleString('en-US', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
  return formatted;
}

/**
 * Convert local time string (HH:mm) on a given date to minutes since midnight
 * @param timeStr - Time string in "HH:mm" format
 * @returns Minutes since midnight
 */
function timeStringToMinutes(timeStr: string): number {
  const [hours, minutes] = timeStr.split(':').map(Number);
  return hours * 60 + minutes;
}

/**
 * Convert timestamp to minutes since midnight in the user's timezone
 * @param timestamp - Unix timestamp in milliseconds
 * @param timezone - IANA timezone name
 * @returns Minutes since midnight in the user's timezone
 */
function timestampToMinutesInTimezone(timestamp: number, timezone: string): number {
  const { hours, minutes } = getTimeInTimezone(timestamp, timezone);
  return hours * 60 + minutes;
}

/**
 * Format a Unix timestamp (ms) to "hh:mm AM/PM" in the specified timezone
 * @param timestamp - Unix timestamp in milliseconds
 * @param timezone - IANA timezone name (default: "Asia/Kolkata")
 * @returns Formatted time string like "11:12 AM" or "05:00 PM"
 */
function formatTimeTo12Hour(timestamp: number, timezone: string = "Asia/Kolkata"): string {
  const date = new Date(timestamp);
  return date.toLocaleString('en-US', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

/**
 * Validate checkout time window and determine attendance status.
 * 
 * Rules:
 * - Earliest checkout: shift_start + (shift_duration / 2) - grace_period (5 min)
 * - Latest checkout: shift_end - 2 hours - grace_period (5 min)
 * - If checkout before earliest → allowed with status = NOT_FULL_DAY
 * - If checkout after latest → checkout DENIED (error)
 * - If checkout in valid window:
 *   - If actual_work_duration >= shift_duration / 2 → HALF_DAY
 *   - If actual_work_duration < shift_duration / 2 → NOT_FULL_DAY
 * 
 * @param clockInTimestamp - Clock-in timestamp (ms)
 * @param clockOutTimestamp - Checkout timestamp (ms)
 * @param shiftStart - Shift start time in "HH:mm" format (in user's local time)
 * @param shiftEnd - Shift end time in "HH:mm" format (in user's local time)
 * @param graceMinutes - Grace period in minutes (default: 5)
 * @param timezone - IANA timezone name (default: "Asia/Kolkata")
 * @returns Object with canCheckout flag, status, and error message if not allowed
 */
function validateCheckoutAndGetStatus(params: {
  clockInTimestamp: number;
  clockOutTimestamp: number;
  shiftStart?: string;
  shiftEnd?: string;
  graceMinutes?: number;
  timezone?: string;
}): { canCheckout: boolean; status: AttendanceStatus; errorMessage?: string } {
  const {
    clockInTimestamp,
    clockOutTimestamp,
    shiftStart,
    shiftEnd,
    graceMinutes = 5,
    timezone = "Asia/Kolkata", // Default to IST
  } = params;

  const shiftDurationMinutes = calculateShiftDuration(shiftStart, shiftEnd);

  if (shiftDurationMinutes === null || !shiftStart || !shiftEnd) {
    const totalWorkMinutes = Math.floor((clockOutTimestamp - clockInTimestamp) / 60000);
    return totalWorkMinutes >= 240
      ? { canCheckout: true, status: AttendanceStatus.HALF_DAY }
      : { canCheckout: true, status: AttendanceStatus.NOT_FULL_DAY };
  }

  const shiftStartMinutes = timeStringToMinutes(shiftStart);
  const shiftEndMinutes = timeStringToMinutes(shiftEnd);

  // Validate parsed times
  if (isNaN(shiftStartMinutes) || isNaN(shiftEndMinutes)) {
    const totalWorkMinutes = Math.floor((clockOutTimestamp - clockInTimestamp) / 60000);
    return totalWorkMinutes >= 240
      ? { canCheckout: true, status: AttendanceStatus.HALF_DAY }
      : { canCheckout: true, status: AttendanceStatus.NOT_FULL_DAY };
  }

  const halfShiftMinutes = shiftDurationMinutes / 2;

  const earliestCheckoutMinutes = shiftStartMinutes + halfShiftMinutes - graceMinutes;

  let latestCheckoutMinutes = shiftEndMinutes - 120 - graceMinutes; // 2 hours = 120 minutes

  if (shiftEndMinutes <= shiftStartMinutes) {
    latestCheckoutMinutes = (shiftEndMinutes + 1440) - 120 - graceMinutes;
  }

  const checkoutMinutes = timestampToMinutesInTimezone(clockOutTimestamp, timezone);

  const totalWorkMinutes = Math.floor((clockOutTimestamp - clockInTimestamp) / 60000);

  // Debug logging
  console.log('Checkout validation debug:', {
    shiftStart,
    shiftEnd,
    shiftDurationMinutes,
    halfShiftMinutes,
    timezone,
    clockInTimestamp: new Date(clockInTimestamp).toISOString(),
    clockOutTimestamp: new Date(clockOutTimestamp).toISOString(),
    checkoutTimeInTZ: formatTimeInTimezone(clockOutTimestamp, timezone),
    earliestCheckoutMinutes,
    latestCheckoutMinutes,
    checkoutMinutes,
    totalWorkMinutes,
    graceMinutes,
  });

  let isAfterLatest = false;
  if (shiftEndMinutes <= shiftStartMinutes) {
    // Overnight shift: adjust checkout minutes for comparison
    const adjustedCheckout = checkoutMinutes < shiftStartMinutes ? checkoutMinutes + 1440 : checkoutMinutes;
    isAfterLatest = adjustedCheckout > latestCheckoutMinutes;
  } else {
    isAfterLatest = checkoutMinutes > latestCheckoutMinutes;
  }

  if (isAfterLatest) {
    // Format latest checkout time for error message
    const latestHours = Math.floor(latestCheckoutMinutes % 1440 / 60);
    const latestMins = latestCheckoutMinutes % 60;
    const latestTimeStr = `${latestHours.toString().padStart(2, '0')}:${latestMins.toString().padStart(2, '0')}`;

    return {
      canCheckout: false,
      status: AttendanceStatus.NOT_FULL_DAY,
      errorMessage: `Cannot checkout after ${latestTimeStr}. Please contact your administrator.`,
    };
  }

  if (checkoutMinutes < earliestCheckoutMinutes) {
    return {
      canCheckout: true,
      status: AttendanceStatus.NOT_FULL_DAY
    };
  }


  // Half shift requirement with 5 minute grace: (shiftDuration/2) - 5
  const halfShiftWithGrace = halfShiftMinutes - graceMinutes;

  if (totalWorkMinutes >= halfShiftWithGrace) {
    // Worked at least (half shift - 5 min) → HALF_DAY
    return {
      canCheckout: true,
      status: AttendanceStatus.HALF_DAY
    };
  } else {
    // Worked less than (half shift - 5 min) → NOT_FULL_DAY
    return {
      canCheckout: true,
      status: AttendanceStatus.NOT_FULL_DAY
    };
  }
}

/**
 * Calculate attendance status based on clock-in time vs shift start
 */
function calculateStatus(
  clockInTimestamp: number,
  shiftStart?: string,
  timezone: string = "UTC",
  graceMinutes: number = 15
): AttendanceStatus {
  // If no shift start defined, default to PRESENT
  if (!shiftStart) {
    return AttendanceStatus.PRESENT;
  }

  // Parse shift start time (format: "HH:mm")
  const [shiftHour, shiftMinute] = shiftStart.split(":").map(Number);

  // Validate shift time format
  if (
    isNaN(shiftHour) ||
    isNaN(shiftMinute) ||
    shiftHour < 0 ||
    shiftHour > 23 ||
    shiftMinute < 0 ||
    shiftMinute > 59
  ) {
    console.warn(
      `Invalid shift start time: ${shiftStart}, defaulting to PRESENT`
    );
    return AttendanceStatus.PRESENT;
  }

  // Get clock-in time in user's timezone (minutes since midnight)
  const clockInMinutes = timestampToMinutesInTimezone(clockInTimestamp, timezone);

  // Shift start time in minutes since midnight
  const shiftStartMinutes = shiftHour * 60 + shiftMinute;

  // Add grace period
  const lateThreshold = shiftStartMinutes + graceMinutes;

  if (clockInMinutes <= lateThreshold) {
    return AttendanceStatus.PRESENT; // On time or within grace period
  } else {
    return AttendanceStatus.LATE;
  }
}

async function checkIn(input: CheckInInput) {
  const { userId, latitude, longitude, localFilePath } = input;
  const timestamp = Date.now();

  const date = format(timestamp, "yyyy-MM-dd");

  const user = await userCrud.findById(userId);
  if (!user) {
    throw new Error("User not found");
  }

  const status = calculateStatus(
    timestamp,
    user.shiftStart,
    "Asia/Kolkata",
    15
  );



  // Validate geofence BEFORE starting transaction
  if (user.officeLat && user.officeLng) {
    const userLocation: GeoPoint = {
      lat: latitude,
      lng: longitude,
    };

    const officeGeofence: Geofence = {
      center: {
        lat: user.officeLat,
        lng: user.officeLng,
      },
      radius: 100,
    };

    if (!isInsideGeofence(userLocation, officeGeofence)) {
      throw new Error("Outside office geofence");
    }
  }


  // Use transaction for atomic check-in with audit log
  const { executeWithTransaction, createAuditLogEntry } = await import(
    "../utils/transaction"
  );

  const attendance = await executeWithTransaction(async (session) => {
    // Check for existing attendance with session lock (prevents duplicates)
    const existing = await attendanceCrud.findByUserIdAndDate(
      userId,
      date,
      session
    );

    if (existing && existing.clockInTime) {
      throw new Error("Already checked in today");
    }

    // Create or update attendance record
    const attendanceRecord = await attendanceCrud.findOneAndUpdate(
      { userId, date, clockInTime: { $exists: false } },
      {
        $set: {
          clockInTime: timestamp,
          clockInLat: latitude,
          clockInLng: longitude,
          clockInImageUrl: "",
          status: status,
        },
        $setOnInsert: { userId, date },
      },
      {
        new: true,
        upsert: true,
        session,
      }
    );

    // Create audit log for check-in
    await createAuditLogEntry(
      {
        action: "CHECK_IN",
        performedBy: userId,
        targetUser: userId,
        resource: "Attendance",
        resourceId: attendanceRecord._id,
        metadata: {
          location: { latitude, longitude },
          status,
          timestamp,
        },
      },
      session
    );

    return attendanceRecord;
  });

  // Calculate weekly hours (outside transaction - read-only)
  const weekStart = new Date(date);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());

  const weekStartStr = weekStart.toISOString().split("T")[0];
  const weekEndStr = new Date(weekStart.getTime() + 6 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0];

  const weeklyRecords = await attendanceCrud.findMany({
    userId,
    startDate: weekStartStr,
    endDate: weekEndStr,
  });

  const totalHoursThisWeek =
    weeklyRecords.reduce(
      (sum, record) => sum + (record.totalWorkMinutes || 0),
      0
    ) / 60;

  // Dispatch background jobs
  if (attendance && localFilePath) {
    await appQueue.add('UPLOAD_CHECKIN_IMAGE', {
      userId,
      attendanceId: attendance._id.toString(),
      localFilePath,
      date,
    }).catch(err => console.error('Failed to queue image upload job:', err));
  }

  await appQueue.add('SEND_ATTENDANCE_NOTIFICATION', {
    userId,
    type: status === AttendanceStatus.LATE ? 'LATE_ARRIVAL' : 'CHECK_IN',
    data: {
      userName: user.name,
      timestamp,
      status,
    },
  }).catch(err => console.error('Failed to queue notification job:', err));

  return {
    clockInTime: formatTimeTo12Hour(timestamp),
    latitude,
    longitude,
    clockInImageUrl: attendance?.clockInImageUrl,
    status: (attendance?.status === AttendanceStatus.LATE || attendance?.status === AttendanceStatus.HALF_DAY || attendance?.status===AttendanceStatus.NOT_FULL_DAY) ? AttendanceStatus.PRESENT : attendance?.status,
    totalHoursThisWeek: Math.round(totalHoursThisWeek * 100) / 100,
  };
}

async function checkOut(input: CheckOutInput) {
  const { userId, latitude, longitude, localFilePath } = input;
  const timestamp = input.timestamp ?? Date.now();
  const date = format(timestamp, "yyyy-MM-dd");
  console.log("userid", userId)
  const user = await userCrud.findById(userId);
  console.log(user)
  if (!user) {
    throw new Error("User not found");
  }

  const attendance = await attendanceCrud.findByUserIdAndDate(userId, date);
  console.log(attendance)
  if (!attendance) {
    throw new Error(
      "No check-in record found for today. Please check in first."
    );
  }

  if (attendance.clockOutTime) {
    throw new Error("Already checked out today");
  }

  // Geofence validation
  if (user.officeLat && user.officeLng) {
    const userLocation: GeoPoint = {
      lat: latitude,
      lng: longitude,
    };
    const officeGeofence: Geofence = {
      center: {
        lat: user.officeLat,
        lng: user.officeLng,
      },
      radius: 100,
    };

    // Get current hour in user's timezone
    const userTimezone = "Asia/Kolkata";
    const currentHourInUserTZ = new Date(timestamp).toLocaleString('en-US', {
      timeZone: userTimezone,
      hour: 'numeric',
      hour12: false
    });
    const currentHour = parseInt(currentHourInUserTZ);

    if (!isInsideGeofence(userLocation, officeGeofence)) {
      if (currentHour < 18) {
        throw new Error("You are outside the office geofence (100m radius)");
      }
    }
  }

  const clockInTime = attendance.clockInTime || timestamp;
  const totalWorkMinutes = Math.floor((timestamp - clockInTime) / (1000 * 60));
  // Use transaction for atomic checkout with audit log
  const { executeWithTransaction, createAuditLogEntry } = await import(
    "../utils/transaction"
  );

  const result = await executeWithTransaction(async (session) => {
    // Use Asia/Kolkata as default timezone for Indian users
    const userTimezoneForValidation = "Asia/Kolkata";

    // Debug: Log user's shift configuration
    console.log('User shift config:', {
      userId,
      shiftStart: user.shiftStart,
      shiftEnd: user.shiftEnd,
      timezone: userTimezoneForValidation,
      clockInTime: new Date(clockInTime).toISOString(),
      clockOutTime: new Date(timestamp).toISOString(),
      totalWorkMinutes,
    });

    // Validate checkout time window and get status
    const checkoutValidation = validateCheckoutAndGetStatus({
      clockInTimestamp: clockInTime,
      clockOutTimestamp: timestamp,
      shiftStart: user.shiftStart,
      shiftEnd: user.shiftEnd,
      graceMinutes: 5,
      timezone: userTimezoneForValidation,
    });

    console.log('Checkout validation result:', checkoutValidation);

    // Check if checkout is allowed
    if (!checkoutValidation.canCheckout) {
      throw new Error(checkoutValidation.errorMessage || "Checkout not allowed at this time.");
    }

    // Determine final status
    let finalStatus = checkoutValidation.status;

    // Preserve LATE status if user was late at check-in and achieved at least HALF_DAY
    if (attendance.status === AttendanceStatus.LATE &&
      checkoutValidation.status === AttendanceStatus.HALF_DAY) {
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


    // Queue background jobs
    if (updatedAttendance && localFilePath) {
      await appQueue.add('UPLOAD_CHECKOUT_IMAGE', {
        userId,
        attendanceId: updatedAttendance._id.toString(),
        localFilePath,
        date,
      }).catch(err => console.error('Failed to queue checkout image upload job:', err));
    }

    await appQueue.add('SEND_ATTENDANCE_NOTIFICATION', {
      userId,
      type: 'CHECK_OUT',
      data: {
        userName: user.name,
        timestamp,
        status: updatedAttendance?.status,
        totalWorkMinutes,
      },
    }).catch(err => console.error('Failed to queue notification job:', err));

    // Calculate stats
    await appQueue.add('CALCULATE_ATTENDANCE_STATS', {
      userId,
      date,
      type: 'DAILY',
    }).catch(err => console.error('Failed to queue stats calculation job:', err));

    await appQueue.add('CALCULATE_ATTENDANCE_STATS', {
      userId,
      date,
      type: 'WEEKLY',
    }).catch(err => console.error('Failed to queue weekly stats job:', err));

    await appQueue.add('CALCULATE_ATTENDANCE_STATS', {
      userId,
      date,
      type: 'MONTHLY',
    }).catch(err => console.error('Failed to queue monthly stats job:', err));


    // Create audit log for checkout
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
      status: (updatedAttendance?.status === AttendanceStatus.LATE || updatedAttendance?.status === AttendanceStatus.HALF_DAY || updatedAttendance?.status===AttendanceStatus.NOT_FULL_DAY) ? AttendanceStatus.PRESENT : updatedAttendance?.status,
    };
  });
  return result;

}



async function getWeeklyAttendance(params: {
  userId: string;
  weekStart?: string;
}) {
  const { userId, weekStart } = params;

  const now = new Date();
  const todayStr = format(now, "yyyy-MM-dd");

  // ✅ Determine End Date (Capped at Today)
  let weekLast = getLastDateOfWeek(weekStart);
  if (weekLast > now) {
    weekLast = now;
  }

  // ✅ Determine Start Date (Rolling 7-day window: End - 6 days)
  const weekStartDate = subDays(weekLast, 6);
  weekStartDate.setHours(0, 0, 0, 0);

  const weekStartStr = format(weekStartDate, "yyyy-MM-dd");
  const weekEndStr = format(weekLast, "yyyy-MM-dd");

  // 🔹 Fetch weekly records
  const records = await attendanceCrud.findMany({
    userId,
    startDate: weekStartStr,
    endDate: weekEndStr,
  });

  // 🔹 Index by date
  const recordsByDate = new Map<string, any>();
  records.forEach((r) => recordsByDate.set(r.date, r));

  const daysInRange = eachDayOfInterval({
    start: weekStartDate,
    end: weekLast,
  });

  const dailyLogs: any[] = [];
  let totalMinutes = 0;
  const clockInMinutesArray: number[] = [];

  // ✅ WEEKLY COUNTS
  let presentDays = 0;
  let lateDays = 0;
  let halfDays = 0;
  let absentDays = 0;
  let notFullDays = 0;

  for (const day of daysInRange) {
    const dateStr = format(day, "yyyy-MM-dd");
    const dayOfWeek = format(day, "EEEE");
    const record = recordsByDate.get(dateStr);

    if (record) {
      let displayMinutes = record.totalWorkMinutes || 0;

      const isLiveToday =
        record.clockInTime &&
        !record.clockOutTime &&
        dateStr === todayStr;

      // 🟡 Live clock-in → display only
      if (isLiveToday) {
        displayMinutes = Math.max(
          Math.floor((now.getTime() - record.clockInTime) / 60000),
          0
        );
      } else {
        // ✅ Finalized day → count minutes
        totalMinutes += record.totalWorkMinutes || 0;
      }

      // ✅ Count days by status (BOTH LIVE AND FINALIZED)
      switch (record.status) {
        case AttendanceStatus.PRESENT:
          presentDays++;
          break;
        case AttendanceStatus.LATE:
          presentDays++;
          lateDays++;
          break;
        case AttendanceStatus.HALF_DAY:
          presentDays++;
          halfDays++;
          break;
        case AttendanceStatus.NOT_FULL_DAY:
          presentDays++;
          notFullDays++;
          break;
        case AttendanceStatus.ABSENT:
          absentDays++;
          break;
      }

      // Average clock-in (finalized only)
      if (record.clockInTime && record.clockOutTime) {
        const d = new Date(record.clockInTime);
        clockInMinutesArray.push(d.getHours() * 60 + d.getMinutes());
      }

      dailyLogs.push({
        date: dateStr,
        dayOfWeek,
        clockInTime: record.clockInTime ? formatTimeTo12Hour(record.clockInTime) : null,
        clockInImageUrl: record.clockInImageUrl || null,
        clockOutTime: record.clockOutTime ? formatTimeTo12Hour(record.clockOutTime) : null,
        clockOutImageUrl: record.clockOutImageUrl || null,
        totalWorkMinutes: displayMinutes,
        status: (
          record.status === AttendanceStatus.LATE ||
          record.status === AttendanceStatus.HALF_DAY ||
          record.status === AttendanceStatus.NOT_FULL_DAY
        ) ? AttendanceStatus.PRESENT : record.status,
      });
    } else {
      // ABSENT - don't count today as absent if no record yet
      if (dateStr !== todayStr) {
        absentDays++;
      }
      dailyLogs.push({
        date: dateStr,
        dayOfWeek,
        clockInTime: null,
        clockInImageUrl: null,
        clockOutTime: null,
        clockOutImageUrl: null,
        totalWorkMinutes: 0,
        status: AttendanceStatus.ABSENT,
      });
    }
  }

  const totalHoursThisWeek = Math.round((totalMinutes / 60) * 100) / 100;

  let averageClockInTime = "N/A";
  if (clockInMinutesArray.length > 0) {
    const avgMinutes =
      clockInMinutesArray.reduce((s, m) => s + m, 0) /
      clockInMinutesArray.length;

    const hours = Math.floor(avgMinutes / 60);
    const minutes = Math.floor(avgMinutes % 60);

    averageClockInTime = `${hours.toString().padStart(2, "0")}:${minutes
      .toString()
      .padStart(2, "0")}`;
  }

  const weekRange = `${format(weekStartDate, "dd MMM")} - ${format(weekLast, "dd MMM")}`;

  return {
    weekRange,
    totalHoursThisWeek,
    averageClockInTime,
    counts: {
      presentDays,
      lateDays,
      halfDays,
      absentDays,
      notFullDays,
    },
    dailyLogs,
  };
}


async function getAttendanceByDate({
  userId,
  date,
}: {
  userId: string;
  date: string;
}) {
  const attendance = await attendanceCrud.findByUserIdAndDate(
    userId,
    date
  );

  if (!attendance) return null;

  return {
    date: attendance.date,
    clockInTime: attendance.clockInTime ? formatTimeTo12Hour(attendance.clockInTime) : null,
    clockOutTime: attendance.clockOutTime ? formatTimeTo12Hour(attendance.clockOutTime) : null,
    clockInImageUrl: attendance.clockInImageUrl ?? null,
    clockOutImageUrl: attendance.clockOutImageUrl ?? null,
    status: attendance.status,
    totalWorkMinutes: attendance.totalWorkMinutes ?? 0,
  };
}


async function getTodayAttendance(userId: string) {
  const today = format(new Date(), "yyyy-MM-dd");

  const attendance = await attendanceCrud.findByUserIdAndDate(userId, today);

  let totalWorkMinutes = attendance?.totalWorkMinutes || 0;

  if (attendance?.clockInTime && !attendance?.clockOutTime) {
    const clockIn = new Date(attendance.clockInTime);
    const diffMs = Date.now() - clockIn.getTime();
    totalWorkMinutes = Math.max(Math.floor(diffMs / 60000), 0);
  }

  return {
    date: today,
    clockedIn: !!attendance?.clockInTime,
    clockedOut: !!attendance?.clockOutTime,
    clockInTime: attendance?.clockInTime ? formatTimeTo12Hour(attendance.clockInTime) : null,
    clockInImageUrl: attendance?.clockInImageUrl || null,
    clockOutTime: attendance?.clockOutTime ? formatTimeTo12Hour(attendance.clockOutTime) : null,
    clockOutImageUrl: attendance?.clockOutImageUrl || null,
    status: (attendance?.status === AttendanceStatus.LATE || attendance?.status === AttendanceStatus.HALF_DAY || attendance?.status===AttendanceStatus.NOT_FULL_DAY) ? AttendanceStatus.PRESENT : (attendance?.status || AttendanceStatus.ABSENT),
    totalWorkMinutes,
  };
}

async function autoCheckoutByGeofence(
  userId: string,
  latitude: number,
  longitude: number
) {
  const timestamp = Date.now();
  const date = format(timestamp, "yyyy-MM-dd");
  const currentHour = new Date(timestamp).getHours();
  if (currentHour < 18) {
    throw new Error("Auto-checkout only available after 6 PM");
  }

  const user = await userCrud.findById(userId);
  if (!user) {
    throw new Error("User not found");
  }

  // Validate geofence BEFORE transaction
  if (user.officeLat && user.officeLng) {
    const userLocation: GeoPoint = {
      lat: latitude,
      lng: longitude,
    };

    const officeGeofence: Geofence = {
      center: {
        lat: user.officeLat,
        lng: user.officeLng,
      },
      radius: 100,
    };

    if (isInsideGeofence(userLocation, officeGeofence)) {
      throw new Error(
        "User is still within office geofence. Cannot auto-checkout."
      );
    }
  }

  // Use transaction for atomic auto-checkout with audit log
  const { executeWithTransaction, createAuditLogEntry } = await import(
    "../utils/transaction"
  );

  const result = await executeWithTransaction(async (session) => {
    const attendance = await attendanceCrud.findByUserIdAndDate(
      userId,
      date,
      session
    );

    if (!attendance) {
      throw new Error("No check-in record found for today");
    }

    if (attendance.clockOutTime) {
      throw new Error("User already checked out");
    }

    const clockInTime = attendance.clockInTime || timestamp;
    const totalWorkMinutes = Math.floor((timestamp - clockInTime) / (1000 * 60));

    // Use the validation function for status determination
    const checkoutValidation = validateCheckoutAndGetStatus({
      clockInTimestamp: clockInTime,
      clockOutTimestamp: timestamp,
      shiftStart: user.shiftStart,
      shiftEnd: user.shiftEnd,
    });

    // For auto-checkout, we use the status from validation but don't block on time window
    let status = checkoutValidation.status;

    const updatedAttendance = await attendanceCrud.updateById(
      attendance._id.toString(),
      {
        clockOutTime: timestamp,
        clockOutLat: latitude,
        clockOutLng: longitude,
        totalWorkMinutes,
        status,
      },
      session
    );

    // Create audit log for auto-checkout
    await createAuditLogEntry(
      {
        action: "AUTO_CHECK_OUT",
        performedBy: userId,
        targetUser: userId,
        resource: "Attendance",
        resourceId: attendance._id,
        metadata: {
          location: { latitude, longitude },
          totalWorkMinutes,
          status,
          timestamp,
          reason: "geofence",
        },
      },
      session
    );

    return {
      clockOutTime: timestamp,
      latitude,
      longitude,
      totalWorkMinutes,
      status: updatedAttendance?.status,
    };
  });

  return result;
}

async function getMonthlyAttendance(params: {
  userId: string;
  month?: number;
  year?: number;
}) {
  const { userId, month, year } = params;

  const now = new Date();
  const todayStr = format(now, "yyyy-MM-dd");

  const targetYear = year ?? now.getFullYear();
  const targetMonth = month ? month - 1 : now.getMonth();

  const referenceDate = new Date(targetYear, targetMonth, 1);
  const monthStartDate = startOfMonth(referenceDate);
  const monthStartStr = format(monthStartDate, "yyyy-MM-dd");

  const monthEndDate = endOfMonth(referenceDate);
  const monthEndStr = format(monthEndDate, "yyyy-MM-dd");

  // Fetch all attendance records for the month
  const monthlyRecords = await attendanceCrud.findMany({
    userId,
    startDate: monthStartStr,
    endDate: monthEndStr,
  });

  // Index records by date for O(1) lookup
  const recordsByDate = new Map<string, IAttendance>();
  monthlyRecords.forEach((r) => recordsByDate.set(r.date, r));

  // Get all days in the month up to today (if current month)
  const isCurrentMonth = targetYear === now.getFullYear() && targetMonth === now.getMonth();
  const rangeEnd = isCurrentMonth ? now : monthEndDate;

  const allDays = eachDayOfInterval({
    start: monthStartDate,
    end: rangeEnd,
  });

  const dailyLogs: any[] = [];
  let totalMinutes = 0;
  const clockInMinutesArray: number[] = [];

  let presentDays = 0;
  let lateDays = 0;
  let halfDays = 0;
  let notFullDays = 0;
  let absentDays = 0;

  for (const day of allDays) {
    const dateStr = format(day, "yyyy-MM-dd");
    const dayOfWeek = format(day, "EEEE");
    const record = recordsByDate.get(dateStr);

    if (record) {
      const isLiveToday =
        record.clockInTime &&
        !record.clockOutTime &&
        dateStr === todayStr;

      let effectiveWorkMinutes = record.totalWorkMinutes || 0;

      if (isLiveToday) {
        // Live clock-in → show elapsed time but don't add to total
        effectiveWorkMinutes = Math.max(
          Math.floor((now.getTime() - record.clockInTime) / 60000),
          0
        );
      } else {
        // Finalized → add to total
        totalMinutes += record.totalWorkMinutes || 0;
      }

      // Count by status
      switch (record.status) {
        case AttendanceStatus.PRESENT:
          presentDays++;
          break;
        case AttendanceStatus.LATE:
          presentDays++;
          lateDays++;
          break;
        case AttendanceStatus.HALF_DAY:
          presentDays++;
          halfDays++;
          break;
        case AttendanceStatus.NOT_FULL_DAY:
          presentDays++;
          notFullDays++;
          break;
        case AttendanceStatus.ABSENT:
          absentDays++;
          break;
      }

      // Average clock-in (finalized only)
      if (record.clockInTime && record.clockOutTime) {
        const d = new Date(record.clockInTime);
        clockInMinutesArray.push(d.getHours() * 60 + d.getMinutes());
      }

      dailyLogs.push({
        date: dateStr,
        dayOfWeek,
        clockInTime: record.clockInTime ? formatTimeTo12Hour(record.clockInTime) : null,
        clockInImageUrl: record.clockInImageUrl || null,
        clockOutTime: record.clockOutTime ? formatTimeTo12Hour(record.clockOutTime) : null,
        clockOutImageUrl: record.clockOutImageUrl || null,
        totalWorkMinutes: effectiveWorkMinutes,
        status: (
          record.status === AttendanceStatus.LATE ||
          record.status === AttendanceStatus.HALF_DAY ||
          record.status === AttendanceStatus.NOT_FULL_DAY
        ) ? AttendanceStatus.PRESENT : record.status,
      });
    } else {
      // No record → ABSENT (but don't count today as absent)
      if (dateStr !== todayStr) {
        absentDays++;
      }

      dailyLogs.push({
        date: dateStr,
        dayOfWeek,
        clockInTime: null,
        clockInImageUrl: null,
        clockOutTime: null,
        clockOutImageUrl: null,
        totalWorkMinutes: 0,
        status: dateStr === todayStr ? AttendanceStatus.ABSENT : AttendanceStatus.ABSENT,
      });
    }
  }

  const totalHoursThisMonth = Math.round((totalMinutes / 60) * 100) / 100;

  let averageClockInTime = "N/A";
  if (clockInMinutesArray.length > 0) {
    const avgMinutes =
      clockInMinutesArray.reduce((s, m) => s + m, 0) / clockInMinutesArray.length;

    const hours = Math.floor(avgMinutes / 60);
    const minutes = Math.floor(avgMinutes % 60);

    averageClockInTime = `${hours.toString().padStart(2, "0")}:${minutes
      .toString()
      .padStart(2, "0")}`;
  }

  const monthLabel = format(monthStartDate, "MMMM yyyy");

  return {
    month: monthLabel,
    startDate: monthStartStr,
    endDate: monthEndStr,
    totalHoursThisMonth,
    averageClockInTime,
    totalWorkingDays: allDays.length,
    presentDays,
    absentDays,
    lateDays,
    halfDays,
    notFullDays,
    dailyLogs,
  };
}

async function autoCheckout() {
  const today = format(new Date(), "yyyy-MM-dd");
  const currentHour = new Date().getHours();

  if (currentHour < 18) {
    console.log("[AutoCheckout] Skipping - before 6 PM");
    return { processed: 0 };
  }

  const openAttendances = await attendanceCrud.findOpenAttendances(today);

  if (openAttendances.length === 0) {
    return { processed: 0 };
  }

  const clockOutTime = Date.now();
  const updates = openAttendances.map(async (attendance) => {
    const totalWorkMinutes = Math.floor(
      (clockOutTime - (attendance.clockInTime || clockOutTime)) / (1000 * 60)
    );

    // Get user shift information for half-day calculation
    // userId is populated by findOpenAttendances
    let shiftStart: string | undefined;
    let shiftEnd: string | undefined;

    // Type assertion for populated userId
    const populatedUserId = attendance.userId as any;
    if (populatedUserId && typeof populatedUserId === 'object' && 'shiftStart' in populatedUserId) {
      shiftStart = populatedUserId.shiftStart;
      shiftEnd = populatedUserId.shiftEnd;
    } else {
      // Fallback: fetch user if not populated
      const userId = attendance.userId.toString();
      const user = await userCrud.findById(userId);
      if (user) {
        shiftStart = user.shiftStart;
        shiftEnd = user.shiftEnd;
      }
    }

    // Use the new validation function for status determination
    // Auto-checkout bypasses time window restrictions but uses the status logic
    const checkoutValidation = validateCheckoutAndGetStatus({
      clockInTimestamp: attendance.clockInTime || clockOutTime,
      clockOutTimestamp: clockOutTime,
      shiftStart,
      shiftEnd,
    });

    return attendanceCrud.updateById(attendance._id.toString(), {
      clockOutTime,
      totalWorkMinutes,
      status: checkoutValidation.status,
      isAutoCheckOut: true,
    });
  });

  await Promise.all(updates);

  console.log(`[AutoCheckout] Processed ${updates.length} auto-checkouts`);
  return { processed: updates.length };
}



async function getUsersForAttendanceView(params: {
  requesterId: string;
  role: string;
  page?: number;
  limit?: number;
}) {
  const { requesterId, role, page = 1, limit = 10 } = params;

  if (role !== UserRole.ADMIN && role !== UserRole.SENIOR) {
    return {
      success: false,
      message: "Unauthorized: Only Admins and Seniors can view attendance lists",
    };
  }

  // Build filter based on role
  const filter: any = {};
  if (role === UserRole.SENIOR) {
    const requester = await userCrud.findById(requesterId);
    if (!requester || !requester.teamId) {
      return {
        success: false,
        message: "Senior team assignment not found",
      };
    }
    filter.teamId = requester.teamId;
    filter.role = { $ne: UserRole.ADMIN };
  }

  const total = await userCrud.count(filter);
  const totalPages = Math.ceil(total / limit);

  const users = await userCrud.findManyPaginated(filter, { page, limit });

  const now = new Date();
  const weekStart = startOfWeek(now, { weekStartsOn: 0 });
  const weekStartStr = format(weekStart, "yyyy-MM-dd");
  const weekEndStr = format(now, "yyyy-MM-dd"); // Up to today

  const usersWithAttendance = await Promise.all(
    users.map(async (user) => {
      const [today, weeklyRecords] = await Promise.all([
        getTodayAttendance(user._id.toString()),
        attendanceCrud.findMany({
          userId: user._id.toString(),
          startDate: weekStartStr,
          endDate: weekEndStr,
        }),
      ]);

      // Calculate weekly total minutes
      const weeklyMinutes = weeklyRecords.reduce((sum, record) => {
        let minutes = record.totalWorkMinutes || 0;

        // If it's today and they are still clocked in, use the live minutes
        if (record.date === today.date && record.clockInTime && !record.clockOutTime) {
          minutes = today.totalWorkMinutes;
        }

        return sum + minutes;
      }, 0);

      const weeklyTotalHours = Math.round((weeklyMinutes / 60) * 100) / 100;

      return {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        today,
        weeklyTotal: weeklyTotalHours,
      };
    })
  );

  return {
    success: true,
    data: {
      users: usersWithAttendance,
      pagination: {
        total,
        page,
        limit,
        totalPages,
      },
    },
  };
}


async function getAttendanceLogs(params: {
  userId: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
}) {
  const { userId, startDate, endDate, page = 1, limit = 10 } = params;

  const filter: any = {
    userId,
  };

  if (startDate || endDate) {
    filter.date = {};
    if (startDate) filter.date.$gte = startDate;
    if (endDate) filter.date.$lte = endDate;
  }

  const total = await attendanceCrud.count(filter);

  const records = await attendanceCrud.findManyPaginated(filter, {
    page,
    limit,
  });
  console.log(records)

  const totalPages = Math.ceil(total / limit);
  const now = new Date();

  const logs = records.map((record) => {
    let effectiveWorkMinutes = record.totalWorkMinutes || 0;

    if (record.clockInTime && !record.clockOutTime) {
      effectiveWorkMinutes = Math.max(
        Math.floor((now.getTime() - record.clockInTime) / 60000),
        0
      );
    }

    return {
      date: record.date,
      dayOfWeek: format(new Date(record.date), "EEEE"),
      clockInTime: record.clockInTime || null,
      clockInImageUrl: record.clockInImageUrl || null,
      clockOutTime: record.clockOutTime || null,
      totalWorkMinutes: effectiveWorkMinutes,
      status: record.status,
    };
  });

  return {
    logs,
    pagination: {
      total,
      page,
      limit,
      totalPages,
    },
  };
}


async function getUserAttendanceForSenior(params: {
  requester: {
    userId: string;
    role: string;
  };
  targetUserId: string;
  weekStart?: string;
  month?: number;
  year?: number;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
}) {
  const {
    requester,
    targetUserId,
    weekStart,
    month,
    year,
    startDate,
    endDate,
    page,
    limit,
  } = params;
  if (requester.role == "JUNIOR") {
    return {
      success: false,
      message: "Juniors can't check attendance of others"
    }
  }
  const user = await userCrud.findById(targetUserId);
  if (!user) {
    throw new Error("User not found");
  }

  const [today, weekly, monthly] = await Promise.all([
    getTodayAttendance(targetUserId),
    getWeeklyAttendance({
      userId: targetUserId,
      weekStart,
    }),
    getMonthlyAttendance({
      userId: targetUserId,
      month,
      year,
    }),
  ]);


  let customRange = null;
  if (startDate || endDate || page || limit) {
    customRange = await getAttendanceLogs({
      userId: targetUserId,
      startDate,
      endDate,
      page,
      limit,
    });
  }

  return {
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      shiftStart: user.shiftStart,
    },
    attendance: {
      today,
      weekly,
      monthly,
      customRange,
    },
  };
}



/**
 * Midnight auto-checkout: closes ALL open attendance records.
 * Sets clockOutTime to 23:59:59 of check-in day so the record
 * stays on the correct date. No time restriction (unlike autoCheckout).
 */
async function midnightAutoCheckout() {
  const openAttendances = await attendanceCrud.findAllOpenAttendances();

  if (openAttendances.length === 0) {
    console.log("[MidnightAutoCheckout] No open attendances found");
    return { processed: 0 };
  }

  const updates = openAttendances.map(async (attendance) => {
    // Set checkout to 23:59:59 of the check-in date
    const checkInDate = attendance.date; // "yyyy-MM-dd"
    const endOfDay = new Date(`${checkInDate}T23:59:59`).getTime();
    const clockOutTime = endOfDay;

    const totalWorkMinutes = Math.floor(
      (clockOutTime - (attendance.clockInTime || clockOutTime)) / (1000 * 60)
    );

    // Get user shift information
    let shiftStart: string | undefined;
    let shiftEnd: string | undefined;

    const populatedUserId = attendance.userId as any;
    if (populatedUserId && typeof populatedUserId === 'object' && 'shiftStart' in populatedUserId) {
      shiftStart = populatedUserId.shiftStart;
      shiftEnd = populatedUserId.shiftEnd;
    } else {
      const userId = attendance.userId.toString();
      const user = await userCrud.findById(userId);
      if (user) {
        shiftStart = user.shiftStart;
        shiftEnd = user.shiftEnd;
      }
    }

    const checkoutValidation = validateCheckoutAndGetStatus({
      clockInTimestamp: attendance.clockInTime || clockOutTime,
      clockOutTimestamp: clockOutTime,
      shiftStart,
      shiftEnd,
    });

    return attendanceCrud.updateById(attendance._id.toString(), {
      clockOutTime,
      totalWorkMinutes,
      status: checkoutValidation.status,
      isAutoCheckOut: true,
    });
  });

  await Promise.all(updates);

  console.log(`[MidnightAutoCheckout] Processed ${updates.length} auto-checkouts`);
  return { processed: updates.length };
}

const attendanceService = {
  checkIn,
  checkOut,
  getWeeklyAttendance,
  getTodayAttendance,
  autoCheckout,
  midnightAutoCheckout,
  autoCheckoutByGeofence,
  getMonthlyAttendance,
  getAttendanceByDate,
  getUserAttendanceForSenior,
  getUsersForAttendanceView,
  getAttendanceLogs
};

export default attendanceService;