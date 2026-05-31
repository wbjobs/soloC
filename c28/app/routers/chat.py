from fastapi import APIRouter, HTTPException, Request
from typing import List, Optional
from datetime import date

from app.models.schemas import ChatRequest, ChatResponse, ChatMessage, QALogEntry, StatsSummary
from app.services.vector_service import VectorService
from app.services.conversation_service import ConversationService
from app.services.qa_service import QAService
from app.services.log_service import log_service
from app.services.document_service import DocumentService


router = APIRouter(prefix="/chat", tags=["问答服务"])

vector_service = VectorService()
conversation_service = ConversationService()
qa_service = QAService(vector_service, conversation_service)
document_service = DocumentService()


@router.post("/", response_model=ChatResponse)
async def chat(request: ChatRequest, http_request: Request = None):
    if not request.question.strip():
        raise HTTPException(status_code=400, detail="问题不能为空")
    
    try:
        result = await qa_service.answer(
            question=request.question,
            conversation_id=request.conversation_id,
            top_k=request.top_k,
        )
        
        actual_conversation_id = qa_service.conversation_service.get_conversation(
            request.conversation_id
        ).id
        
        sources_used = [
            {
                "doc_id": s.doc_id,
                "filename": s.filename,
                "score": s.score,
            }
            for s in result.sources
        ]
        
        user_ip = None
        if http_request:
            try:
                user_ip = http_request.client.host if http_request.client else None
            except Exception:
                pass
        
        await log_service.log_query(
            conversation_id=actual_conversation_id,
            question=request.question,
            answer=result.answer,
            sources_used=sources_used,
            retrieval_time_ms=result.retrieval_time_ms,
            llm_time_ms=result.llm_time_ms,
            total_time_ms=result.total_time_ms,
            source_documents=result.related_documents,
            user_ip=user_ip,
        )
        
        return ChatResponse(
            answer=result.answer,
            conversation_id=actual_conversation_id,
            sources=result.sources,
            related_documents=result.related_documents,
            cited_references=result.cited_references,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"问答失败: {str(e)}")


@router.post("/search")
async def search(query: str, top_k: Optional[int] = None):
    if not query.strip():
        raise HTTPException(status_code=400, detail="查询不能为空")
    
    try:
        results = await qa_service.search_only(query=query, top_k=top_k)
        return {"query": query, "results": results, "count": len(results)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"检索失败: {str(e)}")


@router.get("/conversations")
async def list_conversations():
    convs = conversation_service.list_conversations()
    return {"conversations": convs, "total": len(convs)}


@router.get("/conversations/{conversation_id}")
async def get_conversation(conversation_id: str):
    conv = conversation_service.get_conversation(conversation_id)
    if not conv:
        raise HTTPException(status_code=404, detail="对话不存在")
    
    return {
        "conversation_id": conv.id,
        "messages": conv.messages,
        "created_at": conv.created_at,
        "updated_at": conv.updated_at,
    }


@router.delete("/conversations/{conversation_id}")
async def delete_conversation(conversation_id: str):
    deleted = conversation_service.delete_conversation(conversation_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="对话不存在")
    
    return {"message": "对话已删除", "conversation_id": conversation_id}


@router.get("/logs", response_model=List[QALogEntry])
async def get_logs(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    conversation_id: Optional[str] = None,
    limit: int = 100,
):
    try:
        start = date.fromisoformat(start_date) if start_date else None
        end = date.fromisoformat(end_date) if end_date else None
    except ValueError:
        raise HTTPException(status_code=400, detail="日期格式错误，请使用 YYYY-MM-DD")
    
    try:
        logs = await log_service.get_logs(
            start_date=start,
            end_date=end,
            conversation_id=conversation_id,
            limit=limit,
        )
        return logs
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取日志失败: {str(e)}")


@router.get("/stats", response_model=StatsSummary)
async def get_stats(days: int = 30):
    if days < 1 or days > 90:
        raise HTTPException(status_code=400, detail="天数必须在 1-90 之间")
    
    try:
        docs = await document_service.list_documents()
        summary = await log_service.get_summary(days=days, total_documents=len(docs))
        return summary
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取统计失败: {str(e)}")
