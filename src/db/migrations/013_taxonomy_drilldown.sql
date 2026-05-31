-- 013_taxonomy_drilldown.sql
-- Adds optional taxonomy filter params to regulator aggregation functions
-- Enables dashboard drill-down by occurrence category, hazard category, or event type

-- ============================================================
-- 1. regulator_spi_summary — optional taxonomy filters
-- ============================================================
DROP FUNCTION IF EXISTS regulator_spi_summary();
CREATE OR REPLACE FUNCTION regulator_spi_summary(
  p_occurrence_category_id UUID DEFAULT NULL,
  p_hazard_category_id UUID DEFAULT NULL,
  p_event_type_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'total_signals', COALESCE((
      SELECT COUNT(*)::int FROM safety_signals ss
      WHERE (p_occurrence_category_id IS NULL OR ss.occurrence_category_id = p_occurrence_category_id)
        AND (p_hazard_category_id IS NULL OR ss.hazard_category_id = p_hazard_category_id)
        AND (p_event_type_id IS NULL OR ss.event_type_id = p_event_type_id)
    ), 0),
    'by_type', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('type', report_type, 'count', cnt) ORDER BY report_type)
      FROM (
        SELECT ss.report_type, COUNT(*)::int as cnt
        FROM safety_signals ss
        WHERE (p_occurrence_category_id IS NULL OR ss.occurrence_category_id = p_occurrence_category_id)
          AND (p_hazard_category_id IS NULL OR ss.hazard_category_id = p_hazard_category_id)
          AND (p_event_type_id IS NULL OR ss.event_type_id = p_event_type_id)
        GROUP BY ss.report_type
      ) t
    ), '[]'::jsonb),
    'severity_distribution', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('severity', severity, 'count', cnt) ORDER BY severity)
      FROM (
        SELECT ss.severity, COUNT(*)::int as cnt
        FROM safety_signals ss
        WHERE (p_occurrence_category_id IS NULL OR ss.occurrence_category_id = p_occurrence_category_id)
          AND (p_hazard_category_id IS NULL OR ss.hazard_category_id = p_hazard_category_id)
          AND (p_event_type_id IS NULL OR ss.event_type_id = p_event_type_id)
        GROUP BY ss.severity
      ) t
    ), '[]'::jsonb),
    'probability_distribution', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('probability', probability, 'count', cnt) ORDER BY probability)
      FROM (
        SELECT ss.probability, COUNT(*)::int as cnt
        FROM safety_signals ss
        WHERE (p_occurrence_category_id IS NULL OR ss.occurrence_category_id = p_occurrence_category_id)
          AND (p_hazard_category_id IS NULL OR ss.hazard_category_id = p_hazard_category_id)
          AND (p_event_type_id IS NULL OR ss.event_type_id = p_event_type_id)
        GROUP BY ss.probability
      ) t
    ), '[]'::jsonb),
    'avg_risk_level', COALESCE((
      SELECT ROUND(AVG(risk_level), 1) FROM safety_signals ss
      WHERE (p_occurrence_category_id IS NULL OR ss.occurrence_category_id = p_occurrence_category_id)
        AND (p_hazard_category_id IS NULL OR ss.hazard_category_id = p_hazard_category_id)
        AND (p_event_type_id IS NULL OR ss.event_type_id = p_event_type_id)
    ), 0),
    'total_alerts', (
      SELECT COUNT(*)::int FROM alerts a
      WHERE a.signal_id IN (
        SELECT ss.id FROM safety_signals ss
        WHERE (p_occurrence_category_id IS NULL OR ss.occurrence_category_id = p_occurrence_category_id)
          AND (p_hazard_category_id IS NULL OR ss.hazard_category_id = p_hazard_category_id)
          AND (p_event_type_id IS NULL OR ss.event_type_id = p_event_type_id)
      )
    ),
    'open_alerts', (
      SELECT COUNT(*)::int FROM alerts a
      WHERE a.signal_id IN (
        SELECT ss.id FROM safety_signals ss
        WHERE (p_occurrence_category_id IS NULL OR ss.occurrence_category_id = p_occurrence_category_id)
          AND (p_hazard_category_id IS NULL OR ss.hazard_category_id = p_hazard_category_id)
          AND (p_event_type_id IS NULL OR ss.event_type_id = p_event_type_id)
      )
        AND a.acknowledged_at IS NULL
    ),
    'alerts_by_level', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('level', alert_level, 'count', cnt) ORDER BY alert_level)
      FROM (
        SELECT a.alert_level, COUNT(*)::int as cnt
        FROM alerts a
        WHERE a.signal_id IN (
          SELECT ss.id FROM safety_signals ss
          WHERE (p_occurrence_category_id IS NULL OR ss.occurrence_category_id = p_occurrence_category_id)
            AND (p_hazard_category_id IS NULL OR ss.hazard_category_id = p_hazard_category_id)
            AND (p_event_type_id IS NULL OR ss.event_type_id = p_event_type_id)
        )
        GROUP BY a.alert_level
      ) t
    ), '[]'::jsonb),
    'total_tenants', COALESCE((
      SELECT COUNT(DISTINCT ss.tenant_id)::int
      FROM safety_signals ss
      WHERE (p_occurrence_category_id IS NULL OR ss.occurrence_category_id = p_occurrence_category_id)
        AND (p_hazard_category_id IS NULL OR ss.hazard_category_id = p_hazard_category_id)
        AND (p_event_type_id IS NULL OR ss.event_type_id = p_event_type_id)
    ), 0),
    'period', (
      SELECT jsonb_build_object(
        'from', MIN(ss.occurrence_date),
        'to', MAX(ss.occurrence_date)
      )
      FROM safety_signals ss
      WHERE (p_occurrence_category_id IS NULL OR ss.occurrence_category_id = p_occurrence_category_id)
        AND (p_hazard_category_id IS NULL OR ss.hazard_category_id = p_hazard_category_id)
        AND (p_event_type_id IS NULL OR ss.event_type_id = p_event_type_id)
    )
  ) INTO result;
  RETURN result;
