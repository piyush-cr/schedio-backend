import z from 'zod';
import mongoose from 'mongoose';

/**
 * Common validation schemas for reuse across the application
 */

/**
 * Pagination query parameters
 */
export const paginationSchema = z.object({
  page: z.preprocess(
    (val) => (val === '' || val === null || val === undefined ? undefined : Number(val)),
    z.number().positive().default(1)
  ),
  limit: z.preprocess(
    (val) => (val === '' || val === null || val === undefined ? undefined : Number(val)),
    z.number().positive().max(100).default(20)
  ),
});

/**
 * MongoDB ObjectId validation
 */
export const objectIdSchema = z.string().refine(
  (val) => mongoose.Types.ObjectId.isValid(val),
  { message: 'Invalid MongoDB ObjectId' }
);

/**
 * ID parameter schema (for route params like :id, :userId, :taskId)
 */
export const idParamSchema = z.object({
  id: objectIdSchema,
});

/**
 * User ID parameter schema
 */
export const userIdParamSchema = z.object({
  userId: objectIdSchema,
});

/**
 * Task ID parameter schema
 */
export const taskIdParamSchema = z.object({
  taskId: objectIdSchema,
});

/**
 * Date string validation (YYYY-MM-DD format)
 */
export const dateStringSchema = z.string().regex(
  /^\d{4}-\d{2}-\d{2}$/,
  { message: 'Date must be in YYYY-MM-DD format' }
).refine(
  (val) => !isNaN(Date.parse(val)),
  { message: 'Invalid date' }
);

/**
 * Date query parameters (for filtering by date range)
 */
export const dateQuerySchema = z.object({
  date: dateStringSchema.optional(),
  startDate: dateStringSchema.optional(),
  endDate: dateStringSchema.optional(),
});

/**
 * Month and year query parameters
 */
export const monthYearQuerySchema = z.object({
  month: z.preprocess(
    (val) => (val === '' || val === null || val === undefined ? undefined : Number(val)),
    z.number().min(1).max(12).optional()
  ),
  year: z.preprocess(
    (val) => (val === '' || val === null || val === undefined ? undefined : Number(val)),
    z.number().min(1900).max(2100).optional()
  ),
});

/**
 * Week start date query parameter
 */
export const weekStartQuerySchema = z.object({
  weekStart: dateStringSchema.optional(),
});

/**
 * Search query parameter
 */
export const searchQuerySchema = z.object({
  search: z.string().trim().optional(),
});

/**
 * Combined common query params for list endpoints
 */
export const listQuerySchema = paginationSchema
  .merge(searchQuerySchema)
  .extend({
    status: z.string().optional(),
    priority: z.string().optional(),
    role: z.string().optional(),
    teamId: z.string().optional(),
  });

/**
 * Attendance-specific query schema
 */
export const attendanceQuerySchema = listQuerySchema
  .merge(dateQuerySchema)
  .merge(monthYearQuerySchema)
  .merge(weekStartQuerySchema);

/**
 * Task-specific query schema
 */
export const taskQuerySchema = listQuerySchema.extend({
  assignedToId: objectIdSchema.optional(),
  assignedById: objectIdSchema.optional(),
  deadline: dateStringSchema.optional(),
});
