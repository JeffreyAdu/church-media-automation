/**
 * Agent Repository
 * Database access layer for agents table.
 */

import { supabase } from "../config/supabase.js";

export interface Agent {
  id: string;
  user_id: string | null; // Supabase auth user ID
  name: string; // Church name
  youtube_channel_id: string;
  youtube_channel_url: string | null;
  status: "active" | "paused";
  rss_slug: string;
  podcast_title: string | null; // Podcast show title
  podcast_author: string | null;
  podcast_description: string | null;
  podcast_artwork_url: string | null; // Podcast cover art (1400x1400+)
  intro_audio_url: string | null;
  outro_audio_url: string | null;
  created_at: string;
  updated_at: string;
  // WebSub subscription metadata
  websub_topic_url: string | null;
  websub_callback_url: string | null;
  websub_lease_seconds: number | null;
  websub_expires_at: string | null;
  websub_status: "subscribed" | "expired" | "error" | null;
}

export interface CreateAgentInput {
  user_id: string; // Supabase auth user ID
  name: string; // Church name
  youtube_channel_id: string;
  youtube_channel_url?: string;
  rss_slug: string;
  podcast_title?: string; // Podcast show title
  podcast_author?: string;
  podcast_description?: string;
  podcast_artwork_url?: string;
  intro_audio_url?: string;
  outro_audio_url?: string;
}

export interface UpdateAgentInput {
  name?: string;
  podcast_title?: string;
  youtube_channel_url?: string;
  status?: "active" | "paused";
  podcast_author?: string;
  podcast_description?: string;
  podcast_artwork_url?: string | null;
  intro_audio_url?: string | null;
  outro_audio_url?: string | null;
}

/**
 * Finds an active agent by YouTube channel ID.
 */
export async function findByChannelId(channelId: string): Promise<Agent | null> {
  const { data, error } = await supabase
    .from("agents")
    .select()
    .eq("youtube_channel_id", channelId)
    .eq("status", "active")
    .single();

  if (error && error.code !== "PGRST116") {
    // PGRST116 = no rows
    throw new Error(`Failed to find agent: ${error.message}`);
  }

  return data || null;
}

/**
 * Creates a new agent.
 */
export async function createAgent(input: CreateAgentInput): Promise<Agent> {
  const { data, error } = await supabase
    .from("agents")
    .insert({
      user_id: input.user_id,
      name: input.name,
      youtube_channel_id: input.youtube_channel_id,
      youtube_channel_url: input.youtube_channel_url || null,
      rss_slug: input.rss_slug,
      podcast_title: input.podcast_title || null,
      podcast_author: input.podcast_author || null,
      podcast_description: input.podcast_description || null,
      intro_audio_url: input.intro_audio_url || null,
      outro_audio_url: input.outro_audio_url || null,
      status: "active",
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create agent: ${error.message}`);
  }

  return data;
}

/**
 * Finds an agent by ID.
 */
export async function findById(id: string): Promise<Agent | null> {
  const { data, error } = await supabase
    .from("agents")
    .select()
    .eq("id", id)
    .single();

  if (error && error.code !== "PGRST116") {
    throw new Error(`Failed to find agent: ${error.message}`);
  }

  return data || null;
}

/**
 * Finds all agents for a specific user.
 */
export async function findByUserId(userId: string): Promise<Agent[]> {
  const { data, error } = await supabase
    .from("agents")
    .select()
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to find user agents: ${error.message}`);
  }

  return data || [];
}

/**
 * Finds all agents.
 */
export async function findAll(): Promise<Agent[]> {
  const { data, error } = await supabase
    .from("agents")
    .select()
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to list agents: ${error.message}`);
  }

  return data;
}

/**
 * Updates an agent.
 */
export async function updateAgent(id: string, input: UpdateAgentInput): Promise<Agent> {
  const { data, error } = await supabase
    .from("agents")
    .update(input)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to update agent: ${error.message}`);
  }

  return data;
}

/**
 * Deletes an agent.
 */
export async function deleteAgent(id: string): Promise<void> {
  const { error } = await supabase
    .from("agents")
    .delete()
    .eq("id", id);

  if (error) {
    throw new Error(`Failed to delete agent: ${error.message}`);
  }
}
