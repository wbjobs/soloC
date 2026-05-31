import { CHUNK_SIZE, encryptData, decryptData } from './crypto.js';

export function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export function formatSpeed(bytesPerSecond) {
  if (bytesPerSecond === 0) return '0 Bytes/s';
  const k = 1024;
  const sizes = ['Bytes/s', 'KB/s', 'MB/s', 'GB/s'];
  const i = Math.floor(Math.log(bytesPerSecond) / Math.log(k));
  return parseFloat((bytesPerSecond / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export async function readFileChunk(file, start, end) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    const blob = file.slice(start, end);
    
    reader.onload = () => resolve(new Uint8Array(reader.result));
    reader.onerror = reject;
    reader.readAsArrayBuffer(blob);
  });
}

export function createProgressTracker() {
  let startTime = null;
  let bytesTransferred = 0;
  let lastCheckTime = null;
  let lastCheckBytes = 0;

  return {
    start() {
      startTime = Date.now();
      lastCheckTime = startTime;
    },
    update(bytes) {
      bytesTransferred += bytes;
    },
    getStats() {
      const now = Date.now();
      const elapsedMs = now - startTime;
      const avgSpeed = elapsedMs > 0 ? (bytesTransferred * 1000) / elapsedMs : 0;
      
      const intervalMs = now - lastCheckTime;
      const intervalBytes = bytesTransferred - lastCheckBytes;
      const currentSpeed = intervalMs > 0 ? (intervalBytes * 1000) / intervalMs : 0;
      
      lastCheckTime = now;
      lastCheckBytes = bytesTransferred;
      
      return {
        bytesTransferred,
        avgSpeed,
        currentSpeed,
        elapsedMs
      };
    }
  };
}

export function createFileChunker(file, startByte = 0) {
  const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
  const startChunk = Math.floor(startByte / CHUNK_SIZE);
  let currentChunk = startChunk;
  
  return {
    getTotalChunks() {
      return totalChunks;
    },
    getCurrentChunk() {
      return currentChunk;
    },
    hasNext() {
      return currentChunk < totalChunks;
    },
    async getNextChunk() {
      const start = currentChunk * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, file.size);
      const chunk = await readFileChunk(file, start, end);
      currentChunk++;
      return {
        data: chunk,
        index: currentChunk - 1,
        isLast: currentChunk >= totalChunks,
        start,
        end
      };
    }
  };
}

export async function encryptChunk(data, key) {
  return await encryptData(data, key);
}

export async function decryptChunk(encryptedData, key) {
  return await decryptData(encryptedData, key);
}
