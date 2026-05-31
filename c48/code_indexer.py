import os
import re
import json
import hashlib
from pathlib import Path
from typing import List, Dict, Optional, Callable, Any, Set, Tuple
from langchain_text_splitters import RecursiveCharacterTextSplitter, Language
from langchain_community.embeddings import HuggingFaceEmbeddings
from langchain_community.vectorstores import FAISS
from langchain_core.documents import Document
from tqdm import tqdm
import numpy as np


class IndexMetadata:
    def __init__(self, metadata_path: str):
        self.metadata_path = metadata_path
        self.files: Dict[str, Dict] = {}
        self.index_version: str = "2.0"
        self.last_updated: float = 0
        self.code_path: str = ""
        self._load()

    def _load(self):
        if os.path.exists(self.metadata_path):
            try:
                with open(self.metadata_path, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    self.files = data.get('files', {})
                    self.index_version = data.get('index_version', '1.0')
                    self.last_updated = data.get('last_updated', 0)
                    self.code_path = data.get('code_path', '')
            except Exception as e:
                print(f"加载元数据失败: {e}")

    def save(self):
        os.makedirs(os.path.dirname(self.metadata_path), exist_ok=True)
        data = {
            'files': self.files,
            'index_version': self.index_version,
            'last_updated': self.last_updated,
            'code_path': self.code_path
        }
        with open(self.metadata_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)

    def get_file_hash(self, file_path: str) -> Optional[str]:
        if os.path.exists(file_path):
            try:
                with open(file_path, 'rb') as f:
                    return hashlib.md5(f.read()).hexdigest()
            except:
                pass
        return None

    def get_file_mtime(self, file_path: str) -> float:
        if os.path.exists(file_path):
            return os.path.getmtime(file_path)
        return 0

    def add_file(self, rel_path: str, abs_path: str, file_hash: str, mtime: float, chunk_count: int):
        self.files[rel_path] = {
            'abs_path': abs_path,
            'hash': file_hash,
            'mtime': mtime,
            'chunk_count': chunk_count,
            'last_indexed': self.last_updated
        }

    def update_file(self, rel_path: str, file_hash: str, mtime: float, chunk_count: int):
        if rel_path in self.files:
            self.files[rel_path].update({
                'hash': file_hash,
                'mtime': mtime,
                'chunk_count': chunk_count,
                'last_indexed': self.last_updated
            })

    def remove_file(self, rel_path: str):
        if rel_path in self.files:
            del self.files[rel_path]

    def is_file_changed(self, rel_path: str, abs_path: str) -> Tuple[bool, str, float]:
        current_hash = self.get_file_hash(abs_path)
        current_mtime = self.get_file_mtime(abs_path)
        
        if rel_path not in self.files:
            return True, current_hash, current_mtime
        
        stored = self.files[rel_path]
        if stored.get('hash') != current_hash:
            return True, current_hash, current_mtime
        
        return False, current_hash, current_mtime


class CodeAwareSplitter:
    def __init__(self, chunk_size: int = 800, chunk_overlap: int = 150):
        self.chunk_size = chunk_size
        self.chunk_overlap = chunk_overlap
        self._init_language_splitters()

    def _init_language_splitters(self):
        self.splitters = {
            'Python': RecursiveCharacterTextSplitter.from_language(
                language=Language.PYTHON,
                chunk_size=self.chunk_size,
                chunk_overlap=self.chunk_overlap
            ),
            'JavaScript': RecursiveCharacterTextSplitter.from_language(
                language=Language.JS,
                chunk_size=self.chunk_size,
                chunk_overlap=self.chunk_overlap
            ),
            'Go': RecursiveCharacterTextSplitter.from_language(
                language=Language.GO,
                chunk_size=self.chunk_size,
                chunk_overlap=self.chunk_overlap
            )
        }
        self.default_splitter = RecursiveCharacterTextSplitter(
            chunk_size=self.chunk_size,
            chunk_overlap=self.chunk_overlap,
            separators=["\n\n", "\n", " ", ""]
        )

    def split_document(self, document: Document) -> List[Document]:
        language = document.metadata.get('language', 'Unknown')
        splitter = self.splitters.get(language, self.default_splitter)
        chunks = splitter.split_documents([document])
        
        enriched_chunks = []
        for i, chunk in enumerate(chunks):
            enriched_chunks.append(self._enrich_chunk(chunk, i, document))
        
        return enriched_chunks

    def _enrich_chunk(self, chunk: Document, chunk_idx: int, original_doc: Document) -> Document:
        content = chunk.page_content
        metadata = chunk.metadata.copy()
        metadata['chunk_index'] = chunk_idx
        
        func_names = self._extract_function_names(content, metadata.get('language', ''))
        class_names = self._extract_class_names(content, metadata.get('language', ''))
        
        if func_names:
            metadata['functions'] = ', '.join(func_names)
        if class_names:
            metadata['classes'] = ', '.join(class_names)
        
        if func_names or class_names:
            context_header = self._generate_context_header(metadata)
            new_content = f"{context_header}\n\n{content}"
            chunk = Document(page_content=new_content, metadata=metadata)
        
        return chunk

    def _extract_function_names(self, content: str, language: str) -> List[str]:
        func_names = []
        
        if language == 'Python':
            pattern = r'^def\s+(\w+)\s*\('
        elif language in ['JavaScript', 'TypeScript']:
            pattern = r'(?:function\s+(\w+)|const\s+(\w+)\s*=\s*(?:async\s+)?function|(\w+)\s*:\s*(?:async\s+)?function)\s*\('
        elif language == 'Go':
            pattern = r'^func\s+(?:\(\s*\w+\s*\*\w+\s*\)\s*)?(\w+)\s*\('
        else:
            return func_names
        
        for line in content.split('\n'):
            match = re.match(pattern, line.strip())
            if match:
                name = next((g for g in match.groups() if g), None)
                if name:
                    func_names.append(name)
        
        return func_names

    def _extract_class_names(self, content: str, language: str) -> List[str]:
        class_names = []
        
        if language == 'Python':
            pattern = r'^class\s+(\w+)'
        elif language in ['JavaScript', 'TypeScript']:
            pattern = r'^class\s+(\w+)'
        elif language == 'Go':
            pattern = r'^type\s+(\w+)\s+struct'
        else:
            return class_names
        
        for line in content.split('\n'):
            match = re.match(pattern, line.strip())
            if match:
                class_names.append(match.group(1))
        
        return class_names

    def _generate_context_header(self, metadata: Dict) -> str:
        parts = [f"File: {metadata.get('source', 'Unknown')}"]
        parts.append(f"Language: {metadata.get('language', 'Unknown')}")
        
        if metadata.get('classes'):
            parts.append(f"Classes: {metadata['classes']}")
        if metadata.get('functions'):
            parts.append(f"Functions: {metadata['functions']}")
        
        return ' | '.join(parts)

    def split_documents(self, documents: List[Document]) -> List[Document]:
        all_chunks = []
        for doc in documents:
            all_chunks.extend(self.split_document(doc))
        return all_chunks


class IncrementalCodeIndexer:
    SUPPORTED_EXTENSIONS = {
        '.py': 'Python',
        '.js': 'JavaScript',
        '.ts': 'JavaScript',
        '.jsx': 'JavaScript',
        '.tsx': 'JavaScript',
        '.go': 'Go'
    }

    def __init__(self, model_name: str = "all-MiniLM-L6-v2", batch_size: int = 50, index_path: str = None):
        self.batch_size = batch_size
        self.embeddings = HuggingFaceEmbeddings(
            model_name=model_name,
            model_kwargs={'device': 'cpu'},
            encode_kwargs={'batch_size': batch_size, 'show_progress_bar': True}
        )
        self.vector_store: Optional[FAISS] = None
        self.code_splitter = CodeAwareSplitter(chunk_size=800, chunk_overlap=150)
        self.index_path = index_path
        self.metadata: Optional[IndexMetadata] = None
        self.code_path: str = ""

    def _is_supported_file(self, file_path: Path) -> bool:
        return file_path.suffix in self.SUPPORTED_EXTENSIONS

    def _should_skip_directory(self, dir_path: Path) -> bool:
        skip_dirs = {
            'node_modules', '__pycache__', '.git', '.venv', 'venv',
            'dist', 'build', 'target', 'vendor', '.idea', '.vscode',
            'env', 'envs', '.next', 'out', 'coverage'
        }
        parts = set(dir_path.parts)
        return bool(skip_dirs & parts)

    def _get_file_size(self, file_path: Path) -> int:
        try:
            return file_path.stat().st_size
        except:
            return 0

    def _get_metadata_path(self, index_path: str) -> str:
        return os.path.join(index_path, 'index_metadata.json')

    def traverse_directory(self, root_path: str, max_file_size: int = 5 * 1024 * 1024) -> List[Document]:
        documents = []
        root = Path(root_path)

        if not root.exists():
            raise ValueError(f"目录不存在: {root_path}")

        all_files = list(root.rglob('*'))
        print(f"扫描中... 发现 {len(all_files)} 个文件")

        for file_path in tqdm(all_files, desc="处理文件"):
            if not file_path.is_file():
                continue
                
            if not self._is_supported_file(file_path):
                continue
                
            if self._should_skip_directory(file_path):
                continue
                
            file_size = self._get_file_size(file_path)
            if file_size > max_file_size:
                print(f"跳过过大文件: {file_path} ({file_size / 1024 / 1024:.1f}MB)")
                continue

            try:
                with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                    content = f.read()

                if content.strip():
                    rel_path = file_path.relative_to(root)
                    language = self.SUPPORTED_EXTENSIONS[file_path.suffix]
                    
                    doc = Document(
                        page_content=content,
                        metadata={
                            'source': str(rel_path),
                            'language': language,
                            'file_path': str(file_path),
                            'file_name': file_path.name,
                            'file_size': file_size
                        }
                    )
                    documents.append(doc)
            except Exception as e:
                print(f"读取文件失败 {file_path}: {e}")

        return documents

    def split_documents(self, documents: List[Document]) -> List[Document]:
        print(f"对 {len(documents)} 个文件进行代码感知分块...")
        return self.code_splitter.split_documents(documents)

    def _batch_iterate(self, items: List[Any], batch_size: int):
        for i in range(0, len(items), batch_size):
            yield items[i:i + batch_size]

    def _get_all_doc_ids_from_store(self) -> List[str]:
        if self.vector_store is None:
            return []
        
        docstore = self.vector_store.docstore
        ids = list(docstore._dict.keys())
        return ids

    def _get_docs_by_source(self, source_path: str) -> List[str]:
        if self.vector_store is None:
            return []
        
        matching_ids = []
        docstore = self.vector_store.docstore
        
        for doc_id, doc in docstore._dict.items():
            if doc.metadata.get('source') == source_path:
                matching_ids.append(doc_id)
        
        return matching_ids

    def _remove_docs_by_source(self, source_path: str) -> int:
        if self.vector_store is None:
            return 0
        
        ids_to_remove = self._get_docs_by_source(source_path)
        if ids_to_remove:
            self.vector_store.delete(ids_to_remove)
            return len(ids_to_remove)
        return 0

    def detect_changes(self, code_path: str) -> Dict[str, List[str]]:
        root = Path(code_path)
        current_files = set()
        
        for file_path in root.rglob('*'):
            if (file_path.is_file() and 
                self._is_supported_file(file_path) and 
                not self._should_skip_directory(file_path)):
                rel_path = str(file_path.relative_to(root))
                current_files.add(rel_path)
        
        indexed_files = set(self.metadata.files.keys()) if self.metadata else set()
        
        added = list(current_files - indexed_files)
        deleted = list(indexed_files - current_files)
        modified = []
        
        for rel_path in current_files & indexed_files:
            abs_path = str(root / rel_path)
            is_changed, _, _ = self.metadata.is_file_changed(rel_path, abs_path)
            if is_changed:
                modified.append(rel_path)
        
        return {
            'added': added,
            'modified': modified,
            'deleted': deleted
        }

    def build_index(self, documents: List[Document], code_path: str, 
                    progress_callback: Optional[Callable] = None,
                    index_path: str = None) -> FAISS:
        self.code_path = code_path
        
        if index_path:
            self.index_path = index_path
            self.metadata = IndexMetadata(self._get_metadata_path(index_path))
            self.metadata.code_path = code_path
        
        chunks = self.split_documents(documents)
        print(f"共生成 {len(chunks)} 个代码块")

        if len(chunks) == 0:
            raise ValueError("没有可索引的代码块")

        print("开始构建向量索引...")
        batches = list(self._batch_iterate(chunks, self.batch_size))
        print(f"分为 {len(batches)} 个批次处理")

        self.vector_store = None
        
        for i, batch in enumerate(tqdm(batches, desc="索引进度")):
            if self.vector_store is None:
                self.vector_store = FAISS.from_documents(batch, self.embeddings)
            else:
                texts = [doc.page_content for doc in batch]
                metadatas = [doc.metadata for doc in batch]
                embeddings = self.embeddings.embed_documents(texts)
                self.vector_store.add_embeddings(
                    list(zip(texts, embeddings)),
                    metadatas=metadatas
                )
            
            if progress_callback:
                progress = (i + 1) / len(batches)
                progress_callback(progress)

        if self.metadata:
            self.metadata.last_updated = os.path.getmtime(code_path) if os.path.exists(code_path) else 0
            for doc in documents:
                rel_path = doc.metadata['source']
                abs_path = doc.metadata['file_path']
                file_hash = self.metadata.get_file_hash(abs_path)
                mtime = self.metadata.get_file_mtime(abs_path)
                doc_chunks = [c for c in chunks if c.metadata['source'] == rel_path]
                self.metadata.add_file(rel_path, abs_path, file_hash, mtime, len(doc_chunks))
            self.metadata.save()

        print("索引构建完成！")
        return self.vector_store

    def update_index(self, code_path: str, index_path: str = None, 
                     progress_callback: Optional[Callable] = None) -> Dict[str, int]:
        if index_path:
            self.index_path = index_path
        
        if self.vector_store is None or self.metadata is None:
            raise ValueError("请先加载或构建索引")

        self.code_path = code_path
        root = Path(code_path)

        changes = self.detect_changes(code_path)
        added = changes['added']
        modified = changes['modified']
        deleted = changes['deleted']

        print(f"检测到变更: 新增 {len(added)}, 修改 {len(modified)}, 删除 {len(deleted)}")

        stats = {'added': 0, 'modified': 0, 'deleted': 0}

        if deleted:
            print("处理删除的文件...")
            for rel_path in tqdm(deleted, desc="删除"):
                removed_count = self._remove_docs_by_source(rel_path)
                self.metadata.remove_file(rel_path)
                stats['deleted'] += removed_count

        files_to_process = added + modified
        if files_to_process:
            print("处理新增和修改的文件...")
            documents = []
            
            for rel_path in tqdm(files_to_process, desc="读取文件"):
                abs_path = root / rel_path
                try:
                    with open(abs_path, 'r', encoding='utf-8', errors='ignore') as f:
                        content = f.read()
                    
                    if content.strip():
                        language = self.SUPPORTED_EXTENSIONS[abs_path.suffix]
                        doc = Document(
                            page_content=content,
                            metadata={
                                'source': str(rel_path),
                                'language': language,
                                'file_path': str(abs_path),
                                'file_name': abs_path.name,
                                'file_size': self._get_file_size(abs_path)
                            }
                        )
                        documents.append(doc)
                except Exception as e:
                    print(f"读取文件失败 {abs_path}: {e}")

            if documents:
                if modified:
                    print("移除旧的修改文件向量...")
                    for rel_path in modified:
                        self._remove_docs_by_source(rel_path)

                chunks = self.split_documents(documents)
                print(f"共生成 {len(chunks)} 个新代码块")

                batches = list(self._batch_iterate(chunks, self.batch_size))
                
                for i, batch in enumerate(tqdm(batches, desc="更新索引")):
                    texts = [doc.page_content for doc in batch]
                    metadatas = [doc.metadata for doc in batch]
                    embeddings = self.embeddings.embed_documents(texts)
                    self.vector_store.add_embeddings(
                        list(zip(texts, embeddings)),
                        metadatas=metadatas
                    )

                    if progress_callback:
                        progress = (i + 1) / len(batches) * 0.9 + 0.1
                        progress_callback(progress)

                for doc in documents:
                    rel_path = doc.metadata['source']
                    abs_path = doc.metadata['file_path']
                    file_hash = self.metadata.get_file_hash(abs_path)
                    mtime = self.metadata.get_file_mtime(abs_path)
                    doc_chunks = [c for c in chunks if c.metadata['source'] == rel_path]
                    
                    if rel_path in added:
                        self.metadata.add_file(rel_path, abs_path, file_hash, mtime, len(doc_chunks))
                        stats['added'] += len(doc_chunks)
                    else:
                        self.metadata.update_file(rel_path, file_hash, mtime, len(doc_chunks))
                        stats['modified'] += len(doc_chunks)

        self.metadata.last_updated = os.path.getmtime(code_path) if os.path.exists(code_path) else 0
        self.metadata.save()

        print(f"增量更新完成: 新增 {stats['added']} 块, 修改 {stats['modified']} 块, 删除 {stats['deleted']} 块")
        return stats

    def save_index(self, save_path: str = None):
        if self.vector_store is None:
            raise ValueError("向量库未初始化，请先构建索引")
        
        path = save_path or self.index_path
        if not path:
            raise ValueError("未指定索引保存路径")
        
        os.makedirs(path, exist_ok=True)
        self.vector_store.save_local(path)
        
        if self.metadata:
            self.metadata.save()
        
        print(f"索引已保存到: {path}")

    def load_index(self, load_path: str):
        if not os.path.exists(load_path):
            raise ValueError(f"索引目录不存在: {load_path}")
        
        print("正在加载索引...")
        self.vector_store = FAISS.load_local(
            load_path, 
            self.embeddings,
            allow_dangerous_deserialization=True
        )
        
        self.index_path = load_path
        self.metadata = IndexMetadata(self._get_metadata_path(load_path))
        self.code_path = self.metadata.code_path
        
        print(f"索引加载完成！包含 {len(self.metadata.files)} 个文件")
        return self.vector_store

    def get_index_stats(self) -> Dict:
        if self.vector_store is None or self.metadata is None:
            return {}
        
        return {
            'total_files': len(self.metadata.files),
            'total_chunks': self.vector_store.index.ntotal,
            'index_version': self.metadata.index_version,
            'last_updated': self.metadata.last_updated,
            'code_path': self.metadata.code_path
        }

    def _compute_cosine_similarity(self, vec1: np.ndarray, vec2: np.ndarray) -> float:
        return np.dot(vec1, vec2) / (np.linalg.norm(vec1) * np.linalg.norm(vec2))

    def search_mmr(self, query: str, k: int = 5, fetch_k: int = 30, lambda_mult: float = 0.7) -> List[tuple]:
        if self.vector_store is None:
            raise ValueError("向量库未初始化，请先构建或加载索引")

        candidates = self.vector_store.similarity_search_with_score(query, k=fetch_k)
        
        if not candidates:
            return []

        query_embedding = self.embeddings.embed_query(query)
        query_embedding = np.array(query_embedding)

        selected = []
        selected_embeddings = []
        candidate_docs = [doc for doc, _ in candidates]
        candidate_scores = [score for _, score in candidates]
        candidate_embeddings = [
            np.array(self.embeddings.embed_query(doc.page_content))
            for doc in candidate_docs
        ]

        for _ in range(min(k, len(candidates))):
            best_score = -float('inf')
            best_idx = -1

            for idx in range(len(candidate_docs)):
                if idx in [s[0] for s in selected]:
                    continue

                relevance = 1 - candidate_scores[idx]
                
                diversity = 0
                if selected_embeddings:
                    similarities = [
                        self._compute_cosine_similarity(candidate_embeddings[idx], se)
                        for se in selected_embeddings
                    ]
                    diversity = max(similarities) if similarities else 0

                mmr_score = lambda_mult * relevance - (1 - lambda_mult) * diversity

                if mmr_score > best_score:
                    best_score = mmr_score
                    best_idx = idx

            if best_idx >= 0:
                selected.append((best_idx, candidate_docs[best_idx], candidate_scores[best_idx]))
                selected_embeddings.append(candidate_embeddings[best_idx])

        return [(doc, score) for _, doc, score in selected]

    def _rerank_results(self, query: str, results: List[tuple]) -> List[tuple]:
        query_lower = query.lower()
        query_terms = set(re.findall(r'\w+', query_lower))
        
        reranked = []
        for doc, score in results:
            content_lower = doc.page_content.lower()
            
            term_matches = sum(1 for term in query_terms if term in content_lower)
            term_score = term_matches / max(len(query_terms), 1)
            
            metadata_str = ' '.join(str(v).lower() for v in doc.metadata.values())
            metadata_match = sum(1 for term in query_terms if term in metadata_str) * 0.1
            
            final_score = score * (1 - term_score * 0.3 - metadata_match)
            reranked.append((doc, final_score, term_score + metadata_match))
        
        reranked.sort(key=lambda x: (x[2], 1 - x[1]), reverse=True)
        return [(doc, score) for doc, score, _ in reranked]

    def search(self, query: str, k: int = 5, use_mmr: bool = True, use_rerank: bool = True) -> List[tuple]:
        if self.vector_store is None:
            raise ValueError("向量库未初始化，请先构建或加载索引")

        if use_mmr:
            results = self.search_mmr(query, k=k, fetch_k=max(30, k * 3), lambda_mult=0.7)
        else:
            results = self.vector_store.similarity_search_with_score(query, k=k)

        if use_rerank:
            results = self._rerank_results(query, results)

        return results

    def search_with_scores(self, query: str, k: int = 5, use_mmr: bool = True, use_rerank: bool = True) -> List[tuple]:
        return self.search(query, k=k, use_mmr=use_mmr, use_rerank=use_rerank)


def index_codebase(code_path: str, index_save_path: str, batch_size: int = 50):
    indexer = IncrementalCodeIndexer(batch_size=batch_size, index_path=index_save_path)
    
    print(f"遍历目录: {code_path}")
    documents = indexer.traverse_directory(code_path)
    print(f"找到 {len(documents)} 个代码文件")
    
    if len(documents) == 0:
        print("没有找到支持的代码文件")
        return
    
    indexer.build_index(documents, code_path, index_path=index_save_path)
    indexer.save_index(index_save_path)


def update_index(code_path: str, index_path: str, batch_size: int = 50):
    indexer = IncrementalCodeIndexer(batch_size=batch_size)
    indexer.load_index(index_path)
    
    print(f"检测代码变更: {code_path}")
    stats = indexer.update_index(code_path, index_path)
    indexer.save_index(index_path)
    
    print("\n变更统计:")
    print(f"  新增代码块: {stats['added']}")
    print(f"  修改代码块: {stats['modified']}")
    print(f"  删除代码块: {stats['deleted']}")


def load_and_search(index_path: str, query: str, k: int = 5, use_mmr: bool = True):
    indexer = IncrementalCodeIndexer()
    indexer.load_index(index_path)
    
    results = indexer.search_with_scores(query, k=k, use_mmr=use_mmr)
    
    print(f"\n查询: {query}")
    print(f"\n找到 {len(results)} 个相关代码块:\n")
    
    for i, (doc, score) in enumerate(results, 1):
        print(f"--- 结果 {i} (相似度: {1 - score:.4f}) ---")
        print(f"文件: {doc.metadata['source']}")
        print(f"语言: {doc.metadata['language']}")
        if doc.metadata.get('classes'):
            print(f"类: {doc.metadata['classes']}")
        if doc.metadata.get('functions'):
            print(f"函数: {doc.metadata['functions']}")
        print("代码:")
        content = doc.page_content.split('\n\n', 1)[-1] if '\n\n' in doc.page_content else doc.page_content
        print(content[:500] + "..." if len(content) > 500 else content)
        print()


if __name__ == "__main__":
    import sys
    
    if len(sys.argv) < 2:
        print("用法:")
        print("  构建索引: python code_indexer.py index <代码路径> <索引保存路径>")
        print("  更新索引: python code_indexer.py update <代码路径> <索引路径>")
        print("  查询:     python code_indexer.py search <索引路径> <查询语句> [结果数量]")
        print("  统计:     python code_indexer.py stats <索引路径>")
        sys.exit(1)
    
    command = sys.argv[1]
    
    if command == "index":
        if len(sys.argv) < 4:
            print("用法: python code_indexer.py index <代码路径> <索引保存路径>")
            sys.exit(1)
        code_path = sys.argv[2]
        index_save_path = sys.argv[3]
        index_codebase(code_path, index_save_path)
    
    elif command == "update":
        if len(sys.argv) < 4:
            print("用法: python code_indexer.py update <代码路径> <索引路径>")
            sys.exit(1)
        code_path = sys.argv[2]
        index_path = sys.argv[3]
        update_index(code_path, index_path)
    
    elif command == "search":
        if len(sys.argv) < 4:
            print("用法: python code_indexer.py search <索引路径> <查询语句> [结果数量]")
            sys.exit(1)
        index_path = sys.argv[2]
        query = sys.argv[3]
        k = int(sys.argv[4]) if len(sys.argv) > 4 else 5
        load_and_search(index_path, query, k)
    
    elif command == "stats":
        if len(sys.argv) < 3:
            print("用法: python code_indexer.py stats <索引路径>")
            sys.exit(1)
        index_path = sys.argv[2]
        indexer = IncrementalCodeIndexer()
        indexer.load_index(index_path)
        stats = indexer.get_index_stats()
        print("\n索引统计:")
        for k, v in stats.items():
            print(f"  {k}: {v}")
    
    else:
        print(f"未知命令: {command}")
