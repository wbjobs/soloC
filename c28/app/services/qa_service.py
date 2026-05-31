import time
import re
from typing import List, Dict, Any, Optional, Tuple
from dataclasses import dataclass

from langchain_openai import ChatOpenAI, OpenAIEmbeddings
from langchain.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain.schema import HumanMessage, AIMessage, SystemMessage

from app.config import settings
from app.services.vector_service import VectorService, RetrievedChunk
from app.services.conversation_service import ConversationService
from app.models.schemas import SourceReference


SYSTEM_PROMPT = """你是一个基于私有知识库的问答助手。请严格按照以下规则回答问题：

1. 回答必须基于提供的上下文信息，不得编造内容。
2. 如果上下文没有相关信息，请明确告知用户"知识库中没有找到相关信息"。
3. 回答要简洁、准确、有条理。
4. 如果用户的问题需要澄清，请主动询问。
5. 保留关键术语和专业词汇的准确性。

重要规则 - 引用标注：
- 每句话如果引用了文档中的信息，必须在句末添加 [n] 格式的引用标记
- n 是文档的编号（从1开始），对应上下文中的【文档n】
- 一句话引用多个文档时，使用 [1][2] 格式
- 引用标记必须紧跟在引用内容的句子末尾，在句号、问号等标点之前
- 不要在引用标记后添加额外空格

示例：
- 人工智能是计算机科学的一个分支[1]，它研究如何使计算机模拟人类的智能行为[2]。
- 根据文档内容，这个问题有两种解决方案[1][3]。

你将获得：
- 用户的问题
- 从知识库中检索到的相关文档片段（带编号）
- 对话历史（如果有的话）

请基于这些信息生成回答，并确保正确添加引用标记。"""


@dataclass
class QAResult:
    answer: str
    sources: List[SourceReference]
    related_documents: List[str]
    cited_references: List[int]
    retrieval_time_ms: float
    llm_time_ms: float
    total_time_ms: float


