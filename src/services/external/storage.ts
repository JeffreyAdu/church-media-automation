/**
 * Storage External Client — Cloudflare R2
 * Thin wrapper around the AWS S3-compatible R2 SDK.
 * No business logic, no file I/O — accepts raw buffers only.
 * Supabase is used exclusively for database operations.
 */

import { PutObjectCommand, DeleteObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { r2Client, R2_BUCKET, R2_PUBLIC_URL } from "../../config/r2.js";

export interface UploadResult {
  publicUrl: string;
  sizeBytes: number;
}

/**
 * Upload a buffer to R2 at the given storage path.
 * upsert=false throws if the object already exists (used for episode uploads).
 * upsert=true (default) overwrites silently (used for artwork, intro, outro).
 */
export async function uploadFile(
  buffer: Buffer,
  storagePath: string,
  contentType: string,
  upsert = true
): Promise<UploadResult> {
  if (!upsert) {
    // Check for existing object — PutObject always overwrites on R2/S3
    const exists = await r2Client
      .send(new HeadObjectCommand({ Bucket: R2_BUCKET, Key: storagePath }))
      .then(() => true)
      .catch(() => false);
    if (exists) throw new Error(`Storage conflict: object already exists at ${storagePath}`);
  }

  await r2Client.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: storagePath,
      Body: buffer,
      ContentType: contentType,
    })
  );

  return {
    publicUrl: `${R2_PUBLIC_URL}/${storagePath}`,
    sizeBytes: buffer.length,
  };
}

/**
 * Delete a file from R2.
 */
export async function deleteFile(storagePath: string): Promise<void> {
  await r2Client.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: storagePath }));
}
