import { User } from "../models/User";
import { UserRole } from "../types";

export async function seedAdminUser() {
  try {
    const existingAdmin = await User.findOne({
      role: UserRole.ADMIN,
    });

    if (existingAdmin) {
      console.log(" Admin already exists");
      return;
    }

    const admin = new User({
      employeeId: "ADMIN001",
      name: "System Admin",
      email: "admin@attendance.com",
      phone: "+15550000001",
      password: "Admin@123",
      role: UserRole.ADMIN,
    });

    await admin.save();

    console.log("Default admin created successfully");
    console.log(" Email: admin@attendance.com");
    console.log(" Password: Admin@123");
  } catch (error) {
    console.error(" Failed to seed admin:", error);
  }
}
