import * as protobuf from 'protobufjs';
import path from 'path';

export interface TimeSeries {
  taskId: string;
  data: number[];
  samplingRate: number;
  startFrequency: number;
  endFrequency: number;
  dmMin: number;
  dmMax: number;
  timestamp: number;
  sourceName: string;
}

export interface ProcessingTask {
  taskId: string;
  signalData: TimeSeries;
  submittedAt: number;
}

export interface Candidate {
  period: number;
  snr: number;
  dm: number;
  significance: number;
  pulseCount: number;
}

export interface RFIInfo {
  frequencyHz: number;
  binIndex: number;
  magnitude: number;
  threshold: number;
  flagged: boolean;
}

export interface ProcessingResult {
  taskId: string;
  candidates: Candidate[];
  startedAt: number;
  completedAt: number;
  processingTimeMs: number;
  initialSnr: number;
  finalSnr: number;
  status: string;
  errorMessage?: string;
  rfiRemoved: boolean;
  rfiCount: number;
  rfiInfo: RFIInfo[];
}

export interface TaskStatusResponse {
  taskId: string;
  status: string;
  progress: number;
  submittedAt: number;
  startedAt?: number;
  completedAt?: number;
  candidateCount?: number;
}

class ProtobufLoader {
  private root: protobuf.Root | null = null;

  async load(): Promise<void> {
    if (this.root) return;
    
    const protoPath = path.join(__dirname, '..', 'proto', 'signal.proto');
    this.root = await protobuf.load(protoPath);
  }

  private getRoot(): protobuf.Root {
    if (!this.root) {
      throw new Error('Protobuf not loaded. Call load() first.');
    }
    return this.root;
  }

  encodeProcessingTask(task: ProcessingTask): Buffer {
    const ProcessingTask = this.getRoot().lookupType('radiosignal.ProcessingTask');
    const message = ProcessingTask.create({
      taskId: task.taskId,
      signalData: {
        taskId: task.signalData.taskId,
        data: task.signalData.data,
        samplingRate: task.signalData.samplingRate,
        startFrequency: task.signalData.startFrequency,
        endFrequency: task.signalData.endFrequency,
        dmMin: task.signalData.dmMin,
        dmMax: task.signalData.dmMax,
        timestamp: task.signalData.timestamp,
        sourceName: task.signalData.sourceName,
      },
      submittedAt: task.submittedAt,
    });
    return Buffer.from(ProcessingTask.encode(message).finish());
  }

  decodeProcessingTask(buffer: Buffer): ProcessingTask {
    const ProcessingTask = this.getRoot().lookupType('radiosignal.ProcessingTask');
    const decoded = ProcessingTask.decode(buffer) as any;
    return {
      taskId: decoded.taskId,
      signalData: {
        taskId: decoded.signalData.taskId,
        data: Array.from(decoded.signalData.data || []),
        samplingRate: decoded.signalData.samplingRate,
        startFrequency: decoded.signalData.startFrequency,
        endFrequency: decoded.signalData.endFrequency,
        dmMin: decoded.signalData.dmMin,
        dmMax: decoded.signalData.dmMax,
        timestamp: decoded.signalData.timestamp ? decoded.signalData.timestamp.toNumber() : 0,
        sourceName: decoded.signalData.sourceName,
      },
      submittedAt: decoded.submittedAt ? decoded.submittedAt.toNumber() : 0,
    };
  }

  encodeProcessingResult(result: ProcessingResult): Buffer {
    const ProcessingResult = this.getRoot().lookupType('radiosignal.ProcessingResult');
    const message = ProcessingResult.create({
      taskId: result.taskId,
      candidates: result.candidates.map(c => ({
        period: c.period,
        snr: c.snr,
        dm: c.dm,
        significance: c.significance,
        pulseCount: c.pulseCount,
      })),
      startedAt: result.startedAt,
      completedAt: result.completedAt,
      processingTimeMs: result.processingTimeMs,
      initialSnr: result.initialSnr,
      finalSnr: result.finalSnr,
      status: result.status,
      errorMessage: result.errorMessage,
      rfiRemoved: result.rfiRemoved,
      rfiCount: result.rfiCount,
      rfiInfo: (result.rfiInfo || []).map(r => ({
        frequencyHz: r.frequencyHz,
        binIndex: r.binIndex,
        magnitude: r.magnitude,
        threshold: r.threshold,
        flagged: r.flagged,
      })),
    });
    return Buffer.from(ProcessingResult.encode(message).finish());
  }

  decodeProcessingResult(buffer: Buffer): ProcessingResult {
    const ProcessingResult = this.getRoot().lookupType('radiosignal.ProcessingResult');
    const decoded = ProcessingResult.decode(buffer) as any;
    return {
      taskId: decoded.taskId,
      candidates: Array.from(decoded.candidates || []).map((c: any) => ({
        period: c.period,
        snr: c.snr,
        dm: c.dm,
        significance: c.significance,
        pulseCount: c.pulseCount,
      })),
      startedAt: decoded.startedAt ? decoded.startedAt.toNumber() : 0,
      completedAt: decoded.completedAt ? decoded.completedAt.toNumber() : 0,
      processingTimeMs: decoded.processingTimeMs,
      initialSnr: decoded.initialSnr,
      finalSnr: decoded.finalSnr,
      status: decoded.status,
      errorMessage: decoded.errorMessage,
      rfiRemoved: decoded.rfiRemoved || false,
      rfiCount: decoded.rfiCount || 0,
      rfiInfo: Array.from(decoded.rfiInfo || []).map((r: any) => ({
        frequencyHz: r.frequencyHz,
        binIndex: r.binIndex,
        magnitude: r.magnitude,
        threshold: r.threshold,
        flagged: r.flagged,
      })),
    };
  }
}

export const protobufLoader = new ProtobufLoader();
