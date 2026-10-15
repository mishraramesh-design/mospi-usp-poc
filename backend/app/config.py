from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Database
    pg_host: str = "postgres"
    pg_port: int = 5432
    pg_user: str = "appuser"
    pg_password: str = "apppassword"
    pg_db: str = "mospi_usp"

    # Auth
    secret_key: str = "change-me-super-secret-key-32chars!!"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 480

    # ODK Central
    odk_url: str = "http://odk-central:8383"
    odk_admin_email: str = "admin@mospi.gov.in"
    odk_admin_password: str = "MoSPI@2024"

    # MinIO
    minio_endpoint: str = "minio:9000"
    minio_root_user: str = "minioadmin"
    minio_root_password: str = "minioadmin123"
    minio_bucket: str = "mospi-attachments"

    # Services
    r_api_url: str = "http://r-api:8686"
    airflow_url: str = "http://airflow-webserver:8080"
    airflow_user: str = "admin"
    airflow_password: str = "MoSPI@2024"
    redis_url: str = "redis://redis:6379/0"

    @property
    def database_url(self) -> str:
        return f"postgresql+asyncpg://{self.pg_user}:{self.pg_password}@{self.pg_host}:{self.pg_port}/{self.pg_db}"

    @property
    def database_url_sync(self) -> str:
        return f"postgresql://{self.pg_user}:{self.pg_password}@{self.pg_host}:{self.pg_port}/{self.pg_db}"

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
