/**
 * FFmpeg Audio Extraction
 * Extracts a specific time range from audio file.
 */

import { exec } from "child_process";
import { promisify } from "util";
import { mkdir } from "fs/promises";
import path from "path";
import os from "os";

const execAsync = promisify(exec);

/**
 * Extracts a segment from audio file by time range.
 * Returns path to the extracted segment.
 */
export async function extractAudioSegment(
  inputPath: string,
  startSec: number,
  endSec: number,
  outputFileName: string
): Promise<string> {
  const tempDir = path.join(os.tmpdir(), "ffmpeg-output");
  
  // Ensure the directory exists
  await mkdir(tempDir, { recursive: true });
  
  const outputPath = path.join(tempDir, outputFileName);

  const duration = endSec - startSec;

  const command = [
    "ffmpeg",
    "-i", inputPath,
    "-ss", startSec.toString(),
    "-t", duration.toString(),
    "-c", "copy",
    "-y",
    outputPath,
  ].join(" ");

  await execAsync(command);

  return outputPath;
}
