import userCrud from "../../../crud/user.crud";
import attendanceCrud from "../../../crud/attendance.crud";
import { sendNotification } from "../../../firebase/messaging";
import { format } from "date-fns";

export async function checkShiftReminders(): Promise<{ processed: number }> {
    console.log("[ShiftReminders] Starting check...");
    let processed = 0;
    try {
        const users = await userCrud.findMany({});
        const today = format(new Date(), "yyyy-MM-dd");

        // Convert "HH:mm" to minutes since midnight
        const timeToMinutes = (timeStr: string) => {
            const [hours, minutes] = timeStr.split(':').map(Number);
            return hours * 60 + minutes;
        };

        const now = new Date();
        const currentMinutes = now.getHours() * 60 + now.getMinutes();

        for (const user of users) {
             if (!user.shiftStart || !user.shiftEnd) continue;

             const shiftStartMins = timeToMinutes(user.shiftStart);
             const shiftEndMins = timeToMinutes(user.shiftEnd);
             const geofenceBreachTime = user.geofenceBreachTime ?? 15; // Default 15 minutes

             // Find today's attendance for user
             const attendance = await attendanceCrud.findByUserIdAndDate(user._id.toString(), today);

             // If shift has started (or within 15 mins of starting) and no check in
             if (!attendance || !attendance.clockInTime) {
                 if (currentMinutes >= shiftStartMins && currentMinutes <= shiftStartMins + 15) {
                     // Need to check in
                     if (user.fcmToken) {
                         await sendNotification({
                             token: user.fcmToken,
                             title: "Check-in Reminder",
                             body: "Your shift has started! Don't forget to check in.",
                             data: { type: "REMINDER_CHECK_IN" }
                         });
                         processed++;
                     }
                 }
             }

             // If shift has ended and was clocked in, but no clock out
             if (attendance && attendance.clockInTime && !attendance.clockOutTime) {
                 if (currentMinutes >= shiftEndMins && currentMinutes <= shiftEndMins + 15) {
                     // Need to check out - send reminder notification
                     if (user.fcmToken) {
                         await sendNotification({
                             token: user.fcmToken,
                             title: "Check-out Reminder",
                             body: "Your shift has ended! Don't forget to check out.",
                             data: { type: "REMINDER_CHECK_OUT" }
                         });
                         processed++;
                     }
                 }
                 
                 // Send notification if user hasn't checked out and geofence breach time is approaching
                 const minutesSinceShiftEnd = currentMinutes - shiftEndMins;
                 if (minutesSinceShiftEnd > 0 && minutesSinceShiftEnd < geofenceBreachTime) {
                     const remainingMinutes = geofenceBreachTime - minutesSinceShiftEnd;
                     if (remainingMinutes <= 5 && user.fcmToken) {
                         // Send warning when 5 minutes or less remaining before auto-checkout
                         await sendNotification({
                             token: user.fcmToken,
                             title: "Auto Check-out Warning",
                             body: `You haven't checked out yet. You will be auto-checked out in ${remainingMinutes} minute(s) if you don't check out manually.`,
                             data: { type: "AUTO_CHECKOUT_WARNING", remainingMinutes: remainingMinutes.toString() }
                         });
                         processed++;
                     }
                 }
             }
        }
        console.log(`[ShiftReminders] Finished. Processed ${processed} reminders.`);
    } catch (e) {
        console.error("[ShiftReminders] Error", e);
    }
    return { processed };
}
