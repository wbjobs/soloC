from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql://user:password@localhost:5432/option_pricing"
    REDIS_URL: str = "redis://localhost:6379/0"
    WEBSOCKET_PORT: int = 8765
    API_PORT: int = 8000
    PROMETHEUS_PORT: int = 9090
    REDIS_STREAM_NAME: str = "option_pricing_events"
    PRICE_UPDATE_INTERVAL: float = 1.0

    class Config:
        env_file = ".env"

settings = Settings()
