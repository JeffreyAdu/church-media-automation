/**
 * Storage Upload Service
 * Handles uploading processed audio to Supabase Storage.
 */

import { supabase, MEDIA_BUCKET } from "../../config/supabase.js";
import { readFile, stat } from "fs/promises";
import path from "path";

export interface UploadResult {
  publicUrl: string;
  sizeBytes: number;
}

/**
 * Uploads audio file to Supabase Storage.
 * Returns public URL and file size.
 */
export async function uploadAudioFile(
  filePath: string,
  storagePath: string
): Promise<UploadResult> {
  const fileBuffer = await readFile(filePath);
  const fileStats = await stat(filePath);
  const ext = path.extname(filePath);
  const contentType = ext === ".m4a" ? "audio/mp4" : "audio/mpeg";

  const { error } = await supabase.storage
    .from(MEDIA_BUCKET)
    .upload(storagePath, fileBuffer, {
      contentType,
      upsert: false,
    });

  if (error) {
    throw new Error(`Failed to upload audio: ${error.message}`);
  }

  const { data: publicUrlData } = supabase.storage
    .from(MEDIA_BUCKET)
    .getPublicUrl(storagePath);

  return {
    publicUrl: publicUrlData.publicUrl,
    sizeBytes: fileStats.size,
  };
}

/**
 * Uploads a file from a buffer to Supabase Storage.
 * Returns public URL and file size.
 */
export async function uploadFileFromBuffer(
  buffer: Buffer,
  storagePath: string,
  contentType: string
): Promise<UploadResult> {
  const { error } = await supabase.storage
    .from(MEDIA_BUCKET)
    .upload(storagePath, buffer, {
      contentType,
      upsert: true, // Allow overwriting existing files
    });

  if (error) {
    throw new Error(`Failed to upload file: ${error.message}`);
  }

  const { data: publicUrlData } = supabase.storage
    .from(MEDIA_BUCKET)
    .getPublicUrl(storagePath);

  return {
    publicUrl: publicUrlData.publicUrl,
    sizeBytes: buffer.length,
  };
}

/**
 * Deletes a file from Supabase Storage.
 */
export async function deleteFile(storagePath: string): Promise<void> {
  const { error } = await supabase.storage
    .from(MEDIA_BUCKET)
    .remove([storagePath]);

  if (error) {
    throw new Error(`Failed to delete file: ${error.message}`);
  }
}
