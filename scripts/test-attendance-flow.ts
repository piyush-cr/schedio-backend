import { connectDB } from "../src/db/db";
import { AttendanceStats, StatsType } from "../src/models/AttendanceStats";
import { User, IUser } from "../src/models/User";
import { Attendance } from "../src/models/Attendance";
import mongoose from "mongoose";
import fs from "fs";
import path from "path";

const API_URL = "http://localhost:3000/api";
const EMAIL = "junior@attendance.com";
const PASSWORD = "Junior@123";

// Helper for delays
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function login() {
    console.log(`\n🔑 Logging in as ${EMAIL}...`);
    try {
        const response = await fetch(`${API_URL}/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: EMAIL, password: PASSWORD })
        });

        if (!response.ok) {
            const err = await response.text();
            throw new Error(`Login failed: ${response.status} - ${err}`);
        }

        const resJson = await response.json();
        console.log("✅ Login successful");
        return {
            token: resJson.data.access_token,
            userId: resJson.data.user._id
        };
    } catch (error) {
        console.error("❌ Login error:", error);
        throw error;
    }
}

async function checkIn(token: string) {
    console.log("\n📍 Attempting Check-In (with dummy photo)...");

    // Create valid 1x1 PNG file
    const dummyPath = path.join(__dirname, "img.png");
    const pngBuffer = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAAAAAA6fptVAAAACklEQVR4nGNiAAAABgADNjd8qAAAAABJRU5ErkJggg==", "base64");
    fs.writeFileSync(dummyPath, pngBuffer);

    const file = Bun.file(dummyPath);

    const formData = new FormData();
    formData.append("latitude", "19.0760");
    formData.append("longitude", "72.8777");
    formData.append("timestamp", Date.now().toString());
    formData.append("photo", file, "img.png");

    try {
        const response = await fetch(`${API_URL}/attendance/check-in`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${token}`
            },
            body: formData
        });

        if (!response.ok) {
            const err = await response.text();
            throw new Error(`Check-in failed: ${response.status} - ${err}`);
        }

        const data = await response.json();
        console.log("✅ Check-In successful");
        console.log("   Clock-in Time:", new Date(data.data.clockInTime).toISOString());

        // Clean up dummy
        fs.unlinkSync(dummyPath);
        return data.data;
    } catch (error) {
        console.error("❌ Check-in error:", error);
        // Clean up dummy if error
        if (fs.existsSync(dummyPath)) fs.unlinkSync(dummyPath);
        throw error;
    }
}

async function checkOut(token: string) {
    console.log("\n📍 Attempting Check-Out (with photo)...");

    // Create valid 1x1 PNG file for checkout
    const dummyPath = path.join(__dirname, "checkout_img.png");
    const pngBuffer = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAAAAAA6fptVAAAACklEQVR4nGNiAAAABgADNjd8qAAAAABJRU5ErkJggg==", "base64");
    fs.writeFileSync(dummyPath, pngBuffer);
    const file = Bun.file(dummyPath);

    const checkoutTime = Date.now() + 5000; // 5 seconds later

    const formData = new FormData();
    formData.append("latitude", "19.0760");
    formData.append("longitude", "72.8777");
    formData.append("timestamp", checkoutTime.toString());
    formData.append("photo", file, "img.png");

    try {
        const response = await fetch(`${API_URL}/attendance/check-out`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${token}`
            },
            body: formData
        });

        if (!response.ok) {
            const err = await response.text();
            throw new Error(`Check-out failed: ${response.status} - ${err}`);
        }

        const data = await response.json();
        console.log("✅ Check-Out successful");
        console.log("   Total Work Minutes:", data.data.totalWorkMinutes);

        fs.unlinkSync(dummyPath);
        return data.data;
    } catch (error) {
        console.error("❌ Check-out error:", error);
        if (fs.existsSync(dummyPath)) fs.unlinkSync(dummyPath);
        throw error;
    }
}

async function verifyStats(userId: string) {
    console.log("\n📊 Verifying Statistics in MongoDB...");

    await connectDB();

    // Wait a bit for worker to process stats
    console.log("   Waiting 5s for worker to process stats...");
    await delay(5000);

    const today = new Date().toISOString().split('T')[0];

    // Check Daily Stats
    const dailyStats = await AttendanceStats.findOne({
        userId,
        type: StatsType.DAILY,
        date: today
    });

    if (dailyStats) {
        console.log("✅ Daily Stats found:", JSON.stringify(dailyStats.stats, null, 2));
    } else {
        console.error("❌ Daily Stats NOT found for today");
    }

    // Check Weekly Stats
    // Note: We might need to approximate the startDate 
    const weeklyStats = await AttendanceStats.findOne({
        userId,
        type: StatsType.WEEKLY
    }).sort({ createdAt: -1 });

    if (weeklyStats) {
        console.log("✅ Weekly Stats found (latest):", JSON.stringify(weeklyStats.stats, null, 2));
    } else {
        console.error("❌ Weekly Stats NOT found");
    }

    await mongoose.disconnect();
}

async function resetAttendance(userId: string) {
    console.log("\n🧹 Resetting today's attendance for clean test...");
    await connectDB();
    const today = new Date().toISOString().split('T')[0];
    const user = await User.findById(userId);
    if (user) {
        await Attendance.deleteMany({ userId: user._id, date: today });
        await AttendanceStats.deleteMany({ userId: user._id, date: today });
        console.log("   Attendance cleared.");
    }
    await mongoose.disconnect();
}

async function main() {
    console.log("🚀 Starting Full Attendance Flow Test");
    console.log("   Target API:", API_URL);

    // 1. Login
    let auth;
    try {
        auth = await login();
    } catch (e) {
        console.error("Could not login. Ensure server is running!");
        process.exit(1);
    }

    // 2. Reset previous attendance (optional, but good for repeatability)
    await resetAttendance(auth.userId);

    // 3. Check In
    await checkIn(auth.token);

    // 4. Wait
    console.log("   Simulating work...");
    await delay(2000);

    // 5. Check Out
    await checkOut(auth.token);

    // 6. Verify Stats
    await verifyStats(auth.userId);

    console.log("\n🎉 Test Completed!");
}

main().catch(console.error);
