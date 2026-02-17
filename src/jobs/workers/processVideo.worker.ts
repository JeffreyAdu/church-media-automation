/**
 * Process Video Worker (BullMQ)
 * Handles both video processing and backfill scan jobs
 */

import "dotenv/config";
import { Worker } from "bullmq";
import { redis } from "../../config/redis.js";
import { processVideoOrchestrator } from "../orchestrators/processVideoOrchestrator.js";
import { findVideoByYouTubeId, updateVideoStatus } from "../../repositories/videoRepository.js";
import { processBackfillJob } from "../../services/business/backfillJobService.js";
import { getGenericErrorMessage } from "../../utils/errorMessages.js";
import { cleanupTempFiles, getTempDiskUsage } from "../../utils/cleanupTemp.js";
import { publishProgress } from "../../services/business/progressStreamService.js";

// Cleanup temp files on startup (remove stale downloads from crashes/OOM)
(async () => {
  console.log("[worker] Starting up - checking disk usage...");
  const beforeCleanup = getTempDiskUsage();
  console.log(`[worker] Temp disk usage: ${beforeCleanup.usedMB.toFixed(0)}MB (${beforeCleanup.files} files)`);

  if (beforeCleanup.usedMB > 100 || beforeCleanup.files > 10) {
    console.log(`[worker] Running cleanup (threshold: >100MB or >10 files)...`);
    await cleanupTempFiles(2); // Remove files older than 2 hours
    const afterCleanup = getTempDiskUsage();
    console.log(`[worker] After cleanup: ${afterCleanup.usedMB.toFixed(0)}MB (${afterCleanup.files} files)`);
  } else {
    console.log(`[worker] Disk usage OK, skipping cleanup`);
  }
})();

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
        updateProgress: async (progress: number, status: string) => {
          await job.updateProgress({ progress, status });
          await publishProgress(job.id!, progress, status);
          console.log(`[worker:video] progress ${progress}% - ${status}`);
        },
      });

      console.log("[worker:video] ✓ completed", job.id, "episode:", result.episodeId);
    } catch (error) {
      console.error("[worker:video] ✗ failed", job.id, error);
      
      // Mark video as failed with generic error message
      const video = await findVideoByYouTubeId(agentId, youtubeVideoId);
      if (video) {
        const genericError = getGenericErrorMessage(error);
        await updateVideoStatus(video.id, "failed", genericError);
        console.log(`[worker:video] marked video ${youtubeVideoId} as failed: ${genericError}`);
      }
      
      throw error;
    }
  }
}

const worker = new Worker(queueName, handleJob, {
  connection: redis,
  concurrency: 10, // Can be much higher with Groq!
  lockDuration: 600000, // 10 minutes (Groq is fast)
  lockRenewTime: 60000,
});

console.log("[worker] Starting worker for queue:", queueName);
console.log("[worker] Redis connection:", redis.options.host, redis.options.port);
console.log("[worker] Concurrency:", 10, "(can be much higher with Groq!)");
console.log("[worker] Lock duration:", "10 minutes");
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
