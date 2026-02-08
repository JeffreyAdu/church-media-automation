/**
 * YouTube Download Service
 * Downloads audio from YouTube videos using youtube-dl-exec.
 */

import youtubedlBase from "youtube-dl-exec";
import { mkdir } from "fs/promises";
import fs from "fs";
import path from "path";
import os from "os";

// Explicitly set binary path for yt-dlp
// youtube-dl-exec will look for 'yt-dlp' or 'youtube-dl' in PATH
// On Linux (Docker), yt-dlp is typically in /usr/local/bin/yt-dlp or /usr/bin/yt-dlp
const YTDLP_PATH = process.env.YTDLP_PATH || 'yt-dlp';

// Cookie file path for YouTube authentication
const COOKIES_PATH = '/tmp/youtube-cookies.txt';

// Create instance with explicit binary path
const youtubedl = youtubedlBase.create(YTDLP_PATH);

/**
 * Initialize cookies for YouTube authentication on module load.
 * Writes cookies from YOUTUBE_COOKIES environment variable to file.
 * This runs automatically when the module is first imported.
 */
(function initializeCookies() {
  const cookiesEnv = process.env.YOUTUBE_COOKIES;
  
  if (!cookiesEnv) {
    console.log('[youtube-dl] No YOUTUBE_COOKIES env var found - running without authentication');
    console.log('[youtube-dl] ⚠️  May hit bot detection on cloud IPs. See YOUTUBE_COOKIES_SETUP.md');
    return;
  }

  try {
    // Write cookies to file
    fs.writeFileSync(COOKIES_PATH, cookiesEnv, 'utf-8');
    console.log(`[youtube-dl] ✓ YouTube cookies initialized at ${COOKIES_PATH}`);
  } catch (error) {
    console.error('[youtube-dl] Failed to write cookies file:', error);
    // Don't throw - allow app to start, downloads will just fail with bot detection
  }
})();

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
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      cookies: fs.existsSync(COOKIES_PATH) ? COOKIES_PATH : undefined,
      'js-runtimes': 'node',
      'remote-components': 'ejs:github',
    } as any);

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
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      cookies: fs.existsSync(COOKIES_PATH) ? COOKIES_PATH : undefined,
      'js-runtimes': 'node',
      'remote-components': 'ejs:github',
    } as any);

    const metadata = typeof metadataRaw === 'string' ? JSON.parse(metadataRaw) : metadataRaw;
    const title = metadata.title || "Unknown";
    const durationSeconds = metadata.duration || 0;

    console.log(`[youtube-dl] Title: ${title}`);
    console.log(`[youtube-dl] Duration: ${durationSeconds}s`);

    // Download audio
    console.log(`[youtube-dl] Downloading audio...`);
    console.log(`[youtube-dl] ⏳ Duration: ${Math.round(durationSeconds/60)}min - This may take a while on cloud infrastructure`);
    
    await youtubedl(youtubeUrl, {
      format: 'bestaudio[ext=m4a]/bestaudio/best', // Audio-only format
      extractAudio: true,
      audioFormat: "mp3",
      output: outputPath,
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      cookies: fs.existsSync(COOKIES_PATH) ? COOKIES_PATH : undefined,
      'js-runtimes': 'node',
      'remote-components': 'ejs:github',
      limitRate: '5M', // Limit to 5MB/s to avoid throttling
      noPlaylist: true,
      progress: true, // Show progress
    } as any);

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
    console.error(`[youtube-dl] Binary path attempted:`, YTDLP_PATH);
    console.error(`[youtube-dl] Error type:`, typeof error, error?.constructor?.name);
    console.error(`[youtube-dl] Error keys:`, error ? Object.keys(error) : 'null');
    console.error(`[youtube-dl] Error.code:`, error?.code);
    console.error(`[youtube-dl] Error.path:`, error?.path);
    console.error(`[youtube-dl] Error.spawnargs:`, error?.spawnargs);
    console.error(`[youtube-dl] Error.stderr:`, error?.stderr);
    console.error(`[youtube-dl] Error.stdout:`, error?.stdout);
    console.error(`[youtube-dl] Error.message:`, error?.message);
    throw new Error(`YouTube download failed: ${errorMessage}`);
  }
}
