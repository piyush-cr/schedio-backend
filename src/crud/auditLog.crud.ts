import mongoose, { ClientSession } from "mongoose";
import { AuditLog, IAuditLog } from "../models/AuditLog";

export interface CreateAuditLogInput {
  action: string;
  performedBy: string | mongoose.Types.ObjectId;
  targetUser?: string | mongoose.Types.ObjectId;
  resource?: string;
  resourceId?: string | mongoose.Types.ObjectId;
  metadata?: any;
  ip?: string;
}

async function create(
  data: CreateAuditLogInput,
  session?: ClientSession
): Promise<IAuditLog> {
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
    return auditLog.toObject();
  } else {
    const auditLog = await AuditLog.create(auditData);
    return auditLog.toObject();
  }
}

const auditLogCrud = {
  create,
};

export default auditLogCrud;
