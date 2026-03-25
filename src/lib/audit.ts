/**
 * Audit logging for Lincoln
 *
 * HIPAA requires an audit trail for all access to PHI/PII.
 * Every read, write, and delete of sensitive data should be logged.
 * Audit log records are immutable (no update/delete operations).
 */

import { AuditAction } from "@prisma/client";
import { db } from "./db";

export interface AuditContext {
  tenantId?: string;
  userId?: string;
  clientId?: string;
  matterId?: string;
  documentId?: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface AuditEntry extends AuditContext {
  action: AuditAction;
  entityType?: string;
  entityId?: string;
  description?: string;
  success?: boolean;
  errorMessage?: string;
}

/**
 * Write an audit log entry. Non-throwing — errors are caught and reported
 * to stderr so that a logging failure never blocks the main operation.
 */
export async function writeAuditLog(entry: AuditEntry): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        tenantId: entry.tenantId,
        userId: entry.userId,
        clientId: entry.clientId,
        matterId: entry.matterId,
        documentId: entry.documentId,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        description: entry.description,
        ipAddress: entry.ipAddress,
        userAgent: entry.userAgent,
        success: entry.success ?? true,
        errorMessage: entry.errorMessage,
      },
    });
  } catch (err) {
    // Never throw from audit logging — it must not break application flow
    console.error("[AUDIT] Failed to write audit log:", err);
  }
}

/**
 * Convenience wrappers for common audit events
 */
export const audit = {
  login: (ctx: AuditContext) =>
    writeAuditLog({ ...ctx, action: AuditAction.LOGIN }),

  loginFailed: (ctx: AuditContext, description?: string) =>
    writeAuditLog({
      ...ctx,
      action: AuditAction.LOGIN_FAILED,
      success: false,
      description,
    }),

  logout: (ctx: AuditContext) =>
    writeAuditLog({ ...ctx, action: AuditAction.LOGOUT }),

  matterAccessed: (ctx: AuditContext, matterId: string, title?: string) =>
    writeAuditLog({
      ...ctx,
      matterId,
      action: AuditAction.MATTER_ACCESSED,
      entityType: "Matter",
      entityId: matterId,
      description: title ? `Accessed matter: ${title}` : undefined,
    }),

  matterCreated: (ctx: AuditContext, matterId: string, title: string) =>
    writeAuditLog({
      ...ctx,
      matterId,
      action: AuditAction.MATTER_CREATED,
      entityType: "Matter",
      entityId: matterId,
      description: `Created matter: ${title}`,
    }),

  matterUpdated: (ctx: AuditContext, matterId: string, changes?: string) =>
    writeAuditLog({
      ...ctx,
      matterId,
      action: AuditAction.MATTER_UPDATED,
      entityType: "Matter",
      entityId: matterId,
      description: changes ? `Updated matter: ${changes}` : undefined,
    }),

  clientAccessed: (ctx: AuditContext, clientId: string) =>
    writeAuditLog({
      ...ctx,
      clientId,
      action: AuditAction.CLIENT_ACCESSED,
      entityType: "Client",
      entityId: clientId,
    }),

  clientCreated: (ctx: AuditContext, clientId: string, name: string) =>
    writeAuditLog({
      ...ctx,
      clientId,
      action: AuditAction.CLIENT_CREATED,
      entityType: "Client",
      entityId: clientId,
      description: `Created client: ${name}`,
    }),

  documentUploaded: (
    ctx: AuditContext,
    documentId: string,
    fileName: string
  ) =>
    writeAuditLog({
      ...ctx,
      documentId,
      action: AuditAction.DOCUMENT_UPLOADED,
      entityType: "Document",
      entityId: documentId,
      description: `Uploaded: ${fileName}`,
    }),

  documentDownloaded: (
    ctx: AuditContext,
    documentId: string,
    fileName: string
  ) =>
    writeAuditLog({
      ...ctx,
      documentId,
      action: AuditAction.DOCUMENT_DOWNLOADED,
      entityType: "Document",
      entityId: documentId,
      description: `Downloaded: ${fileName}`,
    }),

  documentDeleted: (ctx: AuditContext, documentId: string, fileName: string) =>
    writeAuditLog({
      ...ctx,
      documentId,
      action: AuditAction.DOCUMENT_DELETED,
      entityType: "Document",
      entityId: documentId,
      description: `Deleted: ${fileName}`,
    }),

  passwordChanged: (ctx: AuditContext) =>
    writeAuditLog({ ...ctx, action: AuditAction.PASSWORD_CHANGED }),

  mfaEnabled: (ctx: AuditContext) =>
    writeAuditLog({ ...ctx, action: AuditAction.MFA_ENABLED }),

  intakeSubmitted: (ctx: AuditContext, intakeId: string) =>
    writeAuditLog({
      ...ctx,
      action: AuditAction.INTAKE_SUBMITTED,
      entityType: "IntakeForm",
      entityId: intakeId,
    }),

  messageSent: (ctx: AuditContext, messageId: string) =>
    writeAuditLog({
      ...ctx,
      action: AuditAction.MESSAGE_SENT,
      entityType: "Message",
      entityId: messageId,
    }),
};
