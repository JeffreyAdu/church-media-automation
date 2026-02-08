/**
 * YouTube API Service
 * Fetches video data from YouTube Data API v3.
 * Resolves YouTube channel IDs from various input formats.
 */

import { youtubeConfig } from "../../config/youtube.js";
import { AppError } from "../../utils/errors.js";

// Multiple regex patterns for different YouTube HTML structures
const CHANNEL_ID_PATTERNS = [
  /"channelId":"(UC[\w-]{22})"/,
  /"channelId\\":\\"(UC[\w-]{22})\\"/,
  /<link rel="canonical" href="https:\/\/www\.youtube\.com\/channel\/(UC[\w-]{22})"/,
  /"externalId":"(UC[\w-]{22})"/,
  /<meta property="og:url" content="https:\/\/www\.youtube\.com\/channel\/(UC[\w-]{22})"/,
];

export interface YouTubeVideo {
  videoId: string;
  title: string;
  description: string;
  publishedAt: string; // ISO 8601 format
  thumbnailUrl: string;
}

/**
 * Fetches all videos from a YouTube channel published since a specific date.
 */
export async function fetchChannelVideosSince(
  channelId: string,
  since: Date
): Promise<YouTubeVideo[]> {
  console.log(`[YouTube API] Fetching videos from channel ${channelId} since ${since.toISOString()}`);
  
  const videos: YouTubeVideo[] = [];
  let pageToken: string | undefined;
  let pageNum = 0;

  do {
    pageNum++;
    const url = new URL(`${youtubeConfig.apiBase}/search`);
    url.searchParams.set("key", youtubeConfig.apiKey);
    url.searchParams.set("channelId", channelId);
    url.searchParams.set("part", "snippet");
    url.searchParams.set("order", "date");
    url.searchParams.set("type", "video");
    url.searchParams.set("maxResults", "50");
    url.searchParams.set("publishedAfter", since.toISOString());
    if (pageToken) {
      url.searchParams.set("pageToken", pageToken);
    }

    console.log(`[YouTube API] Fetching page ${pageNum}...`);
    const response = await fetch(url.toString());
    if (!response.ok) {
      const error = await response.text();
      throw new AppError(`YouTube API error: ${error}`, response.status);
    }

    const data = await response.json();

    // Map and push all items at once
    const pageVideos = (data.items || []).map((item: any) => ({ 
      videoId: item.id.videoId,
      title: item.snippet.title,
      description: item.snippet.description,
      publishedAt: item.snippet.publishedAt,
      thumbnailUrl: item.snippet.thumbnails?.high?.url || item.snippet.thumbnails?.default?.url,
    }));

    videos.push(...pageVideos);
    console.log(`[YouTube API] Page ${pageNum}: +${pageVideos.length} videos (total: ${videos.length})`);
    
    pageToken = data.nextPageToken;
  } while (pageToken);

  console.log(`[YouTube API] ✓ Fetched ${videos.length} videos total in ${pageNum} pages`);
  return videos;
}

/**
 * Try YouTube Data API v3 for channel ID resolution (if API key is configured)
 */
async function tryYouTubeDataAPI(handle: string): Promise<string | null> {
  if (!youtubeConfig.apiKey) {
    console.log('[YouTube API] No API key configured, skipping');
    return null;
  }

  try {
    const cleanHandle = handle.replace('@', '');
    const url = `https://www.googleapis.com/youtube/v3/channels?part=id&forHandle=${cleanHandle}&key=${youtubeConfig.apiKey}`;
    const res = await fetch(url);
    
    if (!res.ok) {
      console.error(`[YouTube API] Failed: ${res.status}`);
      return null;
    }

    const data = await res.json();
    if (data.items?.[0]?.id) {
      console.log(`[YouTube API] Found channel ID: ${data.items[0].id}`);
      return data.items[0].id;
    }
  } catch (err) {
    console.error('[YouTube API] Error:', err);
  }
  
  return null;
}

