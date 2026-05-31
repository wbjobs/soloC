import asyncio
from pathlib import Path

from app.services.document_service import DocumentService
from app.services.conversation_service import ConversationService
from app.services.qa_service import QAService
from app.services.vector_service import VectorService


async def test_document_service():
    print("Testing DocumentService...")
    doc_service = DocumentService()
    
    test_text = """这是第一段测试文本。这里有很多内容需要被正确分块。

这是第二段，稍微短一些。

第三段非常长，用于测试句子分割。人工智能正在快速发展。深度学习技术已经在各个领域取得了显著成果。自然语言处理是其中一个重要的研究方向。大语言模型的出现彻底改变了人机交互的方式。这些模型能够理解复杂的语言任务，包括文本生成、翻译、摘要等。

让我们继续添加更多内容，确保分块算法工作正常。"""
    
    chunks = doc_service._intelligent_split(test_text, chunk_size=100, chunk_overlap=20)
    print(f"  Generated {len(chunks)} chunks:")
    for i, chunk in enumerate(chunks):
        print(f"  [{i+1}] ({len(chunk)} chars) {chunk[:60]}...")
    
    print("  DocumentService OK\n")


async def test_conversation_service():
    print("Testing ConversationService...")
    conv_service = ConversationService()
    
    conv = conv_service.create_conversation()
    print(f"  Created conversation: {conv.id}")
    
    conv_service.add_message(conv.id, "user", "你好")
    conv_service.add_message(conv.id, "assistant", "你好！有什么可以帮助你的？")
    
    history = conv_service.format_history(conv.id)
    print(f"  History has {len(history)} messages")
    for msg in history:
        print(f"    [{msg['role']}] {msg['content']}")
    
    print("  ConversationService OK\n")


async def test_qa_service_helpers():
    print("Testing QAService helpers...")
    
    vector_service = VectorService()
    conv_service = ConversationService()
    qa_service = QAService(vector_service, conv_service)
    
    history = [
        {"role": "user", "content": "这篇文档的主题是什么？"},
        {"role": "assistant", "content": "这篇文档讨论了人工智能的发展。"},
        {"role": "user", "content": "它提到了哪些技术？"},
        {"role": "assistant", "content": "提到了深度学习和自然语言处理。"},
    ]
    
    compressed = qa_service._compress_history(history, max_tokens=100)
    print(f"  Compressed history: {len(compressed)} messages (original: {len(history)})")
    
    condensed = qa_service._build_condensed_question("详细说明一下", history)
    print(f"  Condensed question: {condensed}")
    
    print("  QAService helpers OK\n")


if __name__ == "__main__":
    asyncio.run(test_document_service())
    asyncio.run(test_conversation_service())
    asyncio.run(test_qa_service_helpers())
    print("All tests passed!")
