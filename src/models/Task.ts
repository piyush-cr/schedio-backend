import mongoose, { Schema, InferSchemaType } from "mongoose";
import { Priority, TaskStatus } from "../types";

const SubTaskSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },

    isCompleted: { type: Boolean, default: false },
    completedAt: { type: Date, default: null },

    assignedToId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    assignedById: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
  },
  { _id: true, timestamps: true }
);

const TaskSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, default: "", trim: true },

    assignedToId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    assignedById: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    subTasks: {
      type: [SubTaskSchema],
      default: [],
    },

    priority: {
      type: String,
      enum: Object.values(Priority),
      default: Priority.LOW,
      index: true,
    },
    status: {
      type: String,
      enum: Object.values(TaskStatus),
      default: TaskStatus.TODO,
      index: true,
    },

    deadline: {
      type: String,
      required: true,
    },

    deletedAt: {
      type: Date,
      default: null,
      index: true,
    },
  },
  { timestamps: true }
);


// Task level
TaskSchema.index({ assignedToId: 1, status: 1 });
TaskSchema.index({ assignedById: 1, status: 1 });
TaskSchema.index({ deadline: 1, status: 1 });

// Subtask performance
TaskSchema.index({ "subTasks._id": 1 });
TaskSchema.index({ "subTasks.assignedToId": 1 });
TaskSchema.index({ "subTasks.isCompleted": 1 });

export const Taskmodel = mongoose.model("task", TaskSchema)