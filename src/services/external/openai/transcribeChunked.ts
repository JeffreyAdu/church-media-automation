/**
 * Whisper Transcription Service
 * Supports both local (faster-whisper) and API (OpenAI) transcription.
 * Local: No size limits, no API costs, runs on worker CPU
 * API: Faster for short files, has 25MB limit
 */

import { openaiClient, openaiConfig } from "../../../config/openai.js";
import { createReadStream, statSync } from "fs";
import { unlink } from "fs/promises";
import { compressForWhisper } from "../ffmpeg.js";
import { transcribeWithWhisperLocal } from "../whisperLocal.js";
import path from "path";

export type TranscriptSegment = {
  start: number;
  end: number;
  text: string;
};

export type TranscriptResult = {
  text: string;
  segments: TranscriptSegment[];
};

const MAX_SAFE_SIZE_MB = 20; // Stay under 25MB limit with buffer (API only)
const MAX_SAFE_SIZE_BYTES = MAX_SAFE_SIZE_MB * 1024 * 1024;

// Use local Whisper by default (no size limits, no API costs)
const USE_LOCAL_WHISPER = process.env.USE_LOCAL_WHISPER !== "false";

/**
 * Transcribes audio file with automatic method selection.
 * - Local Whisper (default): No size limits, no API costs, runs on worker
 * - OpenAI API (fallback): Faster for short files, compression if > 20MB
 */
export async function transcribeWithTimestamps(
  audioPath: string
): Promise<TranscriptResult> {
  const fileSize = statSync(audioPath).size;
  const fileSizeMB = fileSize / 1024 / 1024;

  console.log(`[transcribe] File size: ${fileSizeMB.toFixed(2)}MB`);
  
  // Use local Whisper if enabled (default)
  if (USE_LOCAL_WHISPER) {
    console.log(`[transcribe] Using local faster-whisper (no size limits)`);
    return transcribeWithWhisperLocal(audioPath);
  }
  
  // Fallback to OpenAI API (requires compression for large files)
  console.log(`[transcribe] Using OpenAI Whisper API`);

  let pathForWhisper = audioPath;
  let needsCleanup = false;

  // If file is too large, compress it for transcription
  if (fileSize > MAX_SAFE_SIZE_BYTES) {
    console.log(`[transcribe] ⚠️ File exceeds ${MAX_SAFE_SIZE_MB}MB - compressing for Whisper API`);
    
    const compressedFileName = `${path.basename(audioPath, path.extname(audioPath))}_whisper.mp3`;
    pathForWhisper = await compressForWhisper(audioPath, compressedFileName);
    needsCleanup = true;

    const compressedSize = statSync(pathForWhisper).size;
    const compressedSizeMB = compressedSize / 1024 / 1024;
    console.log(`[transcribe] ✓ Compressed: ${fileSizeMB.toFixed(2)}MB → ${compressedSizeMB.toFixed(2)}MB`);

    // Safety check: ensure compressed file is still under limit
    if (compressedSize > MAX_SAFE_SIZE_BYTES) {
      throw new Error(
        `Compressed audio (${compressedSizeMB.toFixed(2)}MB) still exceeds ${MAX_SAFE_SIZE_MB}MB limit. ` +
        `Original: ${fileSizeMB.toFixed(2)}MB. Set USE_LOCAL_WHISPER=true for unlimited file sizes.`
      );
    }
  } else {
    console.log(`[transcribe] File within limit, transcribing directly`);
  }

  try {
    // Transcribe the file (compressed or original)
    const audioStream = createReadStream(pathForWhisper);

    const transcription = await openaiClient.audio.transcriptions.create({
      file: audioStream,
      model: openaiConfig.transcriptionModel,
      response_format: "verbose_json",
      timestamp_granularities: ["segment"],
    });

    if (!transcription.segments || transcription.segments.length === 0) {
      throw new Error("Transcription returned no segments. Timestamps are required for sermon detection.");
    }

    const segments: TranscriptSegment[] = transcription.segments.map((seg: any) => ({
      start: seg.start,
      end: seg.end,
      text: seg.text,
    }));

    return {
      text: transcription.text,
      segments,
    };
  } finally {
    // Clean up compressed file if we created one
    if (needsCleanup) {
      try {
        await unlink(pathForWhisper);
        console.log(`[transcribe] cleaned up compressed file`);
      } catch (err) {
        console.warn(`[transcribe] failed to cleanup compressed file: ${err}`);
      }
    }
  }
}
