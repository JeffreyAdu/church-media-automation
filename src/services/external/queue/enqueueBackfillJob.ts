/**
 * Enqueue Backfill Job
 * Adds a backfill job to the queue for background processing
 */

import { Queue } from "bullmq";
import { redis } from "../../../config/redis.js";

const queue = new Queue("processVideo", { connection: redis });

export interface EnqueueBackfillInput {
  jobId: string;
  agentId: string;
}

export interface EnqueueBackfillResult {
  enqueued: boolean;
  queueJobId?: string;
}

/**
 * Enqueues a backfill scan job with high priority
 * Backfill scans are quick (just YouTube API calls) so they should run before slow video processing
 */
export async function enqueueBackfillJob(
  input: EnqueueBackfillInput
): Promise<EnqueueBackfillResult> {
  try {
    const job = await queue.add(
      "backfill-scan",
      {
        jobId: input.jobId,
        agentId: input.agentId,
      },
      {
        priority: 1, // Highest priority - run before video jobs
      }
    );

    console.log(`[Queue] Backfill job enqueued with priority: ${job.id} for backfill ${input.jobId}`);

    return {
      enqueued: true,
      queueJobId: job.id,
    };
  } catch (error) {
    console.error("[Queue] Failed to enqueue backfill job:", error);
    return {
      enqueued: false,
    };
  }
}
