/**
 * Agent Validation Schemas
 * Zod schemas for validating agent-related requests.
 */

import { z } from "zod";

/**
 * Schema for creating a new agent.
 */
export const createAgentSchema = z.object({
  name: z.string().min(1, "Organization name is required").max(255),
  youtube_channel_url: z
    .string()
    .url("Provide a valid YouTube channel URL (or handle URL)")
    .regex(/youtube\.com\//i, "Must be a YouTube channel/handle URL"),
  rss_slug: z
    .string()
    .min(1, "RSS slug is required")
    .max(100)
    .regex(/^[a-z0-9-]+$/, "RSS slug must contain only lowercase letters, numbers, and hyphens"),
  podcast_title: z.string().max(500).optional(), // Optional: AI will generate from first sermon if not provided
  podcast_author: z.string().max(255).optional(),
  podcast_description: z.string().max(4000).optional(),
  intro_audio_url: z.string().url().optional(),
  outro_audio_url: z.string().url().optional(),
});

/**
 * Schema for updating an existing agent.
 */
export const updateAgentSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  podcast_title: z.string().max(500).optional(),
  youtube_channel_url: z.string().url().optional(),
  status: z.enum(["active", "paused"]).optional(),
  podcast_author: z.string().max(255).optional(),
  podcast_description: z.string().max(4000).optional(),
  intro_audio_url: z.string().url().optional(),
  outro_audio_url: z.string().url().optional(),
});
