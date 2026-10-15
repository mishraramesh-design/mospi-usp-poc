\c mospi_usp

-- ── Demo users ────────────────────────────────────────────────────────────────
-- Passwords are bcrypt of 'MoSPI@2024'
INSERT INTO users (email, full_name, hashed_pw, role, state_code) VALUES
('admin@mospi.gov.in',      'MoSPI Admin',         '$2b$12$K9lQ2VqPbUxWpQpNs6tULehKaT7U3nKRX1wDm5HrqW8bkJf4zGzXi', 'admin',      NULL),
('supervisor@mospi.gov.in', 'Ramesh Sharma',        '$2b$12$K9lQ2VqPbUxWpQpNs6tULehKaT7U3nKRX1wDm5HrqW8bkJf4zGzXi', 'supervisor', 'MH'),
('enum1@mospi.gov.in',      'Priya Patel',          '$2b$12$K9lQ2VqPbUxWpQpNs6tULehKaT7U3nKRX1wDm5HrqW8bkJf4zGzXi', 'enumerator', 'MH'),
('enum2@mospi.gov.in',      'Suresh Kumar',         '$2b$12$K9lQ2VqPbUxWpQpNs6tULehKaT7U3nKRX1wDm5HrqW8bkJf4zGzXi', 'enumerator', 'UP'),
('analyst@mospi.gov.in',    'Dr. Anita Menon',      '$2b$12$K9lQ2VqPbUxWpQpNs6tULehKaT7U3nKRX1wDm5HrqW8bkJf4zGzXi', 'analyst',    NULL)
ON CONFLICT (email) DO NOTHING;

-- ── States (major 10 for demo) ────────────────────────────────────────────────
INSERT INTO states (code, name) VALUES
('AP','Andhra Pradesh'),('AS','Assam'),('BR','Bihar'),
('DL','Delhi'),('GJ','Gujarat'),('KA','Karnataka'),
('KL','Kerala'),('MH','Maharashtra'),('RJ','Rajasthan'),
('TN','Tamil Nadu'),('UP','Uttar Pradesh'),('WB','West Bengal')
ON CONFLICT (code) DO NOTHING;

-- ── Districts (sample subset) ─────────────────────────────────────────────────
INSERT INTO districts (code, state_code, name) VALUES
('MH-MUM','MH','Mumbai'),('MH-PUN','MH','Pune'),('MH-NAG','MH','Nagpur'),
('UP-LUC','UP','Lucknow'),('UP-KAN','UP','Kanpur'),('UP-AGR','UP','Agra'),
('KA-BLR','KA','Bengaluru'),('KA-MYS','KA','Mysuru'),
('TN-CHE','TN','Chennai'),('TN-COI','TN','Coimbatore'),
('DL-DL1','DL','New Delhi'),('RJ-JAI','RJ','Jaipur')
ON CONFLICT (code) DO NOTHING;

-- ── Demo surveys ─────────────────────────────────────────────────────────────
WITH admin_id AS (SELECT id FROM users WHERE email = 'admin@mospi.gov.in')
INSERT INTO surveys (code, title, description, survey_type, status, reference_period_start, reference_period_end, created_by)
SELECT code, title, description, survey_type, status, rps::DATE, rpe::DATE, admin_id.id
FROM admin_id, (VALUES
  ('PLFS-2024-Q3','Periodic Labour Force Survey Q3 2024',
   'Quarterly PLFS covering employment, unemployment, and labour force participation across all states',
   'CAPI','active','2024-07-01','2024-09-30'),
  ('HCES-2024','Household Consumer Expenditure Survey 2024',
   'Annual survey on household consumption patterns, MPCE, and poverty estimation',
   'MIXED','active','2024-01-01','2024-12-31'),
  ('ASI-2024','Annual Survey of Industries 2024',
   'Factory-level data on output, value added, employment, and capital in manufacturing sector',
   'CAWI','draft','2024-04-01','2025-03-31')
) AS v(code,title,description,survey_type,status,rps,rpe)
ON CONFLICT (code) DO NOTHING;

-- ── Demo bronze submissions ───────────────────────────────────────────────────
WITH survey_id AS (SELECT id FROM surveys WHERE code='PLFS-2024-Q3'),
     submitter AS (SELECT id FROM users WHERE email='enum1@mospi.gov.in')
