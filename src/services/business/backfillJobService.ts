/**
 * Backfill Job Service
 * Business logic for managing backfill jobs
 */

import {
  createBackfillJob,
  findBackfillJobById,
  updateJobStatus,
  updateJobProgress,
  getAgentBackfillJobs,
  type BackfillJob,
  type UpdateJobProgressInput,
  type FailedVideo,
} from "../../repositories/backfillJobRepository.js";
import { findById as findAgentById } from "../../repositories/agentRepository.js";
import { upsertVideo } from "../../repositories/videoRepository.js";
import { fetchChannelVideosSince } from "../external/youtube.js";
import { enqueueProcessVideo } from "../external/queue/enqueueProcessVideo.js";
import { NotFoundError } from "../../utils/errors.js";
import { queues } from "../../config/queues.js";
import { getGenericErrorMessage } from "../../utils/errorMessages.js";

export interface BackfillJobWithProgress extends BackfillJob {
  activeVideos?: Array<{
    videoId: string;
    progress: number;
    status: string;
  }>;
}

/**
 * Create a new backfill job
 */
export async function createJob(agentId: string, sinceDate: Date): Promise<BackfillJob> {
  // Verify agent exists and is active
  const agent = await findAgentById(agentId);
  if (!agent) {
    throw new NotFoundError("Agent", agentId);
  }

  if (agent.status !== "active") {
    throw new Error(`Agent must be active to backfill videos. Current status: ${agent.status}`);
  }

  // Create the job
  return await createBackfillJob({
    agent_id: agentId,
    since_date: sinceDate,
  });
}

/**
 * Get job status with real-time BullMQ progress
 */
export async function getJobStatus(jobId: string): Promise<BackfillJobWithProgress> {
  const job = await findBackfillJobById(jobId);
  if (!job) {
    throw new NotFoundError("Backfill job", jobId);
  }

  // Fetch active video jobs from BullMQ to get progress info
  const activeJobs = await queues.processVideo.getJobs(["active", "waiting"]);
  const activeVideos = await Promise.all(
    activeJobs
      .filter((j) => j.data.agentId === job.agent_id)
      .map(async (j) => {
        const progress = (j.progress as any) || {};
        return {
          videoId: j.data.youtubeVideoId,
          progress: progress.progress || 0,
          status: progress.status || "Pending...",
        };
      })
  );

  return {
    ...job,
    activeVideos: activeVideos.length > 0 ? activeVideos : undefined,
  };
}

/**
 * Get recent jobs for an agent
 */
export async function getAgentJobs(agentId: string, limit: number = 10): Promise<BackfillJob[]> {
  return await getAgentBackfillJobs(agentId, limit);
}

/**
 * Process a backfill job (called by worker)
 * This is the actual backfill logic that runs in the background
 */
export async function processBackfillJob(jobId: string): Promise<void> {
  const job = await findBackfillJobById(jobId);
  if (!job) {
    throw new NotFoundError("Backfill job", jobId);
  }

  try {
    // Mark as processing
    await updateJobStatus(jobId, "processing");

    // Get agent
    const agent = await findAgentById(job.agent_id);
    if (!agent) {
      throw new NotFoundError("Agent", job.agent_id);
    }

    // Fetch videos from YouTube
    console.log(`[Backfill Job ${jobId}] Fetching videos since ${job.since_date}`);
    const sinceDate = new Date(job.since_date);
    const youtubeVideos = await fetchChannelVideosSince(agent.youtube_channel_id, sinceDate);
    
    console.log(`[Backfill Job ${jobId}] Found ${youtubeVideos.length} videos`);

    // Update total count
    await updateJobProgress(jobId, { total_videos: youtubeVideos.length });

    // Process videos one by one
    console.log(`[Backfill Job ${jobId}] Starting to process and enqueue videos...`);
    let processedCount = 0;
    let enqueuedCount = 0;
    const failedVideos: FailedVideo[] = [];

    for (const ytVideo of youtubeVideos) {
      try {
        // Upsert video in database
        const video = await upsertVideo({
          agent_id: job.agent_id,
          youtube_video_id: ytVideo.videoId,
          youtube_url: `https://www.youtube.com/watch?v=${ytVideo.videoId}`,
          title: ytVideo.title,
          published_at: ytVideo.publishedAt,
          raw_payload: {
            description: ytVideo.description,
            thumbnailUrl: ytVideo.thumbnailUrl,
          },
        });

        processedCount++;

        // Only enqueue if status is "discovered" (newly created or not yet processed)
        if (video.status === "discovered") {
          const enqueueResult = await enqueueProcessVideo({
            agentId: agent.id,
            youtubeVideoId: video.youtube_video_id,
            youtubeUrl: video.youtube_url,
          });

          if (enqueueResult.enqueued) {
            enqueuedCount++;
          }
        }

        // Update progress and log every 10 videos to show activity
        if (processedCount % 10 === 0 || processedCount === youtubeVideos.length) {
          await updateJobProgress(jobId, {
            processed_videos: processedCount,
            enqueued_videos: enqueuedCount,
            failed_videos: failedVideos,
          });
          console.log(`[Backfill Job ${jobId}] Progress: ${processedCount}/${youtubeVideos.length} processed, ${enqueuedCount} enqueued`);
        }
      } catch (videoError) {
        console.error(`[Backfill Job ${jobId}] Error processing video ${ytVideo.videoId}:`, videoError);
        
        // Track failed video with generic error message
        failedVideos.push({
          videoId: ytVideo.videoId,
          title: ytVideo.title,
          reason: getGenericErrorMessage(videoError),
        });

        // Update failed videos list
        await updateJobProgress(jobId, {
          failed_videos: failedVideos,
        });
        
        // Continue with next video instead of failing entire job
      }
    }

    // Mark as completed
    await updateJobProgress(jobId, {
      processed_videos: processedCount,
      enqueued_videos: enqueuedCount,
      failed_videos: failedVideos,
    });
    await updateJobStatus(jobId, "completed");

    console.log(`[Backfill Job ${jobId}] Completed: ${processedCount}/${youtubeVideos.length} processed, ${enqueuedCount} enqueued, ${failedVideos.length} failed`);
  } catch (error) {
    // Mark as failed
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    await updateJobStatus(jobId, "failed", errorMessage);
    console.error(`[Backfill Job ${jobId}] Failed:`, error);
    throw error;
  }
}
