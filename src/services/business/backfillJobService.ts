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
import { redis } from "../../config/redis.js";

export interface BackfillJobWithProgress extends BackfillJob {
  activeVideos?: Array<{
    videoId: string;
    title?: string;
    progress: number;
    status: string;
  }>;
  queuedVideos?: Array<{
    videoId: string;
    title?: string;
  }>;
}

/**
 * Publish a backfill job snapshot to SSE subscribers.
 * Channel: agent:backfill:{agentId}
 * Forwarded by progressStreamService as a "jobUpdate" SSE event.
 */
async function publishBackfillJob(
  agentId: string,
  partial: {
    jobId: string;
    status?: string;
    totalVideos?: number;
    processedVideos?: number;
    enqueuedVideos?: number;
    failedVideos?: FailedVideo[];
    activeVideoIds?: string[];
    error?: string | null;
  }
): Promise<void> {
  const channel = `agent:backfill:${agentId}`;
  try {
    await redis.publish(channel, JSON.stringify({ ...partial, updatedAt: new Date().toISOString() }));
  } catch (err) {
    console.error(`[backfill-stream] Failed to publish to ${channel}:`, err);
  }
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
  const job = await createBackfillJob({
    agent_id: agentId,
    since_date: sinceDate,
  });

  // Notify SSE subscribers immediately so the UI sees the new job
  void publishBackfillJob(agentId, {
    jobId: job.id,
    status: job.status,
    totalVideos: 0,
    processedVideos: 0,
    enqueuedVideos: 0,
    error: null,
  });

  return job;
}

/**
 * Get job status with real-time BullMQ progress
 */
