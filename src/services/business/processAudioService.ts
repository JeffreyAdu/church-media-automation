/**
 * Process Audio Service
 * Business service wrapper for audio processing operations.
 */

import { concatenateAudio } from "../external/ffmpeg.js";
import { extractAudioSegment } from "../external/ffmpeg/extractSegment.js";

export interface ConcatenationResult {
  outputPath: string;
}

/**
 * Extracts a specific time range from audio.
 */
export async function extractSegment(
  inputPath: string,
  startSec: number,
  endSec: number,
  outputFileName: string
): Promise<string> {
  return await extractAudioSegment(inputPath, startSec, endSec, outputFileName);
}

/**
 * Concatenates multiple audio files (intro, main content, outro).
 */
export async function concatenateAudioFiles(
  introPath: string | null,
  mainPath: string,
  outroPath: string | null,
  outputFileName: string
): Promise<ConcatenationResult> {
  return await concatenateAudio(introPath, mainPath, outroPath, outputFileName);
}
