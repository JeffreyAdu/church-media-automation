/**
 * Upload Episode Service
 * Reads the local audio file, determines content type, and delegates to storage.
 */

import { readFile } from "fs/promises";
import path from "path";
import { uploadFile } from "../external/storage.js";

export type { UploadResult } from "../external/storage.js";

function audioContentType(filePath: string): string {
  return path.extname(filePath) === ".m4a" ? "audio/mp4" : "audio/mpeg";
}

/**
 * Reads a local audio file and uploads it to storage.
 * upsert=false — episode files should never silently overwrite an existing upload.
 */
export async function uploadEpisode(filePath: string, storagePath: string) {
  const buffer = await readFile(filePath);
  return uploadFile(buffer, storagePath, audioContentType(filePath), false);
}
