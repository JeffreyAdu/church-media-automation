/**
 * Health Check Routes
 * Infrastructure endpoints for monitoring and orchestration.
 */

import { Router } from "express";

export const healthRouter = Router();

/** Simple health check endpoint. */
healthRouter.get("/health", (_req, res) => {
  res.json({ ok: true });
});

/** Readiness check endpoint for container orchestration. */
healthRouter.get("/ready", (_req, res) => {
  res.json({ ready: true });
});
