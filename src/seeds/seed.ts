import { User, IUser } from "../models/User";
import { Attendance } from "../models/Attendance";
import { Taskmodel } from "../models/Task";
import { AuditLog } from "../models/AuditLog";
import { AttendanceStats, StatsType } from "../models/AttendanceStats";
import mongoose from "mongoose";
import bcrypt from "bcrypt";
import {
    UserRole,
    UserPosition,
    AttendanceStatus,
    Priority,
    TaskStatus,
} from "../types";

/* --------------------------------------------------
   CONFIG
-------------------------------------------------- */
const TOTAL_DAYS = 75; // 75 days of history
const OFFICE_LAT = 19.076;
const OFFICE_LNG = 72.8777;

/* --------------------------------------------------
   UTILS
-------------------------------------------------- */
const formatDate = (date: Date) => date.toISOString().split("T")[0];

const random = (min: number, max: number) =>
    Math.floor(Math.random() * (max - min + 1)) + min;

const isSunday = (date: Date) => date.getDay() === 0;

const getRandomElement = <T>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];

/* --------------------------------------------------
   SEED DATA GENERATORS
-------------------------------------------------- */

// 1. Create Users
async function seedUsers(adminId: mongoose.Types.ObjectId) {
    // Clear non-admin users first to avoid duplicates on re-seed
    await User.deleteMany({ role: { $ne: UserRole.ADMIN } });

    console.log("Creating new users...");

    // Create 2 Seniors
    const seniors: any[] = [];
    for (let i = 1; i <= 2; i++) {
        seniors.push({
            employeeId: `SEN00${i}`,
            name: `Senior User ${i}`,
            email: `senior${i}@attendance.com`,
            phone: `+15551000${i}`,
            password: "Password@123",
            role: UserRole.SENIOR,
            teamId: `TEAM_${i}`, // Different teams
            officeLat: OFFICE_LAT,
            officeLng: OFFICE_LNG,
            shiftStart: "09:00",
            shiftEnd: "18:00",
            invitedBy: adminId,
        });
    }
    const createdSeniors = (await User.insertMany(seniors)) as IUser[];

    // Create 3 Juniors (assigned to seniors)
    const juniors: any[] = [];
    for (let i = 1; i <= 3; i++) {
        // Assign junior to a random senior's team
        const senior = getRandomElement(createdSeniors);
        juniors.push({
            employeeId: `JUN00${i}`,
            name: `Junior User ${i}`,
            email: `junior${i}@attendance.com`,
            phone: `+15552000${i}`,
            password: "Password@123",
            role: UserRole.JUNIOR,
            position: UserPosition.INTERN,
            teamId: (senior as IUser).teamId,
            officeLat: OFFICE_LAT,
            officeLng: OFFICE_LNG,
            shiftStart: "09:00",
            shiftEnd: "18:00",
            invitedBy: (senior as IUser)._id,
        });
    }
    // Add a deterministic junior for totalWorkMinutes/totalWorkHours testing
    const hoursTestSenior = getRandomElement(createdSeniors);
    juniors.push({
        employeeId: "JUNHRS01",
        name: "Hours Test User",
        email: "hours.tester@attendance.com",
        phone: "+1555200999",
        password: "Password@123",
        role: UserRole.JUNIOR,
        teamId: (hoursTestSenior as IUser).teamId,
        officeLat: OFFICE_LAT,
        officeLng: OFFICE_LNG,
        shiftStart: "09:00",
        shiftEnd: "18:00",
        invitedBy: (hoursTestSenior as IUser)._id,
    });
    const createdJuniors = (await User.insertMany(juniors)) as IUser[];

    // Create 2 Interns (assigned to seniors)
    const interns: any[] = [];
    for (let i = 1; i <= 2; i++) {
        const senior = getRandomElement(createdSeniors);
        interns.push({
            employeeId: `INT00${i}`,
            name: `Intern User ${i}`,
            email: `intern${i}@attendance.com`,
            phone: `+15553000${i}`,
            password: "Password@123",
            role: UserRole.JUNIOR,
            teamId: (senior as IUser).teamId,
            officeLat: OFFICE_LAT,
            officeLng: OFFICE_LNG,
            shiftStart: "09:00",
            shiftEnd: "18:00",
            invitedBy: (senior as IUser)._id,
        });
    }
    const createdInterns = (await User.insertMany(interns)) as IUser[];

    return { seniors: createdSeniors, juniors: createdJuniors, interns: createdInterns };
}

