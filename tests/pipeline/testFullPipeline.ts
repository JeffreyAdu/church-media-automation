/**
 * End-to-End Pipeline Test
 * Tests the full video processing flow with detailed per-step logging.
 *
 * Usage (from church-media-automation/):
 *   npx tsx tests/pipeline/testFullPipeline.ts
 *
 * Requires a .env file in church-media-automation/ with all keys set.
 *
 * What it tests:
 *   1. YouTube audio download
 *   2. Audio compression (compressForStt)
 *   3. Groq transcription (with chunk handling if needed)
 *   4. Sermon boundary detection (Agent A)
 *   5. Sermon text extraction
 *   6. Episode metadata generation (Agent B)
 *   7. Autopublish decision (Agent C)
 *   8. Sermon segment extraction (ffmpeg)
 *   9. Final episode concatenation (intro + sermon + outro)
 *
 * Note: Steps 8–9 require a valid agentId with intro/outro configured in the DB.
 * If no agentId is provided, the script stops after step 7 (AI pipeline only).
 */

import "dotenv/config";
import path from "path";
import { stat, unlink, mkdir, copyFile } from "fs/promises";
import { downloadVideo } from "../../src/services/business/downloadVideoService.js";
import { transcribe } from "../../src/services/business/transcriptionService.js";
import { runSermonAiStage } from "../../src/services/business/sermonPipeline.js";
import { extractSegment, concatenateAudioFiles } from "../../src/services/business/processAudioService.js";
import { compressForStt, getAudioDuration } from "../../src/utils/audioCompression.js";

// ─── CONFIG ──────────────────────────────────────────────────────────────────

const TEST_VIDEO_URL = "https://www.youtube.com/watch?v=kq8rlZI5ltc";
const TEST_VIDEO_ID = "kq8rlZI5ltc";
const TEST_SERVICE_DATE = new Date().toISOString();

// Optional: set to a real agentId to test intro/outro concatenation (steps 8-9)
const TEST_AGENT_ID: string | null = null;

// Output directory — final sermon file is saved here for playback (not deleted after test)
const OUTPUT_DIR = path.resolve("tests/pipeline/output");

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function separator(label: string) {
  const line = "─".repeat(60);
  console.log(`\n${line}`);
  console.log(`  ${label}`);
  console.log(`${line}`);
}

function logJson(label: string, obj: unknown) {
  console.log(`\n[${label}]`);
  console.log(JSON.stringify(obj, null, 2));
}

