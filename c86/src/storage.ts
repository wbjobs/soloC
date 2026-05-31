import fs from 'fs-extra';
import path from 'path';
import { config } from './config';
import { ProcessingResult, Candidate, TaskStatusResponse } from './protobuf';
import { csvFormat } from 'd3-dsv';

export type TaskStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface TaskInfo {
  taskId: string;
  status: TaskStatus;
  progress: number;
  submittedAt: number;
  startedAt?: number;
  completedAt?: number;
  errorMessage?: string;
  sourceName?: string;
}

export class StorageService {
  private tasks: Map<string, TaskInfo> = new Map();
  private results: Map<string, ProcessingResult> = new Map();
  private resultsDir: string;

  constructor() {
    this.resultsDir = config.storage.resultsDir;
    this.ensureDirectories();
  }

  private ensureDirectories(): void {
    fs.ensureDirSync(this.resultsDir);
    fs.ensureDirSync(config.storage.dataDir);
  }

  createTask(taskId: string, sourceName?: string): TaskInfo {
    const taskInfo: TaskInfo = {
      taskId,
      status: 'pending',
      progress: 0,
      submittedAt: Date.now(),
      sourceName,
    };

    this.tasks.set(taskId, taskInfo);
    return taskInfo;
  }

  updateTaskStatus(taskId: string, status: TaskStatus, progress?: number): void {
    const task = this.tasks.get(taskId);
    if (!task) return;

    task.status = status;
    if (progress !== undefined) {
      task.progress = progress;
    }

    if (status === 'processing' && !task.startedAt) {
      task.startedAt = Date.now();
    }

    if (status === 'completed' || status === 'failed') {
      task.completedAt = Date.now();
    }
  }

  setTaskError(taskId: string, errorMessage: string): void {
    const task = this.tasks.get(taskId);
    if (!task) return;

    task.status = 'failed';
    task.errorMessage = errorMessage;
    task.completedAt = Date.now();
  }

  getTask(taskId: string): TaskInfo | undefined {
    return this.tasks.get(taskId);
  }

  getTaskStatus(taskId: string): TaskStatusResponse | null {
    const task = this.tasks.get(taskId);
    if (!task) return null;

    const result = this.results.get(taskId);

    return {
      taskId: task.taskId,
      status: task.status,
      progress: task.progress,
      submittedAt: task.submittedAt,
      startedAt: task.startedAt,
      completedAt: task.completedAt,
      candidateCount: result?.candidates?.length || 0,
    };
  }

  saveResult(result: ProcessingResult): void {
    this.results.set(result.taskId, result);
    this.updateTaskStatus(result.taskId, 'completed', 100);
  }

  getResult(taskId: string): ProcessingResult | undefined {
    return this.results.get(taskId);
  }

  async exportResultToCSV(taskId: string): Promise<string> {
    const result = this.results.get(taskId);
    if (!result) {
      throw new Error(`Result not found for task ${taskId}`);
    }

    const csvData = result.candidates.map((candidate, index) => ({
      rank: index + 1,
      period_s: candidate.period.toFixed(6),
      snr: candidate.snr.toFixed(3),
      dm: candidate.dm.toFixed(2),
      significance: candidate.significance.toFixed(3),
      pulse_count: candidate.pulseCount,
    }));

    const csv = csvFormat(csvData);
    const filePath = path.join(this.resultsDir, `${taskId}_candidates.csv`);

    await fs.writeFile(filePath, csv);
    return filePath;
  }

  async exportRFIToCSV(taskId: string): Promise<string> {
    const result = this.results.get(taskId);
    if (!result) {
      throw new Error(`Result not found for task ${taskId}`);
    }

    const csvData = (result.rfiInfo || []).map((rfi, index) => ({
      rank: index + 1,
      frequency_hz: rfi.frequencyHz.toFixed(2),
      bin_index: rfi.binIndex,
      magnitude: rfi.magnitude.toExponential(3),
      threshold: rfi.threshold.toExponential(3),
      flagged: rfi.flagged,
    }));

    const csv = csvFormat(csvData);
    const filePath = path.join(this.resultsDir, `${taskId}_rfi.csv`);

    await fs.writeFile(filePath, csv);
    return filePath;
  }

  async exportResultToJSON(taskId: string): Promise<string> {
    const result = this.results.get(taskId);
    if (!result) {
      throw new Error(`Result not found for task ${taskId}`);
    }

    const filePath = path.join(this.resultsDir, `${taskId}_result.json`);
    await fs.writeJSON(filePath, result, { spaces: 2 });
    return filePath;
  }

  async saveRawData(taskId: string, data: number[]): Promise<string> {
    const filePath = path.join(config.storage.dataDir, `${taskId}_raw_data.json`);
    await fs.writeJSON(filePath, data);
    return filePath;
  }

  async getRawData(taskId: string): Promise<number[] | null> {
    const filePath = path.join(config.storage.dataDir, `${taskId}_raw_data.json`);
    
    if (!await fs.pathExists(filePath)) {
      return null;
    }

    return await fs.readJSON(filePath);
  }

  getAllTasks(limit?: number): TaskInfo[] {
    const tasks = Array.from(this.tasks.values()).sort(
      (a, b) => b.submittedAt - a.submittedAt
    );

    if (limit) {
      return tasks.slice(0, limit);
    }

    return tasks;
  }

  getTaskStats(): {
    pending: number;
    processing: number;
    completed: number;
    failed: number;
    total: number;
  } {
    const stats = {
      pending: 0,
      processing: 0,
      completed: 0,
      failed: 0,
      total: this.tasks.size,
    };

    for (const task of this.tasks.values()) {
      stats[task.status]++;
    }

    return stats;
  }

  cleanupOldTasks(maxAgeMs: number = 7 * 24 * 60 * 60 * 1000): void {
    const now = Date.now();
    const tasksToDelete: string[] = [];

    for (const [taskId, task] of this.tasks.entries()) {
      if (task.completedAt && now - task.completedAt > maxAgeMs) {
        tasksToDelete.push(taskId);
      }
    }

    for (const taskId of tasksToDelete) {
      this.tasks.delete(taskId);
      this.results.delete(taskId);
    }

    console.log(`Cleaned up ${tasksToDelete.length} old tasks`);
  }
}

export const storageService = new StorageService();
