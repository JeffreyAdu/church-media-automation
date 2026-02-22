/**
 * Transcription Upload Utility
 * Uploads large audio files to Cloudflare R2 and returns a presigned URL.
 * Used when file is >25MB (Groq's direct upload limit).
 *
 * R2 has no per-file size limit (vs Supabase's 50MB cap).
 * Presigned GET URLs are used since public access is disabled on the bucket.
 * URL expires in 15 minutes — well within any transcription window.
 */

import { PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { r2Client, R2_BUCKET } from "../config/r2.js";
import { readFile } from "fs/promises";
import path from "path";

const PRESIGNED_URL_EXPIRES_SEC = 15 * 60; // 15 minutes
const TRANSCRIPTION_PREFIX = "transcription-temp";

/**
 * Upload audio to R2 and return a presigned GET URL.
 * Groq will fetch the file directly from this URL.
 */
export async function uploadForTranscription(audioPath: string): Promise<string> {
  const key = `${TRANSCRIPTION_PREFIX}/${Date.now()}-${path.basename(audioPath)}`;
  const fileBuffer = await readFile(audioPath);

  await r2Client.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      Body: fileBuffer,
      ContentType: "audio/mpeg",
    })
  );

  const presignedUrl = await getSignedUrl(
    r2Client,
    new GetObjectCommand({ Bucket: R2_BUCKET, Key: key }),
    { expiresIn: PRESIGNED_URL_EXPIRES_SEC }
  );

  console.log(`[r2] Uploaded ${path.basename(audioPath)} → ${key} (presigned URL, expires 15min)`);
  return presignedUrl;
}

/**
 * Delete a temp transcription file from R2 after use.
 * Non-critical — silently ignored on failure.
 * Key is extracted from the presigned URL path component.
 */
export async function deleteTempTranscriptionFile(presignedUrl: string): Promise<void> {
  try {
    const url = new URL(presignedUrl);
    // pathname: /<bucket>/transcription-temp/... — strip leading slash
    const key = url.pathname.replace(/^\/[^/]+\//, "");
    await r2Client.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: key }));
    console.log(`[r2] Deleted temp transcription file: ${key}`);
  } catch {
    // Non-critical — temp files can be cleaned up manually if needed
  }
}
