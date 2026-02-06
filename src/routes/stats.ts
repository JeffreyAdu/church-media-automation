/**
 * Stats Routes
 * Endpoints for dashboard statistics
 */

import { Router } from "express";
import { getDashboardStats } from "../controllers/statsController.js";
import { requireAuth } from "../middlewares/auth.middleware.js";

export const statsRouter = Router();

/**
 * GET /stats/dashboard
 * Get dashboard statistics for authenticated user
 */
statsRouter.get("/stats/dashboard", requireAuth, getDashboardStats);
