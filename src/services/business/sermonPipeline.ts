/**
 * Sermon AI Pipeline
 * Orchestrates: Transcription → Sermon Detection → Metadata → Autopublish Decision
 */

import { transcribeWithTimestamps } from "../external/openai/transcribeChunked.js";
import { runJsonAgent } from "../external/openai/runJsonAgent.js";
import {
  SermonBoundarySchema,
  EpisodeMetadataSchema,
  AutopublishDecisionSchema,
  SermonBoundary,
  EpisodeMetadata,
  AutopublishDecision,
} from "../external/openai/agentSchemas.js";
import { SERMON_REFINER_PROMPT } from "./agents/sermonRefiner.js";
import { METADATA_WRITER_PROMPT } from "./agents/metadataWriter.js";
import { AUTOPUBLISH_PROMPT } from "./agents/autopublishDecision.js";
import {
  POSITIVE_SERMON_EXAMPLES,
  NEGATIVE_NON_SERMON_EXAMPLES,
  EDGE_CASE_EXAMPLES,
} from "./agents/autopublishExamples.js";
import type { TranscriptResult } from "../external/openai/transcribe.js";

export interface SermonPipelineInput {
  audioPath: string;
  youtubeTitle: string;
  serviceDateISO: string;
}

export interface SermonPipelineResult {
  transcript: TranscriptResult;
  boundaries: SermonBoundary;
  metadata: EpisodeMetadata;
  decision: AutopublishDecision;
}

/**
 * Runs the complete AI pipeline for sermon processing.
 * 1. Transcribes audio with timestamps
 * 2. Detects sermon boundaries
 * 3. Generates episode metadata
 * 4. Decides autopublish eligibility
 */
export async function runSermonAiStage(
  params: SermonPipelineInput
): Promise<SermonPipelineResult> {
  console.log("[sermonPipeline] starting transcription");
  const transcript = await transcribeWithTimestamps(params.audioPath);

  console.log("[sermonPipeline] detecting sermon boundaries");
  const boundaries = await runJsonAgent({
    agentName: "SermonSegmentRefiner",
    systemPrompt: SERMON_REFINER_PROMPT,
    input: {
      youtube_title: params.youtubeTitle,
      service_date: params.serviceDateISO,
      transcript_segments: transcript.segments,
    },
    schema: SermonBoundarySchema,
  });

  const sermonDurationMin = (boundaries.sermon_end_sec - boundaries.sermon_start_sec) / 60;
  console.log(`[sermon-ai] 🎯 Detected boundaries: ${boundaries.sermon_start_sec}s → ${boundaries.sermon_end_sec}s (${sermonDurationMin.toFixed(1)} min)`);
  console.log(`[sermon-ai] 📊 Confidence: ${boundaries.confidence}, Reason: ${boundaries.explanation}`);

  // Extract sermon text from transcript segments within boundaries
  const sermonText = transcript.segments
    .filter(
      (s) =>
        s.start >= boundaries.sermon_start_sec &&
        s.end <= boundaries.sermon_end_sec
    )
    .map((s) => s.text)
    .join(" ");

  console.log("[sermonPipeline] generating episode metadata");
  const metadata = await runJsonAgent({
    agentName: "EpisodeMetadataWriter",
    systemPrompt: METADATA_WRITER_PROMPT,
    input: {
      youtube_title: params.youtubeTitle,
      service_date: params.serviceDateISO,
      sermon_text: sermonText,
    },
    schema: EpisodeMetadataSchema,
  });

  console.log("[sermonPipeline] determining autopublish eligibility");
  const decision = await runJsonAgent({
    agentName: "AutopublishDecision",
    systemPrompt: AUTOPUBLISH_PROMPT,
    input: {
      segmentation_confidence: boundaries.confidence,
      sermon_duration_minutes:
        (boundaries.sermon_end_sec - boundaries.sermon_start_sec) / 60,
      sermon_text: sermonText,
      examples_positive: POSITIVE_SERMON_EXAMPLES,
      examples_negative: NEGATIVE_NON_SERMON_EXAMPLES,
      examples_edge_cases: EDGE_CASE_EXAMPLES,
    },
    schema: AutopublishDecisionSchema,
  });

  console.log(`[sermon-ai] 🤖 Autopublish: ${decision.should_autopublish ? "YES" : "NO"} | Likeness: ${decision.sermon_likeness} | Category: ${decision.category}`);
  console.log(`[sermon-ai] 📝 Reasons: ${decision.reasons.join("; ")}`);

  console.log("[sermonPipeline] ✓ AI pipeline completed");

  return {
    transcript,
    boundaries,
    metadata,
    decision,
  };
}
