/**
 * Encryption utilities for Lincoln
 *
 * Uses AES-256-GCM with envelope encryption:
 *   - A master key (from env) is used via HKDF to derive per-tenant data
 *     encryption keys (DEK).
 *   - Each encrypted value stores: <iv_hex>:<authTag_hex>:<ciphertext_hex>
 *   - Documents use the same scheme but are written to disk/S3 as binary.
 *
 * HIPAA relevance: encrypts PHI/PII fields at the application layer,
 * independent of database-level encryption.
 */

import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 12;  // 96 bits — recommended for GCM
const AUTH_TAG_LENGTH = 16; // 128 bits

// --- Lazy validation for encryption environment variables ---
// Cannot validate at module scope because NODE_ENV=production is set during
// `next build` but encryption env vars are only available at runtime.

let _salt: string | null = null;
function getSalt(): string {
  if (_salt !== null) return _salt;
  const envSalt = process.env.ENCRYPTION_SALT;
  if (!envSalt && process.env.NODE_ENV === "production" && typeof window === "undefined") {
    // Only enforce at runtime, not during build (build sets NODE_ENV=production but has no secrets)
    console.error("[SECURITY] ENCRYPTION_SALT not set in production — encryption may be weakened");
  }
  if (!envSalt) {
    console.warn("[SECURITY] ENCRYPTION_SALT not set — using dev default. DO NOT use in production.");
  }
  _salt = envSalt || "lincoln-dev-salt-do-not-use-in-production";
  return _salt;
}

function getMasterKey(): Buffer {
  const key = process.env.MASTER_ENCRYPTION_KEY;
  if (!key || key.length < 64) {
    throw new Error(
      "MASTER_ENCRYPTION_KEY must be set and at least 64 hex characters"
    );
  }
  return Buffer.from(key, "hex");
}

/**
 * Derives a per-tenant data encryption key using HKDF.
 * The tenant's encryptionKeyId is used as the info parameter,
 * making each tenant's key unique even if the same master key is used.
 */
export function deriveTenantKey(tenantEncryptionKeyId: string): Buffer {
  const masterKey = getMasterKey();
  const saltBuf = Buffer.from(getSalt(), "hex");
  const info = Buffer.from(`tenant:${tenantEncryptionKeyId}`, "utf8");

  return Buffer.from(crypto.hkdfSync("sha256", masterKey, saltBuf, info, KEY_LENGTH));
}

/**
 * Encrypts a UTF-8 string value using the tenant's derived key.
 * Returns: "<iv_hex>:<authTag_hex>:<ciphertext_hex>"
 */
export function encryptField(
  plaintext: string,
  tenantEncryptionKeyId: string
): string {
  const key = deriveTenantKey(tenantEncryptionKeyId);
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  }) as crypto.CipherGCM;

  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`;
}

/**
 * Decrypts a value encrypted by encryptField.
 */
export function decryptField(
  ciphertext: string,
  tenantEncryptionKeyId: string
): string {
  const parts = ciphertext.split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid ciphertext format");
  }

  const [ivHex, authTagHex, dataHex] = parts;
  const key = deriveTenantKey(tenantEncryptionKeyId);
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const data = Buffer.from(dataHex, "hex");

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  }) as crypto.DecipherGCM;
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
  return decrypted.toString("utf8");
}

/**
 * Encrypts a Buffer (e.g., document bytes) and returns:
 * { encrypted: Buffer, iv: string (hex), authTag: string (hex) }
 */
export function encryptBuffer(
  data: Buffer,
  tenantEncryptionKeyId: string
): { encrypted: Buffer; iv: string; authTag: string } {
  const key = deriveTenantKey(tenantEncryptionKeyId);
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  }) as crypto.CipherGCM;

  const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    encrypted,
    iv: iv.toString("hex"),
    authTag: authTag.toString("hex"),
  };
}

/**
 * Decrypts a Buffer that was encrypted by encryptBuffer.
 */
export function decryptBuffer(
  encrypted: Buffer,
  iv: string,
  authTag: string,
  tenantEncryptionKeyId: string
): Buffer {
  const key = deriveTenantKey(tenantEncryptionKeyId);
  const ivBuf = Buffer.from(iv, "hex");
  const authTagBuf = Buffer.from(authTag, "hex");

  const decipher = crypto.createDecipheriv(ALGORITHM, key, ivBuf, {
    authTagLength: AUTH_TAG_LENGTH,
  }) as crypto.DecipherGCM;
  decipher.setAuthTag(authTagBuf);

  return Buffer.concat([decipher.update(encrypted), decipher.final()]);
}

/**
 * Computes a SHA-256 checksum of a buffer for integrity verification.
 */
export function computeChecksum(data: Buffer): string {
  return crypto.createHash("sha256").update(data).digest("hex");
}

/**
 * Safely compares two strings in constant time (prevents timing attacks).
 */
export function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/**
 * Generates a cryptographically secure random token.
 */
export function generateSecureToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString("hex");
}
