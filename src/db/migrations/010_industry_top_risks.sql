-- Industry Top Risks Declaration (ICAO Annex 19 / Doc 10959 Safety Intelligence Manual)
-- The regulator declares and ranks industry-level top safety risks
-- Operators can view the declared risks but cannot modify

CREATE TABLE IF NOT EXISTS industry_top_risks (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    risk_category   VARCHAR(100) NOT NULL,
    risk_name       VARCHAR(255) NOT NULL,
    severity_ranking INT NOT NULL DEFAULT 999,
    description     TEXT,
    is_active       BOOLEAN NOT NULL DEFAULT true,
    declared_at     TIMESTAMPTZ DEFAULT NOW(),
    declared_by     UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Seed predefined ICAO-aligned risk categories (idempotent)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM industry_top_risks) THEN
        INSERT INTO industry_top_risks (risk_category, risk_name, severity_ranking) VALUES
            ('Operational',    'Runway Excursion',                        1),
            ('Operational',    'Loss of Control Inflight (LOC-I)',        2),
            ('Operational',    'Controlled Flight Into Terrain (CFIT)',   3),
            ('Operational',    'Mid-Air Collision / Airborne Conflict',   4),
            ('Operational',    'Bird Strike / Wildlife Hazard',           5),
            ('Operational',    'Wake Turbulence Encounter',               6),
            ('Technical',      'Uncontained Engine Failure / Debris',     7),
            ('Technical',      'Fire / Smoke (Engine, Cabin, Cargo)',     8),
            ('Technical',      'System / Component Failure',              9),
            ('Technical',      'Fuel Related Events',                     10),
            ('Ground',         'Ground Handling / Ramp Incidents',        11),
            ('Environmental',  'Weather Related Incidents',               12),
            ('Environmental',  'Turbulence Related Injuries',             13),
            ('Security',       'LASER / Illumination Incidents',          14),
            ('Human Factors',  'Fatigue / Human Factors Events',          15);
    END IF;
END$$;

-- Regulator function: get active industry top risks (safe for operator viewing)
CREATE OR REPLACE FUNCTION get_industry_top_risks()
RETURNS JSONB
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'id',               id,
            'risk_category',    risk_category,
            'risk_name',        risk_name,
            'severity_ranking', severity_ranking,
            'description',      description,
            'is_active',        is_active,
            'declared_at',      declared_at
        ) ORDER BY severity_ranking ASC
    ), '[]'::jsonb)
    FROM industry_top_risks
    WHERE is_active = true;
$$;

-- Regulator function: upsert a top risk declaration
CREATE OR REPLACE FUNCTION upsert_top_risk(
    p_id          UUID,
    p_risk_name   VARCHAR,
    p_category    VARCHAR,
    p_ranking     INT,
    p_description TEXT,
    p_user_id     UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_result JSONB;
BEGIN
    INSERT INTO industry_top_risks (id, risk_category, risk_name, severity_ranking, description, declared_by)
    VALUES (COALESCE(p_id, uuid_generate_v4()), p_category, p_risk_name, p_ranking, p_description, p_user_id)
    ON CONFLICT (id) DO UPDATE SET
        risk_category    = EXCLUDED.risk_category,
        risk_name        = EXCLUDED.risk_name,
        severity_ranking = EXCLUDED.severity_ranking,
        description      = EXCLUDED.description,
        declared_by      = EXCLUDED.declared_by,
        updated_at       = NOW()
    RETURNING jsonb_build_object(
        'id',               id,
        'risk_category',    risk_category,
        'risk_name',        risk_name,
        'severity_ranking', severity_ranking,
        'description',      description,
        'is_active',        is_active,
        'declared_at',      declared_at,
        'updated_at',       updated_at
    ) INTO v_result;

    RETURN v_result;
END;
$$;

-- Regulator function: deactivate (archive) a top risk
CREATE OR REPLACE FUNCTION deactivate_top_risk(p_id UUID)
RETURNS JSONB
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
AS $$
    UPDATE industry_top_risks
    SET is_active = false, updated_at = NOW()
    WHERE id = p_id
    RETURNING jsonb_build_object(
        'id', id, 'risk_name', risk_name, 'is_active', is_active
    );
$$;

-- Regulator function: get ALL top risks (including inactive, for management)
CREATE OR REPLACE FUNCTION get_all_top_risks()
RETURNS JSONB
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'id',               id,
            'risk_category',    risk_category,
            'risk_name',        risk_name,
            'severity_ranking', severity_ranking,
            'description',      description,
            'is_active',        is_active,
            'declared_at',      declared_at,
            'updated_at',       updated_at
        ) ORDER BY severity_ranking ASC
    ), '[]'::jsonb)
    FROM industry_top_risks;
$$;
