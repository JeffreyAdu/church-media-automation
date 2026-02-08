/**
 * Video Repository
 * Database access layer for videos table.
 */

import { supabase } from "../config/supabase.js";

export interface Video {
  id: string;
  agent_id: string;
  youtube_video_id: string;
  youtube_url: string;
  title: string | null;
  published_at: string | null;
  duration_seconds: number | null;
  status: "discovered" | "processing" | "processed" | "failed";
  error_message: string | null;
  raw_payload: any;
  created_at: string;
  updated_at: string;
}

export interface CreateVideoInput {
  agent_id: string;
  youtube_video_id: string;
  youtube_url: string;
  title?: string;
  published_at?: string;
  raw_payload?: any;
}

/**
 * Upserts a video record (insert or update if youtube_video_id exists for this agent).
 * Returns the video record.
 */
export async function upsertVideo(input: CreateVideoInput): Promise<Video> {
  const { data, error } = await supabase
    .from("videos")
    .upsert(
      {
        agent_id: input.agent_id,
        youtube_video_id: input.youtube_video_id,
        youtube_url: input.youtube_url,
        title: input.title || null,
        published_at: input.published_at || null,
        raw_payload: input.raw_payload || null,
        status: "discovered",
      },
      {
        onConflict: "agent_id,youtube_video_id",
        ignoreDuplicates: false,
      }
    )
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to upsert video: ${error.message}`);
  }

  return data;
}

/**
 * Finds a video by agent_id and youtube_video_id.
 */
export async function findVideoByYouTubeId(
  agentId: string,
  youtubeVideoId: string
): Promise<Video | null> {
  const { data, error } = await supabase
    .from("videos")
    .select()
    .eq("agent_id", agentId)
    .eq("youtube_video_id", youtubeVideoId)
    .single();

  if (error && error.code !== "PGRST116") {
    // PGRST116 = no rows
    throw new Error(`Failed to find video: ${error.message}`);
  }

  return data || null;
}

/**
 * Finds a video by internal database ID.
 */
export async function findById(id: string): Promise<Video | null> {
  const { data, error } = await supabase
    .from("videos")
    .select()
    .eq("id", id)
    .single();

  if (error && error.code !== "PGRST116") {
    throw new Error(`Failed to find video: ${error.message}`);
  }

  return data || null;
}

/**
 * Updates video status and optionally sets error message
 */
export async function updateVideoStatus(
  videoId: string,
  status: Video["status"],
  errorMessage?: string
): Promise<Video> {
  const { data, error } = await supabase
    .from("videos")
    .update({
      status,
      error_message: errorMessage || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", videoId)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to update video status: ${error.message}`);
  }

  return data;
}

/**
 * Gets failed videos for an agent
 */
export async function getFailedVideos(agentId: string): Promise<Video[]> {
  const { data, error } = await supabase
    .from("videos")
    .select()
    .eq("agent_id", agentId)
    .eq("status", "failed")
    .order("updated_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to get failed videos: ${error.message}`);
  }

  return data || [];
}
