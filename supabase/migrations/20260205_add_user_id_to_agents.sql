-- Add user_id column to agents table for multi-tenancy
-- This links each agent to a Supabase auth user

-- Add user_id column (nullable initially for existing data)
ALTER TABLE agents 
ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Create index for faster user-based queries
CREATE INDEX idx_agents_user_id ON agents(user_id);

-- Add user_id column to episodes table
ALTER TABLE episodes
ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Create index for faster user-based queries
CREATE INDEX idx_episodes_user_id ON episodes(user_id);

-- Enable Row Level Security (RLS) on agents table
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their own agents
CREATE POLICY "Users can view own agents"
ON agents FOR SELECT
USING (auth.uid() = user_id);

-- Policy: Users can insert their own agents
CREATE POLICY "Users can insert own agents"
ON agents FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own agents
CREATE POLICY "Users can update own agents"
ON agents FOR UPDATE
USING (auth.uid() = user_id);

-- Policy: Users can delete their own agents
CREATE POLICY "Users can delete own agents"
ON agents FOR DELETE
USING (auth.uid() = user_id);

-- Enable Row Level Security on episodes table
ALTER TABLE episodes ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see episodes for their own agents
CREATE POLICY "Users can view own episodes"
ON episodes FOR SELECT
USING (auth.uid() = user_id);

-- Policy: Users can insert episodes for their own agents
CREATE POLICY "Users can insert own episodes"
ON episodes FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own episodes
CREATE POLICY "Users can update own episodes"
ON episodes FOR UPDATE
USING (auth.uid() = user_id);

-- Policy: Users can delete their own episodes
CREATE POLICY "Users can delete own episodes"
ON episodes FOR DELETE
USING (auth.uid() = user_id);

-- NOTE: For existing agents (like TLC), you'll need to manually assign them to a user:
-- UPDATE agents SET user_id = 'your-user-uuid' WHERE name = 'Transforming Life Centre Church';
