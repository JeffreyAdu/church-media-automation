/**
 * Upload Episode Service
 * Business service wrapper for episode file uploads.
 */

import { uploadAudioFile } from "../external/storage.js";

export interface UploadResult {
  publicUrl: string;
  sizeBytes: number;
}

/**
 * Uploads an audio file to storage.
 */
export async function uploadEpisode(filePath: string, storagePath: string): Promise<UploadResult> {
  return await uploadAudioFile(filePath, storagePath);
}
