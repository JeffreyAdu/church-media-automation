/**
 * Process Video Orchestrator
 * Coordinates the complete video processing workflow:
 * AI Pipeline → Episode Assembly
 */

import { downloadVideo } from "../../services/business/downloadVideoService.js";
import { extractSegment, concatenateAudioFiles } from "../../services/business/processAudioService.js";
import { uploadEpisode } from "../../services/business/uploadEpisodeService.js";
import { StoragePaths } from "../../utils/storagePaths.js";
import { downloadFromUrl } from "../../services/business/downloadService.js";
import { runSermonAiStage } from "../../services/business/sermonPipeline.js";
import { createEpisode } from "../../services/business/episodeService.js";
import { createSegmentation } from "../../services/business/segmentationService.js";
import { getVideoById } from "../../services/business/videoService.js";
import { findById } from "../../repositories/agentRepository.js";
import { unlink, rm } from "fs/promises";
import os from "os";
import path from "path";

export interface ProcessVideoInput {
  agentId: string;
  videoId: string;
  youtubeVideoId: string;
  youtubeUrl: string;
  updateProgress?: (progress: number, status: string) => Promise<void>;
}

export interface ProcessVideoResult {
  episodeId: string;
  audioUrl: string;
}

/**
 * Orchestrates the complete video processing workflow.
 * Downloads audio, transcribes with AI, detects sermon boundaries,
 * assembles final episode with intro/outro, and publishes.
 */
export async function processVideoOrchestrator(input: ProcessVideoInput): Promise<ProcessVideoResult> {
  const { agentId, videoId, youtubeVideoId, youtubeUrl, updateProgress } = input;

  // 1. Download audio from YouTube
  console.log(`[orchestrator] downloading audio for ${youtubeVideoId}`);
  await updateProgress?.(5, "Downloading audio from YouTube...");
  const download = await downloadVideo(youtubeUrl, youtubeVideoId);

  // 2. Run AI pipeline: transcribe → detect sermon → generate metadata → autopublish decision
  console.log(`[orchestrator] running AI sermon detection pipeline`);
  await updateProgress?.(25, "Transcribing audio with AI...");
  const video = await getVideoById(videoId);
  if (!video) {
    throw new Error(`Video not found: ${videoId}`);
  }

  const aiResult = await runSermonAiStage({
    audioPath: download.audioPath,
    youtubeTitle: download.title,
    serviceDateISO: video.published_at || new Date().toISOString(),
  });

  // 3. Validate sermon boundaries
  if (
    aiResult.boundaries.sermon_start_sec < 0 ||
    aiResult.boundaries.sermon_end_sec > download.durationSeconds ||
    aiResult.boundaries.sermon_start_sec >= aiResult.boundaries.sermon_end_sec
  ) {
    throw new Error(
      `Invalid sermon boundaries: start=${aiResult.boundaries.sermon_start_sec}s, ` +
      `end=${aiResult.boundaries.sermon_end_sec}s, total=${download.durationSeconds}s`
    );
  }

  // 4. Extract sermon segment
  console.log(`[orchestrator] extracting AI-detected sermon segment`);
  await updateProgress?.(65, "Extracting sermon segment...");
  const sermonOnlyFileName = `${youtubeVideoId}-sermon.mp3`;
  const sermonOnlyPath = await extractSegment(
    download.audioPath,
    aiResult.boundaries.sermon_start_sec,
    aiResult.boundaries.sermon_end_sec,
    sermonOnlyFileName
  );

  // 5. Download intro/outro and concatenate final episode
  console.log(`[orchestrator] building final episode with intro/outro`);
  await updateProgress?.(75, "Assembling final episode...");

  const agent = await findById(agentId);
  if (!agent) {
    throw new Error(`Agent not found: ${agentId}`);
  }

  let introPath: string | null = null;
  let outroPath: string | null = null;

  if (agent.intro_audio_url) {
    introPath = await downloadFromUrl(agent.intro_audio_url, `${youtubeVideoId}-intro.mp3`);
  }
  if (agent.outro_audio_url) {
    outroPath = await downloadFromUrl(agent.outro_audio_url, `${youtubeVideoId}-outro.mp3`);
  }

  const finalFileName = `${agentId}-${youtubeVideoId}.mp3`;
  const finalEpisode = await concatenateAudioFiles(introPath, sermonOnlyPath, outroPath, finalFileName);

  // 6. Upload to Cloudflare R2 Storage
  console.log(`[orchestrator] uploading final episode to storage`);
  await updateProgress?.(85, "Uploading to cloud storage...");
  const storagePath = StoragePaths.processed(agentId, youtubeVideoId);
  const upload = await uploadEpisode(finalEpisode.outputPath, storagePath);

  // 7. Create episode record
  console.log(`[orchestrator] creating episode record`);
  await updateProgress?.(95, "Creating episode record...");
  const sermonDurationSec = aiResult.boundaries.sermon_end_sec - aiResult.boundaries.sermon_start_sec;

  const episode = await createEpisode({
    agent_id: agentId,
    video_id: video.id,
    title: aiResult.metadata.episode_title,
    description: aiResult.metadata.episode_description,
    audio_url: upload.publicUrl,
    audio_size_bytes: upload.sizeBytes,
    duration_seconds: Math.round(sermonDurationSec),
    guid: `${agentId}:${youtubeVideoId}`,
    published_at: video.published_at || new Date().toISOString(),
    published: aiResult.decision.should_autopublish,
  });

  // 8. Store AI segmentation record
  console.log(`[orchestrator] storing AI segmentation data`);
  await createSegmentation({
    video_id: video.id,
    method: "llm_v1",
    sermon_start_sec: aiResult.boundaries.sermon_start_sec,
    sermon_end_sec: aiResult.boundaries.sermon_end_sec,
    confidence: aiResult.boundaries.confidence,
    explanation: `AI Pipeline: ${aiResult.boundaries.explanation}. Sermon likeness: ${aiResult.decision.sermon_likeness}, Category: ${aiResult.decision.category}. Reasons: ${aiResult.decision.reasons.join("; ")}.`,
    approved: aiResult.decision.should_autopublish,
  });

  // 9. Cleanup temp files
  const cleanupFiles = [
    { path: introPath, name: "intro" },
    { path: outroPath, name: "outro" },
    { path: download.audioPath, name: "youtube audio" },
    { path: sermonOnlyPath, name: "sermon" },
    { path: finalEpisode.outputPath, name: "final episode" },
  ];

  for (const file of cleanupFiles) {
    if (file.path) {
      try {
        await unlink(file.path);
      } catch (err) {
        console.warn(`[orchestrator] Failed to cleanup ${file.name} file: ${err}`);
      }
    }
  }

  // Remove the entire youtube-audio/{videoId}/ dir — catches any leftover compressed/chunk files
  const videoTempDir = path.join(os.tmpdir(), "youtube-audio", youtubeVideoId);
  await rm(videoTempDir, { recursive: true, force: true }).catch((err) =>
    console.warn(`[orchestrator] Failed to remove temp dir: ${err}`)
  );
  console.log(`[orchestrator] ✓ Removed temp dir: ${videoTempDir}`);

  console.log(`[orchestrator] ✓ completed episode ${episode.id}`);
  await updateProgress?.(100, "Processing complete!");

  return {
    episodeId: episode.id,
    audioUrl: upload.publicUrl,
  };
}
