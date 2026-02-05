/**
 * Download Service
 * Business service for downloading remote files.
 */

import { writeFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";

/**
 * Downloads a file from a URL to a temporary location.
 * Returns the path to the downloaded file.
 */
export async function downloadFromUrl(url: string, filename?: string): Promise<string> {
  const response = await fetch(url);
  
  if (!response.ok) {
    throw new Error(`Failed to download from ${url}: ${response.status} ${response.statusText}`);
  }

  const buffer = await response.arrayBuffer();
  const outputPath = join(tmpdir(), filename || `${randomUUID()}.mp3`);
  
  await writeFile(outputPath, Buffer.from(buffer));
  
  return outputPath;
}
