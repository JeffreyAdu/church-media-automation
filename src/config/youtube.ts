/**
 * YouTube API Configuration
 */

if (!process.env.YOUTUBE_API_KEY) {
  throw new Error("YOUTUBE_API_KEY environment variable is required");
}

export const youtubeConfig = {
  apiKey: process.env.YOUTUBE_API_KEY,
  apiBase: "https://www.googleapis.com/youtube/v3",
} as const;
