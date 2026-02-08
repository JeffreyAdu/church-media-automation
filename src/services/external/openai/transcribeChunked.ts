/**
 * Chunked Whisper Transcription
 * Splits large audio files into chunks for OpenAI Whisper (25MB limit).
 */

import { openaiClient, openaiConfig } from "../../../config/openai.js";
import { createReadStream, statSync } from "fs";
import { exec } from "child_process";
import { promisify } from "util";
import { mkdir } from "fs/promises";
import path from "path";
import os from "os";

const execAsync = promisify(exec);

export type TranscriptSegment = {
  start: number;
  end: number;
  text: string;
};

export type TranscriptResult = {
  text: string;
  segments: TranscriptSegment[];
};

const MAX_FILE_SIZE_MB = 24; // Stay under 25MB limit with buffer
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

/**
 * Transcribes audio file with chunking if needed.
 * Automatically splits files > 24MB into chunks.
 */
export async function transcribeWithTimestamps(
  audioPath: string
): Promise<TranscriptResult> {
  const fileSize = statSync(audioPath).size;

  console.log(`[transcribe] File size: ${(fileSize / 1024 / 1024).toFixed(2)}MB`);

  // If file is small enough, transcribe directly
  if (fileSize <= MAX_FILE_SIZE_BYTES) {
    console.log(`[transcribe] File within limit, transcribing directly`);
    return await transcribeSingleFile(audioPath, 0);
  }

  // Split large file into chunks
  console.log(`[transcribe] File exceeds limit, splitting into chunks`);
  const chunks = await splitAudioIntoChunks(audioPath);

  console.log(`[transcribe] Transcribing ${chunks.length} chunks`);

  // Transcribe each chunk
  const chunkResults = await Promise.all(
    chunks.map(async (chunk, index) => {
      console.log(`[transcribe] Processing chunk ${index + 1}/${chunks.length}`);
      return await transcribeSingleFile(chunk.path, chunk.startTime);
    })
  );

  // Merge results
  const allSegments: TranscriptSegment[] = [];
  const allText: string[] = [];

  for (const result of chunkResults) {
    allSegments.push(...result.segments);
    allText.push(result.text);
  }

  console.log(`[transcribe] Merged ${allSegments.length} total segments`);

  return {
    text: allText.join(" "),
    segments: allSegments,
  };
}

/**
 * Transcribes a single audio file.
 */
async function transcribeSingleFile(
  audioPath: string,
  timeOffset: number
): Promise<TranscriptResult> {
  const audioStream = createReadStream(audioPath);

  const transcription = await openaiClient.audio.transcriptions.create({
    file: audioStream,
    model: openaiConfig.transcriptionModel,
    response_format: "verbose_json",
    timestamp_granularities: ["segment"],
  });

  if (!transcription.segments || transcription.segments.length === 0) {
    throw new Error("Transcription returned no segments");
  }

  // Adjust timestamps by offset
  const segments: TranscriptSegment[] = transcription.segments.map((seg: any) => ({
    start: seg.start + timeOffset,
    end: seg.end + timeOffset,
    text: seg.text,
  }));

  return {
    text: transcription.text || "",
    segments,
  };
}

/**
 * Splits audio into ~10 minute chunks.
 */
async function splitAudioIntoChunks(
  audioPath: string
): Promise<Array<{ path: string; startTime: number }>> {
  const tempDir = path.join(os.tmpdir(), "transcribe-chunks", path.basename(audioPath, path.extname(audioPath)));
  await mkdir(tempDir, { recursive: true });

  // Get duration using ffprobe (more reliable than shell pipes)
  const { stdout } = await execAsync(
    `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${audioPath}"`
  );

  const totalSeconds = Math.floor(parseFloat(stdout.trim()));
  if (isNaN(totalSeconds) || totalSeconds <= 0) {
    throw new Error(`Could not determine audio duration from: ${stdout}`);
  }

  console.log(`[transcribe] Total duration: ${totalSeconds}s`);

  // Split into 10-minute chunks
  const chunkDuration = 600; // 10 minutes
  const numChunks = Math.ceil(totalSeconds / chunkDuration);

  const chunks: Array<{ path: string; startTime: number }> = [];

  for (let i = 0; i < numChunks; i++) {
    const startTime = i * chunkDuration;
    const chunkPath = path.join(tempDir, `chunk_${i}.mp3`);

    await execAsync(
      `ffmpeg -i "${audioPath}" -ss ${startTime} -t ${chunkDuration} -c copy -y "${chunkPath}"`
    );

    chunks.push({ path: chunkPath, startTime });
  }

  return chunks;
}
