import dotenv from "dotenv";
dotenv.config();
import { connectDB } from "./src/db/db";
import { runSeed } from "./src/seeds/seed";

const seed = async () => {
    await connectDB();
    await runSeed();
};

seed();
