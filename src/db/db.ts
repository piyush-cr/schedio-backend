import mongoose from 'mongoose';

const MONGODB_URI = 
// process.env.MONGO_URI;

process.env.MONGODB_URI || "mongodb://localhost:27017/attendance-app";

export const connectDB = async (): Promise<void> => {
  try {
    if (mongoose.connection.readyState === 1) {
      console.log('MongoDB is already connected');
      return;
    }

    // Connection options optimized for transactions
    const options = {
      retryWrites: true, // Automatically retry write operations
      w: 'majority' as const, // Write concern for transactions
    };

    const conn = await mongoose.connect(MONGODB_URI!, options);

    console.log(`MongoDB Connected: ${conn.connection.host}`);
    console.log(`Database: ${conn.connection.name}`);

    // Check if replica set is configured (required for transactions)
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
      if (error.codeName === 'NotYetInitialized' || error.code === 94) {
        console.warn(
          '⚠️  WARNING: MongoDB replica set not initialized. Transactions will NOT work!',
        );
        console.warn(
          '   For development, setup a single-node replica set with: rs.initiate()',
        );
      } else if (error.message?.includes('not running with --replSet')) {
        console.warn(
          '⚠️  WARNING: MongoDB is not running as a replica set. Transactions will NOT work!',
        );
        console.warn(
          '   Start MongoDB with --replSet option to enable transactions.',
        );
      } else {
        console.warn('Could not verify replica set status:', error.message);
      }
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