END;
$$;

-- ============================================================
-- 2. regulator_spi_trends — optional taxonomy filters
-- ============================================================
DROP FUNCTION IF EXISTS regulator_spi_trends(months INT);
CREATE OR REPLACE FUNCTION regulator_spi_trends(
  p_months INT DEFAULT 12,
  p_occurrence_category_id UUID DEFAULT NULL,
  p_hazard_category_id UUID DEFAULT NULL,
  p_event_type_id UUID DEFAULT NULL
)
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
        SELECT date_trunc('month', ss.occurrence_date) as month, COUNT(*)::int as cnt
        FROM safety_signals ss
        WHERE ss.occurrence_date >= date_trunc('month', NOW()) - (p_months || ' months')::interval
          AND (p_occurrence_category_id IS NULL OR ss.occurrence_category_id = p_occurrence_category_id)
          AND (p_hazard_category_id IS NULL OR ss.hazard_category_id = p_hazard_category_id)
          AND (p_event_type_id IS NULL OR ss.event_type_id = p_event_type_id)
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
        SELECT date_trunc('month', ss.occurrence_date) as month, ss.report_type, COUNT(*)::int as cnt
        FROM safety_signals ss
        WHERE ss.occurrence_date >= date_trunc('month', NOW()) - (p_months || ' months')::interval
          AND (p_occurrence_category_id IS NULL OR ss.occurrence_category_id = p_occurrence_category_id)
          AND (p_hazard_category_id IS NULL OR ss.hazard_category_id = p_hazard_category_id)
          AND (p_event_type_id IS NULL OR ss.event_type_id = p_event_type_id)
        GROUP BY month, ss.report_type
      ) t
    ), '[]'::jsonb),
    'monthly_risk_avg', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'month', to_char(month, 'YYYY-MM'),
        'avg_risk', ROUND(avg_risk, 1)
      ) ORDER BY month)
      FROM (
        SELECT date_trunc('month', ss.occurrence_date) as month, AVG(ss.risk_level) as avg_risk
        FROM safety_signals ss
        WHERE ss.occurrence_date >= date_trunc('month', NOW()) - (p_months || ' months')::interval
          AND (p_occurrence_category_id IS NULL OR ss.occurrence_category_id = p_occurrence_category_id)
          AND (p_hazard_category_id IS NULL OR ss.hazard_category_id = p_hazard_category_id)
          AND (p_event_type_id IS NULL OR ss.event_type_id = p_event_type_id)
        GROUP BY month
      ) t
    ), '[]'::jsonb),
    'monthly_alerts', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'month', to_char(month, 'YYYY-MM'),
        'count', cnt
      ) ORDER BY month)
      FROM (
        SELECT date_trunc('month', a.triggered_at) as month, COUNT(*)::int as cnt
        FROM alerts a
        WHERE a.signal_id IN (
          SELECT ss.id FROM safety_signals ss
          WHERE ss.occurrence_date >= date_trunc('month', NOW()) - (p_months || ' months')::interval
            AND (p_occurrence_category_id IS NULL OR ss.occurrence_category_id = p_occurrence_category_id)
            AND (p_hazard_category_id IS NULL OR ss.hazard_category_id = p_hazard_category_id)
            AND (p_event_type_id IS NULL OR ss.event_type_id = p_event_type_id)
        )
        GROUP BY month
      ) t
    ), '[]'::jsonb)
  ) INTO result;
  RETURN result;
