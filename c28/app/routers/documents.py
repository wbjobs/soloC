from fastapi import APIRouter, UploadFile, File, HTTPException, BackgroundTasks, Query
from typing import List, Optional
from pathlib import Path

from app.config import settings
from app.models.schemas import DocumentInfo, DocumentListResponse, DocumentStatus
from app.services.document_service import DocumentService
from app.services.vector_service import VectorService


router = APIRouter(prefix="/documents", tags=["文档管理"])

document_service = DocumentService()
vector_service = VectorService()


def process_in_background(doc_id: str):
    import asyncio
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        loop.run_until_complete(
            document_service.process_document(doc_id, vector_service)
        )
    finally:
        loop.close()


@router.post("/upload", response_model=DocumentInfo)
async def upload_document(
    file: UploadFile = File(...),
    background_tasks: BackgroundTasks = None,
    auto_process: bool = Query(True, description="上传后自动处理"),
):
    allowed_types = ["txt", "pdf", "docx", "doc"]
    file_ext = Path(file.filename).suffix.lower().lstrip(".")
    
    if file_ext not in allowed_types:
        raise HTTPException(
            status_code=400,
            detail=f"不支持的文件类型。支持: {', '.join(allowed_types)}",
        )
    
    content = await file.read()
    
    if len(content) == 0:
        raise HTTPException(status_code=400, detail="上传的文件为空")
    
    max_size = 50 * 1024 * 1024
    if len(content) > max_size:
        raise HTTPException(status_code=400, detail="文件大小超过限制 (最大 50MB)")
    
    doc_info = await document_service.upload_document(file.filename, content)
    
    if auto_process and background_tasks:
        background_tasks.add_task(process_in_background, doc_info.id)
    
    return doc_info


@router.post("/process/{doc_id}", response_model=DocumentInfo)
async def process_document(doc_id: str):
    try:
        doc_info = await document_service.process_document(doc_id, vector_service)
        return doc_info
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"处理失败: {str(e)}")


@router.post("/batch-process")
async def batch_process(doc_ids: List[str]):
    results = await document_service.batch_process(doc_ids, vector_service)
    return {"processed": len(results), "documents": results}


@router.get("/", response_model=DocumentListResponse)
async def list_documents():
    docs = await document_service.list_documents()
    return DocumentListResponse(documents=docs, total=len(docs))


@router.get("/{doc_id}", response_model=DocumentInfo)
async def get_document(doc_id: str):
    doc = await document_service.get_document(doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="文档不存在")
    return doc


@router.delete("/{doc_id}")
async def delete_document(doc_id: str):
    deleted = await document_service.delete_document(doc_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="文档不存在")
    
    await vector_service.delete_by_doc_id(doc_id)
    
    return {"message": "文档已删除", "doc_id": doc_id}


@router.get("/{doc_id}/chunks")
async def get_document_chunks(doc_id: str):
    chunks = await vector_service.get_document_chunks(doc_id)
    return {"doc_id": doc_id, "chunks": chunks, "count": len(chunks)}


@router.get("/stats/vector")
async def get_vector_stats():
    stats = await vector_service.get_stats()
    return stats
