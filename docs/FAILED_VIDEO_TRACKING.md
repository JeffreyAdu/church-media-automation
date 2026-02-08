# Failed Video Tracking Implementation

## Overview
Implemented comprehensive failed video tracking so users can see which videos failed during backfill processing, with user-friendly error messages.

## Backend Changes

### 1. Database Migration
**File:** `supabase/migrations/20260207_add_failed_videos.sql`
- Added `failed_videos` JSONB column to `backfill_jobs` table
- Stores array of failed video objects with generic error messages

### 2. Repository Layer
**File:** `src/repositories/backfillJobRepository.ts`
- Added `FailedVideo` interface with fields: videoId, title, reason
- Updated `BackfillJob` interface to include `failed_videos: FailedVideo[]`
- Updated `UpdateJobProgressInput` to accept `failed_videos`
- Modified `updateJobProgress` to handle failed_videos updates

### 3. Error Message Utility
**File:** `src/utils/errorMessages.ts`
- New utility function: `getGenericErrorMessage(error: unknown): string`
- Converts technical errors into user-friendly messages:
  - "Video unavailable" (404, not available)
  - "Video is private" (403, private)
  - "Video blocked" (copyright, blocked)
  - "Download failed" (yt-dlp errors)
  - "Audio processing failed" (ffmpeg errors)
  - "Transcription failed" (OpenAI/Whisper errors)
  - "Processing timeout" (timeout errors)
  - "Upload failed" (storage errors)
  - "Processing failed" (generic fallback)

### 4. Backfill Service
**File:** `src/services/business/backfillJobService.ts`
- Added `failedVideos` array tracking in `processBackfillJob`
- Catches video processing errors and adds to failed list
- Updates job progress with failed videos after each failure
- Generic error messages generated via `getGenericErrorMessage`
- Final completion log includes failed count

### 5. Controller
**File:** `src/controllers/backfillController.ts`
- Updated `getBackfillJobStatus` to return `failedVideos` in API response

## Frontend Changes

### 1. API Types
**File:** `churchapp_frontend/src/features/agents/api/agentsApi.ts`
- Added `failedVideos` array to `getBackfillStatus` return type
- Interface includes: videoId, title, reason

### 2. Processing Status Component
**File:** `churchapp_frontend/src/features/agents/components/ProcessingStatus.tsx`
- Added `failedVideos` to `JobStatus` interface
- Updated poll function to include `failedVideos` from API response
- New UI section displaying failed videos:
  - Red background cards
  - Shows video title and ID
  - Displays generic error reason in badge
  - Clearly labeled "⚠️ Failed Videos (N)"

## User Experience

### Before:
- Videos fail silently during backfill
- User thinks all videos processed successfully
- No way to know why videos didn't become episodes

### After:
- Failed videos clearly visible in ProcessingStatus component
- User sees:
  ```
  ⚠️ Failed Videos (2):
  
  Sunday Service 01/12/25
  abc123xyz
  [Video unavailable]
  
  Wednesday Night Service
  def456ghi
  [Download failed]
  ```
- Error messages are non-technical and actionable
- User knows exactly which videos failed and why (generically)

## What Still Needs UI (Future):
- Retry button for failed videos
- Option to dismiss/acknowledge failures
- Webhook video failure notifications (currently no tracking for webhook-triggered processing)

## Testing Migration
Run this SQL on Supabase:
```sql
ALTER TABLE backfill_jobs
ADD COLUMN failed_videos JSONB DEFAULT '[]'::jsonb;
```

Then redeploy backend and frontend.
