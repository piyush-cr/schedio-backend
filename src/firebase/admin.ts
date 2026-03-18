
import admin from "firebase-admin";
import "dotenv/config";

// Check if app is already initialized
if (!admin.apps.length) {
    try {
        // Option 1: Using service account file
        if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
            admin.initializeApp({
                credential: admin.credential.applicationDefault(),
            });
        }
        // Option 2: Using individual env vars (common in cloud deployments)
        else if (
            process.env.FIREBASE_PROJECT_ID &&
            process.env.FIREBASE_CLIENT_EMAIL &&
            process.env.FIREBASE_PRIVATE_KEY
        ) {
            admin.initializeApp({
                credential: admin.credential.cert({
                    projectId: process.env.FIREBASE_PROJECT_ID,
                    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                    privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
                }),
            });
        } else {
            console.warn(
                "Firebase Admin configuration missing. Push notifications will not work."
            );
        }
    } catch (error) {
        console.error("Firebase Admin initialization error:", error);
    }
}

export default admin;
