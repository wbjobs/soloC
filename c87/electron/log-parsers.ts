import { ipcMain, BrowserWindow } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { Worker } from 'worker_threads';
import * as Database from 'better-sqlite3';

let db: Database.Database;

const getDbPath = () => {
  const userData = process.env.APPDATA || 
    (process.platform === 'darwin' ? process.env.HOME + '/Library/Application Support' : '/var/local');
  return path.join(userData, 'LogAnalyzer', 'logs.db');
};

const getDb = () => {
  if (!db) {
    db = new Database(getDbPath());
    db.exec('PRAGMA journal_mode = WAL');
    db.exec('PRAGMA synchronous = NORMAL');
  }
  return db;
};

const getFileState = (filePath: string) => {
  const db = getDb();
  const stmt = db.prepare('SELECT * FROM file_state WHERE file_path = ?');
  return stmt.get(filePath) as { last_processed_line: number; last_processed_size: number } | undefined;
};

const activeWorkers = new Map<string, Worker>();

const startIndexWorker = (filePath: string, format: string, mainWindow: BrowserWindow | null) => {
  const dbPath = getDbPath();
  const fileSize = fs.statSync(filePath).size;
  const fileState = getFileState(filePath);

  let startLine = 0;
  if (fileState && fileState.last_processed_size <= fileSize) {
    startLine = fileState.last_processed_line;
  }

  const workerPath = path.join(__dirname, 'worker', 'indexer-worker.js');
  const worker = new Worker(workerPath, {
    workerData: {
      filePath,
      dbPath,
      format,
      startLine,
      fileSize
    }
  });

  activeWorkers.set(filePath, worker);

  worker.on('message', (progress) => {
    mainWindow?.webContents.send('import-progress', { filePath, ...progress });
  });

  worker.on('error', (error) => {
    mainWindow?.webContents.send('import-progress', {
      filePath,
      status: 'error',
      message: `Worker错误: ${String(error)}`,
      percentage: 0
    });
    activeWorkers.delete(filePath);
  });

  worker.on('exit', (code) => {
    activeWorkers.delete(filePath);
  });

  return worker;
};

export const setupLogParsers = () => {
  ipcMain.handle('import-logs', async (event, filePaths: string[], format: string) => {
    const mainWindow = BrowserWindow.fromWebContents(event.sender);

    try {
      let totalFiles = filePaths.length;
      let completedFiles = 0;

      for (const filePath of filePaths) {
        if (activeWorkers.has(filePath)) {
          continue;
        }
        startIndexWorker(filePath, format, mainWindow);
      }

      return { success: true, message: `已开始导入 ${filePaths.length} 个文件`, count: 0 };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('cancel-import', async (_, filePath: string) => {
    const worker = activeWorkers.get(filePath);
    if (worker) {
      await worker.terminate();
      activeWorkers.delete(filePath);
      return { success: true };
    }
    return { success: false, error: '未找到活动的Worker' };
  });

  ipcMain.handle('get-import-status', async () => {
    return {
      activeCount: activeWorkers.size,
      activeFiles: Array.from(activeWorkers.keys())
    };
  });
};
