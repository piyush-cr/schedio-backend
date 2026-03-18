import mongoose from "mongoose";
import { User } from "./src/models/User";
import * as dotenv from "dotenv";

dotenv.config();

const MONGO_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/attendance_db";

async function updateOfficeLocation() {
  try {
    console.log(`Connecting to ${MONGO_URI}...`);
    await mongoose.connect(MONGO_URI);
    console.log("Connected to MongoDB");

    const officeLat = 30.706810835493734;
    const officeLng = 76.6902782893118;

    const result = await User.updateMany(
      {}, 
      { $set: { officeLat, officeLng } }
    );

    console.log(`Updated ${result.modifiedCount} users with office location: ${officeLat}, ${officeLng}`);
    process.exit(0);
  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  }
}

updateOfficeLocation();