// 2. Seed Attendance
async function seedAttendanceForUser(userId: mongoose.Types.ObjectId) {
    const records = [];
    const statsEntries = [];

    const today = new Date();
    const user = await User.findById(userId);

    // Clean up old records
    await Attendance.deleteMany({ userId: userId as any });
    await AttendanceStats.deleteMany({ userId: userId as any });

    for (let i = TOTAL_DAYS; i >= 0; i--) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);

        // Skip future dates if any calculation accidentally went over
        if (date > new Date()) continue;

        if (isSunday(date)) continue;

        const dateStr = formatDate(date);
        const roll = Math.random();

        // Simulating Status
        // 8% Absent
        if (roll < 0.08) {
            const record = {
                userId,
                date: dateStr,
                status: AttendanceStatus.ABSENT,
                totalWorkMinutes: 0,
            };
            records.push(record);

            // Daily Stats
            statsEntries.push({
                userId,
                type: StatsType.DAILY,
                date: dateStr,
                stats: {
                    date: dateStr,
                    totalWorkMinutes: 0,
                    status: AttendanceStatus.ABSENT,
                    isComplete: true
                }
            });
            continue;
        }

        let status = AttendanceStatus.PRESENT;
        let workMinutes = 480; // 8 hours default

        // 7% Half Day
        if (roll < 0.15) {
            status = AttendanceStatus.HALF_DAY;
            workMinutes = 240; // 4 hours
        }
        // 20% Late
        else if (roll < 0.35) {
            status = AttendanceStatus.LATE;
            workMinutes = random(400, 480);
        }

        // Generate Times
        const clockIn = new Date(date);
        // Deterministic "today" record for hours.tester
        if (
            user?.email === "hours.tester@attendance.com" &&
            dateStr === formatDate(today)
        ) {
            status = AttendanceStatus.PRESENT;
            workMinutes = 125; // 2 hours 5 minutes
            clockIn.setHours(9, 0, 0, 0);
        } else {
            // Randomize start time around 9:00 AM
            // Late: 9:30 - 10:30, OnTime: 8:45 - 9:15
            const startHour = status === AttendanceStatus.LATE ? random(9, 10) : 9;
            const startMin = status === AttendanceStatus.LATE ? random(31, 59) : random(0, 15);
            clockIn.setHours(startHour, startMin, 0, 0);
        }

        const clockOut = new Date(clockIn.getTime() + workMinutes * 60000);

        const record = {
            userId,
            date: dateStr,
            clockInTime: clockIn.getTime(),
            clockOutTime: clockOut.getTime(),
            clockInLat: OFFICE_LAT,
            clockInLng: OFFICE_LNG,
            clockOutLat: OFFICE_LAT,
            clockOutLng: OFFICE_LNG,
            clockInImageUrl: "https://res.cloudinary.com/demo/image/upload/v1312461204/sample.jpg",
            clockOutImageUrl: "https://res.cloudinary.com/demo/image/upload/v1312461204/sample.jpg",
            totalWorkMinutes: workMinutes,
            status: status,
        };
        records.push(record);

        // Daily Stat
        statsEntries.push({
            userId,
            type: StatsType.DAILY,
            date: dateStr,
            stats: {
                clockInTime: clockIn.getTime(),
                clockOutTime: clockOut.getTime(),
                totalWorkMinutes: workMinutes,
                status: status,
                isComplete: true
            }
        });
    }

    await Attendance.insertMany(records);
    await AttendanceStats.insertMany(statsEntries);
}

