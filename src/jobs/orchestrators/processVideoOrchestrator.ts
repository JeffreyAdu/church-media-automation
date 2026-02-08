/**
 * Process Video Orchestrator
 * Coordinates the complete video processing workflow:
 * VAD → AI Pipeline → Episode Assembly
 */

import { downloadVideo } from "../../services/business/downloadVideoService.js";
import { convertToWav, extractSpeechSegments, extractSegment, concatenateAudioFiles } from "../../services/business/processAudioService.js";
import { detectSpeech } from "../../services/business/detectSpeechService.js";
import { uploadEpisode } from "../../services/business/uploadEpisodeService.js";
import { downloadFromUrl } from "../../services/business/downloadService.js";
import { runSermonAiStage } from "../../services/business/sermonPipeline.js";
import { createEpisode } from "../../services/business/episodeService.js";
import { createSegmentation } from "../../services/business/segmentationService.js";
import { getVideoById } from "../../services/business/videoService.js";
import { findById } from "../../repositories/agentRepository.js";
import { unlink } from "fs/promises";

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
 * Downloads audio, runs VAD, transcribes, detects sermon with AI,
 * assembles final episode with intro/outro, and publishes.
 */
export async function processVideoOrchestrator(input: ProcessVideoInput): Promise<ProcessVideoResult> {
  const { agentId, videoId, youtubeVideoId, youtubeUrl, updateProgress } = input;

  // 1. Download audio from YouTube
  console.log(`[orchestrator] downloading audio for ${youtubeVideoId}`);
  await updateProgress?.(5, "Downloading audio from YouTube...");
  const download = await downloadVideo(youtubeUrl, youtubeVideoId);

  // 2. Convert to WAV for VAD analysis
  console.log(`[orchestrator] converting to WAV for VAD`);
  await updateProgress?.(15, "Converting to WAV format...");
  const wavPath = await convertToWav(download.audioPath, `${youtubeVideoId}.wav`);

  // 3. Run VAD to detect speech segments
  console.log(`[orchestrator] running voice activity detection`);
  await updateProgress?.(25, "Detecting speech segments...");
  const speechSegments = await detectSpeech(wavPath);
  
  // 4. Build merged timeline mapping and find longest segment
  let mergedPosition = 0;
  const segmentMapping = speechSegments.map((seg) => {
    const mapped = {
      originalStartSec: seg.startSec,
      originalEndSec: seg.endSec,
      mergedStartSec: mergedPosition,
      mergedEndSec: mergedPosition + seg.durationSec,
      durationSec: seg.durationSec,
    };
    mergedPosition += seg.durationSec;
    return mapped;
  });

  const longestInMerged = segmentMapping.length > 0
    ? segmentMapping.reduce((longest, current) =>
        current.durationSec > longest.durationSec ? current : longest
      )
    : null;

  const totalSpeechSec = mergedPosition;
  const speechRatio = download.durationSeconds > 0 ? totalSpeechSec / download.durationSeconds : 0;
  
  console.log(`[vad] 🎤 Detected ${speechSegments.length} speech segments`);
  console.log(`[vad] 📊 Total speech: ${(totalSpeechSec/60).toFixed(1)} min of ${(download.durationSeconds/60).toFixed(1)} min (${(speechRatio*100).toFixed(1)}%)`);
  console.log(`[vad] 🔊 Longest segment: ${longestInMerged?.durationSec.toFixed(0)}s`);

  // 5. Extract and concatenate speech-only segments
  console.log(`[orchestrator] extracting speech-only audio`);
  await updateProgress?.(35, "Extracting speech segments...");
  const speechOnlyFileName = `${youtubeVideoId}-speech-only.mp3`;
  const speechOnlyAudio = await extractSpeechSegments(
    download.audioPath,
    speechSegments,
    speechOnlyFileName
  );

  // 6. Run AI pipeline: transcribe speech-only → detect sermon → generate metadata → autopublish decision
  console.log(`[orchestrator] running AI sermon detection pipeline`);
  await updateProgress?.(45, "Transcribing audio with AI...");
  const video = await getVideoById(videoId);
  if (!video) {
    throw new Error(`Video not found: ${videoId}`);
  }

  const aiResult = await runSermonAiStage({
    audioPath: speechOnlyAudio.outputPath,
    youtubeTitle: download.title,
    serviceDateISO: video.published_at || new Date().toISOString(),
  });

  // 7. Extract just the sermon portion from speech-only audio using AI-detected boundaries
  console.log(`[orchestrator] extracting AI-detected sermon segment`);
  await updateProgress?.(65, "Extracting sermon segment...");
  
  // Validate sermon boundaries
  if (aiResult.boundaries.sermon_start_sec < 0 || 
      aiResult.boundaries.sermon_end_sec > totalSpeechSec ||
      aiResult.boundaries.sermon_start_sec >= aiResult.boundaries.sermon_end_sec) {
    throw new Error(
      `Invalid sermon boundaries: start=${aiResult.boundaries.sermon_start_sec}s, ` +
      `end=${aiResult.boundaries.sermon_end_sec}s, total=${totalSpeechSec}s`
    );
  }
  
  const sermonOnlyFileName = `${youtubeVideoId}-sermon.mp3`;
  const sermonOnlyPath = await extractSegment(
    speechOnlyAudio.outputPath,
    aiResult.boundaries.sermon_start_sec,
    aiResult.boundaries.sermon_end_sec,
    sermonOnlyFileName
  );

  // 8. Concatenate intro + sermon + outro
  console.log(`[orchestrator] building final episode with intro/outro`);
  await updateProgress?.(75, "Assembling final episode...");
  
  // Get agent record to fetch intro/outro URLs
  const agent = await findById(agentId);
  if (!agent) {
    throw new Error(`Agent not found: ${agentId}`);
  }

  // Download intro/outro from Supabase URLs if they exist
  let introPath: string | null = null;
  let outroPath: string | null = null;

  if (agent.intro_audio_url) {
    console.log(`[orchestrator] downloading intro audio from ${agent.intro_audio_url}`);
    introPath = await downloadFromUrl(agent.intro_audio_url, `${youtubeVideoId}-intro.mp3`);
  }

  if (agent.outro_audio_url) {
    console.log(`[orchestrator] downloading outro audio from ${agent.outro_audio_url}`);
    outroPath = await downloadFromUrl(agent.outro_audio_url, `${youtubeVideoId}-outro.mp3`);
  }

  const finalFileName = `${agentId}-${youtubeVideoId}.mp3`;
  const finalEpisode = await concatenateAudioFiles(
    introPath,
    sermonOnlyPath,
    outroPath,
    finalFileName
  );

  // 9. Upload final episode to Supabase Storage
  console.log(`[orchestrator] uploading final episode to storage`);
  await updateProgress?.(85, "Uploading to cloud storage...");
  const storagePath = `episodes/${agentId}/${finalFileName}`;
  const upload = await uploadEpisode(finalEpisode.outputPath, storagePath);

  // 10. Create episode record with AI-generated metadata
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

  // 11. Store AI segmentation (LLM v1)
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

  // 12. Also store VAD segmentation for reference
  if (longestInMerged) {
    console.log(`[orchestrator] storing VAD segmentation for reference`);
    const confidence = Math.min(
      speechRatio * 0.6 +
      Math.min(longestInMerged.durationSec / 1800, 1) * 0.4,
      1.0
    );

    await createSegmentation({
      video_id: video.id,
      method: "vad_v1",
      sermon_start_sec: longestInMerged.mergedStartSec,
      sermon_end_sec: longestInMerged.mergedEndSec,
      confidence,
      explanation: `VAD detected ${speechSegments.length} speech segments. Longest segment (${Math.round(longestInMerged.durationSec)}s) selected as sermon. Timestamps relative to speech-only audio.`,
      approved: false,
    });
  }

  // Cleanup temp files (log errors but don't fail processing)
  const cleanupFiles = [
    { path: introPath, name: 'intro' },
    { path: outroPath, name: 'outro' },
    { path: download.audioPath, name: 'youtube audio' },
    { path: wavPath, name: 'WAV' },
    { path: speechOnlyAudio.outputPath, name: 'speech-only' },
    { path: sermonOnlyPath, name: 'sermon' },
    { path: finalEpisode.outputPath, name: 'final episode' },
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

  console.log(`[orchestrator] ✓ completed episode ${episode.id}`);
  await updateProgress?.(100, "Processing complete!");

  return {
    episodeId: episode.id,
    audioUrl: upload.publicUrl,
  };
}
