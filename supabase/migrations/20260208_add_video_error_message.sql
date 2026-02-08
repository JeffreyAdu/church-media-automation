-- Add error_message column to videos table
ALTER TABLE videos
ADD COLUMN IF NOT EXISTS error_message TEXT;