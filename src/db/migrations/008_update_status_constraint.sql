-- Update status check constraint to include 'Reported'
-- The code now uses 'Reported' as the default status on import

ALTER TABLE safety_signals DROP CONSTRAINT IF EXISTS safety_signals_status_check;
-- Accept both legacy and current workflow statuses
ALTER TABLE safety_signals ADD CONSTRAINT safety_signals_status_check
  CHECK (status IN ('new', 'reviewed', 'closed', 'dismissed', 'Reported', 'N/A',
                    'draft', 'Under Investigation', 'Resolved', 'Closed', 'Dismissed'));
