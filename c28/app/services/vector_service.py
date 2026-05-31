import os
import chromadb
from chromadb.config import Settings as ChromaSettings
from typing import List, Optional, Dict, Any
from dataclasses import dataclass
from pathlib import Path

from app.config import settings


@dataclass
class RetrievedChunk:
    content: str
    metadata: Dict[str, Any]
    score: float


class VectorService:
    def __init__(self):
        self.persist_dir = str(settings.CHROMA_DIR)
        self.collection_name = "knowledge_base"
        
        self._client = None
        self._collection = None
        self._embedding_function = None
    
    @property
    def client(self) -> chromadb.PersistentClient:
        if self._client is None:
            self._client = chromadb.PersistentClient(
                path=self.persist_dir,
                settings=ChromaSettings(anonymized_telemetry=False),
            )
        return self._client
    
    @property
    def collection(self):
        if self._collection is None:
            self._collection = self.client.get_or_create_collection(
                name=self.collection_name,
                metadata={"hnsw:space": "cosine"},
            )
        return self._collection
    
    async def add_documents(
        self,
        doc_id: str,
        filename: str,
        chunks: List[str],
    ) -> int:
        if not chunks:
            return 0
        
        ids = [f"{doc_id}_{i}" for i in range(len(chunks))]
        metadatas = [
            {
                "doc_id": doc_id,
                "filename": filename,
                "chunk_index": i,
                "chunk_size": len(chunk),
            }
            for i, chunk in enumerate(chunks)
        ]
        
        self.collection.add(
            ids=ids,
            documents=chunks,
            metadatas=metadatas,
        )
        
        return len(chunks)
    
    async def search(
        self,
        query: str,
        top_k: int = None,
        doc_ids: Optional[List[str]] = None,
    ) -> List[RetrievedChunk]:
        top_k = top_k or settings.TOP_K
        
        where = None
        if doc_ids:
            where = {"doc_id": {"$in": doc_ids}}
        
        results = self.collection.query(
            query_texts=[query],
            n_results=top_k,
            where=where,
        )
        
        chunks = []
        if results.get("documents") and results["documents"][0]:
            for i, (doc, meta, dist) in enumerate(zip(
                results["documents"][0],
                results["metadatas"][0],
                results["distances"][0],
            )):
                score = 1.0 - dist
                chunks.append(RetrievedChunk(
                    content=doc,
                    metadata=meta,
                    score=score,
                ))
        
        return chunks
    
    async def delete_by_doc_id(self, doc_id: str) -> None:
        results = self.collection.get(
            where={"doc_id": doc_id},
        )
        
        if results.get("ids"):
            self.collection.delete(ids=results["ids"])
    
    async def get_document_chunks(self, doc_id: str) -> List[Dict[str, Any]]:
        results = self.collection.get(
            where={"doc_id": doc_id},
        )
        
        chunks = []
        if results.get("ids"):
            for doc_id, doc, meta in zip(
                results["ids"],
                results["documents"],
                results["metadatas"],
            ):
                chunks.append({
                    "id": doc_id,
                    "content": doc,
                    "metadata": meta,
                })
        
        return chunks
    
    async def get_all_doc_ids(self) -> List[str]:
        results = self.collection.get()
        doc_ids = set()
        if results.get("metadatas"):
            for meta in results["metadatas"]:
                if meta and meta.get("doc_id"):
                    doc_ids.add(meta["doc_id"])
        return list(doc_ids)
    
    async def get_stats(self) -> Dict[str, Any]:
        all_docs = self.collection.get()
        total_chunks = len(all_docs["ids"]) if all_docs.get("ids") else 0
        
        doc_ids = set()
        filenames = set()
        if all_docs.get("metadatas"):
            for meta in all_docs["metadatas"]:
                if meta:
                    if meta.get("doc_id"):
                        doc_ids.add(meta["doc_id"])
                    if meta.get("filename"):
                        filenames.add(meta["filename"])
        
        return {
            "total_documents": len(doc_ids),
            "total_chunks": total_chunks,
            "filenames": list(filenames),
        }
