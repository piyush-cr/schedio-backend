import { checkIn } from "./commands/checkIn";
import { checkOut } from "./commands/checkOut";
import { getWeeklyAttendance } from "./reports/getWeeklyAttendance";
import { getTodayAttendance } from "./queries/getTodayAttendance";
import { autoCheckout } from "./commands/autoCheckout";
import { midnightAutoCheckout } from "./commands/midnightAutoCheckout";
import { autoCheckoutByGeofence } from "./commands/autoCheckoutByGeofence";
import { clearGeofenceBreach } from "./commands/autoCheckoutByGeofence";
import { getMonthlyAttendance } from "./reports/getMonthlyAttendance";
import { getAttendanceByDate } from "./queries/getAttendanceByDate";
import { getUserAttendanceForSenior } from "./admin/getUserAttendanceForSenior";
import { getUsersForAttendanceView } from "./admin/getUsersForAttendanceView";
import { getAttendanceLogs } from "./queries/getAttendanceLogs";
import { heartbeat } from "./commands/heartbeat";

const attendanceService = {
  checkIn,
  checkOut,
  getWeeklyAttendance,
  getTodayAttendance,
  autoCheckout,
  midnightAutoCheckout,
  autoCheckoutByGeofence,
  clearGeofenceBreach,
  getMonthlyAttendance,
  getAttendanceByDate,
  getUserAttendanceForSenior,
  getUsersForAttendanceView,
  getAttendanceLogs,
  heartbeat,
};

export default attendanceService;

export {
  checkIn,
  checkOut,
  getWeeklyAttendance,
  getTodayAttendance,
  autoCheckout,
  midnightAutoCheckout,
  autoCheckoutByGeofence,
  clearGeofenceBreach,
  getMonthlyAttendance,
  getAttendanceByDate,
  getUserAttendanceForSenior,
  getUsersForAttendanceView,
  getAttendanceLogs,
  heartbeat,
};
