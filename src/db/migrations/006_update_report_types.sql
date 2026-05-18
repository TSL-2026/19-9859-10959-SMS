-- Update report_type check constraint to include all types
ALTER TABLE safety_signals DROP CONSTRAINT IF EXISTS safety_signals_report_type_check;
ALTER TABLE safety_signals ADD CONSTRAINT safety_signals_report_type_check 
  CHECK (report_type IN ('MOR', 'VSR', 'Hazard', 'HAZARD', 'SAFETY_DEFICIENCY', 'DIVERSION'));
