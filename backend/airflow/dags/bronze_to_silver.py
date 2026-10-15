"""
Airflow DAG: Bronze → Silver
Promotes validated submissions from bronze_submissions → silver_records
Triggered by: webhook, schedule (every 15 min), or manual
"""
from airflow import DAG
from airflow.operators.python import PythonOperator
from airflow.utils.dates import days_ago
from datetime import datetime, timedelta
import psycopg2, os, json, logging

logger = logging.getLogger(__name__)

PG_CONN = {
    "host": os.getenv("PG_HOST", "postgres"),
    "port": int(os.getenv("PG_PORT", 5432)),
    "dbname": os.getenv("PG_DB", "mospi_usp"),
    "user": os.getenv("PG_USER", "appuser"),
    "password": os.getenv("PG_PASSWORD", "apppassword"),
}

default_args = {
    "owner": "mospi",
    "depends_on_past": False,
    "email_on_failure": False,
    "retries": 2,
    "retry_delay": timedelta(minutes=5),
}


def promote_bronze_to_silver(**context):
    """
    Transformation logic:
    1. Fetch unpromoted bronze records
    2. Parse & clean raw JSONB
    3. Map to silver schema
    4. Insert into silver_records
    5. Write lineage events
    """
    conf = context.get("dag_run", {}).conf or {}
    survey_id = conf.get("survey_id")

    conn = psycopg2.connect(**PG_CONN)
    cur = conn.cursor()
    promoted = 0

    try:
        # Get unpromoted bronze records
        query = """
            SELECT b.id, b.survey_id, b.raw_data, b.state_code, b.district_code,
                   b.fsu_code, b.odk_instance_id
            FROM bronze_submissions b
            WHERE NOT EXISTS (
                SELECT 1 FROM silver_records sr WHERE sr.bronze_id = b.id AND sr.is_latest = TRUE
            )
        """
        params = []
        if survey_id:
            query += " AND b.survey_id = %s::uuid"
            params.append(survey_id)
        query += " LIMIT 500"

        cur.execute(query, params)
        records = cur.fetchall()
        logger.info(f"Bronze→Silver: found {len(records)} unpromoted records")

        for rec in records:
            b_id, s_id, raw, state, district, fsu, instance_id = rec
            data = raw if isinstance(raw, dict) else json.loads(raw)

            # Extract key fields from raw JSONB
            hh_id = data.get("hh_id") or instance_id
            sector = data.get("sector", "Unknown")
            weight = data.get("multiplier") or data.get("weight", 1.0)

            # Insert silver record
            cur.execute("""
                INSERT INTO silver_records
                    (bronze_id, survey_id, data, dq_status, hh_id, state_code, district_code,
                     sector, fsu_code, wgt_multiplier)
                VALUES (%s, %s, %s::jsonb, 'pending', %s, %s, %s, %s, %s, %s)
                RETURNING id
            """, (str(b_id), str(s_id) if s_id else None, json.dumps(data),
                  hh_id, state, district, sector, fsu, weight))
            silver_id = cur.fetchone()[0]

            # Write lineage event
            cur.execute("""
                INSERT INTO lineage_events (bronze_id, silver_id, entity_type, entity_id, event_type, triggered_by)
                VALUES (%s, %s, 'silver', %s, 'cleaned', 'airflow:bronze_to_silver')
            """, (str(b_id), str(silver_id), str(silver_id)))
            promoted += 1

        conn.commit()
        logger.info(f"Bronze→Silver: promoted {promoted} records")
        return {"promoted": promoted}

    except Exception as e:
        conn.rollback()
        logger.error(f"Bronze→Silver error: {e}")
        raise
    finally:
        cur.close()
        conn.close()


def run_basic_dq(**context):
    """Basic DQ validation on newly promoted silver records."""
    conn = psycopg2.connect(**PG_CONN)
    cur = conn.cursor()
    try:
        # Apply simple rule-based DQ
        cur.execute("""
            WITH scored AS (
                SELECT id,
                    CASE
                        WHEN (data->>'usual_activity_status') IS NULL THEN 'fail'
                        WHEN (data->>'hh_size')::int < 1 OR (data->>'hh_size')::int > 30 THEN 'warn'
                        WHEN (data->>'principal_earner_age')::int < 15 OR (data->>'principal_earner_age')::int > 99 THEN 'warn'
                        ELSE 'pass'
                    END AS computed_status,
                    CASE
                        WHEN (data->>'usual_activity_status') IS NULL THEN 40.0
                        WHEN (data->>'hh_size')::int < 1 OR (data->>'hh_size')::int > 30 THEN 72.0
                        ELSE 95.0
                    END AS computed_score
                FROM silver_records
                WHERE dq_status = 'pending'
                LIMIT 1000
            )
            UPDATE silver_records sr
            SET dq_status = scored.computed_status,
                dq_score = scored.computed_score
            FROM scored
            WHERE sr.id = scored.id
        """)
        updated = cur.rowcount
        conn.commit()
        logger.info(f"DQ: updated {updated} silver records")
        return {"dq_updated": updated}
    except Exception as e:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


with DAG(
    "bronze_to_silver",
    default_args=default_args,
    description="Promote Bronze submissions to Silver, apply DQ rules",
    schedule_interval="*/15 * * * *",
    start_date=days_ago(1),
    catchup=False,
    max_active_runs=1,
    tags=["mospi", "pipeline", "bronze", "silver"],
) as dag:

    promote_task = PythonOperator(
        task_id="promote_bronze_to_silver",
        python_callable=promote_bronze_to_silver,
    )

    dq_task = PythonOperator(
        task_id="run_basic_dq",
        python_callable=run_basic_dq,
    )

    promote_task >> dq_task
