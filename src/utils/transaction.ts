import mongoose, { ClientSession } from "mongoose";

/**
 * Transaction options for MongoDB operations
 */
export interface TransactionOptions {
  maxRetries?: number;
  timeoutMs?: number;
}

/**
 * Result of a transaction execution
 */
export interface TransactionResult<T> {
  success: boolean;
  data?: T;
  error?: Error;
}

/**
 * Execute a callback function within a MongoDB transaction with automatic retry logic
 * 
 * @param callback - Async function that receives a session and performs database operations
 * @param options - Transaction configuration options
 * @returns Promise resolving to the callback result
 * 
 * @example
 * ```typescript
 * const result = await executeWithTransaction(async (session) => {
 *   const attendance = await Attendance.create([data], { session });
 *   await AuditLog.create([logData], { session });
 *   return attendance[0];
 * });
 * ```
 */
export async function executeWithTransaction<T>(
  callback: (session: ClientSession) => Promise<T>,
  options: TransactionOptions = {}
): Promise<T> {
  // Check if transactions are implicitly disabled
  if (process.env.TRANSACTIONS_ENABLED === 'false') {
    return callback(undefined as any);
  }

  const { maxRetries = 3, timeoutMs = 30000 } = options;
  const session = await mongoose.startSession();
  let retryCount = 0;

  while (retryCount < maxRetries) {
    try {
      // Start transaction with recommended settings
      session.startTransaction({
        readConcern: { level: "snapshot" },
        writeConcern: { w: "majority" },
        maxCommitTimeMS: timeoutMs,
      });

      // Execute callback with session
      const result = await callback(session);

      // Commit transaction
      await session.commitTransaction();
      await session.endSession();

      return result;
    } catch (error: any) {
      // Abort transaction on any error
      await session.abortTransaction();
      
      // Fallback for standalone instances if transaction fails immediately
      if (
        error.message.includes("Transaction numbers are only allowed on a replica set") ||
        error.message.includes("standalone")
      ) {
         console.warn("⚠️ Transaction not supported (standalone Mongo), executing callback without transaction.");
         await session.endSession();
         return callback(undefined as any);
      }

      // Check if error is transient (can be retried)
      if (
        error.hasErrorLabel &&
        error.hasErrorLabel("TransientTransactionError") &&
        retryCount < maxRetries - 1
      ) {
        retryCount++;
        console.warn(
          `⚠️ Transient transaction error, retrying (${retryCount}/${maxRetries}):`,
          error.message
        );
        // Exponential backoff
        await new Promise((resolve) =>
          setTimeout(resolve, 100 * Math.pow(2, retryCount))
        );
        continue;
      }

      // Check if commit result is unknown (can be retried)
      if (
        error.hasErrorLabel &&
        error.hasErrorLabel("UnknownTransactionCommitResult") &&
        retryCount < maxRetries - 1
      ) {
        retryCount++;
        console.warn(
          `⚠️ Unknown transaction commit result, retrying (${retryCount}/${maxRetries}):`,
          error.message
        );
        await new Promise((resolve) =>
          setTimeout(resolve, 100 * Math.pow(2, retryCount))
        );
        continue;
      }

      // End session and throw permanent errors
      await session.endSession();
      console.error("❌ Transaction failed:", error.message);
      throw error;
    }
  }

  await session.endSession();
  throw new Error("Transaction failed after maximum retries");
}

/**
 * Create an audit log entry (helper for use within transactions)
 * 
 * @param data - Audit log data
 * @param session - MongoDB session (optional, but required for transactional operations)
 * @returns Promise resolving to created audit log
 * 
 * @example
 * ```typescript
 * await createAuditLogEntry({
 *   action: 'CHECK_IN',
 *   performedBy: userId,
 *   resource: 'Attendance',
 *   resourceId: attendance._id,
 *   metadata: { location, deviceInfo }
 * }, session);
 * ```
 */
export async function createAuditLogEntry(
  data: {
    action: string;
    performedBy: mongoose.Types.ObjectId | string;
    targetUser?: mongoose.Types.ObjectId | string;
    resource?: string;
    resourceId?: mongoose.Types.ObjectId | string;
    metadata?: any;
    ip?: string;
  },
  session?: ClientSession
) {
  const { AuditLog } = await import("../models/AuditLog");

  const auditData = {
    action: data.action,
    performedBy:
      typeof data.performedBy === "string"
        ? new mongoose.Types.ObjectId(data.performedBy)
        : data.performedBy,
    targetUser: data.targetUser
      ? typeof data.targetUser === "string"
        ? new mongoose.Types.ObjectId(data.targetUser)
        : data.targetUser
      : undefined,
    resource: data.resource,
    resourceId: data.resourceId
      ? typeof data.resourceId === "string"
        ? new mongoose.Types.ObjectId(data.resourceId)
        : data.resourceId
      : undefined,
    metadata: data.metadata || {},
    ip: data.ip,
  };

  if (session) {
    const [auditLog] = await AuditLog.create([auditData], { session });
    return auditLog;
  } else {
    return await AuditLog.create(auditData);
  }
}

/**
 * Wrap a session-aware operation with proper error handling
 * Used when you want to use a transaction but maintain backwards compatibility
 * 
 * @param operation - Function that accepts an optional session
 * @param useTransaction - Whether to use a transaction (default: true)
 * @returns Promise resolving to operation result
 */
export async function withOptionalTransaction<T>(
  operation: (session?: ClientSession) => Promise<T>,
  useTransaction: boolean = true
): Promise<T> {
  if (useTransaction) {
    return executeWithTransaction((session) => operation(session));
  } else {
    return operation();
  }
}
