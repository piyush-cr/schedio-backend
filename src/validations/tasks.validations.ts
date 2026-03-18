import z from "zod";
import { Priority, TaskStatus } from "../types";

export const createTaskSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  assignedToId: z.string().min(1, "Assigned to ID is required"),
  priority: z.nativeEnum(Priority).optional().default(Priority.LOW),
  deadline: z.string().optional().refine((val) => !val || !isNaN(Date.parse(val)) || !isNaN(Number(val)), {
    message: "Invalid date format for deadline",
  }).transform((val) => {
    if (!val) return val;
    const date = isNaN(Number(val)) ? new Date(val) : new Date(Number(val));
    return date.toISOString();
  }),
  parentTaskId: z.string().optional(),
}).superRefine((data, ctx) => {
  if (!data.parentTaskId && !data.deadline) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Deadline is required for normal tasks",
      path: ["deadline"],
    });
  }
});

export const updateTaskSchema = z.object({
  title: z.string().min(1, "Title cannot be empty").optional(),
  description: z.string().optional(),
  status: z.nativeEnum(TaskStatus).optional(),
  priority: z.nativeEnum(Priority).optional(),
  deadline: z.string().optional().refine((val) => !val || !isNaN(Date.parse(val)) || !isNaN(Number(val)), {
    message: "Invalid date format for deadline",
  }).transform((val) => {
    if (!val) return val;
    const date = isNaN(Number(val)) ? new Date(val) : new Date(Number(val));
    return date.toISOString();
  }),
  assignedToId: z.string().optional(),
  subTaskId: z.string().optional(),
  isCompleted: z.boolean().optional(),
});
