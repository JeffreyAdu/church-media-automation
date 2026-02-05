-- Add 'vad_v1' to segmentations method constraint
ALTER TABLE segmentations
  DROP CONSTRAINT IF EXISTS segmentations_method_check;

ALTER TABLE segmentations
  ADD CONSTRAINT segmentations_method_check
  CHECK (method IN ('vad_v1', 'llm_v1', 'manual_override'));

-- Set default to vad_v1
ALTER TABLE segmentations
  ALTER COLUMN method SET DEFAULT 'vad_v1';
