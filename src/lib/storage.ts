/**
 * Document storage abstraction layer
 *
 * Supports "local" (filesystem) and "s3" providers.
 * All content is encrypted before being handed to the storage layer,
 * so the storage backend only ever sees ciphertext.
 */

import fs from "fs/promises";
import path from "path";
import { encryptBuffer, decryptBuffer, computeChecksum } from "./encryption";

export interface StoreResult {
  storagePath: string;
  iv: string;
  authTag: string;
  checksum: string;
  sizeBytes: number;
}

const STORAGE_PROVIDER = process.env.STORAGE_PROVIDER ?? "local";
const LOCAL_BASE = path.resolve(
  process.env.STORAGE_LOCAL_PATH ?? "./storage/documents"
);

// ---------------------------------------------------------------------------
// Local filesystem storage
// ---------------------------------------------------------------------------

async function localStore(
  tenantId: string,
  documentId: string,
  data: Buffer,
  encryptionKeyId: string
): Promise<StoreResult> {
  const checksum = computeChecksum(data);
  const { encrypted, iv, authTag } = encryptBuffer(data, encryptionKeyId);

  // Store under tenantId subdirectory with opaque filename
  const dir = path.join(LOCAL_BASE, tenantId);
  await fs.mkdir(dir, { recursive: true });
  const storagePath = path.join(dir, `${documentId}.enc`);
  await fs.writeFile(storagePath, encrypted);

  return {
    storagePath,
    iv,
    authTag,
    checksum,
    sizeBytes: data.length,
  };
}

async function localRetrieve(
  storagePath: string,
  iv: string,
  authTag: string,
  encryptionKeyId: string
): Promise<Buffer> {
  const encrypted = await fs.readFile(storagePath);
  return decryptBuffer(encrypted, iv, authTag, encryptionKeyId);
}

async function localDelete(storagePath: string): Promise<void> {
  await fs.unlink(storagePath);
}

// ---------------------------------------------------------------------------
// S3 storage (stub — provide real implementation for production)
// ---------------------------------------------------------------------------

async function s3Store(
  tenantId: string,
  documentId: string,
  data: Buffer,
  encryptionKeyId: string
): Promise<StoreResult> {
  const checksum = computeChecksum(data);
  const { encrypted, iv, authTag } = encryptBuffer(data, encryptionKeyId);
  const key = `documents/${tenantId}/${documentId}.enc`;

  // Dynamically import AWS SDK only when needed
  const { S3Client, PutObjectCommand } = await import("@aws-sdk/client-s3");
  const client = new S3Client({
    region: process.env.AWS_REGION,
    // Supports S3-compatible providers (e.g. DigitalOcean Spaces) via STORAGE_ENDPOINT
    ...(process.env.STORAGE_ENDPOINT && {
      endpoint: process.env.STORAGE_ENDPOINT,
      forcePathStyle: false,
    }),
  });
  await client.send(
    new PutObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET!,
      Key: key,
      Body: encrypted,
      ServerSideEncryption: "AES256", // SSE layer on top of application-level AES-256-GCM
    })
  );

  return {
    storagePath: key,
    iv,
    authTag,
    checksum,
    sizeBytes: data.length,
  };
}

async function s3Retrieve(
  storagePath: string,
  iv: string,
  authTag: string,
  encryptionKeyId: string
): Promise<Buffer> {
  const { S3Client, GetObjectCommand } = await import("@aws-sdk/client-s3");
  const client = new S3Client({
    region: process.env.AWS_REGION,
    ...(process.env.STORAGE_ENDPOINT && {
      endpoint: process.env.STORAGE_ENDPOINT,
      forcePathStyle: false,
    }),
  });
  const response = await client.send(
    new GetObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET!,
      Key: storagePath,
    })
  );

  const chunks: Uint8Array[] = [];
  for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
    chunks.push(chunk);
  }
  const encrypted = Buffer.concat(chunks);
  return decryptBuffer(encrypted, iv, authTag, encryptionKeyId);
}

async function s3Delete(storagePath: string): Promise<void> {
  const { S3Client, DeleteObjectCommand } = await import("@aws-sdk/client-s3");
  const client = new S3Client({
    region: process.env.AWS_REGION,
    ...(process.env.STORAGE_ENDPOINT && {
      endpoint: process.env.STORAGE_ENDPOINT,
      forcePathStyle: false,
    }),
  });
  await client.send(
    new DeleteObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET!,
      Key: storagePath,
    })
  );
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function storeDocument(
  tenantId: string,
  documentId: string,
  data: Buffer,
  encryptionKeyId: string
): Promise<StoreResult> {
  if (STORAGE_PROVIDER === "s3") {
    return s3Store(tenantId, documentId, data, encryptionKeyId);
  }
  return localStore(tenantId, documentId, data, encryptionKeyId);
}

export async function retrieveDocument(
  storagePath: string,
  iv: string,
  authTag: string,
  encryptionKeyId: string
): Promise<Buffer> {
  if (STORAGE_PROVIDER === "s3") {
    return s3Retrieve(storagePath, iv, authTag, encryptionKeyId);
  }
  return localRetrieve(storagePath, iv, authTag, encryptionKeyId);
}

export async function deleteDocument(storagePath: string): Promise<void> {
  if (STORAGE_PROVIDER === "s3") {
    return s3Delete(storagePath);
  }
  return localDelete(storagePath);
}
