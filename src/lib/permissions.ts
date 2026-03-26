/**
 * Role-Based Access Control (RBAC) for Lincoln
 *
 * Role hierarchy (highest to lowest):
 *   SUPER_ADMIN > FIRM_ADMIN > ATTORNEY > STAFF > CLIENT
 */

import { UserRole } from "@prisma/client";

// Permissions organized by resource and action
export const PERMISSIONS = {
  // Tenant / firm management
  TENANT_CREATE: [UserRole.SUPER_ADMIN],
  TENANT_READ: [UserRole.SUPER_ADMIN],
  TENANT_UPDATE: [UserRole.SUPER_ADMIN, UserRole.FIRM_ADMIN],
  TENANT_DELETE: [UserRole.SUPER_ADMIN],

  // User management
  USER_CREATE: [UserRole.SUPER_ADMIN, UserRole.FIRM_ADMIN],
  USER_READ: [UserRole.SUPER_ADMIN, UserRole.FIRM_ADMIN],
  USER_UPDATE_ANY: [UserRole.SUPER_ADMIN, UserRole.FIRM_ADMIN],
  USER_DEACTIVATE: [UserRole.SUPER_ADMIN, UserRole.FIRM_ADMIN],

  // Matter management
  MATTER_CREATE: [UserRole.SUPER_ADMIN, UserRole.FIRM_ADMIN, UserRole.ATTORNEY],
  MATTER_READ_ANY: [UserRole.SUPER_ADMIN, UserRole.FIRM_ADMIN],
  MATTER_READ_ASSIGNED: [UserRole.ATTORNEY, UserRole.STAFF],
  MATTER_UPDATE: [UserRole.SUPER_ADMIN, UserRole.FIRM_ADMIN, UserRole.ATTORNEY],
  MATTER_UPDATE_ASSIGNED: [UserRole.STAFF],
  MATTER_CLOSE: [UserRole.SUPER_ADMIN, UserRole.FIRM_ADMIN, UserRole.ATTORNEY],
  MATTER_ASSIGN: [UserRole.SUPER_ADMIN, UserRole.FIRM_ADMIN],

  // Client management
  CLIENT_CREATE: [UserRole.SUPER_ADMIN, UserRole.FIRM_ADMIN, UserRole.ATTORNEY, UserRole.STAFF],
  CLIENT_READ_ANY: [UserRole.SUPER_ADMIN, UserRole.FIRM_ADMIN],
  CLIENT_READ_ASSIGNED: [UserRole.ATTORNEY, UserRole.STAFF],
  CLIENT_UPDATE: [UserRole.SUPER_ADMIN, UserRole.FIRM_ADMIN, UserRole.ATTORNEY],
  CLIENT_UPDATE_ASSIGNED: [UserRole.STAFF],
  CLIENT_ENABLE_PORTAL: [UserRole.SUPER_ADMIN, UserRole.FIRM_ADMIN],

  // Documents
  DOCUMENT_UPLOAD: [UserRole.SUPER_ADMIN, UserRole.FIRM_ADMIN, UserRole.ATTORNEY, UserRole.STAFF],
  DOCUMENT_READ_ANY: [UserRole.SUPER_ADMIN, UserRole.FIRM_ADMIN],
  DOCUMENT_READ_ASSIGNED: [UserRole.ATTORNEY, UserRole.STAFF],
  DOCUMENT_DELETE: [UserRole.SUPER_ADMIN, UserRole.FIRM_ADMIN, UserRole.ATTORNEY],

  // Intake
  INTAKE_REVIEW: [UserRole.SUPER_ADMIN, UserRole.FIRM_ADMIN, UserRole.ATTORNEY],
  INTAKE_CREATE: [UserRole.SUPER_ADMIN, UserRole.FIRM_ADMIN, UserRole.ATTORNEY, UserRole.STAFF, UserRole.CLIENT],

  // Kanban
  KANBAN_MANAGE: [UserRole.SUPER_ADMIN, UserRole.FIRM_ADMIN],
  KANBAN_USE: [UserRole.SUPER_ADMIN, UserRole.FIRM_ADMIN, UserRole.ATTORNEY, UserRole.STAFF],

  // Messages
  MESSAGE_SEND: [UserRole.SUPER_ADMIN, UserRole.FIRM_ADMIN, UserRole.ATTORNEY, UserRole.STAFF, UserRole.CLIENT],
  MESSAGE_READ_ANY: [UserRole.SUPER_ADMIN, UserRole.FIRM_ADMIN],

  // Audit logs
  AUDIT_READ: [UserRole.SUPER_ADMIN, UserRole.FIRM_ADMIN],

  // Admin views
  ADMIN_DASHBOARD: [UserRole.SUPER_ADMIN],
  FIRM_DASHBOARD: [UserRole.SUPER_ADMIN, UserRole.FIRM_ADMIN],

  // Contacts (opposing counsel, witnesses, experts, etc.)
  CONTACT_CREATE: [UserRole.SUPER_ADMIN, UserRole.FIRM_ADMIN, UserRole.ATTORNEY, UserRole.STAFF],
  CONTACT_READ: [UserRole.SUPER_ADMIN, UserRole.FIRM_ADMIN, UserRole.ATTORNEY, UserRole.STAFF],
  CONTACT_UPDATE: [UserRole.SUPER_ADMIN, UserRole.FIRM_ADMIN, UserRole.ATTORNEY],
  CONTACT_DELETE: [UserRole.SUPER_ADMIN, UserRole.FIRM_ADMIN],

  // Billing
  BILLING_READ: [UserRole.SUPER_ADMIN, UserRole.FIRM_ADMIN, UserRole.ATTORNEY],
  BILLING_WRITE: [UserRole.SUPER_ADMIN, UserRole.FIRM_ADMIN, UserRole.ATTORNEY],
  INVOICE_CREATE: [UserRole.SUPER_ADMIN, UserRole.FIRM_ADMIN, UserRole.ATTORNEY],
  INVOICE_SEND: [UserRole.SUPER_ADMIN, UserRole.FIRM_ADMIN, UserRole.ATTORNEY],
  INVOICE_DELETE: [UserRole.SUPER_ADMIN, UserRole.FIRM_ADMIN],
  TIMEENTRY_CREATE: [UserRole.SUPER_ADMIN, UserRole.FIRM_ADMIN, UserRole.ATTORNEY, UserRole.STAFF],
  TIMEENTRY_READ: [UserRole.SUPER_ADMIN, UserRole.FIRM_ADMIN, UserRole.ATTORNEY, UserRole.STAFF],
  PAYMENT_RECORD: [UserRole.SUPER_ADMIN, UserRole.FIRM_ADMIN],

  // Trust / IOLTA accounting
  BANK_ACCOUNT_MANAGE: [UserRole.SUPER_ADMIN, UserRole.FIRM_ADMIN],
  TRUST_READ: [UserRole.SUPER_ADMIN, UserRole.FIRM_ADMIN, UserRole.ATTORNEY],
  TRUST_WRITE: [UserRole.SUPER_ADMIN, UserRole.FIRM_ADMIN, UserRole.ATTORNEY],
  TRUST_TRANSFER_APPROVE: [UserRole.SUPER_ADMIN, UserRole.FIRM_ADMIN],
  BILLING_RULE_MANAGE: [UserRole.SUPER_ADMIN, UserRole.FIRM_ADMIN, UserRole.ATTORNEY],

  // Notifications
  NOTIFICATION_READ: [UserRole.SUPER_ADMIN, UserRole.FIRM_ADMIN, UserRole.ATTORNEY, UserRole.STAFF, UserRole.CLIENT],
} as const;

