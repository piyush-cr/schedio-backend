import mongoose from 'mongoose';

const MONGODB_URI =
process.env.MONGODB_URI || "mongodb://localhost:27017/attendance-app";

export const connectDB = async (): Promise<void> => {
  try {
    if (mongoose.connection.readyState === 1) {
      console.log('MongoDB is already connected');
      return;
    }

    const options = {
      retryWrites: true,
      w: 'majority' as const,
    };

    const conn = await mongoose.connect(MONGODB_URI!, options);

    console.log(`MongoDB Connected: ${conn.connection.host}`);
    console.log(`Database: ${conn.connection.name}`);

    try {
      const db = conn.connection.db;
      if (db) {
        const admin = db.admin();
        await admin.replSetGetStatus();
        console.log('✅ Replica set active - Transactions enabled');
        process.env.TRANSACTIONS_ENABLED = 'true';
      }
    } catch (error: any) {
      process.env.TRANSACTIONS_ENABLED = 'false';
      console.warn('Could not verify replica set status:', error.message);
    }
  } catch (error) {
    console.error('MongoDB connection error:', error);
    process.exit(1);
  }
};

mongoose.connection.on('connected', () => {
  console.log('Mongoose connected to MongoDB');
});

mongoose.connection.on('error', (err) => {
  console.error('Mongoose connection error:', err);
});

mongoose.connection.on('disconnected', () => {
  console.log('Mongoose disconnected from MongoDB');
});

process.on('SIGINT', async () => {
  await mongoose.connection.close();
  console.log('MongoDB connection closed through app termination');
  process.exit(0);
});

export default connectDB;
