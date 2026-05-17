-- 004_regulator_functions.sql
-- SECURITY DEFINER functions for regulator dashboard (bypasses RLS, returns aggregates only)

-- Overall SPI summary across all tenants
DROP FUNCTION IF EXISTS regulator_spi_summary();
CREATE OR REPLACE FUNCTION regulator_spi_summary()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'total_signals', (SELECT COALESCE(COUNT(*), 0) FROM safety_signals),
    'by_type', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('type', report_type, 'count', cnt) ORDER BY report_type)
      FROM (SELECT report_type, COUNT(*)::int as cnt FROM safety_signals GROUP BY report_type) t
    ), '[]'::jsonb),
    'severity_distribution', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('severity', severity, 'count', cnt) ORDER BY severity)
      FROM (SELECT severity, COUNT(*)::int as cnt FROM safety_signals GROUP BY severity) t
    ), '[]'::jsonb),
    'probability_distribution', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('probability', probability, 'count', cnt) ORDER BY probability)
      FROM (SELECT probability, COUNT(*)::int as cnt FROM safety_signals GROUP BY probability) t
    ), '[]'::jsonb),
    'avg_risk_level', (SELECT COALESCE(ROUND(AVG(risk_level), 1), 0) FROM safety_signals),
    'total_alerts', (SELECT COALESCE(COUNT(*), 0) FROM alerts),
    'open_alerts', (SELECT COALESCE(COUNT(*), 0) FROM alerts WHERE acknowledged_at IS NULL),
    'alerts_by_level', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('level', alert_level, 'count', cnt) ORDER BY alert_level)
      FROM (SELECT alert_level, COUNT(*)::int as cnt FROM alerts GROUP BY alert_level) t
    ), '[]'::jsonb),
    'total_tenants', (SELECT COALESCE(COUNT(DISTINCT tenant_id), 0) FROM safety_signals),
    'period', (
      SELECT jsonb_build_object(
        'from', MIN(occurrence_date),
        'to', MAX(occurrence_date)
      )
      FROM safety_signals
    )
  ) INTO result;
  RETURN result;
END;
$$;

-- Monthly signal trend data (aggregated across all tenants)
DROP FUNCTION IF EXISTS regulator_spi_trends(months INT);
CREATE OR REPLACE FUNCTION regulator_spi_trends(p_months INT DEFAULT 12)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'monthly_signals', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'month', to_char(month, 'YYYY-MM'),
        'count', cnt
      ) ORDER BY month)
      FROM (
        SELECT date_trunc('month', occurrence_date) as month, COUNT(*)::int as cnt
        FROM safety_signals
        WHERE occurrence_date >= date_trunc('month', NOW()) - (p_months || ' months')::interval
        GROUP BY month
      ) t
    ), '[]'::jsonb),
    'monthly_by_type', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'month', to_char(month, 'YYYY-MM'),
        'report_type', report_type,
        'count', cnt
      ) ORDER BY month, report_type)
      FROM (
        SELECT date_trunc('month', occurrence_date) as month, report_type, COUNT(*)::int as cnt
        FROM safety_signals
        WHERE occurrence_date >= date_trunc('month', NOW()) - (p_months || ' months')::interval
        GROUP BY month, report_type
      ) t
    ), '[]'::jsonb),
    'monthly_risk_avg', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'month', to_char(month, 'YYYY-MM'),
        'avg_risk', ROUND(avg_risk, 1)
      ) ORDER BY month)
      FROM (
        SELECT date_trunc('month', occurrence_date) as month, AVG(risk_level) as avg_risk
        FROM safety_signals
        WHERE occurrence_date >= date_trunc('month', NOW()) - (p_months || ' months')::interval
        GROUP BY month
      ) t
    ), '[]'::jsonb),
    'monthly_alerts', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'month', to_char(month, 'YYYY-MM'),
        'count', cnt
      ) ORDER BY month)
      FROM (
        SELECT date_trunc('month', triggered_at) as month, COUNT(*)::int as cnt
        FROM alerts
        WHERE triggered_at >= date_trunc('month', NOW()) - (p_months || ' months')::interval
        GROUP BY month
      ) t
    ), '[]'::jsonb)
  ) INTO result;
  RETURN result;
END;
$$;

-- Per-tenant aggregated SPI data (for cross-tenant view, counts only)
DROP FUNCTION IF EXISTS regulator_spi_by_tenant();
CREATE OR REPLACE FUNCTION regulator_spi_by_tenant()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSONB;
BEGIN
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'tenant_id', tenant_id,
    'total_signals', total_signals,
    'by_type', by_type,
    'avg_risk', avg_risk,
    'total_alerts', total_alerts
  ) ORDER BY total_signals DESC), '[]'::jsonb)
  INTO result
  FROM (
    SELECT
      s.tenant_id,
      COUNT(*)::int as total_signals,
      (SELECT jsonb_agg(jsonb_build_object('type', report_type, 'count', cnt))
       FROM (SELECT report_type, COUNT(*)::int as cnt FROM safety_signals WHERE tenant_id = s.tenant_id GROUP BY report_type) t) as by_type,
      ROUND(AVG(s.risk_level), 1) as avg_risk,
      (SELECT COUNT(*)::int FROM alerts WHERE tenant_id = s.tenant_id) as total_alerts
    FROM safety_signals s
    GROUP BY s.tenant_id
  ) t;
  RETURN result;
END;
$$;

-- Full export data for Annex 19 PDF (aggregated, no raw data)
DROP FUNCTION IF EXISTS regulator_export_data();
CREATE OR REPLACE FUNCTION regulator_export_data()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'summary', regulator_spi_summary(),
    'trends', regulator_spi_trends(24),
    'by_tenant', regulator_spi_by_tenant(),
    'generated_at', NOW()
  ) INTO result;
  RETURN result;
END;
$$;