function elapsed(startMs: number): string {
  return `${((Date.now() - startMs) / 1000).toFixed(1)}s`;
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

async function runTest() {
  console.log("\n🧪 PIPELINE TEST — START");
  console.log(`   URL : ${TEST_VIDEO_URL}`);
  console.log(`   Time: ${new Date().toISOString()}`);

  const tempFiles: string[] = [];
  const totalStart = Date.now();

  await mkdir(OUTPUT_DIR, { recursive: true });

  try {
    // ── STEP 1: Download ──────────────────────────────────────────────────────
    separator("STEP 1 — YouTube Download");
    let t = Date.now();

    const download = await downloadVideo(TEST_VIDEO_URL, TEST_VIDEO_ID);
    const downloadStats = await stat(download.audioPath);

    console.log(`✓ Done in ${elapsed(t)}`);
    console.log(`  File    : ${download.audioPath}`);
    console.log(`  Size    : ${(downloadStats.size / 1024 / 1024).toFixed(2)} MB`);
    console.log(`  Title   : ${download.title}`);
    console.log(`  Duration: ${(download.durationSeconds / 60).toFixed(1)} min (${download.durationSeconds}s)`);

    tempFiles.push(download.audioPath);

    // ── STEP 2: Compression ───────────────────────────────────────────────────
    separator("STEP 2 — Audio Compression (compressForStt)");
    t = Date.now();

    const compressedPath = await compressForStt(download.audioPath);
    const compressedStats = await stat(compressedPath);

    console.log(`✓ Done in ${elapsed(t)}`);
    console.log(`  File     : ${compressedPath}`);
    console.log(`  Size     : ${(compressedStats.size / 1024 / 1024).toFixed(2)} MB`);
    console.log(`  Reduction: ${(((downloadStats.size - compressedStats.size) / downloadStats.size) * 100).toFixed(1)}%`);

    tempFiles.push(compressedPath);

    // ── STEP 3: Transcription ─────────────────────────────────────────────────
    separator("STEP 3 — Groq Transcription");
    t = Date.now();

    const transcript = await transcribe(download.audioPath);
    const lastSeg = transcript.segments[transcript.segments.length - 1];
    const transcriptDurationMin = lastSeg ? (lastSeg.end / 60).toFixed(1) : "unknown";

    console.log(`✓ Done in ${elapsed(t)}`);
    console.log(`  Segments  : ${transcript.segments.length}`);
    console.log(`  Duration  : ${transcriptDurationMin} min`);
    console.log(`  Text chars: ${transcript.text.length}`);
    console.log(`  Language  : ${transcript.language}`);

    console.log(`\n  [First 300 chars]`);
    console.log(`  "${transcript.text.slice(0, 300)}..."`);
    console.log(`\n  [Last 300 chars]`);
    console.log(`  "...${transcript.text.slice(-300)}"`);

    console.log(`\n  [First 3 segments]`);
    transcript.segments.slice(0, 3).forEach((s, i) => {
      console.log(`    [${i}] ${s.start.toFixed(1)}s → ${s.end.toFixed(1)}s: "${s.text.trim()}"`);
    });
    console.log(`\n  [Last 3 segments]`);
    transcript.segments.slice(-3).forEach((s, i) => {
      const idx = transcript.segments.length - 3 + i;
      console.log(`    [${idx}] ${s.start.toFixed(1)}s → ${s.end.toFixed(1)}s: "${s.text.trim()}"`);
    });

    // ── STEP 4–7: AI Pipeline ──────────────────────────────────────────────────
    separator("STEP 4–7 — AI Pipeline (Boundaries → Metadata → Autopublish)");
    t = Date.now();

    const aiResult = await runSermonAiStage({
      audioPath: download.audioPath,
      youtubeTitle: download.title,
      serviceDateISO: TEST_SERVICE_DATE,
    });

    console.log(`✓ AI pipeline done in ${elapsed(t)}`);

    separator("STEP 4 RESULT — Sermon Boundaries (Agent A)");
    logJson("SermonSegmentRefiner", {
      sermon_start_sec: aiResult.boundaries.sermon_start_sec,
      sermon_end_sec: aiResult.boundaries.sermon_end_sec,
      sermon_duration_min: ((aiResult.boundaries.sermon_end_sec - aiResult.boundaries.sermon_start_sec) / 60).toFixed(1),
      confidence: aiResult.boundaries.confidence,
      explanation: aiResult.boundaries.explanation,
    });

    separator("STEP 5 RESULT — Extracted Sermon Text");
    const sermonText = aiResult.transcript.segments
      .filter(s => s.start >= aiResult.boundaries.sermon_start_sec && s.end <= aiResult.boundaries.sermon_end_sec)
      .map(s => s.text)
      .join(" ");
    console.log(`  Sermon text length: ${sermonText.length} chars`);
    console.log(`\n  [First 500 chars]`);
    console.log(`  "${sermonText.slice(0, 500)}"`);
    console.log(`\n  [Last 500 chars]`);
    console.log(`  "${sermonText.slice(-500)}"`);

    separator("STEP 6 RESULT — Episode Metadata (Agent B)");
    logJson("EpisodeMetadataWriter", aiResult.metadata);

    separator("STEP 7 RESULT — Autopublish Decision (Agent C)");
    logJson("AutopublishDecision", aiResult.decision);

    // ── STEP 8: Extract sermon segment ────────────────────────────────────────
    separator("STEP 8 — Extract Sermon Segment (ffmpeg)");
    t = Date.now();

    const sermonOnlyFileName = `${TEST_VIDEO_ID}-sermon-test.mp3`;
    const sermonOnlyPath = await extractSegment(
      download.audioPath,
      aiResult.boundaries.sermon_start_sec,
      aiResult.boundaries.sermon_end_sec,
      sermonOnlyFileName
    );
    const sermonStats = await stat(sermonOnlyPath);
    const sermonDuration = await getAudioDuration(sermonOnlyPath);

    console.log(`✓ Done in ${elapsed(t)}`);
    console.log(`  File              : ${sermonOnlyPath}`);
    console.log(`  Size              : ${(sermonStats.size / 1024 / 1024).toFixed(2)} MB`);
    console.log(`  Actual duration   : ${(sermonDuration / 60).toFixed(1)} min (${sermonDuration.toFixed(0)}s)`);
    console.log(`  Expected duration : ${((aiResult.boundaries.sermon_end_sec - aiResult.boundaries.sermon_start_sec) / 60).toFixed(1)} min`);

    tempFiles.push(sermonOnlyPath);

    // ── Save sermon to output folder for playback ────────────────────────────
    const outputSermonPath = path.join(OUTPUT_DIR, `${TEST_VIDEO_ID}-sermon.mp3`);
    await copyFile(sermonOnlyPath, outputSermonPath);
    console.log(`\n  💾 Saved for playback: ${outputSermonPath}`);

    // ── STEP 9: Concatenation ─────────────────────────────────────────────────
    if (TEST_AGENT_ID) {
      separator("STEP 9 — Concatenate intro + sermon + outro");
      t = Date.now();

      const finalFileName = `test-final-${TEST_VIDEO_ID}.mp3`;
      const finalEpisode = await concatenateAudioFiles(null, sermonOnlyPath, null, finalFileName);
      const finalStats = await stat(finalEpisode.outputPath);
      const finalDuration = await getAudioDuration(finalEpisode.outputPath);

      console.log(`✓ Done in ${elapsed(t)}`);
      console.log(`  File    : ${finalEpisode.outputPath}`);
      console.log(`  Size    : ${(finalStats.size / 1024 / 1024).toFixed(2)} MB`);
      console.log(`  Duration: ${(finalDuration / 60).toFixed(1)} min`);

      tempFiles.push(finalEpisode.outputPath);
    } else {
      separator("STEP 9 — SKIPPED (TEST_AGENT_ID not set)");
      console.log("  Set TEST_AGENT_ID at the top of this file to test intro/outro concatenation.");
    }

    // ── SUMMARY ───────────────────────────────────────────────────────────────
    separator("✅ TEST COMPLETE");
    console.log(`  Total time  : ${elapsed(totalStart)}`);
    console.log(`  Title       : ${download.title}`);
    console.log(`  Full length : ${(download.durationSeconds / 60).toFixed(1)} min`);
    console.log(`  Sermon range: ${aiResult.boundaries.sermon_start_sec}s → ${aiResult.boundaries.sermon_end_sec}s`);
    console.log(`  Sermon len  : ${((aiResult.boundaries.sermon_end_sec - aiResult.boundaries.sermon_start_sec) / 60).toFixed(1)} min`);
    console.log(`  Confidence  : ${aiResult.boundaries.confidence}`);
    console.log(`  Autopublish : ${aiResult.decision.should_autopublish ? "YES ✅" : "NO ❌"} (likeness: ${aiResult.decision.sermon_likeness})`);

  } catch (err) {
    separator("❌ TEST FAILED");
    console.error(err);
    process.exit(1);
  } finally {
    separator("🧹 Cleanup");
    for (const f of tempFiles) {
      try {
        await unlink(f);
        console.log(`  deleted: ${path.basename(f)}`);
      } catch {
        console.warn(`  could not delete: ${f}`);
      }
    }
  }
}

runTest();
