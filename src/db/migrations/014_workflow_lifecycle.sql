-- 014_workflow_lifecycle.sql
-- Adds signal workflow lifecycle: assign → investigate → resolve → close
-- + immutable audit log, escalation rules, automatic department notices

-- ============================================================
-- 1. Update status constraint to include full workflow
-- ============================================================
ALTER TABLE safety_signals DROP CONSTRAINT IF EXISTS safety_signals_status_check;

-- Migrate existing data to new status values
UPDATE safety_signals SET status = 'Closed' WHERE status IN ('closed', 'reviewed');
UPDATE safety_signals SET status = 'Reported' WHERE status = 'new';
UPDATE safety_signals SET status = 'Dismissed' WHERE status = 'dismissed';

ALTER TABLE safety_signals ADD CONSTRAINT safety_signals_status_check
  CHECK (status IN ('draft', 'Reported', 'Under Investigation', 'Resolved', 'Closed', 'Dismissed'));

-- ============================================================
-- 2. Add workflow columns to safety_signals
-- ============================================================
ALTER TABLE safety_signals
  ADD COLUMN IF NOT EXISTS assigned_to_id UUID,
  ADD COLUMN IF NOT EXISTS assigned_to_name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS investigation_notes TEXT,
  ADD COLUMN IF NOT EXISTS corrective_actions TEXT,
  ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS residual_risk_level INT,
  ADD COLUMN IF NOT EXISTS defenses_in_depth JSONB;

-- ============================================================
-- 3. Immutable workflow event log (audit trail)
-- ============================================================
CREATE TABLE IF NOT EXISTS signal_workflow_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  signal_id UUID NOT NULL REFERENCES safety_signals(id) ON DELETE CASCADE,
  from_status VARCHAR(50) NOT NULL,
  to_status VARCHAR(50) NOT NULL,
  changed_by_id UUID,
  changed_by_name VARCHAR(255),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workflow_events_signal
  ON signal_workflow_events(signal_id, created_at DESC);

-- ============================================================
-- 4. Escalation rules — time-based auto-escalation config
-- ============================================================
CREATE TABLE IF NOT EXISTS escalation_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  rule_name VARCHAR(255) NOT NULL,
  trigger_status VARCHAR(50) NOT NULL,
  time_threshold_hours INT NOT NULL,
  escalate_to_role VARCHAR(255),
  escalate_to_department VARCHAR(255),
  alert_level VARCHAR(20) NOT NULL DEFAULT 'MEDIUM',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_escalation_rules_tenant
  ON escalation_rules(tenant_id);

-- ============================================================
-- 5. Workflow notices — automatic notices sent on transitions
-- ============================================================
CREATE TABLE IF NOT EXISTS workflow_notices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  signal_id UUID NOT NULL REFERENCES safety_signals(id) ON DELETE CASCADE,
  notice_type VARCHAR(50) NOT NULL,
  message TEXT NOT NULL,
  department_target VARCHAR(255),
  acknowledged_at TIMESTAMPTZ,
  acknowledged_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workflow_notices_tenant
  ON workflow_notices(tenant_id, acknowledged_at NULLS FIRST);

