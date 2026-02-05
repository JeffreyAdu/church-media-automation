/**
 * RSS Controller
 * Handles RSS feed generation for podcast platforms.
 */

import { Request, Response, NextFunction } from "express";
import { getAgentById } from "../services/business/agentService.js";
import { getPublishedEpisodes } from "../services/business/episodeService.js";
import { buildRssFeed, buildConfigFromAgent } from "../services/business/rssFeedService.js";
import { NotFoundError } from "../utils/errors.js";

/**
 * GET /agents/:id/feed.xml - Returns RSS feed for an agent's podcast
 */
export async function getRssFeed(
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;

    // Fetch agent
    const agent = await getAgentById(id);
    if (!agent) {
      throw new NotFoundError("Agent", id);
    }

    // Fetch published episodes
    const episodes = await getPublishedEpisodes(id);

    // Build RSS config from agent
    const baseUrl = `${req.protocol}://${req.get("host")}`;
    const config = buildConfigFromAgent(agent, baseUrl);

    // Build RSS XML
    const xml = buildRssFeed(config, episodes);

    // Set headers
    res.set({
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=300", // 5 minutes
    });

    res.send(xml);
  } catch (error) {
    next(error);
  }
}
