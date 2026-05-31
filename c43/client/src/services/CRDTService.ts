import { ref } from 'vue';

interface Operation {
  type: 'insert' | 'delete';
  position: number;
  character?: string;
  length?: number;
  id: string;
  timestamp: number;
  siteId: string;
}

interface VectorClock {
  [siteId: string]: number;
}

class CRDTDocument {
  private content: string = '';
  private operations: Operation[] = [];
  private vectorClock: VectorClock = {};
  private siteId: string;
  private localCounter: number = 0;
  private pendingOperations: Operation[] = [];
  private isOffline: boolean = false;

  constructor(siteId: string) {
    this.siteId = siteId;
    this.vectorClock[siteId] = 0;
    this.loadFromStorage();
  }

  private generateId(): string {
    return `${this.siteId}-${this.localCounter}-${Date.now()}`;
  }

  insert(position: number, character: string): Operation {
    this.localCounter++;
    this.vectorClock[this.siteId] = (this.vectorClock[this.siteId] || 0) + 1;

    const operation: Operation = {
      type: 'insert',
      position,
      character,
      id: this.generateId(),
      timestamp: Date.now(),
      siteId: this.siteId
    };

    this.applyOperation(operation);
    this.pendingOperations.push(operation);
    this.saveToStorage();

    return operation;
  }

  delete(position: number, length: number = 1): Operation {
    this.localCounter++;
    this.vectorClock[this.siteId] = (this.vectorClock[this.siteId] || 0) + 1;

    const operation: Operation = {
      type: 'delete',
      position,
      length,
      id: this.generateId(),
      timestamp: Date.now(),
      siteId: this.siteId
    };

    this.applyOperation(operation);
    this.pendingOperations.push(operation);
    this.saveToStorage();

    return operation;
  }

  private applyOperation(op: Operation): void {
    if (op.type === 'insert' && op.character) {
      const pos = Math.min(op.position, this.content.length);
      this.content = this.content.slice(0, pos) + op.character + this.content.slice(pos);
    } else if (op.type === 'delete' && op.length) {
      const pos = Math.min(op.position, this.content.length);
      const end = Math.min(pos + op.length, this.content.length);
      this.content = this.content.slice(0, pos) + this.content.slice(end);
    }
  }

  receiveRemoteOperation(remoteOp: Operation, remoteClock: VectorClock): boolean {
    const opId = remoteOp.id;
    
    if (this.operations.some(op => op.id === opId)) {
      return false;
    }

    const adjustedOp = this.adjustOperationPosition(remoteOp);
    this.applyOperation(adjustedOp);
    this.operations.push(remoteOp);

    this.vectorClock[remoteOp.siteId] = Math.max(
      this.vectorClock[remoteOp.siteId] || 0,
      remoteClock[remoteOp.siteId] || 0
    );

    this.saveToStorage();
    return true;
  }

  private adjustOperationPosition(op: Operation): Operation {
    let adjustedPosition = op.position;
    
    for (const existingOp of this.operations) {
      if (existingOp.timestamp < op.timestamp) {
        if (existingOp.type === 'insert' && existingOp.position <= adjustedPosition) {
          adjustedPosition += 1;
        } else if (existingOp.type === 'delete' && existingOp.position < adjustedPosition) {
          adjustedPosition -= existingOp.length || 1;
        }
      }
    }

    return { ...op, position: Math.max(0, adjustedPosition) };
  }

  setContent(newContent: string): void {
    this.content = newContent;
  }

  getContent(): string {
    return this.content;
  }

  getPendingOperations(): Operation[] {
    return [...this.pendingOperations];
  }

  clearPendingOperations(): void {
    this.pendingOperations = [];
  }

  getVectorClock(): VectorClock {
    return { ...this.vectorClock };
  }

  getOperations(): Operation[] {
    return [...this.operations];
  }

  setOffline(offline: boolean): void {
    this.isOffline = offline;
  }

  getIsOffline(): boolean {
    return this.isOffline;
  }

