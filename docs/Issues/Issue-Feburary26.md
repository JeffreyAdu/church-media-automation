# Issues — February 2026

---

## Issue #1 — Frontend progress updates are buggy during an active backfill

**Priority:** Medium  
**Status:** Open

**Description:**  
The frontend behaves erratically when a backfill job is in progress. Progress updates are either missing, out of order, or not reflecting the actual job state.

**Context:**  
This predates the SSE migration. The frontend was previously polling for status. Now that SSE is implemented on the backend, the frontend still needs to be updated to consume `EventSource` instead of polling. This is likely the root cause.

**Next Steps:**
- Replace polling logic in the frontend with `EventSource` connected to `GET /api/progress/:jobId/stream`
- Verify the `connected`, `progress`, and `complete` message types are handled correctly
- Test with a live backfill to confirm real-time updates are stable

---

## Issue #2 — Transcription layer fails on deployment (Priority 1)

**Priority:** Critical  
**Status:** ✅ Resolved (February 19, 2026)

**Description:**  
Backfill jobs consistently fail at the transcription step when deployed to Fly.io. Also affects videos coming in via WebSub notifications.

**Root Cause Analysis:**  
The previous implementation used a local Python `faster-whisper` model running inside the container. This proved to be a bottleneck on Fly.io — likely due to memory/CPU constraints on the instance or cold-start latency under load. The exact Fly.io-side reason is still to be investigated.

**Resolution:**  
- Migrated transcription from local `faster-whisper` to **Groq Cloud Whisper (`whisper-large-v3-turbo`)** — local model removed entirely
- Compression changed from FLAC (inflated to 340MB) back to **MP3 at 64kbps/16kHz/mono** (~33% reduction vs raw)
- Groq enforces a hard 25MB limit on all upload methods (direct and URL) — fixed by chunking: files >24MB are split into ≤24MB chunks before upload
- Chunk size: 4×~20MB for a 174min sermon; all chunks transcribed individually and merged with timestamp offsets
- All file storage migrated from Supabase Storage to **Cloudflare R2** (no 50MB cap; Supabase is now DB-only)
- `GROQ_API_KEY` and all 5 R2 env vars set as Fly.io secrets and deployed
- Full end-to-end test passed locally: 174min sermon → 4 chunks → 2688 segments → correct boundaries (confidence 0.9) → autopublish YES

---

## Issue #3 — Sermon segmentation model producing severely truncated output

**Priority:** High  
**Status:** ✅ Resolved (February 19, 2026)

**Description:**  
The AI segmentation model was extracting only ~4 minutes of audio from a 3-hour church service. The expected output is the full sermon (typically 45–90 minutes).

**Resolution:**  
Root cause was the transcription layer (Issue #2), not the segmentation model itself. The local `faster-whisper` model was producing incomplete or malformed transcripts under memory pressure, causing the LLM to see very little sermon content and pick a tiny segment. Once the transcription was migrated to Groq and chunking was implemented correctly, the full transcript was delivered to the segmentation model and accuracy was restored.

**Verified by pipeline test (February 19, 2026):**
- Input: 174min sermon ("Unveiling the Mystery of Marriage" — Dr. Ralph Dartey)
- Transcript: 2688 segments across 174 minutes
- Detected boundaries: 3516s → 9158s (**94 minutes** extracted)
- Confidence: **0.9**
- Autopublish: **YES** (sermon_likeness: 0.95)

**Note:** Issue #5 (deliberation loop) is still worth implementing as a quality improvement, but Issue #3 itself is no longer a blocking problem.

---

## Issue #4 — Failed videos are not automatically retried

**Priority:** Medium  
**Status:** Open

**Description:**  
When a video fails processing (e.g. transcription error, ffmpeg crash), its status is set to `"failed"` in the database. The current backfill logic skips any video that is not in `"discovered"` status, meaning failed videos are permanently excluded from all future backfill runs unless a developer manually runs the `resetFailedVideos` script.

This is unacceptable for an autonomous system — a transient error (network blip, Groq rate limit, OOM) should not permanently block a video from being processed.

**Expected Behavior:**  
Every video belonging to an agent's channel should eventually be processed without manual intervention. Transient failures should be retried automatically.

**Proposed Solution:**  
- Add a retry mechanism that resets videos stuck in `"failed"` status back to `"discovered"` after a configurable delay or attempt count
- Options:
  - **Scheduled job**: A cron/BullMQ recurring job that resets `failed` videos older than N hours back to `"discovered"` and triggers a mini-backfill
  - **Backfill-aware retry**: When a backfill scan encounters a `"failed"` video, check the failure timestamp — if older than a threshold (e.g. 1 hour), reset it to `"discovered"` and re-enqueue
  - **Max attempts guard**: Track `retry_count` on the video record; only auto-retry up to a max (e.g. 3) to avoid infinite loops on permanent failures

**Next Steps:**
- Decide on retry strategy (scheduled job vs. backfill-aware)
- Add `retry_count` and `last_failed_at` columns to the `videos` table
- Update `upsertVideo` or backfill logic to check retry eligibility
- Ensure permanent failures (e.g. video deleted from YouTube, no sermon content) are distinguishable from transient ones and are not retried indefinitely

---

## Issue #5 — Multi-agent pipeline has no feedback loop between boundary detection and autopublish

**Priority:** Medium  
**Status:** Design Phase

**Description:**  
The current AI pipeline is sequential with no feedback: Agent A (SermonSegmentRefiner) proposes boundaries, Agent B (EpisodeMetadataWriter) writes metadata, Agent C (AutopublishDecision) makes a publish decision. Agents A and C never communicate — Agent C silently inherits Agent A's boundaries even if they are clearly wrong (e.g. Issue #3: 4 minutes extracted from a 3-hour service).

**Proposed Design: Deliberation Loop**  
Agent A and Agent C enter a structured discussion before boundaries are finalized:

1. Agent A proposes initial boundaries + confidence + explanation
2. Agent C reviews the boundaries and the sermon text extracted from them — scores sermon_likeness and either **approves** or **challenges** with specific reasons
3. If challenged, Agent A receives Agent C's objections and proposes revised boundaries
4. This continues for up to **3 rounds**
5. If consensus is reached (Agent C approves) → boundaries are locked, pipeline continues
6. If no consensus after 3 rounds → episode is flagged for **manual review** (`published: false`, `approved: false`) and a warning is stored in the segmentation explanation

**Exit Conditions:**
- Agent C approves → proceed normally
- Max rounds exceeded → flag for manual review, do not discard the episode

**Key Design Questions (to resolve before implementation):**
- Agent B (metadata) should only run **after** A+C agree — metadata written on bad boundaries is wasted
- The deliberation transcript (each round's reasoning) should be stored in the `explanation` field or a new `deliberation_log` column for debugging

**Benefits:**
- Directly addresses Issue #3 (truncated sermon) — Agent C would challenge a 4-minute result from a 3-hour service
- Makes the pipeline self-correcting without human intervention
- Audit trail of why boundaries were chosen

**Next Steps:**
- Design the inter-agent message schema (what Agent C sends back to Agent A as a challenge)
- Implement `runDeliberationLoop()` in `sermonPipeline.ts` replacing the current sequential A → C calls
- Add `deliberation_rounds` and `deliberation_log` fields to the segmentation record
