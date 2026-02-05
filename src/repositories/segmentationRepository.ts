/**
 * Segmentation Repository
 * Database access layer for audio segmentations table.
 */

import { supabase } from "../config/supabase.js";

export interface Segmentation {
  id: string;
  video_id: string;
  method: "vad_v1" | "llm_v1" | "manual_override";
  sermon_start_sec: number;
  sermon_end_sec: number;
  confidence: number;
  excluded_ranges: { start: number; end: number }[] | null;
  explanation: string | null;
  approved: boolean;
  created_at: string;
}

export interface CreateSegmentationInput {
  video_id: string;
  method: "vad_v1" | "llm_v1" | "manual_override";
  sermon_start_sec: number;
  sermon_end_sec: number;
  confidence: number;
  excluded_ranges?: { start: number; end: number }[];
  explanation?: string;
  approved?: boolean;
}

/**
 * Creates a segmentation record.
 */
export async function createSegmentation(
  input: CreateSegmentationInput
): Promise<Segmentation> {
  const { data, error } = await supabase
    .from("segmentations")
    .insert({
      video_id: input.video_id,
      method: input.method,
      sermon_start_sec: input.sermon_start_sec,
      sermon_end_sec: input.sermon_end_sec,
      confidence: input.confidence,
      excluded_ranges: input.excluded_ranges || null,
      explanation: input.explanation || null,
      approved: input.approved ?? false,
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create segmentation: ${error.message}`);
  }

  return data;
}

/**
 * Finds segmentation by video ID.
 */
export async function findByVideoId(videoId: string): Promise<Segmentation | null> {
  const { data, error } = await supabase
    .from("segmentations")
    .select()
    .eq("video_id", videoId)
    .single();

  if (error && error.code !== "PGRST116") {
    throw new Error(`Failed to find segmentation: ${error.message}`);
  }

  return data;
}
