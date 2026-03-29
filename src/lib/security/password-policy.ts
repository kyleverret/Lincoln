/**
 * Password Policy Enforcement
 *
 * SOC-2 CC6.1 / ISO 27001 A.9.4.3 — Password management system
 *
 * Controls:
 * - Password expiration (configurable, default 90 days)
 * - Password history (prevent reuse of last N passwords, default 5)
 * - Complexity requirements (enforced server-side via Zod + bcrypt)
 * - Minimum password age (prevent rapid cycling, default 1 day)
 * - Must-change-password enforcement on first login / admin reset
 *
 * Password hashes for history are stored as a JSON array in User.passwordHistory.
 * Each entry: { hash: string, changedAt: string (ISO 8601) }
 */

import bcrypt from "bcryptjs";
import { db } from "../db";

// --- Configuration (env-overridable) ---

/** Maximum password age in days before forced rotation */
export const PASSWORD_MAX_AGE_DAYS = parseInt(
  process.env.PASSWORD_MAX_AGE_DAYS ?? "90",
  10
);

/** Minimum password age in days (prevents rapid cycling to exhaust history) */
export const PASSWORD_MIN_AGE_DAYS = parseInt(
  process.env.PASSWORD_MIN_AGE_DAYS ?? "1",
  10
);

/** Number of previous passwords to remember */
export const PASSWORD_HISTORY_SIZE = parseInt(
  process.env.PASSWORD_HISTORY_SIZE ?? "5",
  10
);

/** bcrypt cost factor */
const BCRYPT_ROUNDS = 12;

// --- Types ---

export interface PasswordHistoryEntry {
  hash: string;
  changedAt: string; // ISO 8601
}

export interface PasswordPolicyResult {
  valid: boolean;
  errors: string[];
}

// --- Core Functions ---

/**
 * Check if a user's password has expired.
 * Returns true if the password must be changed.
 */
export function isPasswordExpired(passwordChangedAt: Date | null): boolean {
  if (!passwordChangedAt) return true; // Never set — must change
  const ageMs = Date.now() - passwordChangedAt.getTime();
  const maxAgeMs = PASSWORD_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
  return ageMs > maxAgeMs;
}

/**
 * Check if the minimum password age has been met (prevents rapid cycling).
 * Returns true if the password can be changed.
 */
export function canChangePassword(passwordChangedAt: Date | null): boolean {
  if (!passwordChangedAt) return true;
  const ageMs = Date.now() - passwordChangedAt.getTime();
  const minAgeMs = PASSWORD_MIN_AGE_DAYS * 24 * 60 * 60 * 1000;
  return ageMs >= minAgeMs;
}

/**
 * Check a new password against the password history.
 * Returns true if the password has NOT been used recently.
 */
export async function checkPasswordHistory(
  newPassword: string,
  history: PasswordHistoryEntry[]
): Promise<boolean> {
  const recentHistory = history.slice(-PASSWORD_HISTORY_SIZE);
  for (const entry of recentHistory) {
    const matches = await bcrypt.compare(newPassword, entry.hash);
    if (matches) return false; // Password was used recently
  }
  return true;
}

/**
 * Validate a new password against all policy rules.
 * Combines complexity, history, and age checks.
 */
export async function validatePasswordChange(
  userId: string,
  newPassword: string
): Promise<PasswordPolicyResult> {
  const errors: string[] = [];

  // Complexity checks (mirror Zod schema but enforce server-side)
  if (newPassword.length < 12) {
    errors.push("Password must be at least 12 characters");
  }
  if (!/[A-Z]/.test(newPassword)) {
    errors.push("Password must contain an uppercase letter");
  }
  if (!/[a-z]/.test(newPassword)) {
    errors.push("Password must contain a lowercase letter");
  }
  if (!/[0-9]/.test(newPassword)) {
    errors.push("Password must contain a number");
  }
  if (!/[^A-Za-z0-9]/.test(newPassword)) {
    errors.push("Password must contain a special character");
  }

  // Fetch user for history and age checks
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      passwordChangedAt: true,
      passwordHistory: true,
    },
  });

  if (!user) {
    errors.push("User not found");
    return { valid: false, errors };
  }

  // Minimum age check
  if (!canChangePassword(user.passwordChangedAt)) {
    errors.push(
      `Password can only be changed once every ${PASSWORD_MIN_AGE_DAYS} day(s)`
    );
  }

  // History check
  const history = parsePasswordHistory(user.passwordHistory);
  const notReused = await checkPasswordHistory(newPassword, history);
  if (!notReused) {
    errors.push(
      `Password cannot be the same as your last ${PASSWORD_HISTORY_SIZE} passwords`
    );
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Hash a new password and update the user's password + history.
 * Call this AFTER validatePasswordChange succeeds.
 */
export async function rotatePassword(
  userId: string,
  newPassword: string
): Promise<void> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { passwordHash: true, passwordHistory: true },
  });

  if (!user) throw new Error("User not found");

  const newHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);

  // Build updated history: append current hash, trim to history size
  const history = parsePasswordHistory(user.passwordHistory);
  history.push({
    hash: user.passwordHash,
    changedAt: new Date().toISOString(),
  });
  const trimmedHistory = history.slice(-PASSWORD_HISTORY_SIZE);

  await db.user.update({
    where: { id: userId },
    data: {
      passwordHash: newHash,
      passwordChangedAt: new Date(),
      mustChangePassword: false,
      passwordHistory: JSON.stringify(trimmedHistory),
    },
  });
}

/**
 * Check all users in a tenant for expired passwords.
 * Returns user IDs that need password rotation.
 */
export async function findExpiredPasswords(
  tenantId: string
): Promise<{ userId: string; email: string; daysSinceChange: number }[]> {
  const users = await db.user.findMany({
    where: {
      tenantUsers: { some: { tenantId, isActive: true } },
      isActive: true,
    },
    select: {
      id: true,
      email: true,
      passwordChangedAt: true,
    },
  });

  return users
    .filter((u) => isPasswordExpired(u.passwordChangedAt))
    .map((u) => ({
      userId: u.id,
      email: u.email,
      daysSinceChange: u.passwordChangedAt
        ? Math.floor(
            (Date.now() - u.passwordChangedAt.getTime()) / (1000 * 60 * 60 * 24)
          )
        : -1, // Never changed
    }));
}

// --- Helpers ---

function parsePasswordHistory(raw: string | null): PasswordHistoryEntry[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}
