/**
 * Job Repository
 * Database access layer for jobs table.
 */

import { supabase } from "../config/supabase.js";

export interface Job {
  id: string;
  agent_id: string;
  video_id: string | null;
  type: "process_video" | "backfill_scan";
  status: "queued" | "processing" | "completed" | "failed";
  attempts: number;
  last_error: string | null;
  progress_stage: string | null;
  debug_json: any;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateJobInput {
  agent_id: string;
  video_id?: string;
  type: "process_video" | "backfill_scan";
}

/**
 * Creates a new job record.
 * For process_video jobs, video_id is required.
 */
export async function createJob(input: CreateJobInput): Promise<Job> {
  // Validate process_video has video_id
  if (input.type === "process_video" && !input.video_id) {
    throw new Error("video_id is required for process_video jobs");
  }

  const { data, error } = await supabase
    .from("jobs")
    .insert({
      agent_id: input.agent_id,
      video_id: input.video_id || null,
      type: input.type,
      status: "queued",
      attempts: 0,
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create job: ${error.message}`);
  }

  return data;
}

/**
 * Finds jobs by agent_id and status.
 */
export async function findJobsByStatus(
  agentId: string,
  status: Job["status"]
): Promise<Job[]> {
  const { data, error } = await supabase
    .from("jobs")
    .select()
    .eq("agent_id", agentId)
    .eq("status", status)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Failed to find jobs: ${error.message}`);
  }

  return data;
}
