export class ApiError extends Error {
  public statusCode: number;
  public success: boolean;
  public errors?: unknown[];

  constructor(message: string, statusCode: number = 500, errors?: unknown[]) {
    super(message);
    this.statusCode = statusCode;
    this.success = false;
    this.errors = errors;

    Error.captureStackTrace(this, this.constructor);
  }
}

export class BadRequestError extends ApiError {
  constructor(message: string = "Bad request", errors?: unknown[]) {
    super(message, 400, errors);
  }
}

export class UnauthorizedError extends ApiError {
  constructor(message: string = "Unauthorized", errors?: unknown[]) {
    super(message, 401, errors);
  }
}

export class ForbiddenError extends ApiError {
  constructor(message: string = "Forbidden", errors?: unknown[]) {
    super(message, 403, errors);
  }
}

export class NotFoundError extends ApiError {
  constructor(message: string = "Resource not found", errors?: unknown[]) {
    super(message, 404, errors);
  }
}

export class ConflictError extends ApiError {
  constructor(message: string = "Conflict", errors?: unknown[]) {
    super(message, 409, errors);
  }
}
