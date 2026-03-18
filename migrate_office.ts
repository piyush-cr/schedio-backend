import mongoose from "mongoose";
import { User } from "./src/models/User";
import * as dotenv from "dotenv";

dotenv.config();

const MONGO_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/attendance_db";

async function updateAllUsers() {
  try {
    console.log(`Connecting to ${MONGO_URI}...`);
    await mongoose.connect(MONGO_URI);
    
    const lat = 30.706810835493734;
    const lng = 76.6902782893118;

    const result = await User.updateMany(
      {}, 
      { $set: { officeLat: lat, officeLng: lng } }
    );

    console.log(`Successfully updated ${result.modifiedCount} users.`);
    
    // Verify one user
    const sample = await User.findOne();
    if (sample) {
      console.log(`Verification - Sample User (${sample.name}): Lat=${sample.officeLat}, Lng=${sample.officeLng}`);
    }

    process.exit(0);
  } catch (err) {
    console.error("Migration failed:", err);
    process.exit(1);
  }
}

updateAllUsers();
