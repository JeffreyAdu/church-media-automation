-- Minimal DB tables (v1)
-- Schema for church media automation podcast system

-- 1) agents (one per church "AI agent")
-- Stores onboarding + "always listening" configuration
CREATE TABLE agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL, -- e.g., "Faith Temple Church"
  
  -- YouTube configuration
  youtube_channel_id VARCHAR(255) NOT NULL, -- canonical, not just URL
  youtube_channel_url TEXT,
  
  status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'paused')),
  
  -- Podcast config
  rss_slug VARCHAR(255) UNIQUE NOT NULL, -- used in /podcasts/:slug/rss.xml
  podcast_title VARCHAR(500),
  podcast_author VARCHAR(255),
  podcast_description TEXT,
  podcast_language VARCHAR(10) DEFAULT 'en',
  podcast_category VARCHAR(255),
  podcast_artwork_url TEXT,
  intro_audio_url TEXT, -- nullable
  outro_audio_url TEXT, -- nullable
  
  -- Sermon rules (v1 toggles)
  include_prayer BOOLEAN DEFAULT true,
  include_altar_call BOOLEAN DEFAULT true,
  exclude_announcements BOOLEAN DEFAULT false,
  min_sermon_minutes INTEGER DEFAULT 20,
  autopublish_min_confidence DOUBLE PRECISION DEFAULT 0.85,
  
  -- WebSub subscription tracking
  websub_topic_url TEXT,
  websub_callback_url TEXT,
  websub_lease_seconds INTEGER,
  websub_expires_at TIMESTAMPTZ,
  websub_secret TEXT,
  websub_status VARCHAR(50) CHECK (websub_status IN ('subscribed', 'expired', 'error')),
  
  -- Notifications
  notify_emails TEXT[], -- array of email addresses
  
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 2) videos (raw YouTube uploads we've seen)
-- Idempotency anchor
CREATE TABLE videos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  
  youtube_video_id VARCHAR(255) NOT NULL, -- unique per agent
  youtube_url TEXT NOT NULL,
  title TEXT,
  published_at TIMESTAMPTZ,
  duration_seconds INTEGER, -- nullable initially
  
  status VARCHAR(50) DEFAULT 'discovered' CHECK (status IN ('discovered', 'processing', 'processed', 'failed')),
  
  raw_payload JSONB, -- original YouTube notification/metadata for debugging
  
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  
  -- Unique constraint for idempotency
  UNIQUE (agent_id, youtube_video_id)
);

-- 3) jobs (background processing)
-- Tracks long-running work: download → VAD → transcript → segment → export → publish
CREATE TABLE jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  video_id UUID REFERENCES videos(id) ON DELETE CASCADE,
  
  type VARCHAR(50) NOT NULL CHECK (type IN ('process_video', 'backfill_scan')),
  status VARCHAR(50) DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'completed', 'failed')),
  
  attempts INTEGER DEFAULT 0,
  last_error TEXT,
  
  -- Progress tracking
  progress_stage VARCHAR(50), -- download, vad, transcribe, segment, render, upload, rss
  debug_json JSONB, -- logs or debug info
  
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  
  -- Ensure video_id is NOT NULL for process_video jobs
  CHECK (
    (type = 'process_video' AND video_id IS NOT NULL)
    OR
    (type = 'backfill_scan')
  )
);

-- 4) episodes (podcast episodes we publish to RSS)
-- One episode typically maps to one YouTube video
CREATE TABLE episodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  video_id UUID NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  
  title VARCHAR(500) NOT NULL,
  description TEXT,
  
  audio_url TEXT NOT NULL, -- public URL
  audio_size_bytes BIGINT,
  audio_mime_type VARCHAR(50) DEFAULT 'audio/mpeg',
  duration_seconds INTEGER NOT NULL,
  explicit BOOLEAN DEFAULT false,
  
  published_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  guid VARCHAR(255) NOT NULL, -- stable (use youtube_video_id or episode uuid)
  
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  
  -- Prevent double publishing
  UNIQUE (agent_id, video_id),
  -- Scope guid uniqueness per agent
  UNIQUE (agent_id, guid)
);

-- 5) segmentations (for future HF training + debugging)
-- Optional: stores the "AI decision" with timestamps and confidence
CREATE TABLE segmentations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id UUID NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  
  method VARCHAR(50) DEFAULT 'llm_v1' CHECK (method IN ('llm_v1', 'manual_override')),
  
  sermon_start_sec DOUBLE PRECISION NOT NULL,
  sermon_end_sec DOUBLE PRECISION NOT NULL,
  confidence DOUBLE PRECISION,
  
  excluded_ranges JSONB, -- array of ranges to exclude
  explanation TEXT,
  approved BOOLEAN DEFAULT false, -- true if autopublished or human confirmed
  
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  
  -- Ensure end time is after start time
  CHECK (sermon_end_sec > sermon_start_sec)
);

-- Indexes for performance
CREATE INDEX idx_videos_agent_id ON videos(agent_id);
CREATE INDEX idx_videos_status ON videos(status);
CREATE INDEX idx_jobs_agent_id ON jobs(agent_id);
CREATE INDEX idx_jobs_video_id ON jobs(video_id);
CREATE INDEX idx_jobs_status ON jobs(status);
CREATE INDEX idx_episodes_agent_id ON episodes(agent_id);
CREATE INDEX idx_episodes_published_at ON episodes(published_at DESC);
CREATE INDEX idx_segmentations_video_id ON segmentations(video_id);

-- Triggers for updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_agents_updated_at BEFORE UPDATE ON agents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_videos_updated_at BEFORE UPDATE ON videos
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_jobs_updated_at BEFORE UPDATE ON jobs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_episodes_updated_at BEFORE UPDATE ON episodes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
