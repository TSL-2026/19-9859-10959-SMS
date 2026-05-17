-- 002_safety_tables.sql
-- Safety domain tables with Row Level Security

-- ============================================================
-- safety_signals: ingested MOR/VSR/Hazard reports
-- ============================================================
CREATE TABLE IF NOT EXISTS safety_signals (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id         UUID NOT NULL,
  report_id         VARCHAR(255),
  report_type       VARCHAR(50) NOT NULL CHECK (report_type IN ('MOR', 'VSR', 'Hazard')),
  occurrence_date   DATE,
  severity          INTEGER NOT NULL CHECK (severity BETWEEN 1 AND 5),
  probability       INTEGER NOT NULL CHECK (probability BETWEEN 1 AND 5),
  risk_level        INTEGER NOT NULL,
  description_raw   TEXT,
  status            VARCHAR(50) NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'reviewed', 'closed', 'dismissed')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE safety_signals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS safety_signals_tenant_select ON safety_signals;
CREATE POLICY safety_signals_tenant_select ON safety_signals
  FOR SELECT USING (tenant_id = current_tenant_id());

DROP POLICY IF EXISTS safety_signals_tenant_insert ON safety_signals;
CREATE POLICY safety_signals_tenant_insert ON safety_signals
  FOR INSERT WITH CHECK (tenant_id = current_tenant_id());

DROP POLICY IF EXISTS safety_signals_tenant_update ON safety_signals;
CREATE POLICY safety_signals_tenant_update ON safety_signals
  FOR UPDATE USING (tenant_id = current_tenant_id());

-- ============================================================
-- alert_rules: tenant-configurable threshold rules
-- ============================================================
CREATE TABLE IF NOT EXISTS alert_rules (
  id                     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id              UUID NOT NULL,
  rule_name              VARCHAR(255) NOT NULL,
  severity_threshold     INTEGER NOT NULL CHECK (severity_threshold BETWEEN 1 AND 5),
  probability_threshold  INTEGER NOT NULL CHECK (probability_threshold BETWEEN 1 AND 5),
  alert_level            VARCHAR(50) NOT NULL CHECK (alert_level IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  channels               JSONB NOT NULL DEFAULT '["in_app"]',
  is_active              BOOLEAN NOT NULL DEFAULT true,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE alert_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS alert_rules_tenant_select ON alert_rules;
CREATE POLICY alert_rules_tenant_select ON alert_rules
  FOR SELECT USING (tenant_id = current_tenant_id());

DROP POLICY IF EXISTS alert_rules_tenant_insert ON alert_rules;
CREATE POLICY alert_rules_tenant_insert ON alert_rules
  FOR INSERT WITH CHECK (tenant_id = current_tenant_id());

DROP POLICY IF EXISTS alert_rules_tenant_update ON alert_rules;
CREATE POLICY alert_rules_tenant_update ON alert_rules
  FOR UPDATE USING (tenant_id = current_tenant_id());

DROP POLICY IF EXISTS alert_rules_tenant_delete ON alert_rules;
CREATE POLICY alert_rules_tenant_delete ON alert_rules
  FOR DELETE USING (tenant_id = current_tenant_id());

-- ============================================================
-- alerts: triggered alert instances
-- ============================================================
CREATE TABLE IF NOT EXISTS alerts (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id         UUID NOT NULL,
  signal_id         UUID NOT NULL REFERENCES safety_signals(id) ON DELETE CASCADE,
  rule_id           UUID NOT NULL REFERENCES alert_rules(id) ON DELETE CASCADE,
  alert_level       VARCHAR(50) NOT NULL,
  triggered_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  acknowledged_at   TIMESTAMPTZ,
  acknowledged_by   UUID REFERENCES users(id)
);

ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS alerts_tenant_select ON alerts;
CREATE POLICY alerts_tenant_select ON alerts
  FOR SELECT USING (tenant_id = current_tenant_id());

DROP POLICY IF EXISTS alerts_tenant_insert ON alerts;
CREATE POLICY alerts_tenant_insert ON alerts
  FOR INSERT WITH CHECK (tenant_id = current_tenant_id());

DROP POLICY IF EXISTS alerts_tenant_update ON alerts;
CREATE POLICY alerts_tenant_update ON alerts
  FOR UPDATE USING (tenant_id = current_tenant_id());

-- ============================================================
-- excel_imports: audit trail for uploaded spreadsheets
-- ============================================================
CREATE TABLE IF NOT EXISTS excel_imports (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id         UUID NOT NULL,
  filename          VARCHAR(500) NOT NULL,
  row_count         INTEGER NOT NULL DEFAULT 0,
  status            VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  error_log         JSONB,
  imported_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE excel_imports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS excel_imports_tenant_select ON excel_imports;
CREATE POLICY excel_imports_tenant_select ON excel_imports
  FOR SELECT USING (tenant_id = current_tenant_id());

DROP POLICY IF EXISTS excel_imports_tenant_insert ON excel_imports;
CREATE POLICY excel_imports_tenant_insert ON excel_imports
  FOR INSERT WITH CHECK (tenant_id = current_tenant_id());
