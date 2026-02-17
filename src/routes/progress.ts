/**
 * Progress Stream Routes (SSE)
 * Real-time job progress updates via Server-Sent Events
 */

import { Router } from "express";
import { streamProgress } from "../controllers/progressController.js";

const router = Router();

/**
 * SSE endpoint for job progress streaming
 * GET /api/progress/:jobId/stream
 */
router.get("/:jobId/stream", streamProgress);

export default router;
