from pydantic import BaseModel, Field
from typing import List, Optional, Any, Dict
from datetime import datetime
from enum import Enum


class DocumentStatus(str, Enum):
    UPLOADED = "uploaded"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


class DocumentInfo(BaseModel):
    id: str
    filename: str
    file_type: str
    status: DocumentStatus
    created_at: datetime
    chunk_count: int = 0


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    question: str = Field(..., description="用户问题")
    conversation_id: Optional[str] = Field(None, description="对话ID，用于多轮对话")
    top_k: Optional[int] = Field(None, description="检索文档数量")


class SourceReference(BaseModel):
    doc_id: str
    filename: str
    content: str
    score: float
    chunk_index: Optional[int] = None


class ChatResponse(BaseModel):
    answer: str
    conversation_id: str
    sources: List[SourceReference] = []
    related_documents: List[str] = []
    cited_references: List[int] = []


class DocumentListResponse(BaseModel):
    documents: List[DocumentInfo]
    total: int


class QALogEntry(BaseModel):
    id: str
    timestamp: datetime
    conversation_id: str
    question: str
    answer: str
    sources_used: List[Dict[str, Any]]
    retrieval_time_ms: float
    llm_time_ms: float
    total_time_ms: float
    source_documents: List[str]
    user_ip: Optional[str] = None


class DailyStats(BaseModel):
    date: str
    total_queries: int
    avg_retrieval_time_ms: float
    avg_llm_time_ms: float
    avg_total_time_ms: float
    unique_conversations: int
    top_documents: List[Dict[str, Any]]


class StatsSummary(BaseModel):
    total_queries: int
    total_conversations: int
    total_documents: int
    avg_retrieval_time_ms: float
    avg_llm_time_ms: float
    avg_total_time_ms: float
    top_documents: List[Dict[str, Any]]
    daily_stats: List[DailyStats]
