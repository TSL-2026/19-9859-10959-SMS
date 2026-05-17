-- 001_rls.sql
-- Enable Row Level Security and create helper functions

-- 1. Ensure the uuid-ossp extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Create a tenant_id column helper function
--    This is called by RLS policies to get the current tenant_id from the session
CREATE OR REPLACE FUNCTION current_tenant_id()
RETURNS UUID
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  tid UUID;
BEGIN
  tid := NULLIF(current_setting('app.tenant_id', true), '')::UUID;
  RETURN tid;
END;
$$;

-- 3. Create a helper to set tenant context within a transaction
CREATE OR REPLACE FUNCTION set_tenant_context(p_tenant_id UUID)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config('app.tenant_id', p_tenant_id::TEXT, true);
END;
$$;

-- ============================================================
-- Example tables with RLS
-- ============================================================

-- Users table (scoped to tenant)
CREATE TABLE IF NOT EXISTS users (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id   UUID NOT NULL,
  email       VARCHAR(255) NOT NULL,
  name        VARCHAR(255),
  role        VARCHAR(50) NOT NULL DEFAULT 'member',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS users_tenant_isolation ON users;
CREATE POLICY users_tenant_isolation ON users
  USING (tenant_id = current_tenant_id());

DROP POLICY IF EXISTS users_tenant_insert ON users;
CREATE POLICY users_tenant_insert ON users
  FOR INSERT WITH CHECK (tenant_id = current_tenant_id());

-- Documents table (scoped to tenant)
CREATE TABLE IF NOT EXISTS documents (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id   UUID NOT NULL,
  title       VARCHAR(255) NOT NULL,
  body        TEXT,
  created_by  UUID REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS documents_tenant_isolation ON documents;
CREATE POLICY documents_tenant_isolation ON documents
  USING (tenant_id = current_tenant_id());

DROP POLICY IF EXISTS documents_tenant_insert ON documents;
CREATE POLICY documents_tenant_insert ON documents
  FOR INSERT WITH CHECK (tenant_id = current_tenant_id());
