import mongoose, { Schema } from "mongoose";

const AuditLogSchema = new Schema(
  {
    action: { type: String, required: true, index: true },
    performedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    targetUser: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    // Resource tracking - what entity was affected
    resource: {
      type: String,
      enum: ["Attendance", "Task", "User", "Other"],
      index: true,
    },
    resourceId: {
      type: Schema.Types.ObjectId,
    },
    metadata: Schema.Types.Mixed,
    ip: String,
  },
  { timestamps: true }
);

// Compound indexes for common queries
AuditLogSchema.index({ performedBy: 1, createdAt: -1 });
AuditLogSchema.index({ resource: 1, resourceId: 1 });
AuditLogSchema.index({ action: 1, createdAt: -1 });

export const AuditLog = mongoose.model("AuditLog", AuditLogSchema);

