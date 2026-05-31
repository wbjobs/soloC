use crate::ssh::RemoteFile;
use lru::LruCache;
use std::num::NonZeroUsize;
use std::sync::Mutex;

pub struct FileCache {
    inner: Mutex<LruCache<String, Vec<RemoteFile>>>,
}

impl FileCache {
    pub fn new(capacity: usize) -> Self {
        let capacity = NonZeroUsize::new(capacity.max(1)).unwrap();
        FileCache {
            inner: Mutex::new(LruCache::new(capacity)),
        }
    }
    
    pub fn get(&self, path: &str) -> Option<Vec<RemoteFile>> {
        let mut cache = self.inner.lock().ok()?;
        cache.get(path).cloned()
    }
    
    pub fn insert(&self, path: String, files: Vec<RemoteFile>) {
        if let Ok(mut cache) = self.inner.lock() {
            cache.put(path, files);
        }
    }
    
    pub fn invalidate(&self, path: &str) {
        if let Ok(mut cache) = self.inner.lock() {
            cache.pop(path);
        }
    }
    
    pub fn clear(&self) {
        if let Ok(mut cache) = self.inner.lock() {
            cache.clear();
        }
    }
}

impl Default for FileCache {
    fn default() -> Self {
        Self::new(100)
    }
}
