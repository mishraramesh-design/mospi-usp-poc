-- ============================================================
-- MoSPI USP — Question Bank + Simulator schema
-- ============================================================

\c mospi_usp

-- ── Question Bank ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS question_bank (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    question_text   TEXT NOT NULL,
    field_name      TEXT NOT NULL,
    question_type   TEXT NOT NULL,   -- text, integer, decimal, select_one, select_multiple, date, geopoint, image
    choices         TEXT,            -- comma-sep for select types
    source_survey   TEXT NOT NULL,   -- PLFS, HCES, ASI, CAPEX, NSS, CENSUS
    source_round    TEXT,            -- e.g. "2022-23"
    section         TEXT,            -- HH Characteristics, Employment, Expenditure…
    tags            TEXT[],          -- ['household','income','rural']
    usage_count     INT DEFAULT 0,   -- how many times reused
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_qb_source ON question_bank(source_survey);
CREATE INDEX IF NOT EXISTS idx_qb_type ON question_bank(question_type);
CREATE INDEX IF NOT EXISTS idx_qb_tags ON question_bank USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_qb_text_trgm ON question_bank USING GIN(question_text gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_qb_field_trgm ON question_bank USING GIN(field_name gin_trgm_ops);

-- ── Simulator Runs ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS simulator_runs (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    survey_id       UUID REFERENCES surveys(id),
    mode            TEXT NOT NULL CHECK (mode IN ('volume','edgecases','review')),
    params          JSONB NOT NULL,      -- {n_households, state_codes, …}
    status          TEXT DEFAULT 'pending' CHECK (status IN ('pending','running','done','failed')),
    result_data     JSONB,               -- generated records summary
    report_data     JSONB,               -- tabulation tables
    flaws           JSONB,               -- design flaw list
    created_by      UUID REFERENCES users(id),
    started_at      TIMESTAMPTZ DEFAULT NOW(),
    finished_at     TIMESTAMPTZ,
    n_records       INT
);

CREATE INDEX IF NOT EXISTS idx_sim_survey ON simulator_runs(survey_id);
CREATE INDEX IF NOT EXISTS idx_sim_status ON simulator_runs(status);

-- ── Seed: Real MoSPI Question Bank (50 questions) ────────────
INSERT INTO question_bank (question_text, field_name, question_type, choices, source_survey, source_round, section, tags) VALUES

-- PLFS — Household Characteristics
('What is the type of dwelling unit?', 'dwelling_type', 'select_one',
 'Owned,Rented,Employer quarters,Others',
 'PLFS', '2022-23', 'Household Characteristics',
 ARRAY['household','housing','dwelling']),

('What is the total number of rooms exclusively in possession of the household?', 'rooms_count', 'integer',
 NULL, 'PLFS', '2022-23', 'Household Characteristics',
 ARRAY['household','housing','rooms']),

('What is the household size (number of members)?', 'hh_size', 'integer',
 NULL, 'PLFS', '2022-23', 'Household Characteristics',
 ARRAY['household','demography','size']),

('What is the relationship of the person to the head of household?', 'relation_to_head', 'select_one',
 'Self,Spouse,Child,Grandchild,Parent,Other relative,Non-relative',
 'PLFS', '2022-23', 'Demography',
 ARRAY['household','demography','relationship']),

('What is the sex of the person?', 'sex', 'select_one',
 'Male,Female,Transgender',
 'PLFS', '2022-23', 'Demography',
 ARRAY['demography','gender','sex']),

('What is the age of the person (in completed years)?', 'age_years', 'integer',
 NULL, 'PLFS', '2022-23', 'Demography',
 ARRAY['demography','age']),

('What is the marital status of the person?', 'marital_status', 'select_one',
 'Never married,Currently married,Widowed,Divorced/separated',
 'PLFS', '2022-23', 'Demography',
 ARRAY['demography','marital']),

('What is the highest level of general education attained?', 'education_level', 'select_one',
 'Not literate,Literate without formal schooling,Below primary,Primary,Middle,Secondary,Higher secondary,Diploma/certificate,Graduate,Post graduate and above',
 'PLFS', '2022-23', 'Education',
 ARRAY['education','literacy','level']),

-- PLFS — Employment & Labour
('What is the usual principal activity status of the person during the last 365 days?', 'usual_activity_status', 'select_one',
 'Self-employed,Regular wage/salaried,Casual wage labour,Attended domestic duties,Full-time student,Rentier/pensioner,Begging/destitute,Others',
 'PLFS', '2022-23', 'Employment',
 ARRAY['employment','activity','labour']),

('What is the National Industrial Classification (NIC) code of the industry/enterprise?', 'nic_code', 'text',
 NULL, 'PLFS', '2022-23', 'Employment',
 ARRAY['employment','industry','nic']),

('What is the National Occupation Classification (NOC) code?', 'noc_code', 'text',
 NULL, 'PLFS', '2022-23', 'Employment',
 ARRAY['employment','occupation','noc']),

('How many days did the person work in the reference week?', 'days_worked_week', 'integer',
 NULL, 'PLFS', '2022-23', 'Employment',
 ARRAY['employment','days','work','weekly']),

('What is the type of employment?', 'employment_type', 'select_one',
 'Regular wage/salaried,Own account worker,Employer,Unpaid family helper,Casual',
 'PLFS', '2022-23', 'Employment',
 ARRAY['employment','type','wage']),

-- HCES — Household Consumer Expenditure
('What is the total monthly household consumption expenditure on food items (Rs.)?', 'mpce_food', 'decimal',
 NULL, 'HCES', '2022-23', 'Expenditure',
 ARRAY['expenditure','food','monthly','consumption']),

('What is the monthly household expenditure on cereals and cereal substitutes (Rs.)?', 'exp_cereals', 'decimal',
 NULL, 'HCES', '2022-23', 'Expenditure',
 ARRAY['expenditure','food','cereals','monthly']),

('What is the monthly household expenditure on pulses and pulse products (Rs.)?', 'exp_pulses', 'decimal',
 NULL, 'HCES', '2022-23', 'Expenditure',
 ARRAY['expenditure','food','pulses','monthly']),

('What is the monthly household expenditure on milk and milk products (Rs.)?', 'exp_milk', 'decimal',
 NULL, 'HCES', '2022-23', 'Expenditure',
 ARRAY['expenditure','food','milk','dairy','monthly']),

('What is the monthly household expenditure on edible oil (Rs.)?', 'exp_oil', 'decimal',
 NULL, 'HCES', '2022-23', 'Expenditure',
 ARRAY['expenditure','food','oil','monthly']),

('What is the monthly household expenditure on meat, fish and eggs (Rs.)?', 'exp_meat_fish', 'decimal',
 NULL, 'HCES', '2022-23', 'Expenditure',
 ARRAY['expenditure','food','protein','meat','monthly']),

('What is the monthly household expenditure on vegetables (Rs.)?', 'exp_vegetables', 'decimal',
 NULL, 'HCES', '2022-23', 'Expenditure',
 ARRAY['expenditure','food','vegetables','monthly']),

('What is the monthly household expenditure on fruits (Rs.)?', 'exp_fruits', 'decimal',
 NULL, 'HCES', '2022-23', 'Expenditure',
 ARRAY['expenditure','food','fruits','monthly']),

('What is the monthly household expenditure on education (fees, books, stationery) (Rs.)?', 'exp_education', 'decimal',
 NULL, 'HCES', '2022-23', 'Expenditure',
 ARRAY['expenditure','education','monthly']),

('What is the monthly household expenditure on medical (institutional) care (Rs.)?', 'exp_medical_inst', 'decimal',
 NULL, 'HCES', '2022-23', 'Expenditure',
 ARRAY['expenditure','health','medical','institutional','monthly']),

('What is the monthly household expenditure on clothing and bedding (Rs.)?', 'exp_clothing', 'decimal',
 NULL, 'HCES', '2022-23', 'Expenditure',
 ARRAY['expenditure','clothing','monthly']),

('What is the monthly household expenditure on fuel and light (Rs.)?', 'exp_fuel', 'decimal',
 NULL, 'HCES', '2022-23', 'Expenditure',
 ARRAY['expenditure','fuel','energy','monthly']),

-- ASI — Annual Survey of Industries
('What is the type of organisation of the factory?', 'factory_org_type', 'select_one',
 'Proprietary,Partnership,Joint Hindu family,Public limited company,Private limited company,Co-operative,Departmental undertaking,Public sector undertaking,Others',
 'ASI', '2021-22', 'Factory Characteristics',
 ARRAY['industry','factory','organisation']),

('What is the number of workers employed (directly) in the factory?', 'workers_direct', 'integer',
 NULL, 'ASI', '2021-22', 'Employment',
 ARRAY['industry','workers','employment']),

('What is the total number of man-days worked by directly employed workers?', 'man_days_direct', 'integer',
 NULL, 'ASI', '2021-22', 'Employment',
 ARRAY['industry','man-days','workers']),

('What is the total emoluments paid to all employees (Rs. thousand)?', 'total_emoluments', 'decimal',
 NULL, 'ASI', '2021-22', 'Financial',
 ARRAY['industry','emoluments','salary','wages']),

('What is the total fixed capital at beginning of year (Rs. thousand)?', 'fixed_capital_beg', 'decimal',
 NULL, 'ASI', '2021-22', 'Financial',
 ARRAY['industry','capital','fixed','assets']),

-- NSS — Housing
('What is the type of structure of the dwelling?', 'structure_type', 'select_one',
 'Pucca,Semi-pucca,Katcha',
 'NSS', '76th Round', 'Housing',
 ARRAY['housing','structure','dwelling']),

('Does the household have access to a toilet facility?', 'toilet_access', 'select_one',
 'Flush/pour flush latrine connected to sewerage system,Flush/pour flush latrine connected to septic tank,Ventilated improved pit latrine,Pit latrine,No toilet facility',
 'NSS', '76th Round', 'Sanitation',
 ARRAY['sanitation','toilet','hygiene','housing']),

('What is the main source of drinking water for the household?', 'drinking_water_source', 'select_one',
 'Tap water from treated source inside premises,Tap water from treated source outside premises,Covered well,Uncovered well,Tube well/borehole,Spring,River/stream/tank,Other',
 'NSS', '76th Round', 'Water & Sanitation',
 ARRAY['water','sanitation','drinking','source']),

('Does the household have electricity connection?', 'electricity_connection', 'select_one',
 'Yes,No',
 'NSS', '76th Round', 'Energy',
 ARRAY['electricity','energy','connection','household']),

('What is the main source of lighting for the household?', 'lighting_source', 'select_one',
 'Electricity,Kerosene,Solar energy,Other oil,Any other,No lighting',
 'NSS', '76th Round', 'Energy',
 ARRAY['electricity','lighting','energy','household']),

-- PLFS — Migration
('Has any usual member migrated from this household in the last one year?', 'migration_last_year', 'select_one',
 'Yes,No',
 'PLFS', '2022-23', 'Migration',
 ARRAY['migration','mobility','household']),

('What was the main reason for migration?', 'migration_reason', 'select_one',
 'Employment/work,Education,Marriage,Movement of parent/earning member,Natural calamity,Social/political problem,Others',
 'PLFS', '2022-23', 'Migration',
 ARRAY['migration','reason','mobility']),

-- CAPEX — Capital Expenditure
('What is the sector of the project?', 'project_sector', 'select_one',
 'Agriculture,Industry,Power,Transport,Communication,Social services,Other services',
 'CAPEX', '2023-24', 'Project Details',
 ARRAY['capital','expenditure','project','sector']),

('What is the physical status of the project?', 'project_status', 'select_one',
 'Not started,Under implementation,Stalled,Commissioned,Completed,Abandoned',
 'CAPEX', '2023-24', 'Project Details',
 ARRAY['capital','project','status','infrastructure']),

('What is the total project cost as per latest estimate (Rs. crore)?', 'project_cost_latest', 'decimal',
 NULL, 'CAPEX', '2023-24', 'Financial',
 ARRAY['capital','cost','expenditure','financial']),

('What is the expenditure incurred up to date (Rs. crore)?', 'expenditure_to_date', 'decimal',
 NULL, 'CAPEX', '2023-24', 'Financial',
 ARRAY['capital','expenditure','incurred','financial']),

-- PLFS — Social Groups
('What is the social group of the household?', 'social_group', 'select_one',
 'Scheduled Tribe,Scheduled Caste,Other Backward Class,Others',
 'PLFS', '2022-23', 'Household Characteristics',
 ARRAY['social','caste','tribe','obc','demographic']),

('What is the religion of the household?', 'religion', 'select_one',
 'Hinduism,Islam,Christianity,Sikhism,Jainism,Buddhism,Zoroastrianism,Others',
 'PLFS', '2022-23', 'Household Characteristics',
 ARRAY['religion','household','demographic']),

-- HCES — Durable goods
('Does the household own a mobile phone?', 'owns_mobile_phone', 'select_one',
 'Yes — feature phone only,Yes — smartphone,Yes — both,No',
 'HCES', '2022-23', 'Durable Goods',
 ARRAY['durable','mobile','digital','technology']),

('Does the household own a television?', 'owns_television', 'select_one',
 'Yes,No',
 'HCES', '2022-23', 'Durable Goods',
 ARRAY['durable','television','household']),

('Does the household own a two-wheeler?', 'owns_two_wheeler', 'select_one',
 'Yes,No',
 'HCES', '2022-23', 'Durable Goods',
 ARRAY['durable','vehicle','two-wheeler','transport']),

-- Location fields (common across all surveys)
('GPS coordinates of the household', 'gps_location', 'geopoint',
 NULL, 'PLFS', '2022-23', 'Location',
 ARRAY['location','gps','geographic']),

('State code', 'state_code', 'text',
 NULL, 'PLFS', '2022-23', 'Location',
 ARRAY['location','state','geographic']),

('District code', 'district_code', 'text',
 NULL, 'PLFS', '2022-23', 'Location',
 ARRAY['location','district','geographic']),

('Sector (Rural/Urban)', 'sector', 'select_one',
 'Rural,Urban',
 'PLFS', '2022-23', 'Location',
 ARRAY['location','sector','rural','urban']),

('First Stage Unit (FSU) code', 'fsu_code', 'text',
 NULL, 'PLFS', '2022-23', 'Sampling',
 ARRAY['sampling','fsu','frame']),

('Household serial number within FSU', 'hh_serial_no', 'integer',
 NULL, 'PLFS', '2022-23', 'Sampling',
 ARRAY['sampling','household','serial']),

('Date of survey/interview', 'interview_date', 'date',
 NULL, 'PLFS', '2022-23', 'Meta',
 ARRAY['meta','date','interview'])

ON CONFLICT DO NOTHING;

GRANT ALL PRIVILEGES ON TABLE question_bank TO appuser;
GRANT ALL PRIVILEGES ON TABLE simulator_runs TO appuser;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO appuser;
