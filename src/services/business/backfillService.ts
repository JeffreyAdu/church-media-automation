/**
 * Backfill Service
 * Business logic for backfilling historical videos from YouTube.
 */

import { findById } from "../../repositories/agentRepository.js";
import { upsertVideo } from "../../repositories/videoRepository.js";
import { fetchChannelVideosSince } from "../external/youtube.js";
import { enqueueProcessVideo } from "../external/queue/enqueueProcessVideo.js";
import { NotFoundError } from "../../utils/errors.js";

export interface BackfillResult {
  totalVideosFound: number;
  videosEnqueued: number;
  videoIds: string[];
}

/**
 * Backfills videos from a specific date for an agent.
 * Fetches videos from YouTube, upserts them into DB, and enqueues processing jobs.
 */
export async function backfillVideos(
  agentId: string,
  since: Date
): Promise<BackfillResult> {
  // Find agent
  const agent = await findById(agentId);
  if (!agent) {
    throw new NotFoundError("Agent", agentId);
  }

  if (agent.status !== "active") {
    throw new Error(`Agent must be active to backfill videos. Current status: ${agent.status}`);
  }

  // Fetch videos from YouTube
  const youtubeVideos = await fetchChannelVideosSince(agent.youtube_channel_id, since);

  // Process all videos in parallel
  const results = await Promise.allSettled(
    youtubeVideos.map(async (ytVideo) => {
      const video = await upsertVideo({
        agent_id: agentId,
        youtube_video_id: ytVideo.videoId,
        youtube_url: `https://www.youtube.com/watch?v=${ytVideo.videoId}`,
        title: ytVideo.title,
        published_at: ytVideo.publishedAt,
        raw_payload: {
          description: ytVideo.description,
          thumbnailUrl: ytVideo.thumbnailUrl,
        },
      });

      console.log(`[backfill] Video ${ytVideo.videoId} status: ${video.status}`);

      // Only enqueue if status is "discovered" (newly created or not yet processed)
      if (video.status === "discovered") {
        const enqueueResult = await enqueueProcessVideo({
          agentId: agent.id,
          youtubeVideoId: video.youtube_video_id,
          youtubeUrl: video.youtube_url,
          title: video.title, // Include title for UI display
        });
        console.log(`[backfill] Enqueue result for ${video.youtube_video_id}:`, enqueueResult);

        if (enqueueResult.enqueued) {
          return video.youtube_video_id;
        }
      }
      console.log(`[backfill] Skipping enqueue for ${video.youtube_video_id}, status: ${video.status}`);
      return null;
    })
  );

  // Extract successfully enqueued video IDs
  const enqueuedVideoIds = results
    .filter((r) => r.status === "fulfilled" && r.value !== null)
    .map((r) => (r as PromiseFulfilledResult<string>).value);

  // Log any rejected promises (errors)
  const rejectedResults = results.filter((r) => r.status === "rejected");
  if (rejectedResults.length > 0) {
    console.error("[backfill] Some videos failed to enqueue:");
    rejectedResults.forEach((r) => {
      console.error("  -", (r as PromiseRejectedResult).reason);
    });
  }

  return {
    totalVideosFound: youtubeVideos.length,
    videosEnqueued: enqueuedVideoIds.length,
    videoIds: enqueuedVideoIds,
  };
}
