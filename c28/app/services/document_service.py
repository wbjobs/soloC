import uuid
import json
import shutil
from pathlib import Path
from datetime import datetime
from typing import List, Optional, Dict
from dataclasses import dataclass, asdict, field
from concurrent.futures import ThreadPoolExecutor
import asyncio

from langchain_text_splitters import RecursiveCharacterTextSplitter, MarkdownTextSplitter
import re

from app.config import settings
from app.models.schemas import DocumentInfo, DocumentStatus
from app.utils.parsers import parse_document


@dataclass
class DocumentRecord:
    id: str
    filename: str
    file_type: str
    status: str
    created_at: str
    chunk_count: int = 0
    error: Optional[str] = None


class DocumentService:
    def __init__(self):
        self.upload_dir = settings.UPLOAD_DIR
        self.upload_dir.mkdir(parents=True, exist_ok=True)
        
        self.metadata_file = self.upload_dir / ".metadata.json"
        self.documents: Dict[str, DocumentRecord] = {}
        self._load_metadata()
    
    def _load_metadata(self):
        if self.metadata_file.exists():
            try:
                with open(self.metadata_file, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    for doc_id, record in data.items():
                        self.documents[doc_id] = DocumentRecord(**record)
            except Exception:
                pass
    
    def _save_metadata(self):
        data = {doc_id: asdict(record) for doc_id, record in self.documents.items()}
        with open(self.metadata_file, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
    
    def _get_file_type(self, filename: str) -> str:
        ext = Path(filename).suffix.lower().lstrip(".")
        return ext if ext in ["txt", "pdf", "docx", "doc"] else "txt"
    
    def _estimate_chunk_size(self, text_length: int) -> int:
        if text_length < 5000:
            return 300
        elif text_length < 50000:
            return 500
        elif text_length < 200000:
            return 700
        else:
            return 1000
    
    def _split_by_semantic_units(self, text: str) -> List[str]:
        units = []
        paragraphs = re.split(r'\n\s*\n', text.strip())
        
        for para in paragraphs:
            para = para.strip()
            if not para:
                continue
            
            if len(para) <= 300:
                units.append(para)
            else:
                sentences = re.split(r'(?<=[。！？.!?])\s+', para)
                current_chunk = ""
                
                for sent in sentences:
                    sent = sent.strip()
                    if not sent:
                        continue
                    
                    if len(current_chunk) + len(sent) <= 400:
                        current_chunk += sent
                    else:
                        if current_chunk:
                            units.append(current_chunk)
                        current_chunk = sent
                
                if current_chunk:
                    units.append(current_chunk)
        
        return units
    
    def _intelligent_split(
        self,
        text: str,
        chunk_size: int = None,
        chunk_overlap: int = None,
    ) -> List[str]:
        if not text.strip():
            return []
        
        text_length = len(text)
        
        if chunk_size is None:
            chunk_size = self._estimate_chunk_size(text_length)
        if chunk_overlap is None:
            chunk_overlap = int(chunk_size * 0.15)
        
        semantic_units = self._split_by_semantic_units(text)
        
        text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=chunk_size,
            chunk_overlap=chunk_overlap,
            separators=[
                "\n\n",
                "\n",
                "。", "！", "？", "；",
                ".", "!", "?", ";",
                "，", ",",
                " ", "",
            ],
            length_function=len,
            is_separator_regex=False,
        )
        
        chunks = []
        current_group = []
        current_length = 0
        
        for unit in semantic_units:
            unit_len = len(unit)
            
            if current_length + unit_len <= chunk_size:
                current_group.append(unit)
                current_length += unit_len
            else:
                if current_group:
                    group_text = "\n\n".join(current_group)
                    sub_chunks = text_splitter.split_text(group_text)
                    chunks.extend(sub_chunks)
                
                if unit_len > chunk_size:
                    sub_chunks = text_splitter.split_text(unit)
                    chunks.extend(sub_chunks)
                    current_group = []
                    current_length = 0
                else:
                    current_group = [unit]
                    current_length = unit_len
        
        if current_group:
            group_text = "\n\n".join(current_group)
            sub_chunks = text_splitter.split_text(group_text)
            chunks.extend(sub_chunks)
        
        if chunk_overlap > 0 and len(chunks) > 1:
            overlapped = [chunks[0]]
            for i in range(1, len(chunks)):
                prev = chunks[i - 1]
                curr = chunks[i]
                
                overlap_text = prev[-min(chunk_overlap, len(prev)):]
                merged = overlap_text + curr
                overlapped.append(merged)
            
            return overlapped
        
        return chunks
    
    async def upload_document(self, filename: str, content: bytes) -> DocumentInfo:
        doc_id = str(uuid.uuid4())
        file_type = self._get_file_type(filename)
        
        record = DocumentRecord(
            id=doc_id,
            filename=filename,
            file_type=file_type,
            status=DocumentStatus.UPLOADED,
            created_at=datetime.now().isoformat(),
        )
        
        file_path = self.upload_dir / f"{doc_id}.{file_type}"
        with open(file_path, "wb") as f:
            f.write(content)
        
        self.documents[doc_id] = record
        self._save_metadata()
        
        return self._record_to_info(record)
    
    def _record_to_info(self, record: DocumentRecord) -> DocumentInfo:
        return DocumentInfo(
            id=record.id,
            filename=record.filename,
            file_type=record.file_type,
            status=DocumentStatus(record.status),
            created_at=datetime.fromisoformat(record.created_at),
            chunk_count=record.chunk_count,
        )
    
    async def get_document(self, doc_id: str) -> Optional[DocumentInfo]:
        record = self.documents.get(doc_id)
        if record:
            return self._record_to_info(record)
        return None
    
    async def list_documents(self) -> List[DocumentInfo]:
        return [self._record_to_info(r) for r in self.documents.values()]
    
    async def delete_document(self, doc_id: str) -> bool:
        if doc_id not in self.documents:
            return False
        
        record = self.documents[doc_id]
        file_path = self.upload_dir / f"{doc_id}.{record.file_type}"
        
        if file_path.exists():
            file_path.unlink()
        
        del self.documents[doc_id]
        self._save_metadata()
        
        return True
    
    async def process_document(self, doc_id: str, vector_service) -> DocumentInfo:
        record = self.documents.get(doc_id)
        if not record:
            raise ValueError(f"Document {doc_id} not found")
        
        record.status = DocumentStatus.PROCESSING
        self._save_metadata()
        
        try:
            file_path = self.upload_dir / f"{doc_id}.{record.file_type}"
            
            text = await asyncio.to_thread(
                parse_document, file_path, record.file_type
            )
            
            if not text.strip():
                raise ValueError("文档中未提取到有效文本")
            
            chunks = self._intelligent_split(
                text,
                chunk_size=settings.CHUNK_SIZE,
                chunk_overlap=settings.CHUNK_OVERLAP,
            )
            
            if not chunks:
                raise ValueError("文档分块后没有有效内容")
            
            batch_size = 100
            for i in range(0, len(chunks), batch_size):
                batch = chunks[i:i + batch_size]
                await vector_service.add_documents(
                    doc_id=doc_id,
                    filename=record.filename,
                    chunks=batch,
                )
            
            record.chunk_count = len(chunks)
            record.status = DocumentStatus.COMPLETED
            
        except Exception as e:
            record.status = DocumentStatus.FAILED
            record.error = str(e)
        
        self._save_metadata()
        return self._record_to_info(record)
    
    async def batch_process(self, doc_ids: List[str], vector_service) -> List[DocumentInfo]:
        results = []
        for doc_id in doc_ids:
            try:
                result = await self.process_document(doc_id, vector_service)
                results.append(result)
            except Exception as e:
                record = self.documents.get(doc_id)
                if record:
                    record.status = DocumentStatus.FAILED
                    record.error = str(e)
                    self._save_metadata()
                    results.append(self._record_to_info(record))
        return results
