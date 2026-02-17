-- Cancel all pending/processing backfill jobs
-- This is a cleanup migration to reset the state of all active backfill jobs

UPDATE backfill_jobs 
SET 
  status = 'cancelled',
  error = 'Manually cancelled via migration cleanup',
  updated_at = NOW()
WHERE status IN ('pending', 'processing');
