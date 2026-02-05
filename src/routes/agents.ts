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
} from "../controllers/agentController.js";
import { getRssFeed } from "../controllers/rssController.js";
import { backfillAgent } from "../controllers/backfillController.js";
import { validateBody } from "../middlewares/validation.js";
import { createAgentSchema, updateAgentSchema } from "../middlewares/schemas/agentSchemas.js";
import { backfillSchema } from "../middlewares/schemas/backfillSchema.js";
import { strictLimiter } from "../middlewares/rateLimiting.js";
import { upload, uploadImage } from "../middlewares/upload.js";

export const agentsRouter = Router();

/** List all agents */
agentsRouter.get("/", listAgents);

/** Create new agent */
agentsRouter.post("/", strictLimiter, validateBody(createAgentSchema), createAgent);

/** Get specific agent */
agentsRouter.get("/:id", getAgentById);

/** Update agent */
agentsRouter.put("/:id", validateBody(updateAgentSchema), updateAgent);

/** Delete agent */
agentsRouter.delete("/:id", strictLimiter, deleteAgent);

/** Backfill videos from a specific date */
agentsRouter.post("/:id/backfill", strictLimiter, validateBody(backfillSchema), backfillAgent);

/** Manually (re-)activate agent's WebSub subscription */
agentsRouter.post("/:id/activate", strictLimiter, activateAgent);

/** Upload intro audio */
agentsRouter.post("/:id/intro", strictLimiter, upload.single("audio"), uploadIntro);

/** Upload outro audio */
agentsRouter.post("/:id/outro", strictLimiter, upload.single("audio"), uploadOutro);

/** Delete intro audio */
agentsRouter.delete("/:id/intro", strictLimiter, deleteIntro);

/** Delete outro audio */
agentsRouter.delete("/:id/outro", strictLimiter, deleteOutro);

/** Upload artwork (1400x1400-3000x3000 for Spotify) */
agentsRouter.post("/:id/artwork", strictLimiter, uploadImage.single("image"), uploadArtwork);

/** Delete artwork */
agentsRouter.delete("/:id/artwork", strictLimiter, deleteArtwork);

/** Get all episodes for an agent */
agentsRouter.get("/:id/episodes", getEpisodes);

/** Get RSS feed URL for Spotify/Apple submission */
agentsRouter.get("/:id/feed-url", getFeedUrl);

/** RSS feed for podcast platforms */
agentsRouter.get("/:id/feed.xml", getRssFeed);