INSERT INTO bronze_submissions (survey_id, odk_instance_id, raw_data, source, state_code, district_code, fsu_code, submitter_id)
SELECT
    survey_id.id,
    'uuid:plfs-demo-' || gs,
    jsonb_build_object(
        'hh_id', 'MH-MUM-FSU01-HH' || LPAD(gs::text,3,'0'),
        'state', 'MH', 'district', 'MH-MUM', 'sector', CASE WHEN gs % 3 = 0 THEN 'Rural' ELSE 'Urban' END,
        'hh_size', (3 + gs % 6),
        'principal_earner_age', (25 + gs % 40),
        'principal_earner_sex', CASE WHEN gs % 2 = 0 THEN 'Male' ELSE 'Female' END,
        'usual_activity_status', (ARRAY['11','12','21','31','41','51','81','82','91','97'])[1 + gs % 10],
        'weekly_activity_status', (ARRAY['11','12','21','31','41','51','81','82','91','97'])[1 + (gs+3) % 10],
        'nss_region', CASE WHEN gs % 4 = 0 THEN 'MH-1' WHEN gs % 4 = 1 THEN 'MH-2' WHEN gs % 4 = 2 THEN 'MH-3' ELSE 'MH-4' END,
        'multiplier', (100 + gs * 3)::numeric,
        'completed', true,
        'duration_sec', (180 + gs * 7)
    ),
    CASE WHEN gs % 3 = 0 THEN 'ENKETO' ELSE 'ODK_COLLECT' END,
    'MH', 'MH-MUM', 'FSU-MH-MUM-' || LPAD(gs::text,4,'0'),
    submitter.id
FROM generate_series(1,120) gs, survey_id, submitter
ON CONFLICT (odk_instance_id) DO NOTHING;

-- ── Silver (cleaned) for first 100 bronze records ────────────────────────────
INSERT INTO silver_records (bronze_id, survey_id, data, dq_status, dq_score, hh_id, state_code, district_code, sector, fsu_code, wgt_multiplier)
SELECT
    b.id,
    b.survey_id,
    b.raw_data,
    CASE WHEN row_number() OVER (ORDER BY b.submitted_at) % 10 = 0 THEN 'fail'
         WHEN row_number() OVER (ORDER BY b.submitted_at) % 5 = 0  THEN 'warn'
         ELSE 'pass' END,
    CASE WHEN row_number() OVER (ORDER BY b.submitted_at) % 10 = 0 THEN 42.0
         WHEN row_number() OVER (ORDER BY b.submitted_at) % 5 = 0  THEN 78.5
         ELSE 95.0 + (random() * 5) END,
    b.raw_data->>'hh_id',
    b.state_code,
    b.district_code,
    b.raw_data->>'sector',
    b.fsu_code,
    (b.raw_data->>'multiplier')::numeric
FROM bronze_submissions b
WHERE b.survey_id = (SELECT id FROM surveys WHERE code='PLFS-2024-Q3')
LIMIT 100
ON CONFLICT DO NOTHING;

-- ── DQ run record ─────────────────────────────────────────────────────────────
WITH sv AS (SELECT id FROM surveys WHERE code='PLFS-2024-Q3')
INSERT INTO dq_runs (survey_id, run_type, started_at, finished_at, total_records, passed, warned, failed)
SELECT sv.id, 'batch', NOW()-INTERVAL'1 hour', NOW()-INTERVAL'50 minutes', 100, 80, 12, 8
FROM sv;

-- ── Sample DQ checks ─────────────────────────────────────────────────────────
INSERT INTO dq_checks (run_id, silver_id, check_name, dimension, status, column_name, expected, actual, message)
SELECT
    dr.id,
    sr.id,
    'check_usual_activity_not_null',
    'completeness',
    CASE WHEN sr.dq_status = 'fail' THEN 'fail' WHEN sr.dq_status = 'warn' THEN 'warn' ELSE 'pass' END,
    'usual_activity_status',
    'NOT NULL',
    CASE WHEN sr.dq_status = 'fail' THEN 'NULL' ELSE 'not null' END,
    CASE WHEN sr.dq_status = 'fail' THEN 'Usual activity status is missing' ELSE 'OK' END
FROM dq_runs dr
CROSS JOIN silver_records sr
WHERE dr.run_type = 'batch'
LIMIT 50;

-- ── Tabulation plans ─────────────────────────────────────────────────────────
WITH admin AS (SELECT id FROM users WHERE email='admin@mospi.gov.in'),
     sv AS (SELECT id FROM surveys WHERE code='PLFS-2024-Q3')
INSERT INTO tabulation_plans (name, survey_id, plan_json, created_by)
SELECT
    'PLFS Unemployment Rate by State × Sector',
    sv.id,
    '{"survey_code":"PLFS-2024-Q3","design":{"id_var":"hh_id","strata_var":"nss_region","cluster_var":"fsu_code","weight_var":"multiplier"},"estimator":"svymean","target_var":"unemployed_indicator","by_vars":["state_code","sector"],"confidence_level":0.95}'::jsonb,
    admin.id
FROM admin, sv;

-- ── Lineage events for demo submissions ──────────────────────────────────────
INSERT INTO lineage_events (bronze_id, entity_type, entity_id, event_type, triggered_by)
SELECT id, 'bronze', id, 'submitted', 'ODK_COLLECT_WEBHOOK'
FROM bronze_submissions
WHERE survey_id = (SELECT id FROM surveys WHERE code='PLFS-2024-Q3')
LIMIT 100;

INSERT INTO lineage_events (bronze_id, silver_id, entity_type, entity_id, event_type, triggered_by)
SELECT s.bronze_id, s.id, 'silver', s.id, 'cleaned', 'airflow:bronze_to_silver'
FROM silver_records s
WHERE s.survey_id = (SELECT id FROM surveys WHERE code='PLFS-2024-Q3');
