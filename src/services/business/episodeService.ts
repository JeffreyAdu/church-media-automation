/**
 * Episode Service
 * Business service for episode management.
 */

import { 
  createEpisode as createEpisodeRepo, 
  findPublishedEpisodes as findPublishedEpisodesRepo,
  Episode 
} from "../../repositories/episodeRepository.js";

export interface CreateEpisodeInput {
  agent_id: string;
  video_id: string;
  title: string;
  description: string;
  audio_url: string;
  audio_size_bytes: number;
  duration_seconds: number;
  guid: string;
  published_at: string;
  published: boolean;
}

/**
 * Creates a new episode record.
 */
export async function createEpisode(input: CreateEpisodeInput): Promise<Episode> {
  return await createEpisodeRepo(input);
}

/**
 * Gets published episodes for an agent's RSS feed.
 */
export async function getPublishedEpisodes(agentId: string): Promise<Episode[]> {
  return await findPublishedEpisodesRepo(agentId);
}
