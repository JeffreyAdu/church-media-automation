/**
 * Process Video Worker (BullMQ)
 * Handles both video processing and backfill scan jobs
 */

import "dotenv/config";
import { Worker } from "bullmq";
import { redis } from "../../config/redis.js";
import { processVideoOrchestrator } from "../orchestrators/processVideoOrchestrator.js";
import { findVideoByYouTubeId } from "../../repositories/videoRepository.js";
import { processBackfillJob } from "../../services/business/backfillJobService.js";

const queueName = "processVideo";

interface ProcessVideoJobData {
  agentId: string;
  youtubeVideoId: string;
  youtubeUrl: string;
}

interface BackfillScanJobData {
  jobId: string;
  agentId: string;
}

async function handleJob(job: any) {
  // Determine job type based on name or data structure
  if (job.name === "backfill-scan" || (job.data.jobId && !job.data.youtubeVideoId)) {
    // Backfill scan job
    const { jobId, agentId } = job.data as BackfillScanJobData;
    console.log("[worker:backfill] processing", { jobId, agentId });

    try {
      await processBackfillJob(jobId);
      console.log("[worker:backfill] ✓ completed", job.id, "for backfill job:", jobId);
    } catch (error) {
      console.error("[worker:backfill] ✗ failed", job.id, error);
      throw error;
    }
  } else {
    // Video processing job
    const { agentId, youtubeVideoId, youtubeUrl } = job.data as ProcessVideoJobData;
    console.log("[worker:video] processing", { agentId, youtubeVideoId, youtubeUrl });

    try {
      const video = await findVideoByYouTubeId(agentId, youtubeVideoId);
      if (!video) {
        throw new Error(`Video not found: ${youtubeVideoId}`);
      }

      const result = await processVideoOrchestrator({
        agentId,
        videoId: video.id,
        youtubeVideoId,
        youtubeUrl,
      });

      console.log("[worker:video] ✓ completed", job.id, "episode:", result.episodeId);
    } catch (error) {
      console.error("[worker:video] ✗ failed", job.id, error);
      throw error;
    }
  }
}

const worker = new Worker(queueName, handleJob, {
  connection: redis,
  concurrency: 2,
  lockDuration: 1800000, // 30 minutes
  lockRenewTime: 60000,
});

console.log("[worker] Starting worker for queue:", queueName);
console.log("[worker] Redis connection:", redis.options.host, redis.options.port);
console.log("[worker] Concurrency:", 2);
console.log("[worker] Lock duration:", "30 minutes");
console.log("[worker] Waiting for jobs...");

worker.on("completed", (job) => {
  console.log("[worker] ✓ completed", job.id);
});

worker.on("failed", (job, err) => {
  console.error("[worker] ✗ failed", job?.id, err);
});

worker.on("error", (err) => {
  console.error("[worker] Worker error:", err);
});

worker.on("active", (job) => {
  console.log("[worker] Job became active:", job.id);
});
