-- 006_tenant_types.sql
-- Adds tenant_type column and SECURITY DEFINER aggregation function
-- for regulator tenant-type breakdown

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS tenant_type VARCHAR(50) NOT NULL DEFAULT 'operator';

COMMENT ON COLUMN users.tenant_type IS 'airline, operator, service_provider, maintenance, training, ground_handling, other';

UPDATE users SET tenant_type = 'operator' WHERE tenant_type = 'operator';

DROP FUNCTION IF EXISTS regulator_spi_by_tenant_type();
CREATE OR REPLACE FUNCTION regulator_spi_by_tenant_type()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'tenants', COALESCE(
      (SELECT jsonb_agg(
        jsonb_build_object(
          'tenant_type', t.tenant_type,
          'signal_count', COALESCE(s.total_signals, 0),
          'avg_risk', COALESCE(s.avg_risk, 0)
        )
        ORDER BY s.total_signals DESC NULLS LAST
      )
      FROM (
        SELECT DISTINCT u.tenant_type
        FROM users u
      ) t
      LEFT JOIN (
        SELECT u2.tenant_type, COUNT(*)::int AS total_signals, COALESCE(ROUND(AVG(ss.risk_level), 1), 0) AS avg_risk
        FROM safety_signals ss
        JOIN users u2 ON u2.tenant_id = ss.tenant_id
        GROUP BY u2.tenant_type
      ) s ON s.tenant_type = t.tenant_type),
      '[]'::jsonb
    )
  ) INTO result;

  RETURN result;
END;
$$;

-- GRANTs omitted — SECURITY DEFINER functions run as owner
