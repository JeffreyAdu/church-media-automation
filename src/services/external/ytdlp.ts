/**
 * YouTube Download Service
 * Downloads audio from YouTube videos using youtube-dl-exec.
 */

import youtubedl from "youtube-dl-exec";
import { mkdir } from "fs/promises";
import fs from "fs";
import path from "path";
import os from "os";

export interface DownloadResult {
  audioPath: string;
  title: string;
  durationSeconds: number;
}

/**
 * Downloads audio from a YouTube video.
 * Returns path to the downloaded audio file.
 * Uses youtube-dl-exec which works with both yt-dlp and youtube-dl.
 */
export async function downloadYouTubeAudio(
  youtubeUrl: string,
  videoId: string
): Promise<DownloadResult> {
  const tempDir = path.join(os.tmpdir(), "youtube-audio", videoId);
  await mkdir(tempDir, { recursive: true });

  const outputPath = path.join(tempDir, "audio.mp3");

  // Check if already downloaded (skip re-download on retry)
  if (fs.existsSync(outputPath)) {
    console.log(`[youtube-dl] Audio already exists, skipping download: ${outputPath}`);
    
    // Still need metadata, so fetch it
    console.log(`[youtube-dl] Fetching metadata...`);
    const metadataRaw = await youtubedl(youtubeUrl, {
      dumpSingleJson: true,
      noPlaylist: true,
    });

    const metadata = typeof metadataRaw === 'string' ? JSON.parse(metadataRaw) : metadataRaw;
    const title = metadata.title || "Unknown";
    const durationSeconds = metadata.duration || 0;

    console.log(`[youtube-dl] Title: ${title}`);
    console.log(`[youtube-dl] Duration: ${durationSeconds}s`);

    return {
      audioPath: outputPath,
      title,
      durationSeconds,
    };
  }

  console.log(`[youtube-dl] Downloading audio from: ${youtubeUrl}`);
  console.log(`[youtube-dl] Output path: ${outputPath}`);

  try {
    // Get metadata first
    console.log(`[youtube-dl] Fetching metadata...`);
    const metadataRaw = await youtubedl(youtubeUrl, {
      dumpSingleJson: true,
      noPlaylist: true,
    });

    const metadata = typeof metadataRaw === 'string' ? JSON.parse(metadataRaw) : metadataRaw;
    const title = metadata.title || "Unknown";
    const durationSeconds = metadata.duration || 0;

    console.log(`[youtube-dl] Title: ${title}`);
    console.log(`[youtube-dl] Duration: ${durationSeconds}s`);

    // Download audio
    console.log(`[youtube-dl] Downloading audio...`);
    await youtubedl(youtubeUrl, {
      extractAudio: true,
      audioFormat: "mp3",
      output: outputPath,
    });

    // Verify file exists
    if (!fs.existsSync(outputPath)) {
      throw new Error(`Download completed but file not found: ${outputPath}`);
    }

    console.log(`[youtube-dl] Download completed successfully`);

    return {
      audioPath: outputPath,
      title,
      durationSeconds,
    };
  } catch (error: any) {
    const errorMessage = error.stderr || error.message || String(error);
    console.error(`[youtube-dl] Error:`, errorMessage);
    throw new Error(`YouTube download failed: ${errorMessage}`);
  }
}
