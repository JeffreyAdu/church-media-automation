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
  bitrateKbps?: number;          // default 64 for STT; set 128 if needed
  sampleRate?: number;           // default 16000
  channels?: number;             // default 1
  speechFilters?: boolean;       // default true
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
 * Compress audio for speech-to-text
 * Default settings are speech-optimized and size-conscious
 * 
 * Features:
 * - 64kbps default (more efficient than 128kbps for speech)
 * - Speech cleanup filters (highpass, lowpass, loudnorm)
 * - Idempotent (won't reprocess if output exists)
 * - Collision-resistant output naming
 */
export async function compressForStt(
  audioPath: string,
  opts: CompressOptions = {}
): Promise<string> {
  const bitrateKbps = opts.bitrateKbps ?? 64;     // Speech-optimized
  const sampleRate = opts.sampleRate ?? 16000;
  const channels = opts.channels ?? 1;
  const speechFilters = opts.speechFilters ?? true;
  const overwrite = opts.overwrite ?? false;

  const ext = path.extname(audioPath);
  const base = path.basename(audioPath, ext);
  const dir = path.dirname(audioPath);

  // Collision-resistant output name
  const outputPath = path.join(dir, `${base}-stt-${bitrateKbps}k-${sampleRate}hz-m${channels}.mp3`);

  // Idempotency: don't redo work unless overwrite=true
  if (!overwrite && existsSync(outputPath)) {
    const s = await stat(outputPath);
    if (s.size > 0) {
      console.log(`[compress] Using existing compressed file: ${path.basename(outputPath)} (${(s.size / 1024 / 1024).toFixed(2)}MB)`);
      return outputPath;
    }
  }

  console.log(`[compress] Compressing for STT: ${bitrateKbps}kbps, ${sampleRate}Hz, mono=${channels === 1}`);

  // Speech cleanup chain (optional)
  const af = speechFilters
    ? [
        `highpass=f=80`,         // remove rumble
        `lowpass=f=8000`,        // reduce very high noise (speech rarely needs above this)
        `loudnorm=I=-16:LRA=11:TP=-1.5` // normalize loudness for more consistent transcription
      ].join(',')
    : undefined;

  let lastLoggedPercent = -5;

  await new Promise<void>((resolve, reject) => {
    const cmd = ffmpeg(audioPath)
      .audioCodec('libmp3lame')
      .audioBitrate(`${bitrateKbps}k`)
      .audioFrequency(sampleRate)
      .audioChannels(channels)
      .format('mp3');

    if (af) cmd.audioFilters(af);

    cmd
      .on('start', (line) => console.log(`[compress] ffmpeg: ${line}`))
      .on('progress', (p) => {
        if (typeof p.percent === 'number') {
          // throttle logging to every ~5%
          const rounded = Math.floor(p.percent / 5) * 5;
          if (rounded >= lastLoggedPercent + 5) {
            lastLoggedPercent = rounded;
            console.log(`[compress] Progress: ~${rounded}%`);
          }
        }
      })
      .on('end', () => resolve())
      .on('error', (err) => reject(err));

    // If overwrite is requested, ffmpeg should overwrite
    if (overwrite) {
      cmd.outputOptions(['-y']).save(outputPath);
    } else {
      cmd.outputOptions(['-n']).save(outputPath); // don't overwrite
    }
  });

  const s = await stat(outputPath);
  console.log(`[compress] ✓ Output: ${(s.size / 1024 / 1024).toFixed(2)}MB → ${path.basename(outputPath)}`);

  return outputPath;
}
