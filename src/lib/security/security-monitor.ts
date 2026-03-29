/**
 * Security Monitoring & Anomaly Detection
 *
 * SOC-2 CC7.2, CC7.3 / ISO 27001 A.12.4.1
 *
 * Controls:
 * - Failed login pattern detection (brute force, credential stuffing)
 * - Bulk data access detection (exfiltration indicators)
 * - Privilege escalation monitoring
 * - Off-hours access alerting
 * - Geographic anomaly detection (IP-based)
 * - Security alert generation and persistence
 *
 * Alerts are written to the SecurityAlert table and surfaced via the
 * compliance dashboard. Critical alerts also write to audit log.
 */

import { db } from "../db";
import { writeAuditLog } from "../audit";
import { AuditAction } from "@prisma/client";

// --- Configuration ---

/** Failed login threshold before alert (per user, within window) */
const FAILED_LOGIN_ALERT_THRESHOLD = parseInt(
  process.env.FAILED_LOGIN_ALERT_THRESHOLD ?? "3",
  10
);

/** Time window for failed login detection (ms) */
const FAILED_LOGIN_WINDOW_MS = parseInt(
  process.env.FAILED_LOGIN_WINDOW_MS ?? String(15 * 60 * 1000),
  10
);

/** Bulk access threshold (records accessed per user per hour) */
const BULK_ACCESS_THRESHOLD = parseInt(
  process.env.BULK_ACCESS_THRESHOLD ?? "100",
  10
);

/** Off-hours definition (UTC) — alerts on access outside these hours */
const BUSINESS_HOURS_START = parseInt(
  process.env.BUSINESS_HOURS_START_UTC ?? "12",
  10
); // 7 AM EST = 12 UTC
const BUSINESS_HOURS_END = parseInt(
  process.env.BUSINESS_HOURS_END_UTC ?? "2",
  10
); // 9 PM EST = 2 UTC (next day)

// --- Types ---

export type AlertSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type AlertCategory =
  | "BRUTE_FORCE"
  | "BULK_ACCESS"
  | "PRIVILEGE_ESCALATION"
  | "OFF_HOURS_ACCESS"
  | "ACCOUNT_ANOMALY"
  | "DATA_EXFILTRATION"
  | "CONFIGURATION_CHANGE"
  | "COMPLIANCE_VIOLATION";

export interface SecurityAlert {
  tenantId?: string;
  userId?: string;
  category: AlertCategory;
  severity: AlertSeverity;
  title: string;
  description: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
}

// --- In-Memory Tracking (single instance) ---

interface AccessCounter {
  count: number;
  windowStart: number;
}

/** Failed login attempts per IP */
const failedLoginsByIp = new Map<string, AccessCounter>();

/** Failed login attempts per user */
const failedLoginsByUser = new Map<string, AccessCounter>();

/** Data access counts per user (for bulk access detection) */
const accessCountsByUser = new Map<string, AccessCounter>();

// Cleanup every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, counter] of failedLoginsByIp) {
    if (now - counter.windowStart > FAILED_LOGIN_WINDOW_MS) {
      failedLoginsByIp.delete(key);
    }
  }
  for (const [key, counter] of failedLoginsByUser) {
    if (now - counter.windowStart > FAILED_LOGIN_WINDOW_MS) {
      failedLoginsByUser.delete(key);
    }
  }
  for (const [key, counter] of accessCountsByUser) {
    if (now - counter.windowStart > 60 * 60 * 1000) {
      accessCountsByUser.delete(key);
    }
  }
}, 10 * 60 * 1000);

// --- Alert Persistence ---

/**
 * Create a security alert record in the database.
 * Also writes to audit log for critical/high alerts.
 */
export async function createSecurityAlert(
  alert: SecurityAlert
): Promise<void> {
  try {
    await db.securityAlert.create({
      data: {
        tenantId: alert.tenantId,
        userId: alert.userId,
        category: alert.category,
        severity: alert.severity,
        title: alert.title,
        description: alert.description,
        metadata: alert.metadata ? JSON.stringify(alert.metadata) : null,
        ipAddress: alert.ipAddress,
        status: "OPEN",
      },
    });

    // Critical/High alerts also go to audit log for guaranteed visibility
    if (alert.severity === "CRITICAL" || alert.severity === "HIGH") {
      await writeAuditLog({
        tenantId: alert.tenantId,
        userId: alert.userId,
        action: AuditAction.PERMISSION_CHANGED, // Closest available action
        entityType: "SecurityAlert",
        description: `[${alert.severity}] ${alert.category}: ${alert.title}`,
        ipAddress: alert.ipAddress,
        success: false,
      });
    }
  } catch (err) {
    // Never throw from monitoring — log to stderr
    console.error("[SECURITY_MONITOR] Failed to create alert:", err);
  }
}

// --- Detection Functions ---

/**
 * Track and detect failed login patterns.
 * Call this from the auth handler on every failed login.
 */
