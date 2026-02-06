/**
 * Stats Controller
 * Thin controller for dashboard statistics endpoints
 */

import { Request, Response, NextFunction } from "express";
import { getUserDashboardStats } from "../services/business/statsService.js";

/**
 * Get dashboard statistics for the authenticated user
 */
export async function getDashboardStats(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const stats = await getUserDashboardStats(userId);
    res.json(stats);
  } catch (error) {
    next(error);
  }
}