class QAService:
    def __init__(
        self,
        vector_service: VectorService,
        conversation_service: ConversationService,
    ):
        self.vector_service = vector_service
        self.conversation_service = conversation_service
        
        self._llm = None
        self._embeddings = None
    
    @property
    def llm(self):
        if self._llm is None:
            self._llm = ChatOpenAI(
                model=settings.LLM_MODEL,
                api_key=settings.LLM_API_KEY,
                base_url=settings.LLM_BASE_URL,
                temperature=0.1,
            )
        return self._llm
    
    def _build_context(self, chunks: List[RetrievedChunk]) -> str:
        if not chunks:
            return "没有找到相关文档。"
        
        parts = []
        for i, chunk in enumerate(chunks, 1):
            source = chunk.metadata.get("filename", "未知文档")
            parts.append(f"【文档{i} - {source}】\n{chunk.content}")
        
        return "\n\n".join(parts)
    
    def _build_messages(
        self,
        question: str,
        context: str,
        history: List[Dict[str, str]],
    ) -> List:
        messages = [SystemMessage(content=SYSTEM_PROMPT)]
        
        for msg in history:
            role = msg.get("role", "").lower()
            content = msg.get("content", "")
            if not content:
                continue
            if role == "user":
                messages.append(HumanMessage(content=content))
            elif role == "assistant":
                messages.append(AIMessage(content=content))
        
        if context and context != "没有找到相关文档。":
            context_prompt = f"以下是从知识库中检索到的相关文档：\n\n{context}\n\n"
        else:
            context_prompt = "（知识库中未找到相关文档）\n\n"
        
        final_prompt = f"{context_prompt}请回答用户的问题：{question}"
        messages.append(HumanMessage(content=final_prompt))
        
        return messages
    
    def _extract_cited_references(self, answer: str) -> List[int]:
        pattern = r'\[(\d+)\]'
        matches = re.findall(pattern, answer)
        cited = []
        for match in matches:
            try:
                ref_num = int(match)
                if ref_num not in cited:
                    cited.append(ref_num)
            except ValueError:
                pass
        return cited
    
    def _build_source_references(
        self,
        chunks: List[RetrievedChunk],
    ) -> List[SourceReference]:
        sources = []
        for i, chunk in enumerate(chunks, 1):
            sources.append(SourceReference(
                doc_id=chunk.metadata.get("doc_id", ""),
                filename=chunk.metadata.get("filename", "未知文档"),
                content=chunk.content,
                score=round(chunk.score, 4),
                chunk_index=chunk.metadata.get("chunk_index"),
            ))
        return sources
    
    def _get_related_docs(self, chunks: List[RetrievedChunk]) -> List[str]:
        docs = set()
        for chunk in chunks:
            if chunk.metadata.get("filename"):
                docs.add(chunk.metadata["filename"])
        return list(docs)
    
    def _compress_history(
        self,
        history: List[Dict[str, str]],
        max_tokens: int = 2000,
    ) -> List[Dict[str, str]]:
        if not history:
            return []
        
        total_chars = sum(len(m["content"]) for m in history)
        if total_chars <= max_tokens * 4:
            return history
        
        compressed = []
        current_chars = 0
        
        for msg in reversed(history):
            msg_chars = len(msg["content"])
            if current_chars + msg_chars > max_tokens * 4 and compressed:
                break
            compressed.insert(0, msg)
            current_chars += msg_chars
        
        return compressed
    
    def _build_condensed_question(
        self,
        question: str,
        history: List[Dict[str, str]],
    ) -> str:
        if not history:
            return question
        
        user_messages = [m["content"] for m in history if m["role"] == "user"]
        if user_messages:
            recent_context = " ".join(user_messages[-2:])
            return f"{recent_context} {question}"
        
        return question
    
    async def answer(
        self,
        question: str,
        conversation_id: Optional[str] = None,
        top_k: Optional[int] = None,
    ) -> QAResult:
        total_start = time.time()
        
        conv = self.conversation_service.get_conversation(conversation_id)
        actual_conversation_id = conv.id
        
        history = self.conversation_service.format_history(actual_conversation_id)
        compressed_history = self._compress_history(history)
        
        condensed_question = self._build_condensed_question(question, compressed_history)
        
        retrieval_start = time.time()
        retrieved_chunks = await self.vector_service.search(
            query=condensed_question,
            top_k=top_k,
        )
        retrieval_time_ms = (time.time() - retrieval_start) * 1000
        
        context = self._build_context(retrieved_chunks)
        
        messages = self._build_messages(question, context, compressed_history)
        
        llm_start = time.time()
        response = await self.llm.ainvoke(messages)
        answer = response.content
        llm_time_ms = (time.time() - llm_start) * 1000
        
        self.conversation_service.add_message(actual_conversation_id, "user", question)
        self.conversation_service.add_message(actual_conversation_id, "assistant", answer)
        
        sources = self._build_source_references(retrieved_chunks)
        related_docs = self._get_related_docs(retrieved_chunks)
        cited_references = self._extract_cited_references(answer)
        
        total_time_ms = (time.time() - total_start) * 1000
        
        return QAResult(
            answer=answer,
            sources=sources,
            related_documents=related_docs,
            cited_references=cited_references,
            retrieval_time_ms=round(retrieval_time_ms, 2),
            llm_time_ms=round(llm_time_ms, 2),
            total_time_ms=round(total_time_ms, 2),
        )
    
    async def search_only(
        self,
        query: str,
        top_k: Optional[int] = None,
    ) -> List[Dict[str, Any]]:
        chunks = await self.vector_service.search(query=query, top_k=top_k)
        
        results = []
        for i, chunk in enumerate(chunks, 1):
            results.append({
                "index": i,
                "content": chunk.content,
                "filename": chunk.metadata.get("filename", "未知文档"),
                "doc_id": chunk.metadata.get("doc_id", ""),
                "score": round(chunk.score, 4),
                "chunk_index": chunk.metadata.get("chunk_index"),
            })
        
        return results