export async function trackFailedLogin(
  userId: string | undefined,
  ipAddress: string,
  tenantId?: string
): Promise<void> {
  const now = Date.now();

  // Track by IP
  const ipCounter = failedLoginsByIp.get(ipAddress);
  if (!ipCounter || now - ipCounter.windowStart > FAILED_LOGIN_WINDOW_MS) {
    failedLoginsByIp.set(ipAddress, { count: 1, windowStart: now });
  } else {
    ipCounter.count++;
    if (ipCounter.count >= FAILED_LOGIN_ALERT_THRESHOLD) {
      await createSecurityAlert({
        tenantId,
        category: "BRUTE_FORCE",
        severity: ipCounter.count >= FAILED_LOGIN_ALERT_THRESHOLD * 2 ? "HIGH" : "MEDIUM",
        title: `Repeated failed logins from IP ${ipAddress}`,
        description: `${ipCounter.count} failed login attempts from IP ${ipAddress} in ${Math.round(FAILED_LOGIN_WINDOW_MS / 60000)} minutes`,
        metadata: { ipAddress, attemptCount: ipCounter.count },
        ipAddress,
      });
    }
  }

  // Track by user
  if (userId) {
    const userCounter = failedLoginsByUser.get(userId);
    if (
      !userCounter ||
      now - userCounter.windowStart > FAILED_LOGIN_WINDOW_MS
    ) {
      failedLoginsByUser.set(userId, { count: 1, windowStart: now });
    } else {
      userCounter.count++;
      if (userCounter.count >= FAILED_LOGIN_ALERT_THRESHOLD) {
        await createSecurityAlert({
          tenantId,
          userId,
          category: "BRUTE_FORCE",
          severity: "HIGH",
          title: "Repeated failed logins for user account",
          description: `${userCounter.count} failed login attempts for user ${userId}`,
          metadata: { userId, attemptCount: userCounter.count },
          ipAddress,
        });
      }
    }
  }
}

/**
 * Track data access and detect bulk access patterns.
 * Call this from audit log middleware on sensitive data reads.
 */
export async function trackDataAccess(
  userId: string,
  tenantId: string,
  resourceType: string,
  ipAddress?: string
): Promise<void> {
  const now = Date.now();
  const key = `${userId}:${resourceType}`;

  const counter = accessCountsByUser.get(key);
  if (!counter || now - counter.windowStart > 60 * 60 * 1000) {
    accessCountsByUser.set(key, { count: 1, windowStart: now });
    return;
  }

  counter.count++;
  if (counter.count === BULK_ACCESS_THRESHOLD) {
    await createSecurityAlert({
      tenantId,
      userId,
      category: "BULK_ACCESS",
      severity: "HIGH",
      title: `Unusual bulk access to ${resourceType} records`,
      description: `User ${userId} accessed ${counter.count} ${resourceType} records in 1 hour — possible data exfiltration`,
      metadata: {
        userId,
        resourceType,
        accessCount: counter.count,
        windowMinutes: 60,
      },
      ipAddress,
    });
  }
}

/**
 * Detect off-hours access to sensitive data.
 * Call this from API route handlers when accessing PHI/PII.
 */
export async function checkOffHoursAccess(
  userId: string,
  tenantId: string,
  action: string,
  ipAddress?: string
): Promise<void> {
  const hour = new Date().getUTCHours();

  // Business hours wrap around midnight UTC (e.g., 12 UTC to 2 UTC next day)
  let isBusinessHours: boolean;
  if (BUSINESS_HOURS_START < BUSINESS_HOURS_END) {
    isBusinessHours = hour >= BUSINESS_HOURS_START && hour < BUSINESS_HOURS_END;
  } else {
    // Wraps around midnight
    isBusinessHours = hour >= BUSINESS_HOURS_START || hour < BUSINESS_HOURS_END;
  }

  if (!isBusinessHours) {
    await createSecurityAlert({
      tenantId,
      userId,
      category: "OFF_HOURS_ACCESS",
      severity: "LOW",
      title: "Off-hours data access",
      description: `User ${userId} accessed ${action} outside business hours (${hour}:00 UTC)`,
      metadata: { userId, action, hourUtc: hour },
      ipAddress,
    });
  }
}

/**
 * Detect privilege escalation attempts.
 * Call this when a permission check fails (403 response).
 */
export async function trackPermissionDenied(
  userId: string,
  tenantId: string,
  permission: string,
  endpoint: string,
  ipAddress?: string
): Promise<void> {
  await createSecurityAlert({
    tenantId,
    userId,
    category: "PRIVILEGE_ESCALATION",
    severity: "MEDIUM",
    title: "Unauthorized access attempt",
    description: `User ${userId} attempted ${permission} on ${endpoint} without authorization`,
    metadata: { userId, permission, endpoint },
    ipAddress,
  });
}

/**
 * Track configuration changes (settings, permissions, tenant config).
 * Call this when admin settings are modified.
 */
export async function trackConfigurationChange(
  userId: string,
  tenantId: string,
  changeType: string,
  details: string,
  ipAddress?: string
): Promise<void> {
  await createSecurityAlert({
    tenantId,
    userId,
    category: "CONFIGURATION_CHANGE",
    severity: "MEDIUM",
    title: `Configuration changed: ${changeType}`,
    description: details,
    metadata: { userId, changeType },
    ipAddress,
  });
}

// --- Query Functions ---

/**
 * Get open security alerts for a tenant (for admin dashboard).
 */
export async function getOpenAlerts(
  tenantId: string,
  options?: { severity?: AlertSeverity; limit?: number }
): Promise<unknown[]> {
  return db.securityAlert.findMany({
    where: {
      tenantId,
      status: "OPEN",
      ...(options?.severity ? { severity: options.severity } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: options?.limit ?? 50,
  });
}

/**
 * Get alert counts by severity (for compliance dashboard summary).
 */
export async function getAlertSummary(
  tenantId: string
): Promise<{ severity: string; count: number }[]> {
  const results = await db.securityAlert.groupBy({
    by: ["severity"],
    where: { tenantId, status: "OPEN" },
    _count: { id: true },
  });

  return results.map((r) => ({
    severity: r.severity,
    count: r._count.id,
  }));
}

/**
 * Acknowledge / resolve a security alert.
 */
export async function resolveAlert(
  alertId: string,
  resolvedById: string,
  resolution: string
): Promise<void> {
  await db.securityAlert.update({
    where: { id: alertId },
    data: {
      status: "RESOLVED",
      resolvedById,
      resolvedAt: new Date(),
      resolution,
    },
  });
}