  mergeOperations(remoteOps: Operation[], remoteClock: VectorClock): void {
    const sortedOps = [...remoteOps, ...this.operations].sort((a, b) => {
      if (a.timestamp !== b.timestamp) {
        return a.timestamp - b.timestamp;
      }
      return a.siteId.localeCompare(b.siteId);
    });

    const uniqueOps = Array.from(new Map(sortedOps.map(op => [op.id, op])).values());
    this.operations = uniqueOps;
    this.rebuildContent();

    for (const siteId in remoteClock) {
      this.vectorClock[siteId] = Math.max(
        this.vectorClock[siteId] || 0,
        remoteClock[siteId]
      );
    }

    this.saveToStorage();
  }

  private rebuildContent(): void {
    const sortedOps = [...this.operations].sort((a, b) => {
      if (a.timestamp !== b.timestamp) {
        return a.timestamp - b.timestamp;
      }
      return a.siteId.localeCompare(b.siteId);
    });

    this.content = '';
    for (const op of sortedOps) {
      this.applyOperation(op);
    }
  }

  private saveToStorage(): void {
    try {
      const data = {
        content: this.content,
        operations: this.operations,
        vectorClock: this.vectorClock
      };
      localStorage.setItem(`crdt-doc-${this.siteId}`, JSON.stringify(data));
    } catch (e) {
      console.error('保存 CRDT 数据失败:', e);
    }
  }

  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem(`crdt-doc-${this.siteId}`);
      if (stored) {
        const data = JSON.parse(stored);
        this.content = data.content || '';
        this.operations = data.operations || [];
        this.vectorClock = data.vectorClock || {};
      }
    } catch (e) {
      console.error('加载 CRDT 数据失败:', e);
    }
  }

  clearStorage(): void {
    localStorage.removeItem(`crdt-doc-${this.siteId}`);
    this.content = '';
    this.operations = [];
    this.vectorClock = { [this.siteId]: 0 };
  }
}

class CRDTService {
  private document: CRDTDocument | null = null;
  private siteId: string = '';
  
  public isOffline = ref(false);
  public pendingCount = ref(0);

  init(roomId: string): void {
    this.siteId = `${roomId}-${Math.random().toString(36).substring(2, 9)}`;
    this.document = new CRDTDocument(this.siteId);
    this.isOffline.value = false;
  }

  setContent(content: string): void {
    if (this.document) {
      this.document.setContent(content);
    }
  }

  getContent(): string {
    return this.document?.getContent() || '';
  }

  insert(position: number, character: string): Operation | null {
    if (this.document) {
      const op = this.document.insert(position, character);
      this.pendingCount.value = this.document.getPendingOperations().length;
      return op;
    }
    return null;
  }

  delete(position: number, length: number = 1): Operation | null {
    if (this.document) {
      const op = this.document.delete(position, length);
      this.pendingCount.value = this.document.getPendingOperations().length;
      return op;
    }
    return null;
  }

  receiveOperation(operation: Operation, vectorClock: VectorClock): boolean {
    if (this.document) {
      const result = this.document.receiveRemoteOperation(operation, vectorClock);
      return result;
    }
    return false;
  }

  getPendingOperations(): Operation[] {
    return this.document?.getPendingOperations() || [];
  }

  clearPendingOperations(): void {
    this.document?.clearPendingOperations();
    this.pendingCount.value = 0;
  }

  getVectorClock(): VectorClock {
    return this.document?.getVectorClock() || {};
  }

  getAllOperations(): Operation[] {
    return this.document?.getOperations() || [];
  }

  syncOperations(remoteOps: Operation[], remoteClock: VectorClock): void {
    if (this.document) {
      this.document.mergeOperations(remoteOps, remoteClock);
    }
  }

  setOffline(offline: boolean): void {
    this.isOffline.value = offline;
    this.document?.setOffline(offline);
  }

  destroy(): void {
    this.document?.clearStorage();
    this.document = null;
  }
}

export const crdtService = new CRDTService();
export type { Operation, VectorClock };