-- ============================================================
-- 6. Function: transition signal status with audit trail
-- ============================================================
CREATE OR REPLACE FUNCTION transition_signal_status(
  p_signal_id UUID,
  p_new_status VARCHAR,
  p_note TEXT DEFAULT NULL,
  p_changed_by_id UUID DEFAULT NULL,
  p_changed_by_name VARCHAR DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_status VARCHAR;
  v_tenant_id UUID;
  v_result JSONB;
BEGIN
  SELECT status, tenant_id INTO v_old_status, v_tenant_id
  FROM safety_signals WHERE id = p_signal_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Signal not found';
  END IF;

  -- Update signal status
  UPDATE safety_signals
  SET status = p_new_status
  WHERE id = p_signal_id;

  -- Log workflow event
  INSERT INTO signal_workflow_events (signal_id, from_status, to_status, changed_by_id, changed_by_name, note)
  VALUES (p_signal_id, v_old_status, p_new_status, p_changed_by_id, p_changed_by_name, p_note);

  -- Auto-notice on specific transitions
  IF p_new_status = 'Under Investigation' THEN
    INSERT INTO workflow_notices (tenant_id, signal_id, notice_type, message, department_target)
    SELECT
      v_tenant_id,
      p_signal_id,
      'assigned',
      'Signal assigned for investigation',
      ss.assigned_department
    FROM safety_signals ss WHERE ss.id = p_signal_id;
  ELSIF p_new_status = 'Resolved' THEN
    INSERT INTO workflow_notices (tenant_id, signal_id, notice_type, message)
    VALUES (v_tenant_id, p_signal_id, 'resolved', 'Investigation resolved — corrective actions documented');
  ELSIF p_new_status = 'Closed' THEN
    INSERT INTO workflow_notices (tenant_id, signal_id, notice_type, message)
    VALUES (v_tenant_id, p_signal_id, 'closed', 'Signal closed — residual risk accepted');
  END IF;

  SELECT jsonb_build_object(
    'signal_id', p_signal_id,
    'from_status', v_old_status,
    'to_status', p_new_status,
    'note', p_note
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- ============================================================
-- 7. Function: assign signal for investigation
-- ============================================================
CREATE OR REPLACE FUNCTION assign_signal_for_investigation(
  p_signal_id UUID,
  p_assigned_to_id UUID DEFAULT NULL,
  p_assigned_to_name VARCHAR DEFAULT NULL,
  p_assigned_department VARCHAR DEFAULT NULL,
  p_changed_by_id UUID DEFAULT NULL,
  p_changed_by_name VARCHAR DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
BEGIN
  UPDATE safety_signals
  SET
    assigned_to_id = p_assigned_to_id,
    assigned_to_name = p_assigned_to_name,
    assigned_department = COALESCE(p_assigned_department, assigned_department),
    assigned_at = NOW(),
    status = 'Under Investigation'
  WHERE id = p_signal_id;

  INSERT INTO signal_workflow_events (signal_id, from_status, to_status, changed_by_id, changed_by_name, note)
  VALUES (p_signal_id, 'Reported', 'Under Investigation', p_changed_by_id, p_changed_by_name,
    'Assigned to ' || COALESCE(p_assigned_to_name, 'unassigned') || ' (' || COALESCE(p_assigned_department, 'no department') || ')');

  INSERT INTO workflow_notices (tenant_id, signal_id, notice_type, message, department_target)
  SELECT tenant_id, id, 'assigned',
    'Signal assigned to ' || COALESCE(p_assigned_to_name, 'unassigned') || ' for investigation',
    assigned_department
  FROM safety_signals WHERE id = p_signal_id;

  SELECT jsonb_build_object(
    'signal_id', p_signal_id,
    'assigned_to_name', p_assigned_to_name,
    'assigned_department', COALESCE(p_assigned_department, (SELECT assigned_department FROM safety_signals WHERE id = p_signal_id)),
    'status', 'Under Investigation'
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- ============================================================
-- 8. Function: resolve signal with findings
-- ============================================================
CREATE OR REPLACE FUNCTION resolve_signal(
  p_signal_id UUID,
  p_investigation_notes TEXT DEFAULT NULL,
  p_corrective_actions TEXT DEFAULT NULL,
  p_residual_risk_level INT DEFAULT NULL,
  p_defenses JSONB DEFAULT NULL,
  p_changed_by_id UUID DEFAULT NULL,
  p_changed_by_name VARCHAR DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
BEGIN
  UPDATE safety_signals
  SET
    investigation_notes = COALESCE(p_investigation_notes, investigation_notes),
    corrective_actions = COALESCE(p_corrective_actions, corrective_actions),
    residual_risk_level = COALESCE(p_residual_risk_level, residual_risk_level),
    defenses_in_depth = COALESCE(p_defenses, defenses_in_depth),
    resolved_at = NOW(),
    status = 'Resolved'
  WHERE id = p_signal_id;

  INSERT INTO signal_workflow_events (signal_id, from_status, to_status, changed_by_id, changed_by_name, note)
  VALUES (p_signal_id, 'Under Investigation', 'Resolved', p_changed_by_id, p_changed_by_name,
    'Resolved. Corrective actions: ' || COALESCE(p_corrective_actions, 'none specified'));

  INSERT INTO workflow_notices (tenant_id, signal_id, notice_type, message)
  SELECT tenant_id, id, 'resolved', 'Investigation resolved. Residual risk: ' || COALESCE(residual_risk_level::text, 'not assessed')
  FROM safety_signals WHERE id = p_signal_id;

  SELECT jsonb_build_object(
    'signal_id', p_signal_id,
    'status', 'Resolved',
    'corrective_actions', p_corrective_actions,
    'residual_risk_level', p_residual_risk_level
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- ============================================================
-- 9. Function: close signal
-- ============================================================
CREATE OR REPLACE FUNCTION close_signal(
  p_signal_id UUID,
  p_closing_note TEXT DEFAULT NULL,
  p_changed_by_id UUID DEFAULT NULL,
  p_changed_by_name VARCHAR DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
BEGIN
  UPDATE safety_signals
  SET
    closed_at = NOW(),
    status = 'Closed'
  WHERE id = p_signal_id;

  INSERT INTO signal_workflow_events (signal_id, from_status, to_status, changed_by_id, changed_by_name, note)
  VALUES (p_signal_id, 'Resolved', 'Closed', p_changed_by_id, p_changed_by_name,
    COALESCE(p_closing_note, 'Signal closed'));

  INSERT INTO workflow_notices (tenant_id, signal_id, notice_type, message)
  SELECT tenant_id, id, 'closed', 'Signal closed' || CASE WHEN p_closing_note IS NOT NULL THEN ': ' || p_closing_note ELSE '' END
  FROM safety_signals WHERE id = p_signal_id;

  SELECT jsonb_build_object(
    'signal_id', p_signal_id,
    'status', 'Closed',
    'note', p_closing_note
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- ============================================================
-- 10. Function: check escalations for a tenant
-- ============================================================
CREATE OR REPLACE FUNCTION check_escalations(p_tenant_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
  v_notice_count INT := 0;
BEGIN
  WITH escalated AS (
    INSERT INTO workflow_notices (tenant_id, signal_id, notice_type, message, department_target)
    SELECT
      ss.tenant_id,
      ss.id,
      'escalated',
      format('Escalated: signal in "%s" status for > %s hours', er.trigger_status, er.time_threshold_hours),
      er.escalate_to_department
    FROM safety_signals ss
    JOIN escalation_rules er ON er.tenant_id = ss.tenant_id
      AND er.is_active = true
      AND ss.status = er.trigger_status
      AND (
        CASE
          WHEN ss.status = 'Reported' THEN EXTRACT(EPOCH FROM (NOW() - ss.created_at)) / 3600
          WHEN ss.status = 'Under Investigation' THEN EXTRACT(EPOCH FROM (NOW() - COALESCE(ss.assigned_at, ss.created_at))) / 3600
          ELSE EXTRACT(EPOCH FROM (NOW() - ss.created_at)) / 3600
        END
      ) > er.time_threshold_hours
    WHERE (p_tenant_id IS NULL OR ss.tenant_id = p_tenant_id)
      AND NOT EXISTS (
        SELECT 1 FROM workflow_notices wn
        WHERE wn.signal_id = ss.id
          AND wn.notice_type = 'escalated'
          AND wn.created_at > NOW() - interval '24 hours'
      )
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_notice_count FROM escalated;

  SELECT jsonb_build_object('notices_created', v_notice_count) INTO v_result;
  RETURN v_result;
END;
$$;

-- ============================================================
-- 11. RLS policies for new tables (idempotent)
-- ============================================================
-- signal_workflow_events: no RLS — accessed via API with tenant auth
ALTER TABLE escalation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_notices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS escalation_rules_tenant ON escalation_rules;
CREATE POLICY escalation_rules_tenant ON escalation_rules
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

DROP POLICY IF EXISTS workflow_notices_tenant ON workflow_notices;
CREATE POLICY workflow_notices_tenant ON workflow_notices
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());
