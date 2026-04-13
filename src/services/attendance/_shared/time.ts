import { format } from "date-fns";

/**
 * Get hours and minutes from a timestamp in a specific timezone
 */
export function getTimeInTimezone(
  timestamp: number,
  timezone: string
): { hours: number; minutes: number } {
  const date = new Date(timestamp);
  const timeStr = date.toLocaleString("en-US", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const [hours, minutes] = timeStr.split(":").map(Number);
  return { hours, minutes };
}

/**
 * Format a timestamp to HH:mm format in a specific timezone
 */
export function formatTimeInTimezone(
  timestamp: number,
  timezone: string
): string {
  const date = new Date(timestamp);
  const formatted = date.toLocaleString("en-US", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return formatted;
}

/**
 * Convert a time string (HH:mm) to minutes since midnight
 */
export function timeStringToMinutes(timeStr: string): number {
  const [hours, minutes] = timeStr.split(":").map(Number);
  return hours * 60 + minutes;
}

/**
 * Convert a timestamp to minutes since midnight in a specific timezone
 */
export function timestampToMinutesInTimezone(
  timestamp: number,
  timezone: string
): number {
  const { hours, minutes } = getTimeInTimezone(timestamp, timezone);
  return hours * 60 + minutes;
}

/**
 * Format a timestamp to 12-hour format (h:mm AM/PM)
 */
export function formatTimeTo12Hour(
  timestamp: number,
  timezone: string = "Asia/Kolkata"
): string {
  const date = new Date(timestamp);
  return date.toLocaleString("en-US", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

/**
 * Get date string in yyyy-MM-dd format from a timestamp
 */
export function formatDate(timestamp: number): string {
  return format(timestamp, "yyyy-MM-dd");
}
