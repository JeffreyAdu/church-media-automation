-- Clean up all test data
-- Run this in Supabase SQL Editor

-- This will cascade delete all related data (episodes, videos, jobs, segmentations)
-- due to ON DELETE CASCADE constraints

DELETE FROM agents;

-- Verify cleanup
SELECT 'agents' as table_name, COUNT(*) as remaining FROM agents
UNION ALL
SELECT 'videos', COUNT(*) FROM videos
UNION ALL
SELECT 'episodes', COUNT(*) FROM episodes
UNION ALL
SELECT 'jobs', COUNT(*) FROM jobs
UNION ALL
SELECT 'segmentations', COUNT(*) FROM segmentations;

-- Expected result: All counts should be 0
