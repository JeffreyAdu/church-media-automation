/**
 * Agent Controller
 * Handles HTTP requests for agent management.
 */

import { Request, Response, NextFunction } from "express";
import {
  createAgent as createAgentService,
  getAgent,
  getEpisodes as getEpisodesService,
  listAgents as listAgentsService,
  updateAgent as updateAgentService,
  deleteAgent as deleteAgentService,
  activateAgent as activateAgentService,
  uploadIntro as uploadIntroService,
  uploadOutro as uploadOutroService,
  deleteIntro as deleteIntroService,
  deleteOutro as deleteOutroService,
  uploadArtwork as uploadArtworkService,
  deleteArtwork as deleteArtworkService,
} from "../services/business/agentService.js";
import { buildCallbackUrl } from "../config/websub.js";
import { NotFoundError } from "../utils/errors.js";

/**
 * POST /agents - Creates a new agent
 */
export async function createAgent(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.userId!; // Set by requireAuth middleware
    const callbackUrl = buildCallbackUrl();
    const agent = await createAgentService({ ...req.body, user_id: userId }, callbackUrl);
    res.status(201).json(agent);
  } catch (error) {
    next(error);
  }
}

/**
 * GET /agents/:id - Gets an agent by ID (user must own it)
 */
export async function getAgentById(req: Request<{ id: string }>, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const userId = req.userId!;
    const agent = await getAgent(id, userId);
    if (!agent) {
      throw new NotFoundError("Agent", id);
    }
    res.json(agent);
  } catch (error) {
    next(error);
  }
}

/**
 * GET /agents - Lists all agents for authenticated user
 */
export async function listAgents(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.userId!; // Set by requireAuth middleware
    const agents = await listAgentsService(userId);
    res.json(agents);
  } catch (error) {
    next(error);
  }
}

/**
 * PUT /agents/:id - Updates an agent
 */
export async function updateAgent(req: Request<{ id: string }>, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const callbackUrl = buildCallbackUrl();
    const agent = await updateAgentService(id, req.body, callbackUrl);
    res.json(agent);
  } catch (error) {
    next(error);
  }
}

/**
 * DELETE /agents/:id - Deletes an agent
 */
export async function deleteAgent(req: Request<{ id: string }>, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const callbackUrl = buildCallbackUrl();
    await deleteAgentService(id, callbackUrl);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
}

/**
 * POST /agents/:id/activate - Manually activates/renews agent's WebSub subscription
 */
export async function activateAgent(req: Request<{ id: string }>, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const callbackUrl = buildCallbackUrl();
    const agent = await activateAgentService(id, callbackUrl);
    res.json(agent);
  } catch (error) {
    next(error);
  }
}

/**
 * POST /agents/:id/intro - Uploads intro audio for an agent
 */
export async function uploadIntro(req: Request<{ id: string }>, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.file) {
      res.status(400).json({ error: "No file uploaded" });
      return;
    }

    const { id } = req.params;
    const publicUrl = await uploadIntroService(id, req.file.buffer);
    res.json({ intro_audio_url: publicUrl });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /agents/:id/outro - Uploads outro audio for an agent
 */
export async function uploadOutro(req: Request<{ id: string }>, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.file) {
      res.status(400).json({ error: "No file uploaded" });
      return;
    }

    const { id } = req.params;
    const publicUrl = await uploadOutroService(id, req.file.buffer);
    res.json({ outro_audio_url: publicUrl });
  } catch (error) {
    next(error);
  }
}

/**
 * DELETE /agents/:id/intro - Deletes intro audio for an agent
 */
export async function deleteIntro(req: Request<{ id: string }>, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    await deleteIntroService(id);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
}

/**
 * DELETE /agents/:id/outro - Deletes outro audio for an agent
 */
export async function deleteOutro(req: Request<{ id: string }>, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    await deleteOutroService(id);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
}

/**
 * POST /agents/:id/artwork - Uploads artwork for an agent
 */
export async function uploadArtwork(req: Request<{ id: string }>, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.file) {
      res.status(400).json({ error: "No file uploaded" });
      return;
    }

    const { id } = req.params;
    const publicUrl = await uploadArtworkService(id, req.file.buffer);
    res.json({ podcast_artwork_url: publicUrl });
  } catch (error) {
    next(error);
  }
}

/**
 * DELETE /agents/:id/artwork - Deletes artwork for an agent
 */
export async function deleteArtwork(req: Request<{ id: string }>, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    await deleteArtworkService(id);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
}

/**
 * GET /agents/:id/episodes - Gets all episodes for an agent
 */
export async function getEpisodes(req: Request<{ id: string }>, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const episodes = await getEpisodesService(id);
    
    res.json({
      agentId: id,
      total: episodes.length,
      published: episodes.filter(ep => ep.published).length,
      unpublished: episodes.filter(ep => !ep.published).length,
      episodes
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /agents/:id/feed-url - Returns the RSS feed URL for an agent
 */
export async function getFeedUrl(req: Request<{ id: string }>, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const userId = req.userId!;
    
    // Verify agent exists and user owns it
    const agent = await getAgent(id, userId);
    if (!agent) {
      throw new NotFoundError("Agent", id);
    }

    // Construct full feed URL from request
    const protocol = req.protocol;
    const host = req.get("host");
    const feedUrl = `${protocol}://${host}/agents/${id}/feed.xml`;

    res.json({ 
      feedUrl,
      agentId: id,
      name: agent.name,
      podcastTitle: agent.podcast_title || agent.name
    });
  } catch (error) {
    next(error);
  }
}
