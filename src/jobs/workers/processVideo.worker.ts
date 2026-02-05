/**
 * Process Video Worker (BullMQ)
 */

import "dotenv/config";
import { Worker } from "bullmq";
import { redis } from "../../config/redis.js";
import { processVideoOrchestrator } from "../orchestrators/processVideoOrchestrator.js";
import { findVideoByYouTubeId } from "../../repositories/videoRepository.js";

const queueName = "processVideo";

interface ProcessVideoJobData {
  agentId: string;
  youtubeVideoId: string;
  youtubeUrl: string;
}

async function processVideoJob(job: { data: ProcessVideoJobData; id?: string | number }) {
  const { agentId, youtubeVideoId, youtubeUrl } = job.data;

  console.log("[worker] processing", { agentId, youtubeVideoId, youtubeUrl });

  try {
    // Find video record
    const video = await findVideoByYouTubeId(agentId, youtubeVideoId);
    if (!video) {
      throw new Error(`Video not found: ${youtubeVideoId}`);
    }

    // Process through orchestrator
    const result = await processVideoOrchestrator({
      agentId,
      videoId: video.id,
      youtubeVideoId,
      youtubeUrl,
    });

    console.log("[worker] ✓ completed", job.id, "episode:", result.episodeId);
  } catch (error) {
    console.error("[worker] ✗ failed", job.id, error);
    throw error;
  }
}

const worker = new Worker(queueName, processVideoJob, {
  connection: redis,
  concurrency: 2,
  lockDuration: 1800000, // 30 minutes - balance between long videos and stall detection
  lockRenewTime: 60000, // Renew lock every 60 seconds to prevent stalling
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
