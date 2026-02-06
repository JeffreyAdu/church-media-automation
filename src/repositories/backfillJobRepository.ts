/**
 * Backfill Job Repository
 * Database operations for backfill jobs
 */

import { supabase } from "../config/supabase.js";

export interface BackfillJob {
  id: string;
  agent_id: string;
  status: "pending" | "processing" | "completed" | "failed";
  since_date: string;
  total_videos: number;
  processed_videos: number;
  enqueued_videos: number;
  error: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateBackfillJobInput {
  agent_id: string;
  since_date: Date;
}

export interface UpdateJobProgressInput {
  total_videos?: number;
  processed_videos?: number;
  enqueued_videos?: number;
}

/**
 * Create a new backfill job
 */
export async function createBackfillJob(input: CreateBackfillJobInput): Promise<BackfillJob> {
  const { data, error } = await supabase
    .from("backfill_jobs")
    .insert({
      agent_id: input.agent_id,
      since_date: input.since_date.toISOString(),
      status: "pending",
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create backfill job: ${error.message}`);
  }

  return data;
}

/**
 * Find backfill job by ID
 */
export async function findBackfillJobById(id: string): Promise<BackfillJob | null> {
  const { data, error } = await supabase
    .from("backfill_jobs")
    .select()
    .eq("id", id)
    .single();

  if (error && error.code !== "PGRST116") {
    throw new Error(`Failed to find backfill job: ${error.message}`);
  }

  return data || null;
}

/**
 * Update job status
 */
export async function updateJobStatus(
  id: string,
  status: BackfillJob["status"],
  error?: string
): Promise<BackfillJob> {
  const { data, error: updateError } = await supabase
    .from("backfill_jobs")
    .update({
      status,
      error: error || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single();

  if (updateError) {
    throw new Error(`Failed to update job status: ${updateError.message}`);
  }

  return data;
}

/**
 * Update job progress
 */
export async function updateJobProgress(
  id: string,
  progress: UpdateJobProgressInput
): Promise<BackfillJob> {
  const updateData: any = {
    updated_at: new Date().toISOString(),
  };

  if (progress.total_videos !== undefined) {
    updateData.total_videos = progress.total_videos;
  }

  if (progress.processed_videos !== undefined) {
    updateData.processed_videos = progress.processed_videos;
  }

  if (progress.enqueued_videos !== undefined) {
    updateData.enqueued_videos = progress.enqueued_videos;
  }

  const { data, error } = await supabase
    .from("backfill_jobs")
    .update(updateData)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to update job progress: ${error.message}`);
  }

  return data;
}

/**
 * Get recent backfill jobs for an agent
 */
export async function getAgentBackfillJobs(
  agentId: string,
  limit: number = 10
): Promise<BackfillJob[]> {
  const { data, error } = await supabase
    .from("backfill_jobs")
    .select()
    .eq("agent_id", agentId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`Failed to get agent backfill jobs: ${error.message}`);
  }

  return data || [];
}
