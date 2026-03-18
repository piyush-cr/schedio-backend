// ApiError.ts
export class ApiError extends Error {
  public statusCode: number;
  public success: boolean;
  public errors?: unknown[];  // ✅ Added optional errors field

  constructor(message: string, statusCode: number = 500, errors?: unknown[]) {
    super(message);
    this.statusCode = statusCode;
    this.success = false;
    this.errors = errors;  // ✅ Now actually stored

    Error.captureStackTrace(this, this.constructor);
  }
}