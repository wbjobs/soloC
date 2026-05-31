import os
import hashlib
import json
import threading
import queue
import time
from pathlib import Path
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed

class ThreadSafeIndex:
    def __init__(self):
        self._lock = threading.RLock()
        self._file_index = {}
        self._hash_to_files = defaultdict(list)
        
    def update_file(self, file_path, file_info):
        with self._lock:
            old_hash = self._file_index.get(file_path, {}).get('hash')
            if old_hash and file_path in self._hash_to_files[old_hash]:
                self._hash_to_files[old_hash].remove(file_path)
                if not self._hash_to_files[old_hash]:
                    del self._hash_to_files[old_hash]
            
            self._file_index[file_path] = file_info
            new_hash = file_info.get('hash')
            if new_hash and file_path not in self._hash_to_files[new_hash]:
                self._hash_to_files[new_hash].append(file_path)
    
    def get_file_info(self, file_path):
        with self._lock:
            return self._file_index.get(file_path, {})
    
    def get_files_by_hash(self, file_hash):
        with self._lock:
            return list(self._hash_to_files.get(file_hash, []))
    
    def get_all_hashes(self):
        with self._lock:
            return list(self._hash_to_files.keys())
    
    def get_duplicates(self):
        with self._lock:
            return {h: list(paths) for h, paths in self._hash_to_files.items() if len(paths) > 1}
    
    def size(self):
        with self._lock:
            return len(self._file_index)
    
    def to_dict(self):
        with self._lock:
            return {
                'file_index': dict(self._file_index),
                'hash_to_files': {k: list(v) for k, v in self._hash_to_files.items()}
            }
    
    def from_dict(self, data):
        with self._lock:
            self._file_index = data.get('file_index', {})
            self._hash_to_files = defaultdict(list, data.get('hash_to_files', {}))

class FileIndexer:
    def __init__(self, cache_file='file_cache.json', max_workers=8):
        self.cache_file = cache_file
        self.max_workers = max_workers
        self.index = ThreadSafeIndex()
        
        self._indexing_lock = threading.Lock()
        self._is_indexing = False
        self._cancel_flag = threading.Event()
        self._progress = {'current': 0, 'total': 0, 'phase': 'idle'}
        
        self._load_cache()
        
    def _load_cache(self):
        if os.path.exists(self.cache_file):
            try:
                with open(self.cache_file, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    self.index.from_dict(data)
            except Exception as e:
                print(f"Failed to load cache: {e}")
    
    def _save_cache(self):
        try:
            with open(self.cache_file, 'w', encoding='utf-8') as f:
                json.dump(self.index.to_dict(), f, indent=2)
        except Exception as e:
            print(f"Failed to save cache: {e}")
    
    def compute_sha256(self, file_path, chunk_size=65536):
        sha256_hash = hashlib.sha256()
        try:
            with open(file_path, 'rb') as f:
                for chunk in iter(lambda: f.read(chunk_size), b''):
                    if self._cancel_flag.is_set():
                        return None
                    sha256_hash.update(chunk)
            return sha256_hash.hexdigest()
        except (IOError, PermissionError, OSError):
            return None
    
    def _discover_files(self, root_path):
        files = []
        for root, dirs, filenames in os.walk(root_path):
            if self._cancel_flag.is_set():
                break
            for filename in filenames:
                file_path = os.path.join(root, filename)
                try:
                    stat = os.stat(file_path)
                    files.append((file_path, stat.st_size, stat.st_mtime))
                except (IOError, OSError):
                    continue
        return files
    
    def _process_file(self, file_info):
        file_path, file_size, mtime = file_info
        
        if self._cancel_flag.is_set():
            return None
        
        cached = self.index.get_file_info(file_path)
        
        if (cached.get('size') == file_size and 
            cached.get('mtime') == mtime and
            cached.get('hash')):
            return file_path, cached
        
        file_hash = self.compute_sha256(file_path)
        if file_hash:
            new_info = {
                'size': file_size,
                'mtime': mtime,
                'hash': file_hash,
                'path': file_path
            }
            self.index.update_file(file_path, new_info)
            return file_path, new_info
        
        return None
    
    def index_directory(self, root_path, progress_callback=None):
        with self._indexing_lock:
            if self._is_indexing:
                return False
            self._is_indexing = True
        
        self._cancel_flag.clear()
        root_path = os.path.abspath(root_path)
        
        try:
            self._progress = {'current': 0, 'total': 0, 'phase': 'discovering'}
            
            files = self._discover_files(root_path)
            total_files = len(files)
            self._progress = {'current': 0, 'total': total_files, 'phase': 'hashing'}
            
            processed = 0
            save_interval = max(100, total_files // 10)
            
            with ThreadPoolExecutor(max_workers=self.max_workers) as executor:
                futures = [executor.submit(self._process_file, fi) for fi in files]
                
                for future in as_completed(futures):
                    if self._cancel_flag.is_set():
                        break
                    
                    try:
                        result = future.result(timeout=1)
                        if result:
                            processed += 1
                            self._progress['current'] = processed
                            
                            if processed % save_interval == 0:
                                self._save_cache()
                            
                            if progress_callback:
                                progress_callback(processed, total_files)
                    except Exception:
                        pass
            
            self._save_cache()
            
        finally:
            self._is_indexing = False
            self._progress = {'current': 0, 'total': 0, 'phase': 'idle'}
        
        return True
    
    def cancel_indexing(self):
        self._cancel_flag.set()
    
    def get_progress(self):
        return dict(self._progress)
    
    def is_indexing(self):
        with self._indexing_lock:
            return self._is_indexing
    
    def get_duplicates(self):
        return self.index.get_duplicates()
    
    def get_file_info(self, file_hash):
        paths = self.index.get_files_by_hash(file_hash)
        if paths:
            first_path = paths[0]
            return self.index.get_file_info(first_path)
        return {}
    
    def get_all_hashes(self):
        return self.index.get_all_hashes()
    
    def get_total_files(self):
        return self.index.size()
