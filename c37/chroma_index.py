import chromadb
from chromadb.config import Settings
from typing import List, Dict
import uuid
import time
from llm_suggester import FeedbackStore


class ChromaIndex:
    def __init__(self, collection_name="code_smells", persist_directory="./chroma_db"):
        self.persist_directory = persist_directory
        self.client = chromadb.PersistentClient(path=persist_directory)
        self.collection_name = collection_name
        self.collection = self.client.get_or_create_collection(name=collection_name)
        self.feedback_store = FeedbackStore()
        self._ensure_sync()
    
    def _ensure_sync(self):
        time.sleep(0.1)
    
    def index_functions(self, functions: List[Dict], embeddings: List[List[float]], batch_size=100):
        total_indexed = 0
        
        for i in range(0, len(functions), batch_size):
            batch_functions = functions[i:i+batch_size]
            batch_embeddings = embeddings[i:i+batch_size]
            
            ids = []
            documents = []
            metadatas = []
            
            for j, func in enumerate(batch_functions):
                func_id = str(uuid.uuid4())
                ids.append(func_id)
                
                doc_text = f"Function: {func['name']}\nFile: {func['file']}\nLines: {func['start_line']}-{func['end_line']}\n\n{func['code']}"
                documents.append(doc_text)
                
                metadata = {
                    'name': str(func['name']),
                    'file': str(func['file']),
                    'full_path': str(func['full_path']),
                    'start_line': int(func['start_line']),
                    'end_line': int(func['end_line']),
                    'param_count': int(func['param_count']),
                    'line_count': int(func['line_count']),
                    'code_length': int(len(func['code'])),
                    'code': str(func['code'])
                }
                metadatas.append(metadata)
            
            self.collection.add(
                ids=ids,
                embeddings=batch_embeddings,
                documents=documents,
                metadatas=metadatas
            )
            
            total_indexed += len(ids)
            self._ensure_sync()
        
        return total_indexed
    
    def search_similar(self, query_embedding: List[float], n_results: int = 5):
        self._ensure_sync()
        
        search_count = min(n_results * 2, 100)
        results = self.collection.query(
            query_embeddings=[query_embedding],
            n_results=search_count
        )
        
        formatted_results = []
        for i in range(len(results['ids'][0])):
            metadata = results['metadatas'][0][i]
            
            metadata['start_line'] = int(metadata['start_line'])
            metadata['end_line'] = int(metadata['end_line'])
            metadata['param_count'] = int(metadata['param_count'])
            metadata['line_count'] = int(metadata['line_count'])
            
            code_weight = self.feedback_store.get_code_weight(
                metadata['file'],
                metadata['name']
            )
            
            adjusted_distance = float(results['distances'][0][i]) / code_weight
            
            formatted_results.append({
                'id': results['ids'][0][i],
                'distance': adjusted_distance,
                'original_distance': float(results['distances'][0][i]),
                'document': results['documents'][0][i],
                'metadata': metadata,
                'feedback_weight': code_weight
            })
        
        formatted_results.sort(key=lambda x: x['distance'])
        
        return formatted_results[:n_results]
    
    def clear_collection(self):
        try:
            self.client.delete_collection(self.collection_name)
        except:
            pass
        self.collection = self.client.create_collection(name=self.collection_name)
        self._ensure_sync()
    
    def get_count(self):
        self._ensure_sync()
        return self.collection.count()
