/**
 * Cleanup utility for temporary files
 * Runs on worker startup to clear stale downloads
 */

import fs from "fs";
import path from "path";
import os from "os";

/**
 * Removes all files in /tmp/youtube-audio older than maxAgeHours
 * Also removes corrupt .ytdl files regardless of age
 */
export async function cleanupTempFiles(maxAgeHours: number = 24): Promise<void> {
  const tempBaseDir = path.join(os.tmpdir(), "youtube-audio");
  
  if (!fs.existsSync(tempBaseDir)) {
    console.log('[cleanup] No temp directory found, nothing to clean');
    return;
  }

  console.log(`[cleanup] Scanning ${tempBaseDir} for old files...`);
  
  const now = Date.now();
  const maxAgeMs = maxAgeHours * 60 * 60 * 1000;
  let removedDirs = 0;
  let removedFiles = 0;
  let freedMB = 0;

  try {
    const videoIds = fs.readdirSync(tempBaseDir);
    
    for (const videoId of videoIds) {
      const videoDir = path.join(tempBaseDir, videoId);
      
      // Skip if not a directory
      if (!fs.statSync(videoDir).isDirectory()) {
        continue;
      }

      try {
        const stats = fs.statSync(videoDir);
        const ageMs = now - stats.mtimeMs;
        
        // Check for corrupt .ytdl files (always remove)
        const ytdlFile = path.join(videoDir, "audio.mp3.ytdl");
        if (fs.existsSync(ytdlFile)) {
          const ytdlSize = fs.statSync(ytdlFile).size / (1024 * 1024);
          fs.unlinkSync(ytdlFile);
          freedMB += ytdlSize;
          removedFiles++;
          console.log(`[cleanup] Removed corrupt .ytdl file: ${videoId}`);
        }

        // Remove old directories
        if (ageMs > maxAgeMs) {
          // Calculate size before removal
          const files = fs.readdirSync(videoDir);
          for (const file of files) {
            const filePath = path.join(videoDir, file);
            const fileSize = fs.statSync(filePath).size / (1024 * 1024);
            freedMB += fileSize;
            removedFiles++;
          }
          
          fs.rmSync(videoDir, { recursive: true, force: true });
          removedDirs++;
          console.log(`[cleanup] Removed old temp directory: ${videoId} (${(ageMs / 3600000).toFixed(1)}h old)`);
        }
      } catch (err) {
        console.warn(`[cleanup] Failed to process ${videoId}:`, err);
      }
    }

    console.log(`[cleanup] ✓ Removed ${removedDirs} directories, ${removedFiles} files, freed ${freedMB.toFixed(0)}MB`);
  } catch (error) {
    console.error('[cleanup] Error scanning temp directory:', error);
  }
}

/**
 * Get disk usage for /tmp directory
 */
export function getTempDiskUsage(): { usedMB: number; files: number } {
  const tempBaseDir = path.join(os.tmpdir(), "youtube-audio");
  
  if (!fs.existsSync(tempBaseDir)) {
    return { usedMB: 0, files: 0 };
  }

  let totalBytes = 0;
  let totalFiles = 0;

  try {
    const videoIds = fs.readdirSync(tempBaseDir);
    
    for (const videoId of videoIds) {
      const videoDir = path.join(tempBaseDir, videoId);
      
      if (!fs.statSync(videoDir).isDirectory()) {
        continue;
      }

      const files = fs.readdirSync(videoDir);
      for (const file of files) {
        const filePath = path.join(videoDir, file);
        totalBytes += fs.statSync(filePath).size;
        totalFiles++;
      }
    }
  } catch (err) {
    console.error('[cleanup] Error calculating disk usage:', err);
  }

  return {
    usedMB: totalBytes / (1024 * 1024),
    files: totalFiles,
  };
}
