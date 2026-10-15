#' MoSPI USP — R Plumber Statistical API
#' Endpoints: /tabulate  /estimate  /gold  /plans  /health
#' Uses: survey, dplyr, DBI, RPostgres, jsonlite

library(plumber)
library(survey)
library(dplyr)
library(DBI)
library(RPostgres)
library(jsonlite)

# ── DB connection helper ──────────────────────────────────────────────────────
get_conn <- function() {
  dbConnect(
    Postgres(),
    host     = Sys.getenv("PG_HOST", "postgres"),
    port     = as.integer(Sys.getenv("PG_PORT", "5432")),
    dbname   = Sys.getenv("PG_DB", "mospi_usp"),
    user     = Sys.getenv("PG_USER", "appuser"),
    password = Sys.getenv("PG_PASSWORD", "apppassword")
  )
}

# ── Load silver data for a survey ─────────────────────────────────────────────
load_survey_data <- function(survey_code) {
  conn <- get_conn()
  on.exit(dbDisconnect(conn))

  sql <- "
    SELECT sr.id, sr.state_code, sr.district_code, sr.sector,
           sr.fsu_code, sr.wgt_multiplier,
           sr.data->>'nss_region' AS nss_region,
           sr.data->>'hh_id' AS hh_id,
           sr.data->>'usual_activity_status' AS usual_activity_status,
           sr.data->>'weekly_activity_status' AS weekly_activity_status,
           sr.data->>'hh_size' AS hh_size,
           sr.data->>'principal_earner_age' AS principal_earner_age,
           sr.data->>'principal_earner_sex' AS principal_earner_sex,
           sr.data->>'mpce' AS mpce,
           sr.data->>'multiplier' AS multiplier
    FROM silver_records sr
    JOIN surveys s ON sr.survey_id = s.id
    WHERE s.code = $1
      AND sr.dq_status IN ('pass', 'warn')
  "
  df <- dbGetQuery(conn, sql, params = list(survey_code))

  if (nrow(df) == 0) return(NULL)

  # Type conversions
  df$wgt_multiplier   <- as.numeric(df$wgt_multiplier)
  df$hh_size          <- as.numeric(df$hh_size)
  df$principal_earner_age <- as.numeric(df$principal_earner_age)
  df$mpce             <- as.numeric(df$mpce)
  df$multiplier_raw   <- as.numeric(df$multiplier)

  # Derived indicators — PLFS
  df$unemployed_indicator <- ifelse(df$usual_activity_status %in% c("81","82"), 1, 0)
  df$employed_indicator   <- ifelse(df$usual_activity_status %in% c("11","12","21","22","31"), 1, 0)
  df$labour_force_indicator <- ifelse(!df$usual_activity_status %in% c("91","92","93","94","95","96","97"), 1, 0)
  df$unemployment_rate    <- df$unemployed_indicator  # for svymean → direct UR estimate

  # Handle NULLs
  df[is.na(df$wgt_multiplier), "wgt_multiplier"] <- 1
  df[is.na(df$nss_region), "nss_region"]         <- "NSS-UNKNOWN"
  df[is.na(df$fsu_code), "fsu_code"]             <- paste0("FSU-", df[is.na(df$fsu_code), "id"])

  df
}

# ── Build survey design object ────────────────────────────────────────────────
build_design <- function(df, id_var, strata_var, cluster_var, weight_var) {
  design_formula_id      <- as.formula(paste0("~", cluster_var))
  design_formula_strata  <- as.formula(paste0("~", strata_var))
  weights_vec            <- df[[weight_var]]

  svydesign(
    ids     = design_formula_id,
    strata  = design_formula_strata,
    weights = weights_vec,
    data    = df,
    nest    = TRUE
  )
}

#* @apiTitle MoSPI USP R Statistical API
#* @apiDescription Complex survey estimation — PLFS, HCES, ASI

#* Health check
#* @get /health
function() {
  list(status = "ok", r_version = R.version.string, survey_pkg = packageVersion("survey"))
}

