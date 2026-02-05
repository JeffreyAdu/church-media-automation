/**
 * Download Video Service
 * Business service wrapper for YouTube video downloads.
 */

import { downloadYouTubeAudio } from "../external/ytdlp.js";

export interface DownloadResult {
  audioPath: string;
  title: string;
  durationSeconds: number;
}

/**
 * Downloads audio from a YouTube video.
 */
export async function downloadVideo(youtubeUrl: string, youtubeVideoId: string): Promise<DownloadResult> {
  return await downloadYouTubeAudio(youtubeUrl, youtubeVideoId);
}
