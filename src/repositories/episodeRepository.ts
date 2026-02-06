/**
 * Episodes Repository
 * Database access layer for episodes table.
 */

import { supabase } from "../config/supabase.js";

export interface Episode {
  id: string;
  agent_id: string;
  video_id: string;
  title: string;
  description: string | null;
  audio_url: string;
  audio_size_bytes: number;
  duration_seconds: number | null;
  guid: string;
  published_at: string;
  published: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateEpisodeInput {
  agent_id: string;
  video_id: string;
  title: string;
  description?: string;
  audio_url: string;
  audio_size_bytes: number;
  duration_seconds?: number;
  guid: string;
  published_at: string;
}

/**
 * Creates a new episode record.
 */
export async function createEpisode(input: CreateEpisodeInput): Promise<Episode> {
  const { data, error } = await supabase
    .from("episodes")
    .insert({
      agent_id: input.agent_id,
      video_id: input.video_id,
      title: input.title,
      description: input.description || null,
      audio_url: input.audio_url,
      audio_size_bytes: input.audio_size_bytes,
      duration_seconds: input.duration_seconds || null,
      guid: input.guid,
      published_at: input.published_at,
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create episode: ${error.message}`);
  }

  return data;
}

/**
 * Finds episodes by agent ID, ordered by published date descending.
 */
export async function findEpisodesByAgentId(agentId: string): Promise<Episode[]> {
  const { data, error } = await supabase
    .from("episodes")
    .select()
    .eq("agent_id", agentId)
    .order("published_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to fetch episodes: ${error.message}`);
  }

  return data;
}

/**
 * Finds an episode by video ID.
 */
export async function findEpisodeByVideoId(videoId: string): Promise<Episode | null> {
  const { data, error } = await supabase
    .from("episodes")
    .select()
    .eq("video_id", videoId)
    .single();

  if (error && error.code !== "PGRST116") {
    throw new Error(`Failed to fetch episode: ${error.message}`);
  }

  return data;
}

/**
 * Finds published episodes for an agent's RSS feed.
 * Returns episodes sorted by published_at desc (newest first).
 */
export async function findPublishedEpisodes(agentId: string): Promise<Episode[]> {
  const { data, error } = await supabase
    .from("episodes")
    .select()
    .eq("agent_id", agentId)
    .eq("published", true)
    .order("published_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to fetch published episodes: ${error.message}`);
  }

  return data;
}

/**
 * Get total count of episodes for a user
 */
export async function countEpisodesByUserId(userId: string): Promise<number> {
  const { count, error } = await supabase
    .from("episodes")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId);

  if (error) {
    throw new Error(`Failed to count episodes: ${error.message}`);
  }

  return count || 0;
}

/**
 * Get total count of all episodes across all agents
 */
export async function countAllEpisodes(): Promise<number> {
  const { count, error } = await supabase
    .from("episodes")
    .select("*", { count: "exact", head: true });

  if (error) {
    throw new Error(`Failed to count episodes: ${error.message}`);
  }

  return count || 0;
}
