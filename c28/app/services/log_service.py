import uuid
import json
import asyncio
from pathlib import Path
from typing import List, Dict, Any, Optional
from datetime import datetime, date, timedelta
from collections import defaultdict
from dataclasses import dataclass, asdict

from app.config import settings
from app.models.schemas import QALogEntry, DailyStats, StatsSummary


@dataclass
class LogRecord:
    id: str
    timestamp: str
    conversation_id: str
    question: str
    answer: str
    sources_used: List[Dict[str, Any]]
    retrieval_time_ms: float
    llm_time_ms: float
    total_time_ms: float
    source_documents: List[str]
    user_ip: Optional[str] = None


class LogService:
    def __init__(self):
        self.logs_dir = settings.DATA_DIR / "logs"
        self.logs_dir.mkdir(parents=True, exist_ok=True)
        self._current_file: Optional[Path] = None
        self._cache: List[LogRecord] = []
        self._max_cache_size = 100
    
    def _get_log_file(self, log_date: date = None) -> Path:
        if log_date is None:
            log_date = date.today()
        return self.logs_dir / f"qa_{log_date.strftime('%Y-%m-%d')}.json"
    
    def _load_day_logs(self, log_date: date) -> List[LogRecord]:
        log_file = self._get_log_file(log_date)
        if not log_file.exists():
            return []
        
        try:
            with open(log_file, "r", encoding="utf-8") as f:
                data = json.load(f)
                return [LogRecord(**record) for record in data]
        except Exception:
            return []
    
    def _save_logs(self, logs: List[LogRecord], log_date: date = None) -> None:
        log_file = self._get_log_file(log_date)
        records = [asdict(log) for log in logs]
        with open(log_file, "w", encoding="utf-8") as f:
            json.dump(records, f, ensure_ascii=False, indent=2)
    
    async def log_query(
        self,
        conversation_id: str,
        question: str,
        answer: str,
        sources_used: List[Dict[str, Any]],
        retrieval_time_ms: float,
        llm_time_ms: float,
        total_time_ms: float,
        source_documents: List[str],
        user_ip: Optional[str] = None,
    ) -> QALogEntry:
        record = LogRecord(
            id=str(uuid.uuid4()),
            timestamp=datetime.now().isoformat(),
            conversation_id=conversation_id,
            question=question,
            answer=answer,
            sources_used=sources_used,
            retrieval_time_ms=retrieval_time_ms,
            llm_time_ms=llm_time_ms,
            total_time_ms=total_time_ms,
            source_documents=source_documents,
            user_ip=user_ip,
        )
        
        self._cache.append(record)
        
        if len(self._cache) >= self._max_cache_size:
            await self._flush_cache()
        
        return self._record_to_entry(record)
    
    async def _flush_cache(self) -> None:
        if not self._cache:
            return
        
        logs_by_date: Dict[str, List[LogRecord]] = defaultdict(list)
        
        for record in self._cache:
            log_date = record.timestamp[:10]
            logs_by_date[log_date].append(record)
        
        for date_str, logs in logs_by_date.items():
            log_date = datetime.strptime(date_str, "%Y-%m-%d").date()
            existing = self._load_day_logs(log_date)
            existing.extend(logs)
            self._save_logs(existing, log_date)
        
        self._cache = []
    
    def _record_to_entry(self, record: LogRecord) -> QALogEntry:
        return QALogEntry(
            id=record.id,
            timestamp=datetime.fromisoformat(record.timestamp),
            conversation_id=record.conversation_id,
            question=record.question,
            answer=record.answer,
            sources_used=record.sources_used,
            retrieval_time_ms=record.retrieval_time_ms,
            llm_time_ms=record.llm_time_ms,
            total_time_ms=record.total_time_ms,
            source_documents=record.source_documents,
            user_ip=record.user_ip,
        )
    
    async def get_logs(
        self,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
        conversation_id: Optional[str] = None,
        limit: int = 100,
    ) -> List[QALogEntry]:
        await self._flush_cache()
        
        if start_date is None:
            start_date = date.today() - timedelta(days=7)
        if end_date is None:
            end_date = date.today()
        
        all_logs: List[LogRecord] = []
        
        current_date = start_date
        while current_date <= end_date:
            day_logs = self._load_day_logs(current_date)
            all_logs.extend(day_logs)
            current_date += timedelta(days=1)
        
        if conversation_id:
            all_logs = [log for log in all_logs if log.conversation_id == conversation_id]
        
        all_logs.sort(key=lambda x: x.timestamp, reverse=True)
        
        return [self._record_to_entry(log) for log in all_logs[:limit]]
    
    async def get_daily_stats(self, days: int = 7) -> List[DailyStats]:
        await self._flush_cache()
        
        stats_list: List[DailyStats] = []
        end_date = date.today()
        
        for i in range(days - 1, -1, -1):
            log_date = end_date - timedelta(days=i)
            day_logs = self._load_day_logs(log_date)
            
            if not day_logs:
                stats_list.append(DailyStats(
                    date=log_date.strftime("%Y-%m-%d"),
                    total_queries=0,
                    avg_retrieval_time_ms=0.0,
                    avg_llm_time_ms=0.0,
                    avg_total_time_ms=0.0,
                    unique_conversations=0,
                    top_documents=[],
                ))
                continue
            
            total_queries = len(day_logs)
            conversations = set(log.conversation_id for log in day_logs)
            
            avg_retrieval = sum(log.retrieval_time_ms for log in day_logs) / total_queries
            avg_llm = sum(log.llm_time_ms for log in day_logs) / total_queries
            avg_total = sum(log.total_time_ms for log in day_logs) / total_queries
            
            doc_counts: Dict[str, int] = defaultdict(int)
            for log in day_logs:
                for doc in log.source_documents:
                    doc_counts[doc] += 1
            
            top_docs = [
                {"filename": doc, "count": count}
                for doc, count in sorted(doc_counts.items(), key=lambda x: x[1], reverse=True)[:5]
            ]
            
            stats_list.append(DailyStats(
                date=log_date.strftime("%Y-%m-%d"),
                total_queries=total_queries,
                avg_retrieval_time_ms=round(avg_retrieval, 2),
                avg_llm_time_ms=round(avg_llm, 2),
                avg_total_time_ms=round(avg_total, 2),
                unique_conversations=len(conversations),
                top_documents=top_docs,
            ))
        
        return stats_list
    
    async def get_summary(self, days: int = 30, total_documents: int = 0) -> StatsSummary:
        await self._flush_cache()
        
        daily_stats = await self.get_daily_stats(days)
        
        all_logs: List[LogRecord] = []
        end_date = date.today()
        
        for i in range(days):
            log_date = end_date - timedelta(days=i)
            all_logs.extend(self._load_day_logs(log_date))
        
        if not all_logs:
            return StatsSummary(
                total_queries=0,
                total_conversations=0,
                total_documents=total_documents,
                avg_retrieval_time_ms=0.0,
                avg_llm_time_ms=0.0,
                avg_total_time_ms=0.0,
                top_documents=[],
                daily_stats=daily_stats,
            )
        
        total_queries = len(all_logs)
        conversations = set(log.conversation_id for log in all_logs)
        
        avg_retrieval = sum(log.retrieval_time_ms for log in all_logs) / total_queries
        avg_llm = sum(log.llm_time_ms for log in all_logs) / total_queries
        avg_total = sum(log.total_time_ms for log in all_logs) / total_queries
        
        doc_counts: Dict[str, int] = defaultdict(int)
        for log in all_logs:
            for doc in log.source_documents:
                doc_counts[doc] += 1
        
        top_docs = [
            {"filename": doc, "count": count}
            for doc, count in sorted(doc_counts.items(), key=lambda x: x[1], reverse=True)[:10]
        ]
        
        return StatsSummary(
            total_queries=total_queries,
            total_conversations=len(conversations),
            total_documents=total_documents,
            avg_retrieval_time_ms=round(avg_retrieval, 2),
            avg_llm_time_ms=round(avg_llm, 2),
            avg_total_time_ms=round(avg_total, 2),
            top_documents=top_docs,
            daily_stats=daily_stats,
        )


log_service = LogService()
