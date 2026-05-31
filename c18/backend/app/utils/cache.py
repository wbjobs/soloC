import hashlib
import json
from collections import OrderedDict
from typing import Any, Optional
import time

class LRUCache:
    def __init__(self, max_size: int = 100, ttl: int = 3600):
        self.cache = OrderedDict()
        self.max_size = max_size
        self.ttl = ttl

    def get(self, key: str) -> Optional[Any]:
        if key not in self.cache:
            return None
        
        entry = self.cache[key]
        current_time = time.time()
        
        if current_time - entry['timestamp'] > self.ttl:
            del self.cache[key]
            return None
        
        self.cache.move_to_end(key)
        return entry['value']

    def put(self, key: str, value: Any):
        if key in self.cache:
            self.cache.move_to_end(key)
        else:
            if len(self.cache) >= self.max_size:
                self.cache.popitem(last=False)
        
        self.cache[key] = {
            'value': value,
            'timestamp': time.time()
        }

    def clear(self):
        self.cache.clear()

    def __contains__(self, key: str):
        return key in self.cache

class CacheManager:
    _instance = None
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._initialize()
        return cls._instance
    
    def _initialize(self):
        self.fasta_cache = LRUCache(max_size=50, ttl=1800)
        self.blast_cache = LRUCache(max_size=20, ttl=3600)
        self.sequence_cache = LRUCache(max_size=100, ttl=7200)
    
    @staticmethod
    def generate_key(*args, **kwargs) -> str:
        content = json.dumps({
            'args': args,
            'kwargs': sorted(kwargs.items())
        }, sort_keys=True)
        return hashlib.md5(content.encode()).hexdigest()
    
    def get_fasta(self, file_path: str):
        key = self.generate_key('fasta', file_path)
        return self.fasta_cache.get(key)
    
    def set_fasta(self, file_path: str, result: Any):
        key = self.generate_key('fasta', file_path)
        self.fasta_cache.put(key, result)
    
    def get_blast(self, sequence: str, program: str, database: str, 
                  evalue: float, max_hits: int):
        key = self.generate_key(
            'blast', 
            sequence, 
            program, 
            database, 
            evalue, 
            max_hits
        )
        return self.blast_cache.get(key)
    
    def set_blast(self, sequence: str, program: str, database: str, 
                  evalue: float, max_hits: int, result: Any):
        key = self.generate_key(
            'blast', 
            sequence, 
            program, 
            database, 
            evalue, 
            max_hits
        )
        self.blast_cache.put(key, result)
    
    def clear_all(self):
        self.fasta_cache.clear()
        self.blast_cache.clear()
        self.sequence_cache.clear()
