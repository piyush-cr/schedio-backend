import { AttendanceStatus } from "../../../types";
import {
  timeStringToMinutes,
  timestampToMinutesInTimezone,
  formatTimeInTimezone,
} from "./time";

/**
 * Calculate shift duration in minutes from shift start and end times (HH:mm format)
 */
export function calculateShiftDuration(
  shiftStart?: string,
  shiftEnd?: string
): number | null {
  if (!shiftStart || !shiftEnd) {
    return null;
  }

  const [startHour, startMinute] = shiftStart.split(":").map(Number);
  const [endHour, endMinute] = shiftEnd.split(":").map(Number);

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

  const startMinutes = startHour * 60 + startMinute;
  const endMinutes = endHour * 60 + endMinute;

  let duration = endMinutes - startMinutes;
  if (duration < 0) {
    duration += 24 * 60;
  }

  return duration;
}

/**
 * Calculate attendance status (PRESENT/LATE) based on clock-in time and shift start
 */
export function calculateStatus(
  clockInTimestamp: number,
  shiftStart?: string,
  shiftEnd?: string,
  timezone: string = "Asia/Kolkata",
  graceMinutes: number = 15
): AttendanceStatus {
  if (!shiftStart) {
    return AttendanceStatus.PRESENT;
  }

  const [shiftHour, shiftMinute] = shiftStart.split(":").map(Number);

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

  const clockInMinutes = timestampToMinutesInTimezone(
    clockInTimestamp,
    timezone
  );
  const shiftStartMinutes = shiftHour * 60 + shiftMinute;
  
  const duration = calculateShiftDuration(shiftStart, shiftEnd);
  
  let effectiveClockIn = clockInMinutes;
  // If shift crosses midnight (e.g., 22:00 to 06:00) and clock-in is in early morning
  // we add 1440 to clock-in minutes for accurate comparison with shiftStart
  if (shiftStartMinutes + (duration || 480) > 1440 && clockInMinutes < shiftStartMinutes - 240) {
      effectiveClockIn += 1440;
  }

  const lateThreshold = graceMinutes;
  const halfDayThreshold = 120; // 2 hours after shift start

  const clockInDelay = effectiveClockIn - shiftStartMinutes;

  // Flow: PRESENT -> LATE -> HALF_DAY
  
  // 1. Check for HALF_DAY: User clocked in after 2 hours (120 mins)
  if (clockInDelay > halfDayThreshold) {
      return AttendanceStatus.HALF_DAY;
  }

  // 2. Check for LATE vs PRESENT (15-20 min grace)
  if (clockInDelay <= lateThreshold) {
    return AttendanceStatus.PRESENT;
  } else {
    return AttendanceStatus.LATE;
  }
}

export interface CheckoutValidationResult {
  canCheckout: boolean;
  status: AttendanceStatus;
  errorMessage?: string;
}

/**
 * Validate checkout time window and determine status
 */
export function validateCheckoutAndGetStatus(params: {
  clockInTimestamp: number;
  clockOutTimestamp: number;
  shiftStart?: string;
  shiftEnd?: string;
  graceMinutes?: number;
  timezone?: string;
}): CheckoutValidationResult {
  const {
    clockInTimestamp,
    clockOutTimestamp,
    shiftStart,
    shiftEnd,
    graceMinutes = 5,
    timezone = "Asia/Kolkata",
  } = params;

  const shiftDurationMinutes = calculateShiftDuration(shiftStart, shiftEnd);

  if (shiftDurationMinutes === null || !shiftStart || !shiftEnd) {
    const totalWorkMinutes = Math.floor(
      (clockOutTimestamp - clockInTimestamp) / 60000
    );
    return { 
      canCheckout: true, 
      status: totalWorkMinutes >= 240 ? AttendanceStatus.HALF_DAY : AttendanceStatus.LATE 
    };
  }

  const shiftStartMinutes = timeStringToMinutes(shiftStart);
  const shiftEndMinutes = timeStringToMinutes(shiftEnd);

  if (isNaN(shiftStartMinutes) || isNaN(shiftEndMinutes)) {
    const totalWorkMinutes = Math.floor(
      (clockOutTimestamp - clockInTimestamp) / 60000
    );
    return { 
      canCheckout: true, 
      status: totalWorkMinutes >= 240 ? AttendanceStatus.HALF_DAY : AttendanceStatus.LATE 
    };
  }

  const halfShiftMinutes = shiftDurationMinutes / 2;
  const earliestCheckoutMinutes = shiftStartMinutes + halfShiftMinutes - graceMinutes;

  let latestCheckoutMinutes = shiftEndMinutes - 120 - graceMinutes;

  if (shiftEndMinutes <= shiftStartMinutes) {
    latestCheckoutMinutes = shiftEndMinutes + 1440 - 120 - graceMinutes;
  }

  const checkoutMinutes = timestampToMinutesInTimezone(
    clockOutTimestamp,
    timezone
  );
  const totalWorkMinutes = Math.floor(
    (clockOutTimestamp - clockInTimestamp) / 60000
  );

  console.log("Checkout validation debug:", {
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
    const adjustedCheckout =
      checkoutMinutes < shiftStartMinutes
        ? checkoutMinutes + 1440
        : checkoutMinutes;
    isAfterLatest = adjustedCheckout > latestCheckoutMinutes;
  } else {
    isAfterLatest = checkoutMinutes > latestCheckoutMinutes;
  }

  if (isAfterLatest) {
    return {
      canCheckout: true,
      status: AttendanceStatus.HALF_DAY,
    };
  }

  if (checkoutMinutes < earliestCheckoutMinutes) {
    return {
      canCheckout: true,
      status: AttendanceStatus.LATE,
    };
  }

  const halfShiftWithGrace = halfShiftMinutes - graceMinutes;
  const fullShiftThreshold = (shiftDurationMinutes * 0.9) - graceMinutes;

  if (totalWorkMinutes >= fullShiftThreshold) {
      return {
          canCheckout: true,
          status: AttendanceStatus.PRESENT, // Sufficient for full day
      };
  } else if (totalWorkMinutes >= halfShiftWithGrace) {
    return {
      canCheckout: true,
      status: AttendanceStatus.HALF_DAY,
    };
  } else {
    return {
      canCheckout: true,
      status: AttendanceStatus.LATE,
    };
  }
}
