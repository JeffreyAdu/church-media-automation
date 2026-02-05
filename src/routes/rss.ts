/**
 * RSS Routes
 * Podcast RSS feed endpoints.
 */

import { Router } from "express";
import { getRssFeed } from "../controllers/rssController.js";

export const rssRouter = Router();

/** Podcast RSS feed */
rssRouter.get("/api/v1/podcasts/:slug/rss.xml", getRssFeed);
