/**
 * Process Audio Service
 * Business service wrapper for audio processing operations.
 */

import { 
  convertToWav16kMono, 
  extractAndConcatenateSpeech,
  concatenateAudio 
} from "../external/ffmpeg.js";
import { extractAudioSegment } from "../external/ffmpeg/extractSegment.js";
import { SpeechSegment } from "../external/vad.js";

export interface ConcatenationResult {
  outputPath: string;
}

/**
 * Converts audio to WAV format (16kHz mono) for VAD analysis.
 */
export async function convertToWav(inputPath: string, outputFileName: string): Promise<string> {
  return await convertToWav16kMono(inputPath, outputFileName);
}

/**
 * Extracts and concatenates speech segments from audio.
 */
export async function extractSpeechSegments(
  inputPath: string,
  segments: SpeechSegment[],
  outputFileName: string
): Promise<ConcatenationResult> {
  return await extractAndConcatenateSpeech(inputPath, segments, outputFileName);
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
