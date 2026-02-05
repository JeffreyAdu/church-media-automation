-- Add published column to episodes table
-- This boolean determines if an episode appears in the RSS feed

ALTER TABLE episodes 
ADD COLUMN IF NOT EXISTS published BOOLEAN NOT NULL DEFAULT true;

-- Add index for faster RSS feed queries
CREATE INDEX IF NOT EXISTS idx_episodes_published_at 
ON episodes(agent_id, published, published_at DESC) 
WHERE published = true;

-- Add comment
COMMENT ON COLUMN episodes.published IS 'Whether this episode should appear in the RSS feed (autopublish decision)';
