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
 * Enqueues a backfill scan job
 */
export async function enqueueBackfillJob(
  input: EnqueueBackfillInput
): Promise<EnqueueBackfillResult> {
  try {
    const job = await queue.add("backfill-scan", {
      jobId: input.jobId,
      agentId: input.agentId,
    });

    console.log(`[Queue] Backfill job enqueued: ${job.id} for backfill ${input.jobId}`);

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
