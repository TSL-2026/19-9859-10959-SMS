-- Just Culture Metrics (ICAO Doc 10959)
-- Adds voluntary reporting columns, tenant config, and aggregation functions

ALTER TABLE safety_signals
  ADD COLUMN IF NOT EXISTS is_voluntary BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS reporter_role VARCHAR(50) NULL;

COMMENT ON COLUMN safety_signals.is_voluntary IS 'True for VSR reports or when reporter chose voluntary submission';
COMMENT ON COLUMN safety_signals.reporter_role IS 'pilot, cabin, maintenance, atc, ground, flight_ops, other';

DROP TABLE IF EXISTS tenant_config;
CREATE TABLE tenant_config (
  id SERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL UNIQUE,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE tenant_config IS 'Configurable parameters per tenant including expected voluntary rate';
COMMENT ON COLUMN tenant_config.config IS 'JSON with keys like: total_operations (int), voluntary_rate (float, default 0.05), reporter_roles (array)';

CREATE OR REPLACE FUNCTION just_culture_health()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSONB;
  actual_voluntary INT;
  total_ops NUMERIC;
  expected_voluntary NUMERIC;
  reporting_rate NUMERIC;
  prev_period_count INT;
  curr_period_count INT;
  trend_score NUMERIC;
  diversity_score NUMERIC;
  distinct_roles INT;
  health_score NUMERIC;
  trend_str VARCHAR;
  recs JSONB;
BEGIN
  SELECT COUNT(*) INTO actual_voluntary
  FROM safety_signals
  WHERE is_voluntary = TRUE
    AND created_at >= NOW() - INTERVAL '12 months';

  SELECT COALESCE(SUM((config->>'total_operations')::NUMERIC), 0) INTO total_ops
  FROM tenant_config;

  expected_voluntary := GREATEST(COALESCE(total_ops, 0) * 0.05, 1);
  IF expected_voluntary > 0 THEN
    reporting_rate := LEAST((actual_voluntary::NUMERIC / expected_voluntary) * 100, 100);
  ELSE
    reporting_rate := 0;
  END IF;

  SELECT COUNT(*) INTO curr_period_count
  FROM safety_signals
  WHERE is_voluntary = TRUE
    AND created_at >= NOW() - INTERVAL '6 months';

  SELECT COUNT(*) INTO prev_period_count
  FROM safety_signals
  WHERE is_voluntary = TRUE
    AND created_at >= NOW() - INTERVAL '12 months'
    AND created_at < NOW() - INTERVAL '6 months';

  IF prev_period_count > 0 THEN
    trend_score := LEAST(GREATEST(((curr_period_count - prev_period_count)::NUMERIC / prev_period_count) * 100, -100), 100);
    IF curr_period_count > prev_period_count THEN
      trend_str := '+' || ROUND(ABS(trend_score))::TEXT || '%';
    ELSIF curr_period_count < prev_period_count THEN
      trend_str := '-' || ROUND(ABS(trend_score))::TEXT || '%';
    ELSE
      trend_str := '0%';
    END IF;
  ELSE
    trend_score := 0;
    trend_str := '0%';
  END IF;

  SELECT COUNT(DISTINCT reporter_role) INTO distinct_roles
  FROM safety_signals
  WHERE is_voluntary = TRUE
    AND reporter_role IS NOT NULL
    AND created_at >= NOW() - INTERVAL '12 months';

  diversity_score := LEAST((distinct_roles::NUMERIC / 5) * 100, 100);

  health_score := GREATEST(0, (COALESCE(reporting_rate, 0) * 0.6) + (COALESCE(trend_score, 0) * 0.2) + (COALESCE(diversity_score, 0) * 0.2));

  recs := '[]'::JSONB;
  IF reporting_rate < 80 THEN
    recs := recs || '"Increase voluntary reporting incentives"'::JSONB;
  END IF;
  IF reporting_rate < 60 THEN
    recs := recs || '"Reinforce no-blame policy"'::JSONB;
  END IF;
  IF diversity_score < 60 THEN
    recs := recs || '"Encourage reporting from underrepresented roles"'::JSONB;
  END IF;
  IF curr_period_count <= prev_period_count THEN
    recs := recs || '"Implement targeted safety promotion campaigns"'::JSONB;
  END IF;
  IF recs = '[]'::JSONB THEN
    recs := recs || '"Maintain current positive reporting culture"'::JSONB;
  END IF;

  result := jsonb_build_object(
    'reporting_rate', ROUND(COALESCE(reporting_rate, 0)::NUMERIC, 2),
    'target_rate', 80,
    'health_score', ROUND(COALESCE(health_score, 0)::NUMERIC, 1),
    'trend', trend_str,
    'actual_voluntary', actual_voluntary,
    'expected_voluntary', GREATEST(ROUND(COALESCE(expected_voluntary, 1)), 1),
    'trend_score', ROUND(COALESCE(trend_score, 0)::NUMERIC, 1),
    'diversity_score', ROUND(COALESCE(diversity_score, 0)::NUMERIC, 1),
    'recommendations', recs
  );

  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION just_culture_timeline(months INT DEFAULT 12)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSONB;
BEGIN
  WITH monthly AS (
    SELECT
      tenant_id,
      date_trunc('month', created_at)::DATE AS month,
      COUNT(*) AS cnt
    FROM safety_signals
    WHERE is_voluntary = TRUE
      AND created_at >= date_trunc('month', NOW()) - (months || ' months')::INTERVAL
    GROUP BY tenant_id, date_trunc('month', created_at)
    ORDER BY tenant_id, month
  )
  SELECT jsonb_agg(
    jsonb_build_object(
      'tenant_id', tenant_id,
      'month', month,
      'count', cnt
    )
  ) INTO result
  FROM monthly;

  RETURN COALESCE(result, '[]'::JSONB);
END;
$$;

CREATE OR REPLACE FUNCTION just_culture_benchmark()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSONB;
  tenant_rates JSONB;
  industry_avg NUMERIC;
  best_in_class NUMERIC;
  total_tenants INT;
BEGIN
  WITH tenant_stats AS (
    SELECT
      ss.tenant_id,
      COUNT(*) FILTER (WHERE ss.is_voluntary = TRUE) AS voluntary_count,
      COALESCE(tc.config->>'total_operations', '0')::NUMERIC AS total_ops
    FROM safety_signals ss
    LEFT JOIN tenant_config tc ON tc.tenant_id = ss.tenant_id
    WHERE ss.created_at >= NOW() - INTERVAL '12 months'
    GROUP BY ss.tenant_id, tc.config
  )
  SELECT
    jsonb_agg(
      jsonb_build_object(
        'tenant_id', ts.tenant_id,
        'voluntary_reports', ts.voluntary_count,
        'reporting_rate', CASE
          WHEN ts.total_ops > 0 THEN ROUND(LEAST((ts.voluntary_count::NUMERIC / GREATEST(ts.total_ops * 0.05, 1)) * 100, 100), 1)
          ELSE 0
        END
      )
      ORDER BY ts.tenant_id
    ),
    ROUND(AVG(CASE WHEN ts.total_ops > 0 THEN LEAST((ts.voluntary_count::NUMERIC / GREATEST(ts.total_ops * 0.05, 1)) * 100, 100) ELSE 0 END), 1),
    ROUND(MAX(CASE WHEN ts.total_ops > 0 THEN LEAST((ts.voluntary_count::NUMERIC / GREATEST(ts.total_ops * 0.05, 1)) * 100, 100) ELSE 0 END), 1),
    COUNT(*)
  INTO tenant_rates, industry_avg, best_in_class, total_tenants
  FROM tenant_stats ts;

  result := jsonb_build_object(
    'industry_average_reporting_rate', COALESCE(industry_avg, 0),
    'best_in_class_rate', COALESCE(best_in_class, 0),
    'total_tenants', COALESCE(total_tenants, 0),
    'icao_benchmark', 80,
    'tenant_rates', COALESCE(tenant_rates, '[]'::JSONB)
  );

  RETURN result;
END;
$$;

-- GRANT statements omitted; SECURITY DEFINER functions run as owner
