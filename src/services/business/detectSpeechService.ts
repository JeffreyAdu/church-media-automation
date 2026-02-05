/**
 * Detect Speech Service
 * Business service wrapper for voice activity detection.
 */

import { detectSpeech as vadDetectSpeech, SpeechSegment } from "../external/vad.js";

/**
 * Detects speech segments in an audio file using VAD.
 */
export async function detectSpeech(wavPath: string): Promise<SpeechSegment[]> {
  return await vadDetectSpeech(wavPath);
}
