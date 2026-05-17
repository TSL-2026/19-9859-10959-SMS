-- 003_pii_store.sql
-- Encrypted PII storage with restricted access

-- Helper function to set user role in session context
CREATE OR REPLACE FUNCTION set_user_role(p_role TEXT)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config('app.user_role', p_role, true);
END;
$$;

-- PII store: encrypted original signal data
-- Access restricted to admin and pii_viewer roles via RLS
CREATE TABLE IF NOT EXISTS pii_store (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id      UUID NOT NULL,
  signal_id      UUID NOT NULL REFERENCES safety_signals(id) ON DELETE CASCADE,
  encrypted_pii  JSONB NOT NULL,
  created_by     UUID REFERENCES users(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE pii_store ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pii_store_tenant_select ON pii_store;
CREATE POLICY pii_store_tenant_select ON pii_store
  FOR SELECT USING (
    tenant_id = current_tenant_id()
    AND NULLIF(current_setting('app.user_role', true), '') IN ('admin', 'pii_viewer')
  );

DROP POLICY IF EXISTS pii_store_tenant_insert ON pii_store;
CREATE POLICY pii_store_tenant_insert ON pii_store
  FOR INSERT WITH CHECK (
    tenant_id = current_tenant_id()
    AND NULLIF(current_setting('app.user_role', true), '') IN ('admin', 'pii_viewer')
  );
