from pydantic_settings import BaseSettings
from pathlib import Path


class Settings(BaseSettings):
    APP_NAME: str = "私有知识库问答系统"
    VERSION: str = "1.0.0"
    
    DATA_DIR: Path = Path(__file__).parent.parent / "data"
    UPLOAD_DIR: Path = DATA_DIR / "uploads"
    CHROMA_DIR: Path = DATA_DIR / "chroma"
    
    LLM_API_KEY: str = "your-api-key"
    LLM_BASE_URL: str = "https://api.openai.com/v1"
    LLM_MODEL: str = "gpt-4o-mini"
    EMBEDDING_MODEL: str = "text-embedding-3-small"
    
    CHUNK_SIZE: int = 500
    CHUNK_OVERLAP: int = 50
    
    TOP_K: int = 4
    MAX_HISTORY: int = 10
    
    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
