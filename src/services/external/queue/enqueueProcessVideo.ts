/**
 * Enqueue processing job for a YouTube video.
 * Uses BullMQ with Redis (TCP) for real workers.
 */

import { queues } from "../../../config/queues.js";

export interface EnqueueProcessVideoParams {
  agentId: string;
  youtubeVideoId: string;
  youtubeUrl: string;
  title?: string; // Video title for UI display
}

export interface EnqueueResult {
  jobId: string;
  enqueued: boolean;
}

export async function enqueueProcessVideo(
  params: EnqueueProcessVideoParams
): Promise<EnqueueResult> {
  const jobId = `${params.agentId}_${params.youtubeVideoId}`;

  const existingJob = await queues.processVideo.getJob(jobId);
  
  if (existingJob) {
    const state = await existingJob.getState();
    
    // If job is waiting or delayed, don't duplicate
    if (state === "waiting" || state === "delayed") {
      console.log(`[enqueue] Job ${jobId} already ${state}, skipping`);
      return { jobId, enqueued: false };
    }
    
    // If job is "active" but worker isn't processing it (stale lock), remove it
    // This happens when worker crashes while processing
    if (state === "active") {
      console.log(`[enqueue] Job ${jobId} is active but may be stale, removing to allow retry`);
      await existingJob.remove();
    }
    
    // If job failed or stalled, remove it so we can retry with potentially fixed code
    if (state === "failed") {
      console.log(`[enqueue] Job ${jobId} failed all attempts, removing to allow retry`);
      await existingJob.remove();
    }
    
    // Handle stalled jobs (took too long or worker crashed)
    if (state === "unknown") {
      // "unknown" can mean stalled - BullMQ doesn't expose "stalled" state directly
      console.log(`[enqueue] Job ${jobId} in unknown state (possibly stalled), removing to allow retry`);
      await existingJob.remove();
    }
  }
  
  await queues.processVideo.add("process_video", params, {
    jobId,
    attempts: 5,
    backoff: { type: "exponential", delay: 10_000 },
    removeOnComplete: { age: 86400, count: 1000 }, // Remove after 24 hours or keep max 1000
    removeOnFail: { age: 86400, count: 100 }, // Remove failed jobs after 24 hours or keep max 100
    // Note: No priority set (default) - backfill-scan jobs have priority 1 to run first
  });
  
  console.log(`[enqueue] Job ${jobId} enqueued for video ${params.youtubeVideoId}`);
  return { jobId, enqueued: true };
}
