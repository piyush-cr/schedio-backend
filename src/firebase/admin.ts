
import admin from "firebase-admin";
import "dotenv/config";
import * as fs from "fs";
import * as path from "path";

console.log("[Firebase Admin] Starting initialization...");
console.log("[Firebase Admin] GOOGLE_APPLICATION_CREDENTIALS:", process.env.GOOGLE_APPLICATION_CREDENTIALS);
console.log("[Firebase Admin] FIREBASE_PROJECT_ID:", process.env.FIREBASE_PROJECT_ID ? "set" : "not set");

// Check if app is already initialized
if (!admin.apps.length) {
    try {
        // Option 1: Using service account file - explicitly load it
        if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
            const serviceAccountPath = path.resolve(process.env.GOOGLE_APPLICATION_CREDENTIALS);
            console.log("[Firebase Admin] Loading service account from:", serviceAccountPath);
            
            if (!fs.existsSync(serviceAccountPath)) {
                throw new Error(`Service account file not found at: ${serviceAccountPath}`);
            }
            
            const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, "utf8"));
            console.log("[Firebase Admin] Service account loaded. Client email:", serviceAccount.client_email);
            
            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount),
            });
            console.log("✅ Firebase Admin initialized using service account file:", process.env.GOOGLE_APPLICATION_CREDENTIALS);
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
            console.log("✅ Firebase Admin initialized using environment variables");
        } else {
            console.warn(
                "⚠️ Firebase Admin configuration missing. Push notifications will not work."
            );
        }
    } catch (error) {
        console.error("❌ Firebase Admin initialization error:", error);
    }
} else {
    console.log("✅ Firebase Admin already initialized");
}

export default admin;
