-- Create backfill_jobs table for tracking background backfill operations
CREATE TABLE IF NOT EXISTS backfill_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  since_date TIMESTAMP WITH TIME ZONE NOT NULL,
  total_videos INTEGER DEFAULT 0,
  processed_videos INTEGER DEFAULT 0,
  enqueued_videos INTEGER DEFAULT 0,
  error TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for querying jobs by agent
CREATE INDEX idx_backfill_jobs_agent_id ON backfill_jobs(agent_id);

-- Index for querying by status
CREATE INDEX idx_backfill_jobs_status ON backfill_jobs(status);
