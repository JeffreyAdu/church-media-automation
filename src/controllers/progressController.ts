/**
 * Progress Controller
 * Handles SSE streaming for job progress updates
 */

import { Request, Response } from "express";
import { streamJobProgress } from "../services/business/progressStreamService.js";

/**
 * SSE endpoint for job progress streaming
 * GET /api/progress/:jobId/stream
 */
export async function streamProgress(req: Request, res: Response): Promise<void> {
  const { jobId } = req.params;

  // Validate jobId is a string
  if (typeof jobId !== "string") {
    res.status(400).json({ error: "Invalid job ID" });
    return;
  }

  console.log(`[sse] Client connected for job ${jobId}`);

  // Set SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // Disable nginx buffering
  res.flushHeaders(); // Establish SSE connection

  try {
    await streamJobProgress(jobId, res);
  } catch (error) {
    console.error(`[sse] Error streaming job ${jobId}:`, error);
    res.write(`data: ${JSON.stringify({ type: "error", message: "Stream error" })}\n\n`);
    res.end();
  }

  // Clean up on client disconnect
  req.on("close", () => {
    console.log(`[sse] Client disconnected from job ${jobId}`);
  });
}
