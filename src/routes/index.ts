/**
 * Route Aggregator
 * Combines all routers into a single exported router.
 * Add new routers here as features grow.
 */

import { Router } from "express";
import { healthRouter } from "./health.js";
import { websubRouter } from "./websub.js";
import { agentsRouter } from "./agents.js";
import { rssRouter } from "./rss.js";

export const router = Router();

/** Register all route modules */
router.use(healthRouter);
router.use(websubRouter);
router.use("/agents", agentsRouter);
router.use(rssRouter);
// router.use("/episodes", episodesRouter);  // Coming soon
// router.use("/jobs", jobsRouter);          // Coming soon
