-- Add failed_videos column to backfill_jobs table
-- Stores array of failed video info with generic error messages
ALTER TABLE backfill_jobs
ADD COLUMN failed_videos JSONB DEFAULT '[]'::jsonb;

-- Example structure:
-- [
--   {
--     "videoId": "abc123",
--     "title": "Sunday Service 01/12/25",
--     "reason": "Video unavailable"
--   }
-- ]
