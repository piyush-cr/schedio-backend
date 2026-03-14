import mongoose, { ClientSession } from "mongoose";

export interface TransactionOptions {
  maxRetries?: number;
  timeoutMs?: number;
}

export interface TransactionResult<T> {
  success: boolean;
  data?: T;
  error?: Error;
}

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
         await session.endSession();
         return callback(undefined as any);
      }

      if (
        error.hasErrorLabel &&
        error.hasErrorLabel("TransientTransactionError") &&
        retryCount < maxRetries - 1
      ) {
        retryCount++;
        await new Promise((resolve) =>
          setTimeout(resolve, 100 * Math.pow(2, retryCount))
        );
        continue;
      }

      if (
        error.hasErrorLabel &&
        error.hasErrorLabel("UnknownTransactionCommitResult") &&
        retryCount < maxRetries - 1
      ) {
        retryCount++;
        await new Promise((resolve) =>
          setTimeout(resolve, 100 * Math.pow(2, retryCount))
        );
        continue;
      }

      await session.endSession();
      throw error;
    }
  }

  await session.endSession();
  throw new Error("Transaction failed after maximum retries");
}

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

export async function createAuditLogEntry(
  data: any,
  session?: ClientSession
): Promise<void> {
  const auditLogCrud = (await import("../crud/auditLog.crud")).default;
  await auditLogCrud.create(data, session);
}