/**
 * Try third-party API (no auth needed)
 */
async function tryThirdPartyAPI(handle: string): Promise<string | null> {
  try {
    const url = `https://yt.lemnoslife.com/channels?handle=${handle}`;
    const res = await fetch(url, { 
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(5000) // 5s timeout
    });
    
    if (!res.ok) {
      console.error(`[YouTube Third-party API] Failed: ${res.status}`);
      return null;
    }

    const data = await res.json();
    if (data.items?.[0]?.id) {
      console.log(`[YouTube Third-party API] Found channel ID: ${data.items[0].id}`);
      return data.items[0].id;
    }
  } catch (err) {
    console.error('[YouTube Third-party API] Error:', err);
  }
  
  return null;
}

/**
 * Fallback: HTML scraping (multiple patterns)
 */
async function tryHTMLScraping(handle: string): Promise<string | null> {
  try {
    const pageUrl = `https://www.youtube.com/${handle}`;
    const res = await fetch(pageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      }
    });
    
    if (!res.ok) {
      console.error(`[YouTube HTML] Failed to fetch: ${res.status}`);
      return null;
    }

    const html = await res.text();
    
    // Try all patterns
    for (const pattern of CHANNEL_ID_PATTERNS) {
      const idMatch = html.match(pattern);
      if (idMatch && idMatch[1]) {
        console.log(`[YouTube HTML] Extracted channel ID: ${idMatch[1]}`);
        return idMatch[1];
      }
    }
    
    console.error(`[YouTube HTML] No patterns matched. HTML length: ${html.length}`);
  } catch (err) {
    console.error('[YouTube HTML] Error:', err);
  }
  
  return null;
}

/**
 * Resolves a YouTube channel ID from various input formats.
 * Uses layered approach: YouTube API → Third-party API → HTML scraping
 * 
 * Accepts:
 * - Full channel ID: UCxxxxxxxxxxxxxxxxxxxxxx
 * - Channel URL: https://youtube.com/channel/UC...
 * - Handle URL: https://youtube.com/@username
 * - Handle: @username
 * 
 * Returns channel ID (UC...) or throws error.
 */
export async function resolveChannelId(input: string): Promise<string> {
  const trimmed = input.trim();

  // Already a channel ID
  if (/^UC[\w-]{22}$/.test(trimmed)) {
    console.log('[YouTube] Input is already a channel ID');
    return trimmed;
  }

  try {
    const url = new URL(trimmed.startsWith('http') ? trimmed : `https://www.youtube.com/${trimmed}`);

    // Extract from /channel/UC... path
    const channelMatch = url.pathname.match(/\/channel\/(UC[\w-]{22})/);
    if (channelMatch) {
      console.log('[YouTube] Extracted channel ID from URL path');
      return channelMatch[1];
    }

    // Handle: /@username
    const handleMatch = url.pathname.match(/@([\w.-]{3,})/);
    if (handleMatch) {
      const handle = handleMatch[0]; // includes the @
      console.log(`[YouTube] Resolving handle: ${handle}`);
      
      // Try methods in order (most reliable first)
      let channelId = await tryYouTubeDataAPI(handle);
      if (channelId) return channelId;
      
      channelId = await tryThirdPartyAPI(handle);
      if (channelId) return channelId;
      
      channelId = await tryHTMLScraping(handle);
      if (channelId) return channelId;
      
      throw new Error(`Could not resolve channel ID for handle ${handle}. Channel may be private, deleted, or unavailable.`);
    }
  } catch (err) {
    if (err instanceof Error && err.message.includes('Could not resolve')) {
      throw err; // Re-throw our custom error
    }
    console.error('[YouTube] Error during resolution:', err);
  }

  throw new Error('Unable to resolve YouTube channel ID from input. Provide a valid channel URL, handle (@username), or channel ID (UC...).');
}