#* Run weighted tabulation
#* @post /tabulate
#* @param req The request body
function(req) {
  t_start <- proc.time()
  body    <- fromJSON(req$postBody)

  survey_code     <- body$survey_code
  design_spec     <- body$design
  estimator       <- body$estimator %||% "svymean"
  target_var      <- body$target_var
  by_vars         <- body$by_vars
  confidence      <- as.numeric(body$confidence_level %||% 0.95)

  # Load data
  df <- tryCatch(load_survey_data(survey_code), error = function(e) NULL)
  if (is.null(df) || nrow(df) == 0) {
    return(list(status = "error", message = paste("No data for survey:", survey_code)))
  }

  if (!target_var %in% names(df)) {
    return(list(status = "error", message = paste("Variable not found:", target_var)))
  }

  # Build design
  svy_design <- tryCatch(
    build_design(df,
                 design_spec$id_var %||% "hh_id",
                 design_spec$strata_var %||% "nss_region",
                 design_spec$cluster_var %||% "fsu_code",
                 design_spec$weight_var %||% "wgt_multiplier"),
    error = function(e) {
      # Fallback: simple random sampling design
      svydesign(ids = ~1, weights = ~wgt_multiplier, data = df)
    }
  )

  # Build formula
  target_formula <- as.formula(paste0("~", target_var))
  alpha <- 1 - confidence

  # Estimation
  rows <- tryCatch({
    if (length(by_vars) > 0) {
      by_formula <- as.formula(paste0("~", paste(by_vars, collapse = " + ")))
      res <- svyby(target_formula, by_formula, svy_design,
                   switch(estimator,
                     svymean = svymean, svytotal = svytotal, svyratio = svyratio,
                     svymean),
                   deff = TRUE, vartype = c("se", "ci", "cv"),
                   na.rm = TRUE, ci.lev = confidence)
      as.data.frame(res)
    } else {
      res <- do.call(switch(estimator, svymean = svymean, svytotal = svytotal, svymean),
                     list(target_formula, svy_design, deff = TRUE,
                          vartype = c("se","ci","cv"), na.rm = TRUE))
      as.data.frame(as.list(res))
    }
  }, error = function(e) {
    data.frame(error = e$message)
  })

  elapsed_ms <- round((proc.time() - t_start)["elapsed"] * 1000)

  # Build R code string for display
  by_str  <- if (length(by_vars) > 0) paste("~", paste(by_vars, collapse=" + ")) else "NULL"
  r_code  <- sprintf('library(survey)\ndesign <- svydesign(\n  id = ~%s,\n  strata = ~%s,\n  weights = ~%s,\n  data = survey_data, nest = TRUE\n)\nresult <- svyby(\n  ~%s,\n  %s,\n  design,\n  %s,\n  deff = TRUE,\n  vartype = c("se","ci","cv")\n)\nprint(result)',
    design_spec$cluster_var %||% "fsu_code",
    design_spec$strata_var %||% "nss_region",
    design_spec$weight_var %||% "wgt_multiplier",
    target_var, by_str, estimator)

  list(
    status         = "success",
    estimator      = estimator,
    target_var     = target_var,
    by_vars        = by_vars,
    n_records      = nrow(df),
    confidence     = confidence,
    rows           = rows,
    execution_ms   = elapsed_ms,
    r_code         = r_code
  )
}

#* State-level PLFS estimates (pre-computed gold or live)
#* @get /gold/plfs
function() {
  conn <- tryCatch(get_conn(), error = function(e) NULL)
  if (is.null(conn)) {
    return(list(status = "error", message = "DB unavailable"))
  }
  on.exit(dbDisconnect(conn))
  rows <- dbGetQuery(conn, "
    SELECT g.*, s.name AS state_name
    FROM gold_plfs_state g
    LEFT JOIN states s ON g.state_code = s.code
    ORDER BY g.run_id DESC, g.state_code, g.sector
    LIMIT 100
  ")
  list(status = "success", rows = rows)
}

#* Small Area Estimation — district-level synthetic estimation
#* @post /sae
function(req) {
  body <- fromJSON(req$postBody)
  # Placeholder — in production: use sae package (BHF, Fay-Herriot)
  list(
    status = "demo",
    message = "SAE endpoint — Fay-Herriot model (sae package) — available in production",
    model = "Fay-Herriot empirical BLUP",
    auxiliary_vars = c("literacy_rate", "urban_pct", "poverty_headcount")
  )
}

# Null coalescing operator
`%||%` <- function(a, b) if (!is.null(a) && length(a) > 0 && a != "") a else b
