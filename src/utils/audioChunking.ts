/**
 * Audio Chunking Utility
 * Splits long audio files into smaller chunks using FFmpeg segment muxer
 * OPTIMIZED: Single FFmpeg process instead of N sequential processes
 */

import ffmpeg from 'fluent-ffmpeg';
import { readdir, stat } from 'fs/promises';
import path from 'path';

const QUALITY_BITRATE = 64; // Speech-optimized to match compression
const CHUNK_DURATION_MINUTES = 45; // 45min chunks at 64kbps = ~4.3MB each
const AUDIO_FREQ = 16000; // Whisper's native frequency
const CHANNELS = 1; // Mono

/**
 * Helper to promisify FFmpeg command execution
 */
function ffmpegRun(command: ffmpeg.FfmpegCommand): Promise<void> {
  return new Promise((resolve, reject) => {
    command
      .on('end', () => resolve())
      .on('error', (err) => reject(err))
      .run();
  });
}

/**
 * Split audio into fixed-duration chunks using a single FFmpeg run
 * Returns array of chunk file paths (sorted chronologically)
 * 
 * PERFORMANCE: Uses FFmpeg's segment muxer to:
 * - Decode audio once
 * - Encode once
 * - Split output stream into multiple files
 * This is O(1) FFmpeg processes instead of O(N)
 */
export async function splitIntoChunks(
  audioPath: string,
  audioDurationSeconds: number
): Promise<string[]> {
  const chunkDurationSeconds = CHUNK_DURATION_MINUTES * 60;
  const numChunks = Math.ceil(audioDurationSeconds / chunkDurationSeconds);

  const audioDir = path.dirname(audioPath);
  const base = path.basename(audioPath, path.extname(audioPath));

  // Use zero-padded numbering so lexical sort == chronological order
  const pattern = path.join(audioDir, `${base}_chunk%03d.mp3`);

  console.log(
    `[chunking] Splitting ${(audioDurationSeconds / 60).toFixed(1)}min audio into ` +
    `${numChunks} chunks of ${CHUNK_DURATION_MINUTES}min each (single FFmpeg run)`
  );

  const cmd = ffmpeg(audioPath)
    // Encode settings (applies once, segmenter splits output)
    .audioCodec('libmp3lame')
    .audioBitrate(`${QUALITY_BITRATE}k`)
    .audioChannels(CHANNELS)
    .audioFrequency(AUDIO_FREQ)
    // Segmenting output
    .outputOptions([
      '-f segment',
      `-segment_time ${chunkDurationSeconds}`,
      '-reset_timestamps 1',
      // Avoid tiny extra tail chunks due to timestamp drift
      '-segment_time_delta 0.5',
    ])
    .output(pattern);

  await ffmpegRun(cmd);

  // Collect generated chunks from directory
  const files = await readdir(audioDir);
  const chunkFiles = files
    .filter((f) => f.startsWith(`${base}_chunk`) && f.endsWith('.mp3'))
    .sort()
    .map((f) => path.join(audioDir, f));

  // Log sizes for monitoring
  let totalMB = 0;
  for (const [idx, file] of chunkFiles.entries()) {
    const s = await stat(file);
    const mb = s.size / (1024 * 1024);
    totalMB += mb;
    console.log(`[chunking] ✓ Chunk ${idx + 1}/${chunkFiles.length}: ${mb.toFixed(2)}MB`);
  }
  console.log(`[chunking] ✓ Total chunk output: ${totalMB.toFixed(2)}MB`);

  return chunkFiles;
}
