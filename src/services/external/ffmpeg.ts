/**
 * FFmpeg Service
 * Handles audio concatenation with intro/outro.
 */

import { exec } from "child_process";
import { promisify } from "util";
import { writeFile, unlink, mkdir, access } from "fs/promises";
import path from "path";
import os from "os";

const execAsync = promisify(exec);

export interface ConcatenateResult {
  outputPath: string;
}

export interface SpeechSegment {
  startSec: number;
  endSec: number;
  durationSec: number;
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

/**
 * Converts audio to 16kHz mono WAV for VAD processing.
 * Results are cached to avoid expensive re-conversion.
 */
export async function convertToWav16kMono(
  inputPath: string,
  outputFileName: string
): Promise<string> {
  const tempDir = path.join(os.tmpdir(), "vad-processing");
  
  // Ensure the directory exists
  await mkdir(tempDir, { recursive: true });
  
  const outputPath = path.join(tempDir, outputFileName);

  // Check if WAV already exists (cached)
  try {
    await access(outputPath);
    console.log("[ffmpeg] using cached WAV conversion");
    return outputPath;
  } catch {
    // Cache miss, continue with conversion
  }

  console.log("[ffmpeg] converting to 16kHz mono WAV");

  const command = [
    "ffmpeg",
    "-i", inputPath,
    "-ar", "16000", // 16kHz sample rate
    "-ac", "1", // mono
    "-y", // overwrite
    outputPath,
  ].join(" ");

  await execAsync(command);

  return outputPath;
}



/**
 * Extracts and concatenates only speech segments from audio.
 * Removes music, silence, and non-speech content.
 * Results are cached to avoid expensive re-processing.
 */
export async function extractAndConcatenateSpeech(
  inputPath: string,
  segments: SpeechSegment[],
  outputFileName: string
): Promise<ConcatenateResult> {
  if (segments.length === 0) {
    throw new Error("No speech segments to extract");
  }

  const tempDir = path.join(os.tmpdir(), "ffmpeg-output");
  
  // Ensure the directory exists
  await mkdir(tempDir, { recursive: true });
  
  const outputPath = path.join(tempDir, outputFileName);

  // Check if speech-only audio already exists (cached)
  try {
    await access(outputPath);
    console.log("[ffmpeg] using cached speech-only audio");
    return { outputPath };
  } catch {
    // Cache miss, continue with extraction
  }

  console.log("[ffmpeg] extracting speech-only audio");

  // Build aselect filter expression: between(t,start1,end1)+between(t,start2,end2)+...
  const selectExpr = segments
    .map((seg) => `between(t,${seg.startSec},${seg.endSec})`)
    .join("+");

  const command = [
    "ffmpeg",
    "-i", inputPath,
    "-af", `aselect='${selectExpr}',asetpts=N/SR/TB`,
    "-y",
    outputPath,
  ].join(" ");

  await execAsync(command);

  return { outputPath };
}
