/**
 * Backfill Controller
 * Handles HTTP requests for backfilling historical videos.
 */

import { Request, Response, NextFunction } from "express";
import { backfillVideos } from "../services/business/backfillService.js";

/**
 * POST /agents/:id/backfill
 * Backfills videos from a specific date.
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

    const result = await backfillVideos(id, sinceDate);

    res.status(200).json({
      message: "Backfill completed successfully",
      ...result,
    });
  } catch (error) {
    next(error);
  }
}