export async function getJobStatus(jobId: string): Promise<BackfillJobWithProgress> {
  const job = await findBackfillJobById(jobId);
  if (!job) {
    throw new NotFoundError("Backfill job", jobId);
  }

  // Fetch active and waiting video jobs from BullMQ
  // Use timeout to prevent hanging requests
  let activeVideos: Array<{ videoId: string; title?: string; progress: number; status: string }> | undefined;
  let queuedVideos: Array<{ videoId: string; title?: string }> | undefined;
  
  try {
    const [activeJobs, waitingJobs] = await Promise.race([
      Promise.all([
        queues.processVideo.getJobs(["active"]),
        queues.processVideo.getJobs(["waiting"])
      ]),
      new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error("BullMQ getJobs timeout")), 5000)
      )
    ]);
    
    // Process active jobs (currently being processed)
    const activeList = await Promise.all(
      activeJobs
        .filter((j) => j.data?.agentId === job.agent_id && j.data?.youtubeVideoId)
        .map(async (j) => {
          const progress = (j.progress as any) || {};
          return {
            videoId: j.data.youtubeVideoId,
            title: j.data.title,
            progress: progress.progress || 0,
            status: progress.status || "Starting...",
          };
        })
    );
    
    // Process waiting jobs (queued but not started)
    const queuedList = waitingJobs
      .filter((j) => j.data?.agentId === job.agent_id && j.data?.youtubeVideoId)
      .map((j) => ({
        videoId: j.data.youtubeVideoId,
        title: j.data.title,
      }));
    
    activeVideos = activeList.length > 0 ? activeList : undefined;
    queuedVideos = queuedList.length > 0 ? queuedList : undefined;
  } catch (error) {
    // Log but don't fail - return job status without video lists
    console.error(`[backfillJob] Failed to fetch active/queued videos for job ${jobId}:`, error);
    activeVideos = undefined;
    queuedVideos = undefined;
  }

  return {
    ...job,
    activeVideos,
    queuedVideos,
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
    void publishBackfillJob(job.agent_id, { jobId, status: "processing" });

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
    void publishBackfillJob(job.agent_id, { jobId, totalVideos: youtubeVideos.length });

    // Process videos one by one
    console.log(`[Backfill Job ${jobId}] Starting to process and enqueue videos...`);
    let processedCount = 0;
    let enqueuedCount = 0;
    const failedVideos: FailedVideo[] = [];
    const activeVideoIds: string[] = []; // all video IDs enqueued — frontend opens per-video SSE for these

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
            title: video.title ?? undefined, // Include title for UI display (convert null to undefined)
          });

          if (enqueueResult.enqueued) {
            enqueuedCount++;
            activeVideoIds.push(video.youtube_video_id);
            // Publish immediately so the frontend can open an SSE connection for this video
            void publishBackfillJob(job.agent_id, { jobId, activeVideoIds: [...activeVideoIds] });
          }
        }

        // Update progress and log every 10 videos to show activity
        if (processedCount % 10 === 0 || processedCount === youtubeVideos.length) {
          await updateJobProgress(jobId, {
            processed_videos: processedCount,
            enqueued_videos: enqueuedCount,
            failed_videos: failedVideos,
          });
          void publishBackfillJob(job.agent_id, {
            jobId,
            processedVideos: processedCount,
            enqueuedVideos: enqueuedCount,
            failedVideos,
            activeVideoIds,
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
    void publishBackfillJob(job.agent_id, {
      jobId,
      status: "completed",
      processedVideos: processedCount,
      enqueuedVideos: enqueuedCount,
      failedVideos,
      activeVideoIds,
    });

    console.log(`[Backfill Job ${jobId}] Completed: ${processedCount}/${youtubeVideos.length} processed, ${enqueuedCount} enqueued, ${failedVideos.length} failed`);
  } catch (error) {
    // Mark as failed
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    await updateJobStatus(jobId, "failed", errorMessage);
    void publishBackfillJob(job.agent_id, { jobId, status: "failed", error: errorMessage });
    console.error(`[Backfill Job ${jobId}] Failed:`, error);
    throw error;
  }
}

/**
 * Cancel a backfill job and cleanup associated resources
 */
export async function cancelJob(jobId: string, agentId: string): Promise<void> {
  const job = await findBackfillJobById(jobId);
  if (!job) {
    throw new NotFoundError("Backfill job", jobId);
  }

  if (job.agent_id !== agentId) {
    throw new Error("Job does not belong to this agent");
  }

  // Only allow canceling pending or processing jobs
  if (job.status !== "pending" && job.status !== "processing") {
    throw new Error(`Cannot cancel job with status: ${job.status}`);
  }

  try {
    console.log(`[Backfill Job ${jobId}] Cancelling job...`);

    // Remove backfill-scan job from Redis if it exists
    const queue = queues.processVideo;
    const waitingJobs = await queue.getJobs(["waiting", "active", "delayed"]);
    
    // Find and remove all jobs related to this backfill
    let removedCount = 0;
    for (const queueJob of waitingJobs) {
      // Check if job data matches this backfill
      if (queueJob.data.source === "backfill" || queueJob.name === "backfill-scan") {
        const jobData = queueJob.data;
        // Check if it's the scan job for this backfill
        if (queueJob.name === "backfill-scan" && jobData.jobId === jobId) {
          await queueJob.remove();
          removedCount++;
          console.log(`[Backfill Job ${jobId}] Removed backfill-scan job from queue`);
        }
        // Check if it's a video job from this backfill's agent
        else if (jobData.agentId === agentId && jobData.source === "backfill") {
          await queueJob.remove();
          removedCount++;
        }
      }
    }

    console.log(`[Backfill Job ${jobId}] Removed ${removedCount} jobs from queue`);

    // Update job status to failed with cancellation message
    await updateJobStatus(jobId, "failed", "Cancelled by user");
    void publishBackfillJob(job.agent_id, { jobId, status: "failed", error: "Cancelled by user" });

    console.log(`[Backfill Job ${jobId}] Cancelled successfully`);
  } catch (error) {
    console.error(`[Backfill Job ${jobId}] Failed to cancel:`, error);
    throw new Error(`Failed to cancel backfill job: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}
