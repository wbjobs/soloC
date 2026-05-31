import { ChunkStartPayload } from './types';

interface UploadSession {
  startPayload: ChunkStartPayload;
  chunks: Map<number, string>;
  receivedChunks: number;
  startedAt: number;
}

class ChunkManager {
  private uploads: Map<string, UploadSession> = new Map();
  private readonly MAX_UPLOAD_AGE = 5 * 60 * 1000;
  private readonly CHUNK_SIZE = 64 * 1024;

  constructor() {
    setInterval(() => this.cleanupOldSessions(), 60000);
  }

  getChunkSize(): number {
    return this.CHUNK_SIZE;
  }

  startUpload(payload: ChunkStartPayload): boolean {
    if (this.uploads.has(payload.uploadId)) {
      return false;
    }

    this.uploads.set(payload.uploadId, {
      startPayload: payload,
      chunks: new Map(),
      receivedChunks: 0,
      startedAt: Date.now()
    });

    console.log(`[ChunkManager] Started upload: ${payload.uploadId}, chunks: ${payload.totalChunks}, size: ${payload.totalSize}`);
    return true;
  }

  receiveChunk(uploadId: string, chunkIndex: number, data: string): { complete: boolean; assembled?: string } {
    const session = this.uploads.get(uploadId);
    if (!session) {
      return { complete: false };
    }

    if (!session.chunks.has(chunkIndex)) {
      session.chunks.set(chunkIndex, data);
      session.receivedChunks++;
    }

    console.log(`[ChunkManager] Received chunk ${chunkIndex}/${session.startPayload.totalChunks} for ${uploadId}, total: ${session.receivedChunks}`);

    if (session.receivedChunks === session.startPayload.totalChunks) {
      const assembled = this.assembleChunks(session);
      return { complete: true, assembled };
    }

    return { complete: false };
  }

  private assembleChunks(session: UploadSession): string {
    const sortedChunks: string[] = [];
    for (let i = 0; i < session.startPayload.totalChunks; i++) {
      const chunk = session.chunks.get(i);
      if (chunk === undefined) {
        throw new Error(`Missing chunk ${i} for upload ${session.startPayload.uploadId}`);
      }
      sortedChunks.push(chunk);
    }
    return sortedChunks.join('');
  }

  getSession(uploadId: string): UploadSession | undefined {
    return this.uploads.get(uploadId);
  }

  removeSession(uploadId: string): void {
    this.uploads.delete(uploadId);
    console.log(`[ChunkManager] Removed upload session: ${uploadId}`);
  }

  private cleanupOldSessions(): void {
    const now = Date.now();
    for (const [uploadId, session] of this.uploads.entries()) {
      if (now - session.startedAt > this.MAX_UPLOAD_AGE) {
        this.uploads.delete(uploadId);
        console.log(`[ChunkManager] Cleaned up stale upload: ${uploadId}`);
      }
    }
  }

  splitIntoChunks(data: string): string[] {
    const chunks: string[] = [];
    for (let i = 0; i < data.length; i += this.CHUNK_SIZE) {
      chunks.push(data.substring(i, i + this.CHUNK_SIZE));
    }
    return chunks;
  }

  shouldUseChunking(dataSize: number): boolean {
    return dataSize > this.CHUNK_SIZE;
  }
}

export const chunkManager = new ChunkManager();
