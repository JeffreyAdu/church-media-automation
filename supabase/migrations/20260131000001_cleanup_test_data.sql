-- Clean up all test data
-- This will cascade delete all related data (episodes, videos, jobs, segmentations)
-- due to ON DELETE CASCADE constraints

DELETE FROM agents;
