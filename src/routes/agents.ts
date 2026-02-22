/**
 * Agent Routes
 * HTTP endpoints for agent management.
 */

import { Router } from "express";
import {
  createAgent,
  getAgentById,
  listAgents,
  updateAgent,
  deleteAgent,
  activateAgent,
  uploadIntro,
  uploadOutro,
  deleteIntro,
  deleteOutro,
  uploadArtwork,
  deleteArtwork,
  getEpisodes,
  getFeedUrl,
  getFailedVideos,
} from "../controllers/agentController.js";
import { getRssFeed } from "../controllers/rssController.js";
import { backfillAgent, getBackfillJobStatus, getAgentBackfillJobs, cancelBackfillJob, streamBackfillJobs } from "../controllers/backfillController.js";
import { validateBody } from "../middlewares/validation.js";
import { createAgentSchema, updateAgentSchema } from "../middlewares/schemas/agentSchemas.js";
import { backfillSchema } from "../middlewares/schemas/backfillSchema.js";
import { apiLimiter, strictLimiter } from "../middlewares/rateLimiting.js";
import { upload, uploadImage } from "../middlewares/upload.js";
import { requireAuth, optionalAuth } from "../middlewares/auth.middleware.js";

export const agentsRouter = Router();

/** List all agents (user-specific) */
agentsRouter.get("/", requireAuth, listAgents);

/** Create new agent (user-specific) */
agentsRouter.post("/", requireAuth, strictLimiter, validateBody(createAgentSchema), createAgent);

/** Get specific agent (user-specific) */
agentsRouter.get("/:id", requireAuth, getAgentById);

/** Update agent (user-specific) */
agentsRouter.put("/:id", requireAuth, apiLimiter, validateBody(updateAgentSchema), updateAgent);

/** Delete agent (user-specific) */
agentsRouter.delete("/:id", requireAuth, strictLimiter, deleteAgent);

/** Create backfill job (user-specific) */
agentsRouter.post("/:id/backfill", requireAuth, strictLimiter, validateBody(backfillSchema), backfillAgent);
agentsRouter.delete("/:id/backfill/:jobId", requireAuth, cancelBackfillJob);

/** SSE stream for real-time backfill job list updates (no auth — matches /progress/:jobId/stream) */
agentsRouter.get("/:id/backfill/stream", streamBackfillJobs);

/** Get backfill job status (user-specific) */
agentsRouter.get("/:id/backfill/:jobId", requireAuth, getBackfillJobStatus);

/** Get recent backfill jobs for agent (user-specific) */
agentsRouter.get("/:id/backfill", requireAuth, getAgentBackfillJobs);

/** Get failed videos for an agent (user-specific) */
agentsRouter.get("/:id/failed-videos", requireAuth, getFailedVideos);

/** Manually (re-)activate agent's WebSub subscription */
agentsRouter.post("/:id/activate", requireAuth, strictLimiter, activateAgent);

/** Upload intro audio */
agentsRouter.post("/:id/intro", requireAuth, strictLimiter, upload.single("audio"), uploadIntro);

/** Upload outro audio */
agentsRouter.post("/:id/outro", requireAuth, strictLimiter, upload.single("audio"), uploadOutro);

/** Delete intro audio */
agentsRouter.delete("/:id/intro", requireAuth, strictLimiter, deleteIntro);

/** Delete outro audio */
agentsRouter.delete("/:id/outro", requireAuth, strictLimiter, deleteOutro);

/** Upload artwork (1400x1400-3000x3000 for Spotify) */
agentsRouter.post("/:id/artwork", requireAuth, strictLimiter, uploadImage.single("image"), uploadArtwork);

/** Delete artwork */
agentsRouter.delete("/:id/artwork", requireAuth, strictLimiter, deleteArtwork);

/** Get all episodes for an agent */
agentsRouter.get("/:id/episodes", requireAuth, getEpisodes);

/** Get RSS feed URL for Spotify/Apple submission */
agentsRouter.get("/:id/feed-url", requireAuth, getFeedUrl);

/** RSS feed for podcast platforms (public - no auth) */
agentsRouter.get("/:id/feed.xml", getRssFeed);
