-- ============================================================
-- MoSPI USP POC — PostgreSQL schema
-- Databases: mospi_usp (main), odk_central, airflow, superset
-- ============================================================

-- Create auxiliary databases
SELECT 'CREATE DATABASE odk_central OWNER appuser' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'odk_central')\gexec
SELECT 'CREATE DATABASE airflow OWNER appuser' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'airflow')\gexec
SELECT 'CREATE DATABASE superset OWNER appuser' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'superset')\gexec

-- ── Connect to main DB ────────────────────────────────────────────────────────
\c mospi_usp

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ── Users & Auth ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email       TEXT UNIQUE NOT NULL,
    full_name   TEXT NOT NULL,
    hashed_pw   TEXT NOT NULL,
    role        TEXT NOT NULL CHECK (role IN ('admin','supervisor','enumerator','analyst')),
    is_active   BOOLEAN DEFAULT TRUE,
    state_code  TEXT,
    district_code TEXT,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── Survey definition ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS surveys (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code         TEXT UNIQUE NOT NULL,              -- e.g. PLFS-2024-Q3
    title        TEXT NOT NULL,
    description  TEXT,
    survey_type  TEXT NOT NULL CHECK (survey_type IN ('CAPI','CAWI','MIXED')),
    xlsform_path TEXT,
    odk_form_id  TEXT,
    odk_project_id INT,
    status       TEXT DEFAULT 'draft' CHECK (status IN ('draft','active','closed','archived')),
    reference_period_start DATE,
    reference_period_end   DATE,
    created_by   UUID REFERENCES users(id),
    created_at   TIMESTAMPTZ DEFAULT NOW(),
    updated_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ── States & Districts (geographic master) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS states (
    code        TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    geom        GEOMETRY(MULTIPOLYGON, 4326)
);

CREATE TABLE IF NOT EXISTS districts (
    code        TEXT PRIMARY KEY,
    state_code  TEXT REFERENCES states(code),
    name        TEXT NOT NULL,
    geom        GEOMETRY(MULTIPOLYGON, 4326)
);

CREATE INDEX IF NOT EXISTS idx_districts_state ON districts(state_code);
CREATE INDEX IF NOT EXISTS idx_states_geom ON states USING GIST(geom);
CREATE INDEX IF NOT EXISTS idx_districts_geom ON districts USING GIST(geom);

-- ── Sampling frame & allocation ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sampling_frames (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    survey_id       UUID REFERENCES surveys(id),
    frame_name      TEXT NOT NULL,
    total_units     INT NOT NULL,
    uploaded_at     TIMESTAMPTZ DEFAULT NOW(),
    uploaded_by     UUID REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS sampling_units (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    frame_id        UUID REFERENCES sampling_frames(id),
    fsu_code        TEXT NOT NULL,
    state_code      TEXT REFERENCES states(code),
    district_code   TEXT REFERENCES districts(code),
    sector          TEXT CHECK (sector IN ('Rural','Urban')),
    stratum         TEXT,
    nss_region      TEXT,
    fsu_name        TEXT,
    hh_count        INT,
    multiplier      NUMERIC(10,4),
    assigned_to     UUID REFERENCES users(id),
    selected        BOOLEAN DEFAULT FALSE,
    geom            GEOMETRY(POINT, 4326)
);

CREATE INDEX IF NOT EXISTS idx_su_frame ON sampling_units(frame_id);
CREATE INDEX IF NOT EXISTS idx_su_state ON sampling_units(state_code);
CREATE INDEX IF NOT EXISTS idx_su_geom ON sampling_units USING GIST(geom);

-- ═══════════════════════════════════════════════════════════════
-- BRONZE LAYER — raw submissions (JSONB, immutable append-only)
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS bronze_submissions (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    survey_id       UUID REFERENCES surveys(id),
    odk_instance_id TEXT UNIQUE,
    raw_data        JSONB NOT NULL,
    source          TEXT CHECK (source IN ('ODK_COLLECT','ENKETO','API_IMPORT')),
    submitted_at    TIMESTAMPTZ DEFAULT NOW(),
    submitter_id    UUID REFERENCES users(id),
    fsu_code        TEXT,
    state_code      TEXT,
    district_code   TEXT,
    device_id       TEXT,
    app_version     TEXT,
    geom            GEOMETRY(POINT, 4326)
);

CREATE INDEX IF NOT EXISTS idx_bronze_survey ON bronze_submissions(survey_id);
CREATE INDEX IF NOT EXISTS idx_bronze_submitted ON bronze_submissions(submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_bronze_state ON bronze_submissions(state_code);
CREATE INDEX IF NOT EXISTS idx_bronze_raw ON bronze_submissions USING GIN(raw_data);
CREATE INDEX IF NOT EXISTS idx_bronze_geom ON bronze_submissions USING GIST(geom);

-- ═══════════════════════════════════════════════════════════════
-- SILVER LAYER — cleaned, validated, parsed
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS silver_records (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    bronze_id       UUID REFERENCES bronze_submissions(id),
    survey_id       UUID REFERENCES surveys(id),
    data            JSONB NOT NULL,
    dq_status       TEXT CHECK (dq_status IN ('pass','warn','fail','pending')) DEFAULT 'pending',
    dq_score        NUMERIC(5,2),
    cleaned_at      TIMESTAMPTZ DEFAULT NOW(),
    silver_version  INT DEFAULT 1,
    is_latest       BOOLEAN DEFAULT TRUE,
    -- numeric fields for common survey vars (populated by transformation)
    hh_id           TEXT,
    state_code      TEXT,
    district_code   TEXT,
    sector          TEXT,
    fsu_code        TEXT,
    wgt_multiplier  NUMERIC(12,4)
);

CREATE INDEX IF NOT EXISTS idx_silver_bronze ON silver_records(bronze_id);
CREATE INDEX IF NOT EXISTS idx_silver_survey ON silver_records(survey_id);
CREATE INDEX IF NOT EXISTS idx_silver_dq ON silver_records(dq_status);
CREATE INDEX IF NOT EXISTS idx_silver_state ON silver_records(state_code);
CREATE INDEX IF NOT EXISTS idx_silver_data ON silver_records USING GIN(data);

-- ═══════════════════════════════════════════════════════════════
-- GOLD LAYER — aggregated OLAP tables per survey domain
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS gold_plfs_state (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    run_id              TEXT NOT NULL,
    reference_period    TEXT NOT NULL,
    state_code          TEXT REFERENCES states(code),
    sector              TEXT,
    -- PLFS key indicators
    lfpr                NUMERIC(8,4),    -- Labour Force Participation Rate
    wpr                 NUMERIC(8,4),    -- Worker Population Ratio
    ur                  NUMERIC(8,4),    -- Unemployment Rate
    ur_se               NUMERIC(8,4),    -- Standard Error
    ur_cv               NUMERIC(8,4),    -- Coefficient of Variation
    ur_ci_lower         NUMERIC(8,4),
    ur_ci_upper         NUMERIC(8,4),
    ur_deff             NUMERIC(8,4),    -- Design Effect
    sample_hh           INT,
    sample_persons      INT,
    computed_at         TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gold_plfs_state_code ON gold_plfs_state(state_code);
CREATE INDEX IF NOT EXISTS idx_gold_plfs_run ON gold_plfs_state(run_id);

CREATE TABLE IF NOT EXISTS gold_hces_state (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    run_id              TEXT NOT NULL,
    reference_period    TEXT NOT NULL,
    state_code          TEXT REFERENCES states(code),
    sector              TEXT,
    -- HCES key indicators
    mpce_mean           NUMERIC(10,2),   -- Monthly Per Capita Expenditure
    mpce_se             NUMERIC(10,2),
    mpce_ci_lower       NUMERIC(10,2),
    mpce_ci_upper       NUMERIC(10,2),
    mpce_deff           NUMERIC(8,4),
    gini_coeff          NUMERIC(8,4),
    sample_hh           INT,
    computed_at         TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════
-- DQ AUDIT TRAIL
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS dq_runs (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    survey_id       UUID REFERENCES surveys(id),
    run_type        TEXT CHECK (run_type IN ('batch','realtime','manual')),
    started_at      TIMESTAMPTZ DEFAULT NOW(),
    finished_at     TIMESTAMPTZ,
    total_records   INT,
    passed          INT,
    warned          INT,
    failed          INT,
    ge_result_url   TEXT    -- Great Expectations HTML report path
);

CREATE TABLE IF NOT EXISTS dq_checks (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    run_id          UUID REFERENCES dq_runs(id),
    silver_id       UUID REFERENCES silver_records(id),
    check_name      TEXT NOT NULL,
    dimension       TEXT CHECK (dimension IN ('completeness','validity','consistency','accuracy','timeliness')),
    status          TEXT CHECK (status IN ('pass','warn','fail')),
    column_name     TEXT,
    expected        TEXT,
    actual          TEXT,
    message         TEXT,
    checked_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dq_checks_run ON dq_checks(run_id);
CREATE INDEX IF NOT EXISTS idx_dq_checks_silver ON dq_checks(silver_id);
CREATE INDEX IF NOT EXISTS idx_dq_checks_status ON dq_checks(status);

-- ═══════════════════════════════════════════════════════════════
-- LINEAGE — tracks record journey Bronze → Silver → Gold
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS lineage_events (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    bronze_id       UUID REFERENCES bronze_submissions(id),
    silver_id       UUID REFERENCES silver_records(id),
    entity_type     TEXT NOT NULL,  -- bronze/silver/gold/dq_run
    entity_id       UUID NOT NULL,
    event_type      TEXT NOT NULL,  -- submitted/cleaned/validated/promoted/rejected
    event_data      JSONB,
    triggered_by    TEXT,           -- user id or 'airflow_dag' or 'webhook'
    occurred_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lineage_bronze ON lineage_events(bronze_id);
CREATE INDEX IF NOT EXISTS idx_lineage_entity ON lineage_events(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_lineage_occurred ON lineage_events(occurred_at DESC);

-- ═══════════════════════════════════════════════════════════════
-- PIPELINE NOTIFICATIONS (replaces Kafka)
-- ═══════════════════════════════════════════════════════════════
-- PostgreSQL LISTEN/NOTIFY channels used:
--   new_submission  — fired by bronze insert trigger
--   dq_complete     — fired by DQ run completion
--   silver_ready    — fired when silver promotion completes

CREATE OR REPLACE FUNCTION notify_new_submission()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM pg_notify('new_submission', row_to_json(NEW)::text);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_notify_bronze
AFTER INSERT ON bronze_submissions
FOR EACH ROW EXECUTE FUNCTION notify_new_submission();

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated   BEFORE UPDATE ON users    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_surveys_updated BEFORE UPDATE ON surveys  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ═══════════════════════════════════════════════════════════════
-- TABULATION PLANS (saved R plans)
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS tabulation_plans (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name        TEXT NOT NULL,
    survey_id   UUID REFERENCES surveys(id),
    plan_json   JSONB NOT NULL,
    created_by  UUID REFERENCES users(id),
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tabulation_results (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    plan_id         UUID REFERENCES tabulation_plans(id),
    run_at          TIMESTAMPTZ DEFAULT NOW(),
    result_json     JSONB NOT NULL,
    r_code          TEXT,
    execution_ms    INT
);

GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO appuser;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO appuser;
