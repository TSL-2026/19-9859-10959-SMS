ALTER TABLE safety_signals
  ADD COLUMN IF NOT EXISTS source VARCHAR(500),
  ADD COLUMN IF NOT EXISTS assigned_department VARCHAR(255);

COMMENT ON COLUMN safety_signals.source IS 'Source of information (e.g., report, inspection, audit)';
COMMENT ON COLUMN safety_signals.assigned_department IS 'Department assigned to investigate or action';
