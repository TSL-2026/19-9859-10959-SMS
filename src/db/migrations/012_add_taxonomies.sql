-- 012_add_taxonomies.sql
-- ICAO ADREP-aligned taxonomy tables for safety classification

-- ============================================================
-- occurrence_categories: high-level ICAO ADREP categories
-- ============================================================
CREATE TABLE IF NOT EXISTS occurrence_categories (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code        VARCHAR(10) NOT NULL UNIQUE,
  name        VARCHAR(255) NOT NULL,
  description TEXT,
  icon        VARCHAR(10) DEFAULT ''
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_occ_cat_code ON occurrence_categories(code);

INSERT INTO occurrence_categories (code, name, description, icon) VALUES
  ('ARC',    'Abnormal Runway Contact',    'Hard landing, tail strike, nose gear collapse', '✈'),
  ('BIRD',   'Bird Strike',                'Strike with bird or wildlife', '🐦'),
  ('CABIN',  'Cabin Safety Events',        'Cabin pressure, seatbelt, galley, turbulence injury', '💺'),
  ('CFIT',   'Controlled Flight Into Terrain', 'Aircraft flown into terrain/water with pilot control', '⛰'),
  ('EVAC',   'Emergency Evacuation',       'Emergency evacuation on ground or water', '🚪'),
  ('F-NI',   'Fire/Smoke Non-Impact',      'Fire or smoke not resulting from impact', '🔥'),
  ('F-POST', 'Fire/Smoke Post-Impact',     'Fire or smoke after impact', '🔥'),
  ('FOD',    'Foreign Object Debris',      'FOD on runway, taxiway, or apron', '🧹'),
  ('FUEL',   'Fuel Related',               'Fuel leak, contamination, starvation', '⛽'),
  ('GCOL',   'Ground Collision',           'Collision with vehicle, aircraft, or object on ground', '🚛'),
  ('ICE',    'Icing',                      'Structural icing, engine icing', '❄'),
  ('LASER',  'Laser Illumination',         'Laser strike on aircraft', '🔦'),
  ('LOC-I',  'Loss of Control Inflight',   'Loss of aircraft control while airborne', '🔄'),
  ('MAC',    'Airborne Collision',         'Mid-air collision or near-midair', '💥'),
  ('MED',    'Medical',                    'Medical emergency on board', '🏥'),
  ('NAV',    'Navigation Error',           'RNAV deviation, waypoint error, altitude bust', '🧭'),
  ('RAMP',   'Ground Handling',            'Ground handling damage, towing, servicing', '🛠'),
  ('RE',     'Runway Excursion',           'Aircraft departing the runway surface', '🛤'),
  ('RI',     'Runway Incursion',           'Unauthorised presence on runway', '🚦'),
  ('SCF-NP', 'System/Comp Failure Non-PP', 'Non-powerplant system or component failure', '⚙'),
  ('SCF-PP', 'System/Comp Failure Powerplant', 'Engine or propeller system failure', '🔧'),
  ('SEC',    'Security Related',           'Unlawful interference, sabotage, cyber', '🔒'),
  ('TURB',   'Turbulence Encounter',       'Clear air, wake, or thunderstorm turbulence', '🌊'),
  ('USOS',   'Undershoot/Overshoot',       'Landing short of or beyond runway', '📏'),
  ('WSTRW',  'Wind Shear/Thunderstorm',    'Wind shear, microburst, thunderstorm encounter', '⛈'),
  ('MISC',   'Miscellaneous',              'Other occurrences not otherwise classified', '📋'),
  ('UNK',    'Unknown',                    'Unable to determine occurrence category', '❓')
ON CONFLICT (code) DO NOTHING;

-- ============================================================
-- event_types: granular event types linked to categories
-- ============================================================
CREATE TABLE IF NOT EXISTS event_types (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code         VARCHAR(20) NOT NULL UNIQUE,
  name         VARCHAR(255) NOT NULL,
  description  TEXT,
  category_id  UUID NOT NULL REFERENCES occurrence_categories(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_event_type_code ON event_types(code);

INSERT INTO event_types (code, name, description, category_id) VALUES
  -- ARC: Abnormal Runway Contact
  ('HDLG',  'Hard Landing',           'Excessive vertical G-force on landing',          (SELECT id FROM occurrence_categories WHERE code='ARC')),
  ('TSTRI', 'Tail Strike',            'Tail contacting runway during takeoff/landing',   (SELECT id FROM occurrence_categories WHERE code='ARC')),
  ('NGEAR', 'Nose Gear Collapse',     'Nose landing gear failure on landing',            (SELECT id FROM occurrence_categories WHERE code='ARC')),
  -- BIRD: Bird Strike
  ('BIRD-S', 'Bird Strike Single',    'Single bird strike event',                        (SELECT id FROM occurrence_categories WHERE code='BIRD')),
  ('BIRD-M', 'Bird Strike Multiple',  'Multiple bird strike event',                       (SELECT id FROM occurrence_categories WHERE code='BIRD')),
  ('WLD',    'Wildlife Strike',       'Strike with animal other than bird',               (SELECT id FROM occurrence_categories WHERE code='BIRD')),
  -- CABIN
  ('CAB-PR', 'Cabin Pressure',        'Cabin pressurisation failure or altitude warning', (SELECT id FROM occurrence_categories WHERE code='CABIN')),
  ('CAB-INJ','Cabin Injury',          'Passenger or crew injury in cabin',                (SELECT id FROM occurrence_categories WHERE code='CABIN')),
  -- F-NI: Fire Non-Impact
  ('F-ENG',  'Engine Fire',           'Engine fire in flight or on ground',              (SELECT id FROM occurrence_categories WHERE code='F-NI')),
  ('F-APU',  'APU Fire',              'Auxiliary power unit fire',                        (SELECT id FROM occurrence_categories WHERE code='F-NI')),
  ('F-CARGO','Cargo Fire',            'Cargo compartment fire/smoke',                     (SELECT id FROM occurrence_categories WHERE code='F-NI')),
  ('F-BATT', 'Battery Fire',          'Lithium battery or electrical fire',               (SELECT id FROM occurrence_categories WHERE code='F-NI')),
  -- FUEL
  ('FUELLK', 'Fuel Leak',             'Fuel leak detected',                               (SELECT id FROM occurrence_categories WHERE code='FUEL')),
  ('FUELCT', 'Fuel Contamination',    'Contaminated fuel found',                           (SELECT id FROM occurrence_categories WHERE code='FUEL')),
  ('FUELST', 'Fuel Starvation',       'Fuel exhaustion or starvation',                     (SELECT id FROM occurrence_categories WHERE code='FUEL')),
  -- GCOL
  ('GCOL-V', 'Vehicle Collision',     'Aircraft struck by ground vehicle',                (SELECT id FROM occurrence_categories WHERE code='GCOL')),
  ('GCOL-O', 'Object Collision',      'Aircraft struck stationary object',                (SELECT id FROM occurrence_categories WHERE code='GCOL')),
  ('GCOL-G', 'Ground Equipment',      'Ground equipment damage to aircraft',              (SELECT id FROM occurrence_categories WHERE code='GCOL')),
  -- LASER
  ('LASER-P','Laser Cockpit',         'Laser aimed at cockpit during flight',             (SELECT id FROM occurrence_categories WHERE code='LASER')),
  -- LOC-I
  ('UPSET', 'Aircraft Upset',         'Unintended aircraft attitude deviation',            (SELECT id FROM occurrence_categories WHERE code='LOC-I')),
  ('STALL', 'Aerodynamic Stall',      'Stall warning or actual stall',                     (SELECT id FROM occurrence_categories WHERE code='LOC-I')),
  -- MED
  ('MED-P', 'Passenger Medical',      'Passenger medical emergency',                       (SELECT id FROM occurrence_categories WHERE code='MED')),
  ('MED-C', 'Crew Medical',           'Crew incapacitation or medical issue',              (SELECT id FROM occurrence_categories WHERE code='MED')),
  -- NAV
  ('ALTDV', 'Altitude Deviation',     'Altitude deviation from cleared level',            (SELECT id FROM occurrence_categories WHERE code='NAV')),
  ('RNP',   'RNP/RNAV Deviation',     'Navigation accuracy deviation',                     (SELECT id FROM occurrence_categories WHERE code='NAV')),
  ('COMML', 'Comms Loss',             'Communication failure or loss of contact',          (SELECT id FROM occurrence_categories WHERE code='NAV')),
  -- RAMP
  ('TOW',   'Towing Incident',        'Damage during towing operations',                   (SELECT id FROM occurrence_categories WHERE code='RAMP')),
  ('SERV',  'Servicing Error',        'Fuel/oil/hydraulic servicing error',                (SELECT id FROM occurrence_categories WHERE code='RAMP')),
  -- RE: Runway Excursion
  ('RE-VE', 'Veer Off',               'Aircraft veered off runway laterally',              (SELECT id FROM occurrence_categories WHERE code='RE')),
  ('RE-OV', 'Overrun',                'Aircraft overran runway end',                       (SELECT id FROM occurrence_categories WHERE code='RE')),
  -- RI: Runway Incursion
  ('RI-V',  'Vehicle Incursion',      'Vehicle on runway without clearance',               (SELECT id FROM occurrence_categories WHERE code='RI')),
  ('RI-P',  'Pedestrian Incursion',   'Person on runway without clearance',                (SELECT id FROM occurrence_categories WHERE code='RI')),
  ('RI-A',  'Aircraft Incursion',     'Aircraft on runway without clearance',              (SELECT id FROM occurrence_categories WHERE code='RI')),
  -- SCF-NP
  ('HYD',   'Hydraulic Failure',      'Hydraulic system failure',                          (SELECT id FROM occurrence_categories WHERE code='SCF-NP')),
  ('ELEC',  'Electrical Failure',     'Electrical system malfunction',                     (SELECT id FROM occurrence_categories WHERE code='SCF-NP')),
  ('LDGGR', 'Landing Gear Failure',   'Landing gear malfunction or indication',            (SELECT id FROM occurrence_categories WHERE code='SCF-NP')),
  ('FLTCT', 'Flight Controls Failure','Flight control system malfunction',                 (SELECT id FROM occurrence_categories WHERE code='SCF-NP')),
  ('AVNCS', 'Avionics Failure',       'Avionics or instrument failure',                    (SELECT id FROM occurrence_categories WHERE code='SCF-NP')),
  -- SCF-PP
  ('ENG-F', 'Engine Failure',         'Engine failure or shutdown in flight',              (SELECT id FROM occurrence_categories WHERE code='SCF-PP')),
  ('ENG-O', 'Engine Oil Issue',       'Oil pressure loss or leak',                         (SELECT id FROM occurrence_categories WHERE code='SCF-PP')),
  ('ENG-I', 'Engine Ingestion',       'Engine ingested foreign object',                    (SELECT id FROM occurrence_categories WHERE code='SCF-PP')),
  -- SEC
  ('SEC-U', 'Unlawful Interference',  'Hijacking, sabotage, or threat',                    (SELECT id FROM occurrence_categories WHERE code='SEC')),
  ('SEC-C', 'Cyber Incident',         'Cybersecurity breach or attempt',                   (SELECT id FROM occurrence_categories WHERE code='SEC')),
  -- TURB
  ('TURB-C', 'Clear Air Turbulence',  'CAT encounter',                                     (SELECT id FROM occurrence_categories WHERE code='TURB')),
  ('TURB-W', 'Wake Turbulence',       'Wake turbulence encounter',                          (SELECT id FROM occurrence_categories WHERE code='TURB')),
  ('TURB-S', 'Weather Turbulence',    'Turbulence associated with weather',                (SELECT id FROM occurrence_categories WHERE code='TURB')),
  -- MISC
  ('FOD-R', 'Runway FOD',             'FOD found on runway',                               (SELECT id FROM occurrence_categories WHERE code='FOD')),
  ('EVAC-D', 'Precautionary Evac',    'Precautionary evacuation',                          (SELECT id FROM occurrence_categories WHERE code='EVAC'))
ON CONFLICT (code) DO NOTHING;

-- ============================================================
-- hazard_categories: aligned with industry top risks
-- ============================================================
CREATE TABLE IF NOT EXISTS hazard_categories (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code        VARCHAR(20) NOT NULL UNIQUE,
  name        VARCHAR(255) NOT NULL,
  description TEXT
);

INSERT INTO hazard_categories (code, name, description) VALUES
  ('OPS',    'Operational',   'Flight operations, crew, dispatch'),
  ('TECH',   'Technical',     'Aircraft systems, engines, structures'),
  ('GRD',    'Ground',        'Ground operations, handling, servicing'),
  ('ENV',    'Environmental', 'Weather, terrain, wildlife, obstacles'),
  ('SEC',    'Security',      'Security threats, cyber, unlawful interference'),
  ('HF',     'Human Factors', 'Human performance, fatigue, training, communication')
ON CONFLICT (code) DO NOTHING;

-- ============================================================
-- Link safety_signals to taxonomy
-- ============================================================
ALTER TABLE safety_signals
  ADD COLUMN IF NOT EXISTS occurrence_category_id UUID REFERENCES occurrence_categories(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS event_type_id           UUID REFERENCES event_types(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS hazard_category_id      UUID REFERENCES hazard_categories(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_sig_occ_cat ON safety_signals(occurrence_category_id);
CREATE INDEX IF NOT EXISTS idx_sig_evt_type ON safety_signals(event_type_id);
CREATE INDEX IF NOT EXISTS idx_sig_haz_cat ON safety_signals(hazard_category_id);

-- ============================================================
-- Auto-classification function: maps description text -> taxonomy
-- ============================================================
CREATE OR REPLACE FUNCTION classify_signal_taxonomy(
  p_description TEXT,
  p_report_type VARCHAR,
  p_source VARCHAR
) RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_occ_cat_id    UUID;
  v_event_type_id UUID;
  v_haz_cat_id    UUID;
  v_desc_lower    TEXT;
  v_result        JSONB;
BEGIN
  v_desc_lower := LOWER(COALESCE(p_description, ''));

  -- --- Occurrence Category ---
  -- Runway / Landing
  IF v_desc_lower ~ 'hard landing|heavy landing|rough landing' THEN
    SELECT id INTO v_occ_cat_id FROM occurrence_categories WHERE code = 'ARC';
    SELECT id INTO v_event_type_id FROM event_types WHERE code = 'HDLG';
  ELSIF v_desc_lower ~ 'tail strike' THEN
    SELECT id INTO v_occ_cat_id FROM occurrence_categories WHERE code = 'ARC';
    SELECT id INTO v_event_type_id FROM event_types WHERE code = 'TSTRI';
  -- Bird / Wildlife
  ELSIF v_desc_lower ~ 'bird strike|bird ingest|bird hit' THEN
    SELECT id INTO v_occ_cat_id FROM occurrence_categories WHERE code = 'BIRD';
    SELECT id INTO v_event_type_id FROM event_types WHERE code = 'BIRD-S';
  -- Fire / Smoke
  ELSIF v_desc_lower ~ 'engine fire|engine.*flame' THEN
    SELECT id INTO v_occ_cat_id FROM occurrence_categories WHERE code = 'F-NI';
    SELECT id INTO v_event_type_id FROM event_types WHERE code = 'F-ENG';
  ELSIF v_desc_lower ~ 'cargo smoke|cargo fire|smoke in cabin' THEN
    SELECT id INTO v_occ_cat_id FROM occurrence_categories WHERE code = 'F-NI';
    SELECT id INTO v_event_type_id FROM event_types WHERE code = 'F-CARGO';
  ELSIF v_desc_lower ~ 'battery fire|battery smoke|lithium' THEN
    SELECT id INTO v_occ_cat_id FROM occurrence_categories WHERE code = 'F-NI';
    SELECT id INTO v_event_type_id FROM event_types WHERE code = 'F-BATT';
  ELSIF v_desc_lower ~ 'apu fire' THEN
    SELECT id INTO v_occ_cat_id FROM occurrence_categories WHERE code = 'F-NI';
    SELECT id INTO v_event_type_id FROM event_types WHERE code = 'F-APU';
  -- Fuel
  ELSIF v_desc_lower ~ 'fuel leak|fuel.*spill' THEN
    SELECT id INTO v_occ_cat_id FROM occurrence_categories WHERE code = 'FUEL';
    SELECT id INTO v_event_type_id FROM event_types WHERE code = 'FUELLK';
  ELSIF v_desc_lower ~ 'fuel contaminat' THEN
    SELECT id INTO v_occ_cat_id FROM occurrence_categories WHERE code = 'FUEL';
    SELECT id INTO v_event_type_id FROM event_types WHERE code = 'FUELCT';
  ELSIF v_desc_lower ~ 'fuel starvation|fuel exhaust|fuel.*imbalance' THEN
    SELECT id INTO v_occ_cat_id FROM occurrence_categories WHERE code = 'FUEL';
    SELECT id INTO v_event_type_id FROM event_types WHERE code = 'FUELST';
  -- Ground Collision
  ELSIF v_desc_lower ~ 'ground collision|catering|ground vehicle' THEN
    SELECT id INTO v_occ_cat_id FROM occurrence_categories WHERE code = 'GCOL';
    SELECT id INTO v_event_type_id FROM event_types WHERE code = 'GCOL-V';
  -- Laser
  ELSIF v_desc_lower ~ 'laser' THEN
    SELECT id INTO v_occ_cat_id FROM occurrence_categories WHERE code = 'LASER';
    SELECT id INTO v_event_type_id FROM event_types WHERE code = 'LASER-P';
  -- Turbulence
  ELSIF v_desc_lower ~ 'turbulence|severe turbulence' THEN
    SELECT id INTO v_occ_cat_id FROM occurrence_categories WHERE code = 'TURB';
    SELECT id INTO v_event_type_id FROM event_types WHERE code = 'TURB-S';
  -- LOC-I / Upset
  ELSIF v_desc_lower ~ 'loss of control|upset|unusual attitude' THEN
    SELECT id INTO v_occ_cat_id FROM occurrence_categories WHERE code = 'LOC-I';
    SELECT id INTO v_event_type_id FROM event_types WHERE code = 'UPSET';
  -- Medical
  ELSIF v_desc_lower ~ 'medical emergency|passenger.*chest|medical.*on board' THEN
    SELECT id INTO v_occ_cat_id FROM occurrence_categories WHERE code = 'MED';
    SELECT id INTO v_event_type_id FROM event_types WHERE code = 'MED-P';
  ELSIF v_desc_lower ~ 'pilot incapacit|crew.*medical' THEN
    SELECT id INTO v_occ_cat_id FROM occurrence_categories WHERE code = 'MED';
    SELECT id INTO v_event_type_id FROM event_types WHERE code = 'MED-C';
  -- Engine / Powerplant
  ELSIF v_desc_lower ~ 'engine failure|engine shut.*down|engine.*fail' THEN
    SELECT id INTO v_occ_cat_id FROM occurrence_categories WHERE code = 'SCF-PP';
    SELECT id INTO v_event_type_id FROM event_types WHERE code = 'ENG-F';
  ELSIF v_desc_lower ~ 'oil pressure|oil leak|engine oil' THEN
    SELECT id INTO v_occ_cat_id FROM occurrence_categories WHERE code = 'SCF-PP';
    SELECT id INTO v_event_type_id FROM event_types WHERE code = 'ENG-O';
  ELSIF v_desc_lower ~ 'engine ingestion|engine.*bird|foreign object.*engine' THEN
    SELECT id INTO v_occ_cat_id FROM occurrence_categories WHERE code = 'SCF-PP';
    SELECT id INTO v_event_type_id FROM event_types WHERE code = 'ENG-I';
  -- Hydraulic / Systems
  ELSIF v_desc_lower ~ 'hydraulic.*fail|hydraulic.*leak' THEN
    SELECT id INTO v_occ_cat_id FROM occurrence_categories WHERE code = 'SCF-NP';
    SELECT id INTO v_event_type_id FROM event_types WHERE code = 'HYD';
  ELSIF v_desc_lower ~ 'landing gear.*fail|landing gear.*indication|gear.*fail' THEN
    SELECT id INTO v_occ_cat_id FROM occurrence_categories WHERE code = 'SCF-NP';
    SELECT id INTO v_event_type_id FROM event_types WHERE code = 'LDGGR';
  ELSIF v_desc_lower ~ 'electrical fail|elec.*malfunction|power fail' THEN
    SELECT id INTO v_occ_cat_id FROM occurrence_categories WHERE code = 'SCF-NP';
    SELECT id INTO v_event_type_id FROM event_types WHERE code = 'ELEC';
  ELSIF v_desc_lower ~ 'flight control.*fail|flt control|control.*malfunction' THEN
    SELECT id INTO v_occ_cat_id FROM occurrence_categories WHERE code = 'SCF-NP';
    SELECT id INTO v_event_type_id FROM event_types WHERE code = 'FLTCT';
  ELSIF v_desc_lower ~ 'avionics|weather radar.*fail|radar.*fail' THEN
    SELECT id INTO v_occ_cat_id FROM occurrence_categories WHERE code = 'SCF-NP';
    SELECT id INTO v_event_type_id FROM event_types WHERE code = 'AVNCS';
  -- Runway Excursion
  ELSIF v_desc_lower ~ 'runway excursion|exit.*runway|depart.*runway.*surfac' THEN
    SELECT id INTO v_occ_cat_id FROM occurrence_categories WHERE code = 'RE';
    SELECT id INTO v_event_type_id FROM event_types WHERE code = 'RE-VE';
  -- Runway Incursion
  ELSIF v_desc_lower ~ 'runway incursion|unauthori.*runway|hold.*position.*violat' THEN
    SELECT id INTO v_occ_cat_id FROM occurrence_categories WHERE code = 'RI';
    SELECT id INTO v_event_type_id FROM event_types WHERE code = 'RI-A';
  -- Navigation / Altitude
  ELSIF v_desc_lower ~ 'altitude deviat|mis-set altimeter|level bust' THEN
    SELECT id INTO v_occ_cat_id FROM occurrence_categories WHERE code = 'NAV';
    SELECT id INTO v_event_type_id FROM event_types WHERE code = 'ALTDV';
  ELSIF v_desc_lower ~ 'rn.*deviation|navigation.*discrepancy|rnav' THEN
    SELECT id INTO v_occ_cat_id FROM occurrence_categories WHERE code = 'NAV';
    SELECT id INTO v_event_type_id FROM event_types WHERE code = 'RNP';
  ELSIF v_desc_lower ~ 'communication fail|comms.*lost|radio.*fail' THEN
    SELECT id INTO v_occ_cat_id FROM occurrence_categories WHERE code = 'NAV';
    SELECT id INTO v_event_type_id FROM event_types WHERE code = 'COMML';
  -- Wind shear / Weather
  ELSIF v_desc_lower ~ 'wind shear|microburst|thunderstorm|go.*around.*weather' THEN
    SELECT id INTO v_occ_cat_id FROM occurrence_categories WHERE code = 'WSTRW';
  -- Cabin
  ELSIF v_desc_lower ~ 'cabin altitude|cabin pressur|door.*indication|door.*seal' THEN
    SELECT id INTO v_occ_cat_id FROM occurrence_categories WHERE code = 'CABIN';
    SELECT id INTO v_event_type_id FROM event_types WHERE code = 'CAB-PR';
  -- FOD
  ELSIF v_desc_lower ~ 'foreign object|debris.*runway|fod' THEN
    SELECT id INTO v_occ_cat_id FROM occurrence_categories WHERE code = 'FOD';
    SELECT id INTO v_event_type_id FROM event_types WHERE code = 'FOD-R';
  -- Security
  ELSIF v_desc_lower ~ 'security|unlawful|sabotage|threat|breach' THEN
    SELECT id INTO v_occ_cat_id FROM occurrence_categories WHERE code = 'SEC';
    SELECT id INTO v_event_type_id FROM event_types WHERE code = 'SEC-U';
  -- Default: classify by report type
  ELSE
    IF p_report_type = 'DIVERSION' THEN
      SELECT id INTO v_occ_cat_id FROM occurrence_categories WHERE code = 'MISC';
    ELSIF p_report_type = 'SAFETY_DEFICIENCY' THEN
      SELECT id INTO v_occ_cat_id FROM occurrence_categories WHERE code = 'MISC';
    ELSE
      SELECT id INTO v_occ_cat_id FROM occurrence_categories WHERE code = 'UNK';
    END IF;
  END IF;

  -- --- Hazard Category ---
  IF v_desc_lower ~ 'engine|hydraulic|electrical|avionics|fuel|oil|landing gear|flight control|tire|brake|apu|battery' THEN
    SELECT id INTO v_haz_cat_id FROM hazard_categories WHERE code = 'TECH';
  ELSIF v_desc_lower ~ 'pilot|crew|training|fatigue|communication|procedure|human|error|mistake' THEN
    SELECT id INTO v_haz_cat_id FROM hazard_categories WHERE code = 'HF';
  ELSIF v_desc_lower ~ 'runway|taxiway|ground|gate|ramp|towing|servicing|maintenance|parking' THEN
    SELECT id INTO v_haz_cat_id FROM hazard_categories WHERE code = 'GRD';
  ELSIF v_desc_lower ~ 'weather|wind|turbulence|icing|thunderstorm|bird|wildlife|terrain|mountain|fog|visibility' THEN
    SELECT id INTO v_haz_cat_id FROM hazard_categories WHERE code = 'ENV';
  ELSIF v_desc_lower ~ 'security|cyber|hijack|sabotage|unlawful|threat|laser|drone' THEN
    SELECT id INTO v_haz_cat_id FROM hazard_categories WHERE code = 'SEC';
  ELSE
    SELECT id INTO v_haz_cat_id FROM hazard_categories WHERE code = 'OPS';
  END IF;

  SELECT jsonb_build_object(
    'occurrence_category_id', v_occ_cat_id,
    'event_type_id', v_event_type_id,
    'hazard_category_id', v_haz_cat_id
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- ============================================================
-- Regulator aggregation by taxonomy
-- ============================================================
CREATE OR REPLACE FUNCTION regulator_signals_by_occurrence_category()
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
    GROUP BY ss.occurrence_category_id
  ) t
  JOIN occurrence_categories oc ON oc.id = t.occurrence_category_id;

  RETURN COALESCE(result, '[]'::JSONB);
END;
$$;

CREATE OR REPLACE FUNCTION regulator_signals_by_hazard_category()
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
    GROUP BY ss.hazard_category_id
  ) t
  JOIN hazard_categories hc ON hc.id = t.hazard_category_id;

  RETURN COALESCE(result, '[]'::JSONB);
END;
$$;
