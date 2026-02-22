/**
 * Audio Compression Utility
 * Handles FFmpeg compression operations optimized for speech-to-text
 * Speech-focused: Lower bitrate + audio filters for better STT quality
 */

import ffmpeg from 'fluent-ffmpeg';
import { stat } from 'fs/promises';
import fs from 'fs';
import path from 'path';

type CompressOptions = {
  bitrateKbps?: number;          // default 64
  sampleRate?: number;           // default 16000
  channels?: number;             // default 1
  overwrite?: boolean;           // default false
};

function existsSync(p: string): boolean {
  try {
    fs.accessSync(p, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get audio duration in seconds
 */
export async function getAudioDuration(audioPath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(audioPath, (err, metadata) => {
      if (err) return reject(err);
      const dur = metadata?.format?.duration;
      resolve(typeof dur === 'number' ? dur : 0);
    });
  });
}

/**
 * Compress audio for speech-to-text.
 * Outputs 64kbps MP3 at 16kHz mono — reduces a 174min service from ~120MB to ~79MB.
 * The transcription service handles routing: <25MB direct upload, 25-95MB via Supabase URL.
 * Idempotent: skips reprocessing if output already exists.
 */
export async function compressForStt(
  audioPath: string,
  opts: CompressOptions = {}
): Promise<string> {
  const bitrateKbps = opts.bitrateKbps ?? 64;
  const sampleRate = opts.sampleRate ?? 16000;
  const channels = opts.channels ?? 1;
  const overwrite = opts.overwrite ?? false;

  const ext = path.extname(audioPath);
  const base = path.basename(audioPath, ext);
  const dir = path.dirname(audioPath);

  const outputPath = path.join(dir, `${base}-stt-${bitrateKbps}k-${sampleRate}hz-m${channels}.mp3`);

  // Idempotency: skip if already exists and non-empty
  if (!overwrite && existsSync(outputPath)) {
    const s = await stat(outputPath);
    if (s.size > 0) {
      console.log(`[compress] Using existing file: ${path.basename(outputPath)} (${(s.size / 1024 / 1024).toFixed(2)}MB)`);
      return outputPath;
    }
  }

  console.log(`[compress] Compressing for STT: ${bitrateKbps}kbps MP3, ${sampleRate}Hz, mono`);

  let lastLoggedPercent = -5;

  await new Promise<void>((resolve, reject) => {
    const cmd = ffmpeg(audioPath)
      .audioCodec('libmp3lame')
      .audioBitrate(`${bitrateKbps}k`)
      .audioFrequency(sampleRate)
      .audioChannels(channels)
      .format('mp3');

    cmd
      .on('start', (line) => console.log(`[compress] ffmpeg: ${line}`))
      .on('progress', (p) => {
        if (typeof p.percent === 'number') {
          const rounded = Math.floor(p.percent / 5) * 5;
          if (rounded >= lastLoggedPercent + 5) {
            lastLoggedPercent = rounded;
            console.log(`[compress] Progress: ~${rounded}%`);
          }
        }
      })
      .on('end', () => resolve())
      .on('error', (err) => reject(err));

    if (overwrite) {
      cmd.outputOptions(['-y']).save(outputPath);
    } else {
      cmd.save(outputPath);
    }
  });

  const s = await stat(outputPath);
  console.log(`[compress] ✓ Output: ${(s.size / 1024 / 1024).toFixed(2)}MB → ${path.basename(outputPath)}`);

  return outputPath;
}
