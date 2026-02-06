/**
 * Backfill Controller
 * Handles HTTP requests for backfilling historical videos.
 */

import { Request, Response, NextFunction } from "express";
import { createJob, getJobStatus, getAgentJobs } from "../services/business/backfillJobService.js";
import { enqueueBackfillJob } from "../services/external/queue/enqueueBackfillJob.js";

/**
 * POST /agents/:id/backfill
 * Creates a backfill job and enqueues it for background processing
 */
export async function backfillAgent(
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;
    const { since } = req.body;

    const sinceDate = new Date(since);

    // Create the backfill job
    const job = await createJob(id, sinceDate);

    // Enqueue for background processing
    await enqueueBackfillJob({
      jobId: job.id,
      agentId: id,
    });

    res.status(202).json({
      message: "Backfill job created and queued for processing",
      jobId: job.id,
      status: job.status,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /agents/:id/backfill/:jobId
 * Get status of a backfill job
 */
export async function getBackfillJobStatus(
  req: Request<{ id: string; jobId: string }>,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { jobId } = req.params;

    const job = await getJobStatus(jobId);

    res.status(200).json({
      jobId: job.id,
      status: job.status,
      totalVideos: job.total_videos,
      processedVideos: job.processed_videos,
      enqueuedVideos: job.enqueued_videos,
      error: job.error,
      createdAt: job.created_at,
      updatedAt: job.updated_at,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /agents/:id/backfill
 * Get recent backfill jobs for an agent
 */
export async function getAgentBackfillJobs(
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 10;

    const jobs = await getAgentJobs(id, limit);

    res.status(200).json(jobs);
  } catch (error) {
    next(error);
  }
}