type Permission = keyof typeof PERMISSIONS;

export function hasPermission(role: UserRole, permission: Permission): boolean {
  const allowedRoles = PERMISSIONS[permission] as readonly UserRole[];
  return allowedRoles.includes(role);
}

export function hasAnyPermission(
  role: UserRole,
  permissions: Permission[]
): boolean {
  return permissions.some((p) => hasPermission(role, p));
}

export function hasAllPermissions(
  role: UserRole,
  permissions: Permission[]
): boolean {
  return permissions.every((p) => hasPermission(role, p));
}

// Role display names
export const ROLE_LABELS: Record<UserRole, string> = {
  SUPER_ADMIN: "Super Admin",
  FIRM_ADMIN: "Firm Admin",
  ATTORNEY: "Attorney",
  STAFF: "Staff",
  CLIENT: "Client",
};

// Roles that belong to a firm (not platform-level or client-level)
export const FIRM_ROLES: UserRole[] = [
  UserRole.FIRM_ADMIN,
  UserRole.ATTORNEY,
  UserRole.STAFF,
];

export function isFirmUser(role: UserRole): boolean {
  return FIRM_ROLES.includes(role) || role === UserRole.SUPER_ADMIN;
}

export function isClientUser(role: UserRole): boolean {
  return role === UserRole.CLIENT;
}
