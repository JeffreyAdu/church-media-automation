/**
 * Zod Schemas for AI Agent Outputs
 */

import { z } from "zod";

// Agent A: Sermon Boundary Detection
export const SermonBoundarySchema = z.object({
  sermon_start_sec: z.number().min(0),
  sermon_end_sec: z.number().min(0),
  confidence: z.number().min(0).max(1),
  excluded_ranges: z
    .array(
      z.object({
        start_sec: z.number().min(0),
        end_sec: z.number().min(0),
        reason: z.string().min(1),
      })
    )
    .optional(),
  explanation: z.string().min(1),
});
export type SermonBoundary = z.infer<typeof SermonBoundarySchema>;

// Agent B: Episode Metadata Generation
export const EpisodeMetadataSchema = z.object({
  episode_title: z.string().min(3),
  episode_description: z.string().min(20),
  speaker: z.string().optional(),
  keywords: z.array(z.string()).optional(),
  scripture_refs: z.array(z.string()).optional(),
  chapters: z
    .array(
      z.object({
        t_sec: z.number().min(0),
        title: z.string().min(1),
      })
    )
    .optional(),
});
export type EpisodeMetadata = z.infer<typeof EpisodeMetadataSchema>;

// Agent C: Autopublish Decision
export const AutopublishDecisionSchema = z.object({
  should_autopublish: z.boolean(),
  confidence: z.number().min(0).max(1),
  sermon_likeness: z.number().min(0).max(1),
  category: z.enum([
    "sermon_preaching",
    "prayer_only",
    "worship_music_only",
    "announcements_admin",
    "mixed_service",
    "non_church_audio",
    "unknown",
  ]),
  reasons: z.array(z.string().min(3)).min(1),
  warnings: z.array(z.string()).optional(),
});
export type AutopublishDecision = z.infer<typeof AutopublishDecisionSchema>;