END;
$$;

-- ============================================================
-- 3. regulator_signals_by_occurrence_category — optional filters
-- ============================================================
DROP FUNCTION IF EXISTS regulator_signals_by_occurrence_category();
CREATE OR REPLACE FUNCTION regulator_signals_by_occurrence_category(
  p_occurrence_category_id UUID DEFAULT NULL,
  p_hazard_category_id UUID DEFAULT NULL,
  p_event_type_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSONB;
BEGIN
  SELECT jsonb_agg(
    jsonb_build_object(
      'code', oc.code,
      'name', oc.name,
      'count', t.cnt
    ) ORDER BY t.cnt DESC
  ) INTO result
  FROM (
    SELECT ss.occurrence_category_id, COUNT(*)::int AS cnt
    FROM safety_signals ss
    WHERE ss.occurrence_category_id IS NOT NULL
      AND (p_occurrence_category_id IS NULL OR ss.occurrence_category_id = p_occurrence_category_id)
      AND (p_hazard_category_id IS NULL OR ss.hazard_category_id = p_hazard_category_id)
      AND (p_event_type_id IS NULL OR ss.event_type_id = p_event_type_id)
    GROUP BY ss.occurrence_category_id
  ) t
  JOIN occurrence_categories oc ON oc.id = t.occurrence_category_id;

  RETURN COALESCE(result, '[]'::JSONB);
END;
$$;

-- ============================================================
-- 4. regulator_signals_by_hazard_category — optional filters
-- ============================================================
DROP FUNCTION IF EXISTS regulator_signals_by_hazard_category();
CREATE OR REPLACE FUNCTION regulator_signals_by_hazard_category(
  p_occurrence_category_id UUID DEFAULT NULL,
  p_hazard_category_id UUID DEFAULT NULL,
  p_event_type_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSONB;
BEGIN
  SELECT jsonb_agg(
    jsonb_build_object(
      'code', hc.code,
      'name', hc.name,
      'count', t.cnt
    ) ORDER BY t.cnt DESC
  ) INTO result
  FROM (
    SELECT ss.hazard_category_id, COUNT(*)::int AS cnt
    FROM safety_signals ss
    WHERE ss.hazard_category_id IS NOT NULL
      AND (p_occurrence_category_id IS NULL OR ss.occurrence_category_id = p_occurrence_category_id)
      AND (p_hazard_category_id IS NULL OR ss.hazard_category_id = p_hazard_category_id)
      AND (p_event_type_id IS NULL OR ss.event_type_id = p_event_type_id)
    GROUP BY ss.hazard_category_id
  ) t
  JOIN hazard_categories hc ON hc.id = t.hazard_category_id;

  RETURN COALESCE(result, '[]'::JSONB);
END;
$$;