// 3. Seed Tasks
async function seedTasksForUsers(seniors: any[], juniors: any[]) {
    await Taskmodel.deleteMany({});

    const tasks = [];
    const titles = [
        "Update API Documentation", "Fix Login Bug", "Refactor CSS",
        "Database Backup", "Client Meeting", "Code Review",
        "Implement Feature X", "Unit Tests"
    ];

    for (const junior of juniors) {
        // Assign 5-10 tasks per junior
        const taskCount = random(5, 10);

        // Find their senior (same team)
        const mySenior = seniors.find(s => s.teamId === junior.teamId) || seniors[0];

        for (let k = 0; k < taskCount; k++) {
            const isCompleted = Math.random() > 0.5;
            tasks.push({
                title: getRandomElement(titles),
                description: "Auto-generated task description for testing purposes.",
                assignedById: mySenior._id,
                assignedToId: junior._id,
                priority: getRandomElement(Object.values(Priority)),
                status: isCompleted ? TaskStatus.COMPLETED : getRandomElement([TaskStatus.TODO, TaskStatus.IN_PROGRESS]),
                deadline: new Date(Date.now() + random(1, 10) * 24 * 60 * 60 * 1000).toISOString(),
                createdAt: new Date(Date.now() - random(0, 30) * 24 * 60 * 60 * 1000)
            });
        }
    }
    await Taskmodel.create(tasks);
}

// 4. Seed Audit Logs
async function seedAuditLogs(users: any[]) {
    await AuditLog.deleteMany({});

    const logs = [];
    const actions = ["LOGIN", "LOGOUT", "CHECK_IN", "CHECK_OUT", "CREATE_TASK", "UPDATE_TASK"];

    for (let i = 0; i < 50; i++) {
        const user = getRandomElement(users);
        logs.push({
            action: getRandomElement(actions),
            performedBy: user._id,
            targetUser: user._id,
            metadata: { description: "Auto-generated audit log" },
            ip: "127.0.0.1",
            createdAt: new Date(Date.now() - random(0, 30) * 24 * 60 * 60 * 1000)
        });
    }
    await AuditLog.create(logs);
}

/* --------------------------------------------------
   MAIN RUNNER
-------------------------------------------------- */
export async function runSeed() {
    try {
        if (process.env.NODE_ENV === "production") {
            // throw new Error("🚫 Seeding blocked in production");
            console.warn("⚠️ Warning: Seeding in production environment (check logic if this is intended)");
        }

        // 1. Get Admin
        let admin = await User.findOne({ role: UserRole.ADMIN });
        if (!admin) {
            console.log("Creating Admin...");
            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash("Admin@123", salt);
            admin = await User.create({
                employeeId: "ADMIN01",
                name: "System Admin",
                email: "admin@attendance.com",
                phone: "+15550000001",
                password: hashedPassword,
                role: UserRole.ADMIN,
                officeLat: OFFICE_LAT,
                officeLng: OFFICE_LNG,
            });
        }
        console.log(`✅ Admin ready: ${admin.email}`);

        // 2. Create Users
        // const { seniors, juniors, interns } = await seedUsers(admin._id);
        // console.log(`✅ Created ${seniors.length} Seniors, ${juniors.length} Juniors, and ${interns.length} Interns`);

        // // 3. Seed Attendance & Stats for all Users
        // const allUsers = [...seniors, ...juniors, ...interns];
        // console.log(`⏳ Seeding attendance (${TOTAL_DAYS} days) for ${allUsers.length} users...`);

        // for (const user of allUsers) {
        //     await seedAttendanceForUser(user._id);
        // }
        // console.log(`✅ Attendance & Stats seeded.`);

        // // 4. Tasks
        // console.log("⏳ Seeding tasks...");
        // await seedTasksForUsers(seniors, juniors);
        // console.log(`✅ Tasks seeded.`);

        // // 5. Audit Logs
        // console.log("⏳ Seeding audit logs...");
        // await seedAuditLogs([admin, ...allUsers]);
        // console.log(`✅ Audit Logs seeded.`);

        console.log("\n🎉 FULL SEED COMPLETED SUCCESSFULLY!");

    } catch (err) {
        console.error("❌ Seed failed:", err);
        process.exit(1);
    }
}
