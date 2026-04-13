
import admin from "./admin";

interface NotificationPayload {
    token: string;
    title: string;
    body: string;
    data?: Record<string, string>;
}

export async function sendNotification(payload: NotificationPayload) {
    const { token, title, body, data } = payload;

    console.log("[FCM] Sending notification...");
    console.log("[FCM] Token:", token ? token.substring(0, 20) + "..." : "MISSING");
    console.log("[FCM] Title:", title);
    console.log("[FCM] Body:", body);

    if (!token) {
        console.warn("[FCM] Skipping notification: No token provided");
        return;
    }

    // Ensure admin is initialized
    console.log("[FCM] Admin apps count:", admin.apps.length);
    if (admin.apps.length === 0) {
        console.warn("[FCM] Skipping notification: Firebase Admin not initialized");
        return;
    }

    try {
        console.log("[FCM] Attempting to send via Firebase Messaging...");
        const response = await admin.messaging().send({
            token,
            notification: {
                title,
                body,
            },
            data,
        });
        console.log("✅ Notification sent successfully!");
        console.log("[FCM] Response:", response);
        console.log(`[FCM] Notification sent to ${token}`);
    } catch (error: any) {
        console.error("❌ Error sending notification:", error.message);
        console.error("[FCM] Error code:", error.code);
        console.error("[FCM] Error details:", error);
        // Suggest removing invalid tokens?
        // if (error.code === 'messaging/registration-token-not-registered') ...
        throw error;
    }
}
