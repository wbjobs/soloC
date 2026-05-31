import asyncio
import time
import re

from app.services.qa_service import QAService
from app.services.log_service import LogService
from app.models.schemas import SourceReference


async def test_citation_extraction():
    print("Testing citation extraction...")
    
    test_answers = [
        "人工智能是研究如何模拟人类智能的学科[1]。它涉及机器学习[2]、深度学习等多个领域[1][3]。",
        "根据文档内容，这个问题的答案是明确的[1]。",
        "没有找到相关信息。",
        "这是一个多引用测试[1][2][3]。",
    ]
    
    vector_service = type('MockVectorService', (), {})()
    conv_service = type('MockConvService', (), {})()
    qa_service = QAService(vector_service, conv_service)
    
    for i, answer in enumerate(test_answers):
        cited = qa_service._extract_cited_references(answer)
        print(f"  Test {i+1}: {answer}")
        print(f"    Cited references: {cited}")
    
    print("  Citation extraction OK\n")


async def test_log_service():
    print("Testing LogService...")
    
    log_service = LogService()
    
    for i in range(5):
        entry = await log_service.log_query(
            conversation_id=f"conv_test_{i % 2}",
            question=f"测试问题 {i+1}",
            answer=f"测试回答 {i+1} [1]",
            sources_used=[{"doc_id": f"doc{i}", "filename": f"test{i}.pdf", "score": 0.85}],
            retrieval_time_ms=100.0 + i * 10,
            llm_time_ms=500.0 + i * 50,
            total_time_ms=650.0 + i * 60,
            source_documents=[f"test{i % 3}.pdf"],
            user_ip="127.0.0.1",
        )
        print(f"  Logged query: {entry.id}")
    
    await log_service._flush_cache()
    
    logs = await log_service.get_logs(limit=10)
    print(f"  Retrieved {len(logs)} logs")
    
    summary = await log_service.get_summary(days=1, total_documents=5)
    print(f"  Stats - Total queries: {summary.total_queries}")
    print(f"  Stats - Unique conversations: {summary.total_conversations}")
    print(f"  Stats - Avg retrieval time: {summary.avg_retrieval_time_ms}ms")
    
    print("  LogService OK\n")


async def test_source_references():
    print("Testing SourceReference building...")
    
    from app.services.vector_service import RetrievedChunk
    
    chunks = [
        RetrievedChunk(
            content="这是第一个文档片段的内容。",
            metadata={"doc_id": "doc1", "filename": "论文.pdf", "chunk_index": 0},
            score=0.92,
        ),
        RetrievedChunk(
            content="这是第二个文档片段的内容。",
            metadata={"doc_id": "doc2", "filename": "报告.docx", "chunk_index": 5},
            score=0.85,
        ),
    ]
    
    vector_service = type('MockVectorService', (), {})()
    conv_service = type('MockConvService', (), {})()
    qa_service = QAService(vector_service, conv_service)
    
    sources = qa_service._build_source_references(chunks)
    
    print(f"  Built {len(sources)} source references:")
    for i, src in enumerate(sources, 1):
        print(f"    [{i}] {src.filename} (score: {src.score}, chunk: {src.chunk_index})")
        print(f"        Content: {src.content[:40]}...")
    
    print("  SourceReference building OK\n")


if __name__ == "__main__":
    asyncio.run(test_citation_extraction())
    asyncio.run(test_source_references())
    asyncio.run(test_log_service())
    print("All tests passed!")
