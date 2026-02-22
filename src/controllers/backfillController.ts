/**
 * Backfill Controller
 * Handles HTTP requests for backfilling historical videos.
 */

import { Request, Response, NextFunction } from "express";
import { createJob, getJobStatus, getAgentJobs, cancelJob } from "../services/business/backfillJobService.js";
import { enqueueBackfillJob } from "../services/external/queue/enqueueBackfillJob.js";
import { streamAgentBackfillJobs } from "../services/business/progressStreamService.js";

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
      failedVideos: job.failed_videos || [],
      activeVideos: job.activeVideos,
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

    // Map database fields to API format
    const mappedJobs = jobs.map((job) => ({
      jobId: job.id,
      status: job.status,
      totalVideos: job.total_videos,
      processedVideos: job.processed_videos,
      enqueuedVideos: job.enqueued_videos,
      error: job.error,
      createdAt: job.created_at,
      updatedAt: job.updated_at,
    }));

    res.status(200).json(mappedJobs);
  } catch (error) {
    next(error);
  }
}

/**
 * DELETE /agents/:id/backfill/:jobId
 * Cancel a backfill job and clean up associated resources
 */
export async function cancelBackfillJob(
  req: Request<{ id: string; jobId: string }>,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id: agentId, jobId } = req.params;

    await cancelJob(jobId, agentId);

    res.status(200).json({
      message: "Backfill job cancelled successfully",
      jobId,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /agents/:id/backfill/stream
 * SSE stream — pushes backfill job list updates in real-time.
 * Sends an initial snapshot then forwards Redis pub/sub updates until client disconnects.
 * No auth required (matches existing /progress/:jobId/stream convention).
 */
export async function streamBackfillJobs(
  req: Request<{ id: string }>,
  res: Response
): Promise<void> {
  const { id: agentId } = req.params;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  console.log(`[sse] Client connected to backfill stream for agent ${agentId}`);

  const ac = new AbortController();
  req.on("close", () => {
    console.log(`[sse] Client disconnected from backfill stream for agent ${agentId}`);
    ac.abort();
  });

  try {
    await streamAgentBackfillJobs(agentId, res, ac.signal);
  } catch (error) {
    console.error(`[sse] Error in backfill stream for agent ${agentId}:`, error);
    res.write(`data: ${JSON.stringify({ type: "error", message: "Stream error" })}\n\n`);
    res.end();
  }
}
