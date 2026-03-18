# MongoDB Transactions with Mongoose Sessions
## Anti-Gravity Attendance Management System - Internal Documentation


## 📋 Table of Contents

1. [Introduction](#1-introduction)
2. [Use Cases in Attendance System](#2-use-cases-in-attendance-system)
3. [Prerequisites](#3-prerequisites)
4. [Transaction Flow Explanation](#4-transaction-flow-explanation)
5. [Code Examples](#5-code-examples)
6. [Concurrency & Performance](#6-concurrency--performance)
7. [Folder Structure & Integration](#7-folder-structure--integration)
8. [Edge Cases](#8-edge-cases)
9. [Best Practices](#9-best-practices)
10. [Summary](#10-summary)
11. [Implementation Checklist](#11-implementation-checklist)

---

## 1. Introduction

### 1.1 What are MongoDB Transactions?

MongoDB transactions are **ACID-compliant operations** that allow you to execute multiple database operations as a single, atomic unit of work. Either all operations succeed, or all fail together, ensuring data consistency.

**Key Properties:**

- **Atomicity**: All operations succeed or all fail
- **Consistency**: Database moves from one valid state to another
- **Isolation**: Concurrent transactions don't interfere with each other
- **Durability**: Committed changes persist even after system failure

### 1.2 What are Mongoose Sessions?

A **Mongoose session** is a client-side abstraction that:

- Tracks a sequence of related operations
- Ensures operations execute within a transaction context
- Provides transaction lifecycle management (start, commit, abort)
- Must be passed to every database operation within the transaction

```javascript
// Session is passed to every operation
await User.findOne({ _id: userId }).session(session);
await Attendance.create([attendanceData], { session });
```

### 1.3 Why Transactions are Critical for Attendance APIs

Without transactions, the Attendance Management System faces serious concurrency issues:

#### **Problem 1: Race Conditions**
```
User clicks "Check In" button twice rapidly:
  Request 1: Check if attendance exists → No → Create attendance record
  Request 2: Check if attendance exists → No → Create attendance record
  Result: TWO attendance records for the same date! ❌
```

#### **Problem 2: Partial Updates**
```
Check-out operation:
  Step 1: Update attendance record with check-out time ✓
  Step 2: Calculate worked hours and update ✓
  Step 3: Create audit log entry ✗ (Server crashes)
  Result: Attendance updated but no audit trail ❌
```

#### **Problem 3: Data Inconsistency**
```
Attendance correction approval:
  Step 1: Update original attendance record ✓
  Step 2: Update correction request status ✗ (Network error)
  Result: Attendance changed but request still shows "pending" ❌
```

#### **Solution: Transactions Ensure:**

✅ **Duplicate Prevention**: First request locks the record, second request waits  
✅ **Atomic Updates**: All operations succeed together or all fail together  
✅ **Data Consistency**: Related records always stay synchronized

---

## 2. Use Cases in Attendance System

### 2.1 Mark Attendance (Check-In / Check-Out)

**Operations involved:**

1. Validate user and date
2. Check for existing attendance
3. Create or update attendance record
4. Log the action in audit trail
5. Update user statistics

**Why transaction needed:**

- Prevent duplicate check-ins on concurrent requests
- Ensure audit log is always created with attendance
- Keep user statistics synchronized

### 2.2 Prevent Duplicate Attendance

**Challenge:**

Two simultaneous check-in requests from the same user on the same date could both pass the "duplicate check" and create two records.

**Solution with transaction:**

```javascript
// First request acquires lock on user's date range
// Second request waits until first commits or aborts
// Only one record gets created
```

### 2.3 Update Attendance + Logs Atomically

**Operations involved:**

1. Update attendance record
2. Create audit log entry
3. Send notification (optional)
4. Update daily/monthly summaries

**Why transaction needed:**

- If audit log fails, attendance shouldn't update
- Summary reports must reflect actual attendance
- Prevents orphaned updates

### 2.4 Attendance Correction Approval Workflows

**Operations involved:**

1. Validate correction request exists
2. Update original attendance record
3. Mark correction request as "approved"
4. Create approval audit log
5. Notify user of approval

**Why transaction needed:**

- If approval fails midway, attendance shouldn't change
- Request status must match attendance state
- Prevents approval of same request twice concurrently

---

## 3. Prerequisites

### 3.1 MongoDB Replica Set Requirement

⚠️ **CRITICAL**: Transactions **only work with MongoDB replica sets**, not standalone instances.

**Why?**  
Transactions require distributed consensus to ensure ACID properties. Replica sets provide this through an election protocol.

#### **Local Development Setup**

**Option 1: Docker Compose (Recommended)**

```yaml
# docker-compose.yml
version: '3.8'
services:
  mongo1:
    image: mongo:7.0
    command: ["--replSet", "rs0", "--bind_ip_all"]
    ports:
      - "27017:27017"
    volumes:
      - mongo1_data:/data/db
    networks:
      - mongo-cluster

  mongo2:
    image: mongo:7.0
    command: ["--replSet", "rs0", "--bind_ip_all"]
    ports:
      - "27018:27017"
    volumes:
      - mongo2_data:/data/db
    networks:
      - mongo-cluster

  mongo3:
    image: mongo:7.0
    command: ["--replSet", "rs0", "--bind_ip_all"]
    ports:
      - "27019:27017"
    volumes:
      - mongo3_data:/data/db
    networks:
      - mongo-cluster

volumes:
  mongo1_data:
  mongo2_data:
  mongo3_data:

networks:
  mongo-cluster:
    driver: bridge
```

**Initialize replica set:**

```bash
docker-compose up -d
docker exec -it <container_name> mongosh
```

```javascript
// Inside mongosh
rs.initiate({
  _id: "rs0",
  members: [
    { _id: 0, host: "mongo1:27017" },
    { _id: 1, host: "mongo2:27017" },
    { _id: 2, host: "mongo3:27017" }
  ]
})
```

**Option 2: Single-Node Replica Set (Quick Testing)**

```bash
# Start MongoDB with replica set flag
mongod --replSet rs0 --port 27017 --dbpath /data/db

# In another terminal, initialize
mongosh
rs.initiate()
```

**Connection string:**

```javascript
// For replica set
mongodb://localhost:27017,localhost:27018,localhost:27019/anti-gravity?replicaSet=rs0

// For single-node replica set
mongodb://localhost:27017/anti-gravity?replicaSet=rs0
```

### 3.2 Mongoose Version Requirements

- **Minimum**: Mongoose 5.2.0
- **Recommended**: Mongoose 7.x or higher

```bash
npm install mongoose@latest
```

### 3.3 Environment Configuration

**Development (.env.development):**

```env
MONGODB_URI=mongodb://localhost:27017,localhost:27018,localhost:27019/anti-gravity-dev?replicaSet=rs0
ENABLE_TRANSACTIONS=true
TRANSACTION_TIMEOUT_MS=30000
```

**Production (.env.production):**

```env
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/anti-gravity?retryWrites=true&w=majority
ENABLE_TRANSACTIONS=true
TRANSACTION_TIMEOUT_MS=15000
MAX_TRANSACTION_RETRY=3
```

**Database Connection Setup:**

```javascript
// config/database.js
const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const options = {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 5000,
      // Transaction-specific options
      retryWrites: true,
      w: 'majority'
    };

    await mongoose.connect(process.env.MONGODB_URI, options);
    
    console.log('✅ MongoDB connected successfully');
    console.log('✅ Replica set:', mongoose.connection.db.admin().replSetGetStatus ? 'Active' : 'Not configured');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
};

module.exports = connectDB;
```

---

## 4. Transaction Flow Explanation

### 4.1 Complete Transaction Lifecycle

```
┌─────────────────────────────────────────────────────────────┐
│                    Transaction Lifecycle                     │
└─────────────────────────────────────────────────────────────┘

1. START SESSION
   └─> const session = await mongoose.startSession();
       │
       └─> Creates a logical session with MongoDB
           - Generates unique session ID
           - Prepares transaction context

2. START TRANSACTION
   └─> session.startTransaction(options);
       │
       └─> Begins ACID transaction
           - Sets isolation level
           - Acquires necessary locks
           - Starts tracking operations

3. EXECUTE OPERATIONS
   └─> await Model.operation(...).session(session);
       │
       └─> All operations use the session
           - Reads see uncommitted writes from this transaction
           - Other transactions see old data (snapshot isolation)
           - Locks are acquired as needed

4. VALIDATION CHECKPOINT
   └─> if (error) → Go to ABORT
       if (success) → Go to COMMIT

5. COMMIT TRANSACTION
   └─> await session.commitTransaction();
       │
       └─> Makes all changes permanent
           - Writes to all replica set members
           - Releases locks
           - Changes become visible to other transactions

6. END SESSION
   └─> await session.endSession();
       │
       └─> Cleanup resources
           - Closes session
           - Releases server resources

───────────────── ERROR PATH ─────────────────

4. ERROR DETECTED
   └─> await session.abortTransaction();
       │
       └─> Rollback ALL changes
           - Discards all uncommitted operations
           - Releases locks
           - Database returns to pre-transaction state

5. END SESSION
   └─> await session.endSession();
```

### 4.2 What Happens on Failure?

#### **Scenario 1: Operation Fails Before Commit**

```javascript
session.startTransaction();
try {
  await Attendance.create([data], { session }); // ✓ Success
  await AuditLog.create([log], { session });     // ✗ Validation Error
  await session.commitTransaction();              // Never reached
} catch (error) {
  await session.abortTransaction(); // ← Rollback attendance creation
}
```

**Result:**  
✅ No data written to database  
✅ Database remains in original state  
✅ No partial updates

#### **Scenario 2: Network Failure During Commit**

```javascript
session.startTransaction();
await Attendance.create([data], { session });
await session.commitTransaction(); // ✗ Network timeout
```

**Result:**  
⚠️ MongoDB's **write concern** determines behavior:  
- If `w: "majority"` → Waits for acknowledgment from majority of nodes
- If timeout → Transaction may still commit on server side
- Client receives error but should check transaction state

**Solution:**  
```javascript
let retryCount = 0;
while (retryCount < MAX_RETRIES) {
  try {
    await session.commitTransaction();
    break; // Success
  } catch (error) {
    if (error.hasErrorLabel('TransientTransactionError')) {
      retryCount++;
      continue; // Retry
    }
    throw error; // Permanent failure
  }
}
```

#### **Scenario 3: Write Conflict**

```javascript
// Transaction 1
session1.startTransaction();
await Attendance.updateOne(
  { userId, date },
  { checkOutTime: '18:00' },
  { session: session1 }
);

// Transaction 2 (concurrent)
session2.startTransaction();
await Attendance.updateOne(
  { userId, date },
  { checkOutTime: '18:30' }, // Conflicts!
  { session: session2 }
);
```

**Result:**  
- First transaction to commit wins
- Second transaction gets `WriteConflict` error
- Second transaction must retry or abort

---

## 5. Code Examples

### 5.1 Attendance Check-In API with Mongoose Session

#### **Controller: `controllers/attendance.controller.js`**

```javascript
const attendanceService = require('../services/attendance.service');
const { AppError } = require('../utils/errors');

/**
 * Check-in attendance
 * @route POST /api/v1/attendance/check-in
 */
exports.checkIn = async (req, res, next) => {
  try {
    const { userId } = req.user; // From auth middleware
    const { location, deviceInfo } = req.body;

    const attendance = await attendanceService.checkIn({
      userId,
      location,
      deviceInfo
    });

    res.status(201).json({
      success: true,
      message: 'Checked in successfully',
      data: { attendance }
    });
  } catch (error) {
    next(error);
  }
};
```

#### **Service: `services/attendance.service.js`**

```javascript
const mongoose = require('mongoose');
const Attendance = require('../models/attendance.model');
const AuditLog = require('../models/auditLog.model');
const User = require('../models/user.model');
const { AppError } = require('../utils/errors');

/**
 * Check-in service with transaction
 */
exports.checkIn = async ({ userId, location, deviceInfo }) => {
  // Start session
  const session = await mongoose.startSession();
  
  try {
    // Start transaction
    session.startTransaction({
      readConcern: { level: 'snapshot' },
      writeConcern: { w: 'majority' },
      maxTimeMS: 30000 // 30 seconds timeout
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Step 1: Check if already checked in (with session lock)
    const existingAttendance = await Attendance.findOne({
      userId,
      date: today
    }).session(session);

    if (existingAttendance) {
      throw new AppError('Already checked in for today', 400);
    }

    // Step 2: Verify user exists
    const user = await User.findById(userId).session(session);
    if (!user) {
      throw new AppError('User not found', 404);
    }

    // Step 3: Create attendance record
    const attendanceData = {
      userId,
      date: today,
      checkInTime: new Date(),
      location,
      deviceInfo,
      status: 'present'
    };

    const [attendance] = await Attendance.create([attendanceData], { 
      session 
    });

    // Step 4: Create audit log
    const auditLogData = {
      userId,
      action: 'CHECK_IN',
      resource: 'Attendance',
      resourceId: attendance._id,
      metadata: {
        location,
        deviceInfo,
        timestamp: new Date()
      }
    };

    await AuditLog.create([auditLogData], { session });

    // Step 5: Update user stats
    await User.findByIdAndUpdate(
      userId,
      { 
        $inc: { totalAttendance: 1 },
        lastCheckIn: new Date()
      },
      { session }
    );

    // Commit transaction
    await session.commitTransaction();
    
    console.log('✅ Check-in transaction committed successfully');

    return attendance;

  } catch (error) {
    // Abort transaction on any error
    await session.abortTransaction();
    console.error('❌ Check-in transaction aborted:', error.message);
    
    throw error;
  } finally {
    // Always end session
    await session.endSession();
  }
};
```

### 5.2 Attendance Check-Out API with Session

#### **Service: `services/attendance.service.js`**

```javascript
/**
 * Check-out service with transaction
 */
exports.checkOut = async ({ userId, location, notes }) => {
  const session = await mongoose.startSession();
  
  try {
    session.startTransaction({
      readConcern: { level: 'snapshot' },
      writeConcern: { w: 'majority' }
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Step 1: Find today's attendance
    const attendance = await Attendance.findOne({
      userId,
      date: today
    }).session(session);

    if (!attendance) {
      throw new AppError('No check-in record found for today', 404);
    }

    if (attendance.checkOutTime) {
      throw new AppError('Already checked out for today', 400);
    }

    // Step 2: Calculate worked hours
    const checkOutTime = new Date();
    const checkInTime = attendance.checkInTime;
    const workedHours = (checkOutTime - checkInTime) / (1000 * 60 * 60);

    // Step 3: Update attendance
    attendance.checkOutTime = checkOutTime;
    attendance.workedHours = parseFloat(workedHours.toFixed(2));
    attendance.checkOutLocation = location;
    attendance.notes = notes;
    
    await attendance.save({ session });

    // Step 4: Create audit log
    await AuditLog.create([{
      userId,
      action: 'CHECK_OUT',
      resource: 'Attendance',
      resourceId: attendance._id,
      metadata: {
        workedHours: attendance.workedHours,
        location,
        timestamp: checkOutTime
      }
    }], { session });

    // Step 5: Update monthly summary
    const monthKey = `${today.getFullYear()}-${today.getMonth() + 1}`;
    await User.findByIdAndUpdate(
      userId,
      { 
        $inc: { 
          [`monthlySummary.${monthKey}.totalHours`]: attendance.workedHours,
          [`monthlySummary.${monthKey}.daysPresent`]: 1
        }
      },
      { session }
    );

    await session.commitTransaction();
    console.log('✅ Check-out transaction committed successfully');

    return attendance;

  } catch (error) {
    await session.abortTransaction();
    console.error('❌ Check-out transaction aborted:', error.message);
    throw error;
  } finally {
    await session.endSession();
  }
};
```

### 5.3 Using `withTransaction()` Helper (Recommended)

The `withTransaction()` method provides automatic retry logic and cleaner code:

```javascript
/**
 * Attendance correction approval using withTransaction
 */
exports.approveCorrectionRequest = async ({ requestId, approvedBy, comments }) => {
  const session = await mongoose.startSession();
  
  try {
    const result = await session.withTransaction(async () => {
      // All operations inside this callback run in transaction

      // Step 1: Find correction request
      const request = await AttendanceCorrectionRequest.findById(requestId)
        .session(session);

      if (!request) {
        throw new AppError('Correction request not found', 404);
      }

      if (request.status !== 'pending') {
        throw new AppError('Request is not in pending status', 400);
      }

      // Step 2: Update original attendance
      const attendance = await Attendance.findById(request.attendanceId)
        .session(session);

      if (!attendance) {
        throw new AppError('Original attendance not found', 404);
      }

      // Apply corrections
      Object.assign(attendance, request.correctedData);
      await attendance.save({ session });

      // Step 3: Update correction request
      request.status = 'approved';
      request.approvedBy = approvedBy;
      request.approvedAt = new Date();
      request.approverComments = comments;
      await request.save({ session });

      // Step 4: Create audit logs
      await AuditLog.create([
        {
          userId: request.userId,
          action: 'ATTENDANCE_CORRECTED',
          resource: 'Attendance',
          resourceId: attendance._id,
          metadata: { requestId, approvedBy }
        },
        {
          userId: approvedBy,
          action: 'CORRECTION_APPROVED',
          resource: 'AttendanceCorrectionRequest',
          resourceId: requestId,
          metadata: { originalAttendanceId: attendance._id }
        }
      ], { session });

      return { attendance, request };

    }, {
      readConcern: { level: 'snapshot' },
      writeConcern: { w: 'majority' },
      maxCommitTimeMS: 10000
    });

    console.log('✅ Correction approval transaction successful');
    return result;

  } catch (error) {
    console.error('❌ Correction approval failed:', error.message);
    throw error;
  } finally {
    await session.endSession();
  }
};
```

### 5.4 Error Handling Best Practices

```javascript
/**
 * Comprehensive error handling wrapper
 */
const executeWithTransaction = async (callback) => {
  const session = await mongoose.startSession();
  let retryCount = 0;
  const MAX_RETRIES = 3;

  while (retryCount < MAX_RETRIES) {
    try {
      const result = await session.withTransaction(callback, {
        readConcern: { level: 'snapshot' },
        writeConcern: { w: 'majority' },
        readPreference: 'primary'
      });

      return result;

    } catch (error) {
      // Check if error is transient (can be retried)
      if (error.hasErrorLabel('TransientTransactionError') && retryCount < MAX_RETRIES - 1) {
        retryCount++;
        console.warn(`⚠️ Transient error, retrying (${retryCount}/${MAX_RETRIES}):`, error.message);
        await new Promise(resolve => setTimeout(resolve, 100 * retryCount)); // Exponential backoff
        continue;
      }

      // Check if error is unknown commit result
      if (error.hasErrorLabel('UnknownTransactionCommitResult') && retryCount < MAX_RETRIES - 1) {
        retryCount++;
        console.warn(`⚠️ Unknown commit result, retrying (${retryCount}/${MAX_RETRIES}):`, error.message);
        continue;
      }

      // Permanent error - don't retry
      console.error('❌ Permanent transaction error:', error);
      throw error;
    } finally {
      await session.endSession();
    }
  }

  throw new AppError('Transaction failed after maximum retries', 500);
};

// Usage
exports.checkInWithRetry = async (data) => {
  return executeWithTransaction(async (session) => {
    // All operations here
    const attendance = await Attendance.create([data], { session });
    await AuditLog.create([logData], { session });
    return attendance[0];
  });
};
```

---

## 6. Concurrency & Performance

### 6.1 How Transactions Prevent Race Conditions

#### **Without Transaction:**

```javascript
// Request 1 (t=0ms)
const existing = await Attendance.findOne({ userId, date }); // null
// Request 2 (t=5ms) 
const existing = await Attendance.findOne({ userId, date }); // null

// Request 1 (t=10ms)
await Attendance.create({ userId, date }); // Creates record A

// Request 2 (t=12ms)
await Attendance.create({ userId, date }); // Creates record B 😱 DUPLICATE!
```

#### **With Transaction:**

```javascript
// Request 1 (t=0ms)
session1.startTransaction();
const existing = await Attendance.findOne({ userId, date }).session(session1);
// ✓ Acquires READ lock on query range

// Request 2 (t=5ms)
session2.startTransaction();
const existing = await Attendance.findOne({ userId, date }).session(session2);
// ⏳ WAITS for Request 1 to release lock

// Request 1 (t=10ms)
await Attendance.create([{ userId, date }], { session: session1 });
await session1.commitTransaction();
// ✓ Releases lock

// Request 2 (t=15ms)
// ✓ Now acquires lock and sees record created by Request 1
if (existing) throw new Error('Duplicate'); // Prevented! ✅
```

### 6.2 MongoDB Locking Levels

MongoDB uses **document-level locking** with transactions:

| Lock Type | When Acquired | Impact |
|-----------|---------------|--------|
| **Intent Shared (IS)** | Read operations | Other reads allowed, writes wait |
| **Intent Exclusive (IX)** | Write operations | Other writes wait, reads allowed |
| **Shared (S)** | Snapshot reads | Reads allowed, writes wait |
| **Exclusive (X)** | Write/Update/Delete | Everything waits |

**Key Points:**

- Locks are acquired at **document level**, not collection level
- Read operations acquire **shared locks** (multiple concurrent reads OK)
- Write operations acquire **exclusive locks** (blocks all other operations on that document)
- Locks are automatically released on commit/abort

### 6.3 Performance Best Practices

#### **✅ DO: Keep Transactions Short**

```javascript
// GOOD: Fast transaction (< 100ms)
session.startTransaction();
await Attendance.create([data], { session });
await AuditLog.create([log], { session });
await session.commitTransaction();
```

```javascript
// BAD: Slow transaction (> 5 seconds)
session.startTransaction();
await Attendance.create([data], { session });
await sendEmail(user.email); // ❌ External I/O
await uploadToS3(photo); // ❌ Network call
await sleep(3000); // ❌ Unnecessary delay
await session.commitTransaction();
```

**Why?**  
Long-running transactions:
- Hold locks longer → blocks other users
- Increase memory usage
- Higher chance of conflicts
- Risk of timeout

**Solution:**

```javascript
// Move external operations outside transaction
session.startTransaction();
const attendance = await Attendance.create([data], { session });
await session.commitTransaction();

// External operations after commit
await sendEmail(user.email);
await uploadToS3(photo);
```

#### **✅ DO: Batch Related Operations**

```javascript
// GOOD: Batch inserts
await AuditLog.create([
  { action: 'CHECK_IN', ... },
  { action: 'UPDATE_STATS', ... },
  { action: 'NOTIFY_MANAGER', ... }
], { session });
```

```javascript
// BAD: Individual inserts
await AuditLog.create([{ action: 'CHECK_IN' }], { session });
await AuditLog.create([{ action: 'UPDATE_STATS' }], { session });
await AuditLog.create([{ action: 'NOTIFY_MANAGER' }], { session });
```

#### **✅ DO: Use Indexes for Transaction Queries**

```javascript
// Attendance model with proper indexes
attendanceSchema.index({ userId: 1, date: 1 }, { unique: true });
attendanceSchema.index({ date: 1, status: 1 });
attendanceSchema.index({ userId: 1, createdAt: -1 });

// Fast query in transaction
await Attendance.findOne({ userId, date }).session(session);
// Uses index → fast → short lock duration
```

#### **❌ DON'T: Use Transactions for Read-Only Operations**

```javascript
// BAD: Unnecessary transaction overhead
session.startTransaction();
const attendances = await Attendance.find({ userId }).session(session);
await session.commitTransaction();

// GOOD: Direct read (no transaction needed)
const attendances = await Attendance.find({ userId });
```

### 6.4 When NOT to Use Transactions

| Scenario | Use Transaction? | Alternative |
|----------|------------------|-------------|
| Single document update | ❌ No | MongoDB's atomic operations |
| Read-only queries | ❌ No | Direct read queries |
| Long-running batch jobs | ❌ No | Process in chunks, idempotent design |
| External API calls | ❌ No | Use message queues (e.g., Bull, RabbitMQ) |
| File uploads | ❌ No | Upload first, then update DB |
| Generating reports | ❌ No | Use read replicas |

**Example: Single document update (no transaction needed)**

```javascript
// Atomic operation - no transaction required
await Attendance.findByIdAndUpdate(
  attendanceId,
  { $set: { notes: 'Updated notes' } },
  { new: true }
);
```

**Example: Long batch job (avoid transaction)**

```javascript
// BAD: All-or-nothing for 10,000 records
session.startTransaction();
for (let i = 0; i < 10000; i++) {
  await Attendance.create([data[i]], { session });
}
await session.commitTransaction(); // Likely to timeout!

// GOOD: Process in chunks with idempotency
for (let i = 0; i < 10000; i += 100) {
  const chunk = data.slice(i, i + 100);
  await Attendance.insertMany(chunk, { ordered: false });
  // Each chunk is independent, can retry individual chunks
}
```

---

## 7. Folder Structure & Integration

### 7.1 Recommended Architecture

```
src/
├── controllers/
│   ├── attendance.controller.js      # HTTP request handling
│   └── correction.controller.js
│
├── services/
│   ├── attendance.service.js         # Business logic + transactions
│   ├── correction.service.js
│   └── transaction.service.js        # Shared transaction utilities
│
├── models/
│   ├── attendance.model.js           # Mongoose schemas
│   ├── auditLog.model.js
│   ├── user.model.js
│   └── correctionRequest.model.js
│
├── middlewares/
│   ├── auth.middleware.js
│   ├── validation.middleware.js
│   └── errorHandler.middleware.js
│
├── utils/
│   ├── errors.js                     # Custom error classes
│   └── logger.js
│
└── config/
    ├── database.js                   # MongoDB connection
    └── env.js
```

### 7.2 Controller → Service → Model Pattern

#### **Step 1: Controller (HTTP Layer)**

```javascript
// controllers/attendance.controller.js
const attendanceService = require('../services/attendance.service');

exports.checkIn = async (req, res, next) => {
  try {
    // Extract and validate input
    const { userId } = req.user;
    const { location, deviceInfo } = req.body;

    // Delegate to service (no transaction logic here)
    const attendance = await attendanceService.checkIn({
      userId,
      location,
      deviceInfo
    });

    // Return response
    res.status(201).json({
      success: true,
      data: { attendance }
    });
  } catch (error) {
    next(error); // Error handling middleware
  }
};
```

#### **Step 2: Service (Business Logic + Transactions)**

```javascript
// services/attendance.service.js
const mongoose = require('mongoose');
const Attendance = require('../models/attendance.model');
const { executeWithTransaction } = require('./transaction.service');

exports.checkIn = async ({ userId, location, deviceInfo }) => {
  // All transaction logic lives here
  return executeWithTransaction(async (session) => {
    // Check duplicates
    const existing = await Attendance.findOne({ userId, date: today })
      .session(session);
    
    if (existing) {
      throw new AppError('Already checked in', 400);
    }

    // Create attendance
    const [attendance] = await Attendance.create([{
      userId,
      date: today,
      checkInTime: new Date(),
      location,
      deviceInfo
    }], { session });

    // Create audit log
    await AuditLog.create([{
      userId,
      action: 'CHECK_IN',
      resourceId: attendance._id
    }], { session });

    return attendance;
  });
};
```

#### **Step 3: Shared Transaction Utility**

```javascript
// services/transaction.service.js
const mongoose = require('mongoose');

/**
 * Execute callback within a transaction with retry logic
 */
exports.executeWithTransaction = async (callback, options = {}) => {
  const session = await mongoose.startSession();
  let retryCount = 0;
  const maxRetries = options.maxRetries || 3;

  while (retryCount < maxRetries) {
    try {
      const result = await session.withTransaction(callback, {
        readConcern: { level: 'snapshot' },
        writeConcern: { w: 'majority' },
        readPreference: 'primary',
        maxCommitTimeMS: options.timeout || 10000
      });

      return result;

    } catch (error) {
      if (shouldRetryTransaction(error) && retryCount < maxRetries - 1) {
        retryCount++;
        await sleep(100 * Math.pow(2, retryCount)); // Exponential backoff
        continue;
      }
      throw error;
    } finally {
      await session.endSession();
    }
  }
};

const shouldRetryTransaction = (error) => {
  return error.hasErrorLabel('TransientTransactionError') ||
         error.hasErrorLabel('UnknownTransactionCommitResult');
};

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
```

### 7.3 Integration Example

**Before (Without Transactions):**

```javascript
// ❌ Vulnerable to race conditions
exports.checkIn = async (req, res) => {
  const existing = await Attendance.findOne({ userId, date });
  if (existing) {
    return res.status(400).json({ error: 'Duplicate' });
  }
  
  const attendance = await Attendance.create({ userId, date });
  await AuditLog.create({ action: 'CHECK_IN' });
  
  res.json({ attendance });
};
```

**After (With Transactions):**

```javascript
// ✅ Safe from race conditions
exports.checkIn = async (req, res, next) => {
  try {
    const attendance = await attendanceService.checkIn({
      userId: req.user.userId,
      location: req.body.location
    });
    
    res.status(201).json({
      success: true,
      data: { attendance }
    });
  } catch (error) {
    next(error);
  }
};

// In service
exports.checkIn = async ({ userId, location }) => {
  return executeWithTransaction(async (session) => {
    const existing = await Attendance.findOne({ userId, date })
      .session(session);
    
    if (existing) throw new AppError('Duplicate', 400);
    
    const [attendance] = await Attendance.create([{ userId, date }], { session });
    await AuditLog.create([{ action: 'CHECK_IN' }], { session });
    
    return attendance;
  });
};
```

---

## 8. Edge Cases

### 8.1 Network Failure During Transaction

**Problem:**  
Client loses connection after transaction commits on server but before receiving response.

```javascript
session.startTransaction();
await Attendance.create([data], { session });
await session.commitTransaction(); // ✓ Commits on server
// Network drops here ❌
// Client never receives success response
```

**Solution: Idempotent Request Design**

```javascript
// Client sends unique request ID
POST /api/v1/attendance/check-in
{
  "userId": "user123",
  "requestId": "req_20250130_001", // Unique ID
  "location": "Office"
}

// Server checks for duplicate request ID
exports.checkIn = async ({ userId, requestId, location }) => {
  return executeWithTransaction(async (session) => {
    // Check if request already processed
    const processed = await ProcessedRequest.findOne({ requestId })
      .session(session);
    
    if (processed) {
      // Return existing result (idempotent)
      return processed.result;
    }

    // Process request
    const attendance = await Attendance.create([{
      userId,
      location,
      date: new Date()
    }], { session });

    // Mark request as processed
    await ProcessedRequest.create([{
      requestId,
      result: attendance,
      processedAt: new Date()
    }], { session });

    return attendance;
  });
};
```

**Cleanup old request IDs:**

```javascript
// Cron job to clean up old request IDs (> 24 hours)
cron.schedule('0 0 * * *', async () => {
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
  await ProcessedRequest.deleteMany({ processedAt: { $lt: yesterday } });
});
```

### 8.2 Partial Updates (Transaction Interrupted)

**Problem:**  
Transaction aborted midway due to timeout or error.

```javascript
session.startTransaction();
await Attendance.create([data], { session }); // ✓ Buffered
await AuditLog.create([log], { session });    // ✓ Buffered
await User.updateOne(..., { session });       // ❌ Timeout!
await session.commitTransaction();            // Never reached
```

**Result:**  
✅ All operations rolled back automatically  
✅ Database remains consistent  
❌ Client needs to know operation failed

**Solution: Proper Error Handling**

```javascript
exports.checkIn = async (data) => {
  try {
    return await executeWithTransaction(async (session) => {
      // All operations
    });
  } catch (error) {
    // Log failure
    logger.error('Check-in failed', {
      userId: data.userId,
      error: error.message,
      stack: error.stack
    });

    // Return user-friendly error
    if (error.name === 'MongoServerError' && error.code === 50) {
      throw new AppError('Transaction timeout - please try again', 408);
    }

    throw error;
  }
};
```

### 8.3 Retry Strategies

#### **Scenario 1: Transient Network Error**

```javascript
const executeWithRetry = async (callback, maxRetries = 3) => {
  let attempt = 0;

  while (attempt < maxRetries) {
    try {
      return await executeWithTransaction(callback);
    } catch (error) {
      attempt++;

      // Retry on transient errors
      if (error.hasErrorLabel('TransientTransactionError') && attempt < maxRetries) {
        console.warn(`Retry attempt ${attempt}/${maxRetries}`);
        await sleep(100 * Math.pow(2, attempt)); // Exponential backoff
        continue;
      }

      // Non-transient error - don't retry
      throw error;
    }
  }
};
```

#### **Scenario 2: Write Conflict**

```javascript
try {
  await executeWithTransaction(async (session) => {
    const attendance = await Attendance.findOne({ userId, date })
      .session(session);
    
    // Concurrent update detected
    if (attendance && attendance.__v !== expectedVersion) {
      throw new AppError('Record was modified by another user', 409);
    }

    // Update with version increment
    attendance.checkOutTime = new Date();
    attendance.__v += 1;
    await attendance.save({ session });
  });
} catch (error) {
  if (error.statusCode === 409) {
    // Inform user to refresh and retry
    return res.status(409).json({
      error: 'Conflict',
      message: 'Record was modified. Please refresh and try again.'
    });
  }
}
```

#### **Scenario 3: Deadlock**

```javascript
// Deadlock can occur with conflicting lock orders
// Transaction 1: Lock A → Lock B
// Transaction 2: Lock B → Lock A

// Solution: Always acquire locks in consistent order
exports.updateAttendanceAndUser = async ({ attendanceId, userId }) => {
  return executeWithTransaction(async (session) => {
    // ALWAYS query in same order: User first, then Attendance
    const user = await User.findById(userId).session(session);
    const attendance = await Attendance.findById(attendanceId).session(session);

    // Update both
    await user.save({ session });
    await attendance.save({ session });
  });
};
```

---

## 9. Best Practices

### 9.1 Logging Transactions

```javascript
// utils/logger.js
const winston = require('winston');

const logger = winston.createLogger({
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'transactions.log' })
  ]
});

// Service with logging
exports.checkIn = async (data) => {
  const transactionId = `txn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  logger.info('Transaction started', {
    transactionId,
    operation: 'checkIn',
    userId: data.userId
  });

  try {
    const result = await executeWithTransaction(async (session) => {
      logger.debug('Creating attendance record', { transactionId });
      const attendance = await Attendance.create([data], { session });
      
      logger.debug('Creating audit log', { transactionId });
      await AuditLog.create([logData], { session });
      
      return attendance[0];
    });

    logger.info('Transaction committed', {
      transactionId,
      attendanceId: result._id
    });

    return result;

  } catch (error) {
    logger.error('Transaction failed', {
      transactionId,
      error: error.message,
      stack: error.stack
    });
    
    throw error;
  }
};
```

### 9.2 Monitoring Transaction Failures

```javascript
// middlewares/metrics.middleware.js
const prometheus = require('prom-client');

const transactionCounter = new prometheus.Counter({
  name: 'mongodb_transactions_total',
  help: 'Total number of transactions',
  labelNames: ['operation', 'status']
});

const transactionDuration = new prometheus.Histogram({
  name: 'mongodb_transaction_duration_seconds',
  help: 'Transaction duration',
  labelNames: ['operation']
});

// Wrap transaction execution
exports.executeWithMetrics = async (operation, callback) => {
  const startTime = Date.now();

  try {
    const result = await executeWithTransaction(callback);
    
    transactionCounter.inc({ operation, status: 'success' });
    transactionDuration.observe({ operation }, (Date.now() - startTime) / 1000);
    
    return result;

  } catch (error) {
    transactionCounter.inc({ operation, status: 'failure' });
    throw error;
  }
};

// Usage
exports.checkIn = async (data) => {
  return executeWithMetrics('checkIn', async (session) => {
    // Transaction logic
  });
};
```

**Grafana Dashboard Queries:**

```promql
# Transaction success rate
rate(mongodb_transactions_total{status="success"}[5m]) / 
rate(mongodb_transactions_total[5m])

# Average transaction duration
rate(mongodb_transaction_duration_seconds_sum[5m]) / 
rate(mongodb_transaction_duration_seconds_count[5m])

# Failed transactions
sum(rate(mongodb_transactions_total{status="failure"}[5m])) by (operation)
```

### 9.3 Writing Idempotent APIs

**Idempotent** = Same request multiple times produces same result without side effects

```javascript
// Non-idempotent (BAD)
POST /api/v1/attendance/check-in
{
  "userId": "user123"
}
// Calling twice creates two records ❌

// Idempotent (GOOD)
POST /api/v1/attendance/check-in
{
  "userId": "user123",
  "date": "2025-01-30",
  "idempotencyKey": "req_user123_20250130"
}
// Calling twice returns same record ✅

// Implementation
exports.checkIn = async ({ userId, date, idempotencyKey }) => {
  return executeWithTransaction(async (session) => {
    // Check if request already processed
    const existing = await IdempotencyRecord.findOne({ 
      key: idempotencyKey 
    }).session(session);

    if (existing) {
      // Return cached result
      return existing.result;
    }

    // Check for existing attendance
    const attendance = await Attendance.findOne({ userId, date })
      .session(session);

    if (attendance) {
      // Store in idempotency cache
      await IdempotencyRecord.create([{
        key: idempotencyKey,
        result: attendance,
        createdAt: new Date()
      }], { session });

      return attendance;
    }

    // Create new attendance
    const [newAttendance] = await Attendance.create([{
      userId,
      date,
      checkInTime: new Date()
    }], { session });

    // Store in idempotency cache
    await IdempotencyRecord.create([{
      key: idempotencyKey,
      result: newAttendance,
      createdAt: new Date()
    }], { session });

    return newAttendance;
  });
};
```

**Cleanup Strategy:**

```javascript
// Auto-expire idempotency records after 24 hours
const idempotencySchema = new Schema({
  key: { type: String, required: true, unique: true },
  result: Schema.Types.Mixed,
  createdAt: { type: Date, default: Date.now, expires: 86400 } // 24h TTL
});
```

### 9.4 Transaction Configuration

```javascript
// config/transaction.config.js
module.exports = {
  development: {
    readConcern: { level: 'snapshot' },
    writeConcern: { w: 'majority', wtimeout: 5000 },
    readPreference: 'primary',
    maxCommitTimeMS: 30000,
    maxRetries: 3
  },
  
  production: {
    readConcern: { level: 'snapshot' },
    writeConcern: { w: 'majority', wtimeout: 3000 },
    readPreference: 'primary',
    maxCommitTimeMS: 15000,
    maxRetries: 5
  },

  test: {
    readConcern: { level: 'local' },
    writeConcern: { w: 1 },
    readPreference: 'primary',
    maxCommitTimeMS: 10000,
    maxRetries: 1
  }
};

// Usage
const config = require('./config/transaction.config')[process.env.NODE_ENV];

session.startTransaction(config);
```

---

## 10. Summary

### 10.1 Key Takeaways

✅ **Transactions guarantee ACID properties**  
- Atomicity: All or nothing  
- Consistency: Valid state transitions  
- Isolation: Concurrent safety  
- Durability: Permanent commits

✅ **Essential for multi-step operations**  
- Check-in + audit log  
- Check-out + hours calculation  
- Correction approval + attendance update

✅ **Prevents common concurrency issues**  
- Duplicate attendance records  
- Partial updates  
- Data inconsistencies

✅ **MongoDB requires replica sets**  
- Local: Docker Compose or single-node replica set  
- Production: MongoDB Atlas (built-in)

✅ **Use Mongoose sessions properly**  
- Pass session to ALL operations  
- Always end session in finally block  
- Use withTransaction() for automatic retries

✅ **Keep transactions short**  
- < 100ms ideal  
- < 1 second acceptable  
- > 5 seconds problematic

✅ **Implement proper error handling**  
- Retry transient errors  
- Log all failures  
- Return user-friendly messages

✅ **Design for idempotency**  
- Use unique request IDs  
- Cache processed requests  
- Handle duplicate calls gracefully

### 10.2 When Transactions Add Real Value in Anti-Gravity

| Feature | Without Transactions | With Transactions | Value |
|---------|---------------------|-------------------|-------|
| **Check-in** | Duplicate records possible | Guaranteed unique per day | 🔒 Data integrity |
| **Check-out** | Hours calculated but audit log fails | Hours + audit atomic | 📊 Consistency |
| **Correction Approval** | Attendance updated but request still pending | Both updated together | ✅ Workflow integrity |
| **Bulk Import** | Partial imports on failure | All or nothing | 🎯 Clean rollback |
| **Concurrent Requests** | Race conditions | Serialized execution | 🚦 Concurrency safety |

### 10.3 Quick Decision Tree

```
Should I use a transaction?

├─ Single document operation?
│  └─ NO → Use atomic operators ($set, $inc, etc.)
│
├─ Read-only query?
│  └─ NO → Direct query, no transaction
│
├─ Multiple documents need to stay consistent?
│  └─ YES → Use transaction
│
├─ External API calls involved?
│  └─ NO → Do external calls AFTER transaction
│
└─ Operation takes > 5 seconds?
   └─ NO → Break into smaller chunks or use job queue
```

---

## 11. Implementation Checklist

### Before You Start

Use this checklist to determine which service functions need transaction support:

#### **Step 1: Identify Service Functions**

List all service functions in your Attendance Management System:

```
Services to Review:
□ attendance.service.js
  □ checkIn()
  □ checkOut()
  □ updateAttendance()
  □ deleteAttendance()
  □ bulkImport()

□ correction.service.js
  □ createCorrectionRequest()
  □ approveCorrectionRequest()
  □ rejectCorrectionRequest()

□ report.service.js
  □ generateMonthlyReport()
  □ calculateStatistics()

□ user.service.js
  □ updateUserProfile()
  □ resetAttendance()
```

#### **Step 2: Transaction Need Assessment**

For each function, answer these questions:

| Question | Yes | No | Action |
|----------|-----|----|----|---|
| Does it modify multiple documents? | ✓ | | **Use transaction** |
| Does it create related records (e.g., attendance + log)? | ✓ | | **Use transaction** |
| Could concurrent requests cause duplicates? | ✓ | | **Use transaction** |
| Does it only read data? | | ✓ | **No transaction** |
| Does it update a single document? | | ✓ | **No transaction** (atomic) |
| Does it involve external API calls? | | ✓ | **API calls outside transaction** |

#### **Step 3: Implementation Priority**

Mark functions by priority:

**🔴 Critical (Implement First):**
- [ ] `checkIn()` - Prevents duplicate attendance
- [ ] `checkOut()` - Ensures hours + audit consistency
- [ ] `approveCorrectionRequest()` - Maintains approval workflow integrity

**🟡 Important (Implement Next):**
- [ ] `createCorrectionRequest()` - Links request to attendance
- [ ] `bulkImport()` - All-or-nothing import
- [ ] `rejectCorrectionRequest()` - Updates status + logs

**🟢 Optional (Nice to Have):**
- [ ] `updateAttendance()` - If modifying related data
- [ ] `deleteAttendance()` - If cascading deletes needed

#### **Step 4: Implementation Template**

For each function marked for transaction support:

```javascript
// BEFORE (No Transaction)
exports.functionName = async (params) => {
  // Business logic
  const result = await Model.create(data);
  await AuditLog.create(log);
  return result;
};

// AFTER (With Transaction)
exports.functionName = async (params) => {
  return executeWithTransaction(async (session) => {
    // Same business logic with .session(session)
    const result = await Model.create([data], { session });
    await AuditLog.create([log], { session });
    return result[0];
  });
};
```

#### **Step 5: Testing Checklist**

For each implemented transaction:

**Unit Tests:**
- [ ] Success case: All operations commit
- [ ] Failure case: All operations rollback
- [ ] Duplicate prevention: Same request twice
- [ ] Concurrent requests: Race condition handling

**Integration Tests:**
- [ ] Network failure during commit
- [ ] Timeout handling
- [ ] Retry logic verification

**Load Tests:**
- [ ] 100 concurrent check-ins
- [ ] Transaction duration < 100ms
- [ ] No deadlocks under load

---

## 📖 Additional Resources

- **MongoDB Transactions Documentation**: https://www.mongodb.com/docs/manual/core/transactions/
- **Mongoose Transactions Guide**: https://mongoosejs.com/docs/transactions.html
- **ACID Properties Explained**: https://en.wikipedia.org/wiki/ACID
- **Anti-Gravity Support**: Contact backend team at backend@antigravity.com

---

## 🎯 Next Steps

1. **Review your codebase** using the Implementation Checklist
2. **Identify high-risk functions** (check-in, check-out, approvals)
3. **Set up replica set** in development environment
4. **Implement transactions** starting with critical functions
5. **Write comprehensive tests** for each transaction
6. **Monitor in production** using logging and metrics
7. **Iterate and optimize** based on performance data

---

**Document Version:** 1.0  
**Last Updated:** January 30, 2025  
**Maintained By:** Anti-Gravity Backend Team  
**Review Cycle:** Quarterly