import os
import hashlib
from typing import List, Dict
from sentence_transformers import SentenceTransformer
from dotenv import load_dotenv
import asyncio
import concurrent.futures


load_dotenv()


class EmbeddingGenerator:
    def __init__(self, use_local=True, model_name='all-MiniLM-L6-v2', batch_size=32):
        self.use_local = use_local
        self.model_name = model_name
        self.batch_size = batch_size
        self.model = None
        self.cache: Dict[str, List[float]] = {}
        self.executor = concurrent.futures.ThreadPoolExecutor(max_workers=2)
        
        if use_local:
            self._load_local_model()
    
    def _load_local_model(self):
        try:
            self.model = SentenceTransformer(self.model_name)
            print(f"Loaded local model: {self.model_name}")
        except Exception as e:
            print(f"Error loading local model: {e}")
            raise
    
    def _get_cache_key(self, text: str) -> str:
        return hashlib.md5(text.encode('utf-8')).hexdigest()
    
    def generate_embedding(self, text: str):
        cache_key = self._get_cache_key(text)
        if cache_key in self.cache:
            return self.cache[cache_key]
        
        if self.use_local:
            embedding = self.model.encode(text, show_progress_bar=False).tolist()
        else:
            embedding = self._generate_openai_embedding(text)
        
        self.cache[cache_key] = embedding
        return embedding
    
    def _generate_openai_embedding(self, text: str):
        try:
            from openai import OpenAI
            client = OpenAI(api_key=os.getenv('OPENAI_API_KEY'))
            response = client.embeddings.create(
                input=text,
                model="text-embedding-ada-002"
            )
            return response.data[0].embedding
        except Exception as e:
            print(f"Error with OpenAI embedding: {e}")
            raise
    
    def generate_embeddings_batch(self, texts: List[str]):
        unique_texts = {}
        text_indices = {}
        
        for idx, text in enumerate(texts):
            cache_key = self._get_cache_key(text)
            if cache_key in self.cache:
                continue
            if cache_key not in unique_texts:
                unique_texts[cache_key] = text
                text_indices[cache_key] = []
            text_indices[cache_key].append(idx)
        
        embeddings = [None] * len(texts)
        
        for idx, text in enumerate(texts):
            cache_key = self._get_cache_key(text)
            if cache_key in self.cache:
                embeddings[idx] = self.cache[cache_key]
        
        if unique_texts:
            unique_list = list(unique_texts.values())
            cache_keys = list(unique_texts.keys())
            
            if self.use_local:
                new_embeddings = self.model.encode(
                    unique_list, 
                    batch_size=self.batch_size,
                    show_progress_bar=True
                ).tolist()
            else:
                new_embeddings = [self._generate_openai_embedding(text) for text in unique_list]
            
            for cache_key, embedding in zip(cache_keys, new_embeddings):
                self.cache[cache_key] = embedding
                for idx in text_indices[cache_key]:
                    embeddings[idx] = embedding
        
        return embeddings
    
    async def generate_embeddings_batch_async(self, texts: List[str]):
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            self.executor, 
            self.generate_embeddings_batch, 
            texts
        )
    
    def get_embedding_dim(self):
        if self.use_local:
            return self.model.get_sentence_embedding_dimension()
        else:
            return 1536
    
    def clear_cache(self):
        self.cache.clear()
    
    def get_cache_size(self):
        return len(self.cache)
