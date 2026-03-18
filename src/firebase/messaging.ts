
import admin from "./admin";

interface NotificationPayload {
    token: string;
    title: string;
    body: string;
    data?: Record<string, string>;
}

export async function sendNotification(payload: NotificationPayload) {
    const { token, title, body, data } = payload;

    if (!token) {
        console.warn("Skipping notification: No token provided");
        return;
    }

    // Ensure admin is initialized
    if (admin.apps.length === 0) {
        console.warn("Skipping notification: Firebase Admin not initialized");
        return;
    }

    try {
        await admin.messaging().send({
            token,
            notification: {
                title,
                body,
            },
            data,
        });
        console.log(`Notification sent to ${token}`);
    } catch (error) {
        console.error("Error sending notification:", error);
        // Suggest removing invalid tokens?
        // if (error.code === 'messaging/registration-token-not-registered') ...
    }
}
