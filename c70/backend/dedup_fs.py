import os
import sys
import stat
import errno
import threading
import time
from fuse import FUSE, FuseOSError, Operations
from collections import defaultdict

class DedupFS(Operations):
    def __init__(self, file_indexer):
        self.file_indexer = file_indexer
        self.fd = 0
        self._fd_lock = threading.Lock()
        
        self._readdir_cache = {}
        self._readdir_cache_time = 0
        self._cache_timeout = 5.0
        
        self._attr_cache = {}
        self._attr_cache_time = {}
        self._attr_cache_timeout = 2.0
        
        self._mount_thread = None
        self._mount_event = threading.Event()

    def _get_hash_from_path(self, path):
        if path == '/':
            return None
        parts = path.strip('/').split('/')
        if len(parts) >= 1:
            return parts[0]
        return None

    def getattr(self, path, fh=None):
        if path == '/':
            return {
                'st_mode': stat.S_IFDIR | 0o755,
                'st_nlink': 2,
                'st_size': 4096,
                'st_mtime': time.time()
            }
        
        file_hash = self._get_hash_from_path(path)
        if not file_hash:
            raise FuseOSError(errno.ENOENT)
        
        current_time = time.time()
        if file_hash in self._attr_cache:
            if current_time - self._attr_cache_time.get(file_hash, 0) < self._attr_cache_timeout:
                return self._attr_cache[file_hash]
        
        paths = self.file_indexer.index.get_files_by_hash(file_hash)
        if not paths:
            raise FuseOSError(errno.ENOENT)
        
        first_path = paths[0]
        try:
            st = os.stat(first_path)
            result = {
                'st_mode': stat.S_IFREG | 0o444,
                'st_nlink': 1,
                'st_size': st.st_size,
                'st_mtime': st.st_mtime
            }
            self._attr_cache[file_hash] = result
            self._attr_cache_time[file_hash] = current_time
            return result
        except:
            raise FuseOSError(errno.ENOENT)

    def readdir(self, path, fh):
        dirents = ['.', '..']
        if path == '/':
            current_time = time.time()
            if current_time - self._readdir_cache_time < self._cache_timeout:
                dirents.extend(self._readdir_cache)
            else:
                hashes = self.file_indexer.get_all_hashes()
                self._readdir_cache = hashes[:2000]
                self._readdir_cache_time = current_time
                dirents.extend(self._readdir_cache)
        return dirents

    def read(self, path, size, offset, fh):
        file_hash = self._get_hash_from_path(path)
        if not file_hash:
            raise FuseOSError(errno.ENOENT)
        
        paths = self.file_indexer.index.get_files_by_hash(file_hash)
        if not paths:
            raise FuseOSError(errno.ENOENT)
        
        first_path = paths[0]
        try:
            with open(first_path, 'rb') as f:
                f.seek(offset)
                return f.read(size)
        except:
            raise FuseOSError(errno.EIO)

    def open(self, path, flags):
        with self._fd_lock:
            self.fd += 1
            return self.fd

    def release(self, path, fh):
        return 0

    def readlink(self, path):
        file_hash = self._get_hash_from_path(path)
        if not file_hash:
            raise FuseOSError(errno.ENOENT)
        
        paths = self.file_indexer.index.get_files_by_hash(file_hash)
        if paths:
            return paths[0]
        raise FuseOSError(errno.ENOENT)
    
    def statfs(self, path):
        return {
            'f_bsize': 4096,
            'f_frsize': 4096,
            'f_blocks': 1000000,
            'f_bfree': 500000,
            'f_bavail': 500000,
            'f_files': 100000,
            'f_ffree': 50000,
            'f_favail': 50000,
            'f_flag': 0,
            'f_namemax': 255
        }

def mount_fs_in_thread(file_indexer, mount_point):
    fs = DedupFS(file_indexer)
    try:
        FUSE(fs, mount_point, foreground=True, nothreads=False)
    except Exception as e:
        print(f"FUSE mount error: {e}")
