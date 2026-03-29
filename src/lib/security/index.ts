/**
 * Security Controls Module — Lincoln Platform
 *
 * SOC-2 / ISO 27001 / HIPAA technical controls.
 *
 * Usage:
 *   import { validatePasswordChange, isSessionRevoked, trackFailedLogin } from "@/lib/security";
 */

export {
  // Password Policy (SOC-2 CC6.1 / ISO A.9.4.3)
  isPasswordExpired,
  canChangePassword,
  validatePasswordChange,
  rotatePassword,
  findExpiredPasswords,
  PASSWORD_MAX_AGE_DAYS,
  PASSWORD_HISTORY_SIZE,
} from "./password-policy";

export {
  // Session Management (SOC-2 CC6.1, CC6.6 / ISO A.9.2.1, A.9.4.2)
  registerSession,
  touchSession,
  removeSession,
  revokeUserSessions,
  revokeTenantSessions,
  isSessionRevoked,
  getUserSessions,
  getTenantSessions,
  getActiveSessionCount,
  MAX_CONCURRENT_SESSIONS,
} from "./session-manager";

export {
  // Security Monitoring (SOC-2 CC7.2, CC7.3 / ISO A.12.4.1)
  trackFailedLogin,
  trackDataAccess,
  checkOffHoursAccess,
  trackPermissionDenied,
  trackConfigurationChange,
  createSecurityAlert,
  getOpenAlerts,
  getAlertSummary,
  resolveAlert,
} from "./security-monitor";

export {
  // Compliance Reporting (SOC-2 CC4.1 / ISO A.18.2)
  generateComplianceReport,
  exportAuditLogs,
} from "./compliance";

export type {
  PasswordPolicyResult,
  PasswordHistoryEntry,
} from "./password-policy";

export type {
  ActiveSession,
} from "./session-manager";

export type {
  AlertSeverity,
  AlertCategory,
  SecurityAlert,
} from "./security-monitor";

export type {
  ComplianceControl,
  ComplianceReport,
  ControlStatus,
} from "./compliance";
