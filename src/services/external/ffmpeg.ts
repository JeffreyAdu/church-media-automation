/**
 * FFmpeg Service
 * Handles audio concatenation with intro/outro.
 */

import { exec } from "child_process";
import { promisify } from "util";
import { writeFile, unlink, mkdir } from "fs/promises";
import path from "path";
import os from "os";

const execAsync = promisify(exec);

export interface ConcatenateResult {
  outputPath: string;
}

/**
 * Concatenates intro + main audio + outro using FFmpeg.
 * Returns path to the final episode file.
 */
export async function concatenateAudio(
  introPath: string | null,
  mainAudioPath: string,
  outroPath: string | null,
  outputFileName: string
): Promise<ConcatenateResult> {
  const tempDir = path.join(os.tmpdir(), "ffmpeg-output");
  const outputPath = path.join(tempDir, outputFileName);

  // Build file list for FFmpeg concat
  const files: string[] = [];
  if (introPath) files.push(introPath);
  files.push(mainAudioPath);
  if (outroPath) files.push(outroPath);

  // Create concat file list
  const concatListPath = path.join(tempDir, "concat-list.txt");
  const concatContent = files.map((f) => `file '${f}'`).join("\n");
  await writeFile(concatListPath, concatContent);

  const command = [
    "ffmpeg",
    "-f", "concat",
    "-safe", "0",
    "-i", concatListPath,
    "-c", "copy",
    outputPath,
  ].join(" ");

  await execAsync(command);
  await unlink(concatListPath);

  return { outputPath };
}
