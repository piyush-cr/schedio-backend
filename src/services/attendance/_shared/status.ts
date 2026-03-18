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
  timezone: string = "UTC",
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
  const lateThreshold = shiftStartMinutes + graceMinutes;

  if (clockInMinutes <= lateThreshold) {
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
    return totalWorkMinutes >= 240
      ? { canCheckout: true, status: AttendanceStatus.HALF_DAY }
      : { canCheckout: true, status: AttendanceStatus.NOT_FULL_DAY };
  }

  const shiftStartMinutes = timeStringToMinutes(shiftStart);
  const shiftEndMinutes = timeStringToMinutes(shiftEnd);

  if (isNaN(shiftStartMinutes) || isNaN(shiftEndMinutes)) {
    const totalWorkMinutes = Math.floor(
      (clockOutTimestamp - clockInTimestamp) / 60000
    );
    return totalWorkMinutes >= 240
      ? { canCheckout: true, status: AttendanceStatus.HALF_DAY }
      : { canCheckout: true, status: AttendanceStatus.NOT_FULL_DAY };
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
    const latestHours = Math.floor((latestCheckoutMinutes % 1440) / 60);
    const latestMins = latestCheckoutMinutes % 60;
    const latestTimeStr = `${latestHours
      .toString()
      .padStart(2, "0")}:${latestMins.toString().padStart(2, "0")}`;

    return {
      canCheckout: false,
      status: AttendanceStatus.NOT_FULL_DAY,
      errorMessage: `Cannot checkout after ${latestTimeStr}. Please contact your administrator.`,
    };
  }

  if (checkoutMinutes < earliestCheckoutMinutes) {
    return {
      canCheckout: true,
      status: AttendanceStatus.NOT_FULL_DAY,
    };
  }

  const halfShiftWithGrace = halfShiftMinutes - graceMinutes;

  if (totalWorkMinutes >= halfShiftWithGrace) {
    return {
      canCheckout: true,
      status: AttendanceStatus.HALF_DAY,
    };
  } else {
    return {
      canCheckout: true,
      status: AttendanceStatus.NOT_FULL_DAY,
    };
  }
}
