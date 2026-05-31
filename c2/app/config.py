import os
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    INFLUXDB_URL: str = os.getenv("INFLUXDB_URL", "http://localhost:8086")
    INFLUXDB_TOKEN: str = os.getenv("INFLUXDB_TOKEN", "my-token")
    INFLUXDB_ORG: str = os.getenv("INFLUXDB_ORG", "my-org")
    INFLUXDB_BUCKET: str = os.getenv("INFLUXDB_BUCKET", "traces")
    
    REDIS_URL: str = os.getenv("REDIS_URL", "redis://localhost:6379/0")
    
    CELERY_BROKER_URL: str = os.getenv("CELERY_BROKER_URL", "redis://localhost:6379/1")
    CELERY_RESULT_BACKEND: str = os.getenv("CELERY_RESULT_BACKEND", "redis://localhost:6379/2")
    
    SLOW_CALL_THRESHOLD_MS: int = int(os.getenv("SLOW_CALL_THRESHOLD_MS", "500"))
    TOPOLOGY_UPDATE_INTERVAL_MINUTES: int = int(os.getenv("TOPOLOGY_UPDATE_INTERVAL_MINUTES", "5"))
    
    API_HOST: str = os.getenv("API_HOST", "0.0.0.0")
    API_PORT: int = int(os.getenv("API_PORT", "8000"))
    
    ANOMALY_SIGMA_THRESHOLD: float = float(os.getenv("ANOMALY_SIGMA_THRESHOLD", "3.0"))
    ANOMALY_MIN_DATA_POINTS: int = int(os.getenv("ANOMALY_MIN_DATA_POINTS", "10"))
    ANOMALY_LOOKBACK_HOURS: int = int(os.getenv("ANOMALY_LOOKBACK_HOURS", "24"))
    ANOMALY_HISTORY_MAX_ITEMS: int = int(os.getenv("ANOMALY_HISTORY_MAX_ITEMS", "1000"))
    
    ALERT_WEBHOOK_URL: str = os.getenv("ALERT_WEBHOOK_URL", "")
    ALERT_WEBHOOK_TIMEOUT: int = int(os.getenv("ALERT_WEBHOOK_TIMEOUT", "5"))

    class Config:
        env_file = ".env"


settings = Settings()
