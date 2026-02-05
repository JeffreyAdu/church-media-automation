/**
 * Video Service
 * Business logic for video processing and YouTube webhook handling.
 */

import { XMLParser } from "fast-xml-parser";
import { verifySignature } from "../external/websub.js";
import { findByChannelId } from "../../repositories/agentRepository.js";
import { upsertVideo, findById, Video } from "../../repositories/videoRepository.js";
import { createJob } from "../../repositories/jobRepository.js";
import { enqueueProcessVideo } from "../external/queue/enqueueProcessVideo.js";

/**
 * Processes a YouTube WebSub notification.
 * Verifies signature, parses XML, finds agent, creates video record, and enqueues job.
 */
export async function processYouTubeNotification(
  xmlBody: string,
  signature?: string
): Promise<void> {
  try {
    // Verify signature
    const isValid = await verifySignature(xmlBody, signature);
    if (!isValid) {
      console.warn("WebSub notification signature verification failed");
      return;
    }
    
    const parser = new XMLParser();
    const feed = parser.parse(xmlBody);
    
    // Extract video data from Atom feed
    const entry = feed?.feed?.entry;
    if (!entry) {
      console.warn("No entry found in WebSub notification");
      return;
    }
    
    const videoId = entry["yt:videoId"];
    const channelId = entry["yt:channelId"];
    const title = entry.title;
    const published = entry.published;
    const link = entry.link?.href || `https://www.youtube.com/watch?v=${videoId}`;
    
    if (!videoId || !channelId) {
      console.warn("Missing videoId or channelId in notification");
      return;
    }
    
    console.log(`Received video notification: ${videoId} from channel ${channelId}`);
    
    // Find agent by channelId
    const agent = await findByChannelId(channelId);
    if (!agent) {
      console.warn(`No active agent found for channel ${channelId}`);
      return;
    }
    
    // Upsert video record
    const video = await upsertVideo({
      agent_id: agent.id,
      youtube_video_id: videoId,
      youtube_url: link,
      title,
      published_at: published,
      raw_payload: entry,
    });
    
    console.log(`✓ Video ${videoId} saved with id ${video.id}`);
    
    const queueResult = await enqueueProcessVideo({
      agentId: agent.id,
      youtubeVideoId: videoId,
      youtubeUrl: link,
    });

    if (!queueResult.enqueued) {
      console.log(`↷ Job already queued for video ${videoId}`);
      return;
    }

    const job = await createJob({
      agent_id: agent.id,
      video_id: video.id,
      type: "process_video",
    });

    console.log(`✓ Job ${job.id} created + queued (${queueResult.jobId})`);
    
  } catch (error) {
    console.error("Failed to process YouTube notification:", error);
  }
}

/**
 * Finds a video by ID.
 */
export async function getVideoById(videoId: string): Promise<Video | null> {
  return await findById(videoId);
}
