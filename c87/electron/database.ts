import { ipcMain } from 'electron';
import * as Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';

let db: Database.Database;

export interface LogEntry {
  id?: number;
  timestamp: number;
  level: string;
  message: string;
  source: string;
  host?: string;
  process?: string;
  raw: string;
}

const getUserDataPath = () => {
  const userData = process.env.APPDATA || 
    (process.platform === 'darwin' ? process.env.HOME + '/Library/Application Support' : '/var/local');
  const appDataPath = path.join(userData, 'LogAnalyzer');
  
  if (!fs.existsSync(appDataPath)) {
    fs.mkdirSync(appDataPath, { recursive: true });
  }
  
  return appDataPath;
};

export const setupDatabase = () => {
  const dbPath = path.join(getUserDataPath(), 'logs.db');
  db = new Database(dbPath);

  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA synchronous = NORMAL');
  db.exec('PRAGMA cache_size = -10000');

  db.exec(`
    CREATE TABLE IF NOT EXISTS logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp INTEGER NOT NULL,
      level TEXT NOT NULL,
      message TEXT NOT NULL,
      source TEXT NOT NULL,
      host TEXT,
      process TEXT,
      raw TEXT NOT NULL
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS logs_fts USING fts5(
      message,
      raw,
      content='logs',
      content_rowid='id'
    );

    CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON logs(timestamp);
    CREATE INDEX IF NOT EXISTS idx_logs_level ON logs(level);
    CREATE INDEX IF NOT EXISTS idx_logs_source ON logs(source);

    CREATE TABLE IF NOT EXISTS file_state (
      file_path TEXT PRIMARY KEY,
      last_processed_line INTEGER NOT NULL DEFAULT 0,
      last_processed_size INTEGER NOT NULL DEFAULT 0,
      last_updated INTEGER NOT NULL DEFAULT 0
    );
  `);

  db.exec(`
    CREATE TRIGGER IF NOT EXISTS logs_ai AFTER INSERT ON logs BEGIN
      INSERT INTO logs_fts(rowid, message, raw) VALUES (new.id, new.message, new.raw);
    END;

    CREATE TRIGGER IF NOT EXISTS logs_ad AFTER DELETE ON logs BEGIN
      INSERT INTO logs_fts(logs_fts, rowid, message, raw) VALUES ('delete', old.id, old.message, old.raw);
    END;
  `);
};

export const insertLog = (log: LogEntry): number => {
  const stmt = db.prepare(`
    INSERT INTO logs (timestamp, level, message, source, host, process, raw)
    VALUES (@timestamp, @level, @message, @source, @host, @process, @raw)
  `);
  const result = stmt.run(log);
  return result.lastInsertRowid as number;
};

export const insertLogs = (logs: LogEntry[]): void => {
  const insertMany = db.transaction((logList: LogEntry[]) => {
    const stmt = db.prepare(`
      INSERT INTO logs (timestamp, level, message, source, host, process, raw)
      VALUES (@timestamp, @level, @message, @source, @host, @process, @raw)
    `);
    for (const log of logList) {
      stmt.run(log);
    }
  });
  insertMany(logs);
};

export const searchLogsFTS = (query: string, limit: number = 100): LogEntry[] => {
  const stmt = db.prepare(`
    SELECT l.* FROM logs l
    JOIN logs_fts f ON l.id = f.rowid
    WHERE logs_fts MATCH ?
    ORDER BY rank
    LIMIT ?
  `);
  return stmt.all(query, limit) as LogEntry[];
};

export const getLogsByTimeRange = (startTime: number, endTime: number): LogEntry[] => {
  const stmt = db.prepare(`
    SELECT * FROM logs
    WHERE timestamp BETWEEN ? AND ?
    ORDER BY timestamp ASC
  `);
  return stmt.all(startTime, endTime) as LogEntry[];
};

export const getAllLogs = (limit: number = 1000): LogEntry[] => {
  const stmt = db.prepare('SELECT * FROM logs ORDER BY timestamp DESC LIMIT ?');
  return stmt.all(limit) as LogEntry[];
};

ipcMain.handle('get-all-logs', async (_, limit: number = 1000) => {
  return getAllLogs(limit);
});
