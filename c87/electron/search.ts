import { ipcMain } from 'electron';
import * as Database from 'better-sqlite3';
import * as path from 'path';
import { LogEntry } from './database';

let db: Database.Database;

const getDb = () => {
  if (!db) {
    const userData = process.env.APPDATA || 
      (process.platform === 'darwin' ? process.env.HOME + '/Library/Application Support' : '/var/local');
    const dbPath = path.join(userData, 'LogAnalyzer', 'logs.db');
    db = new Database(dbPath);
    db.exec('PRAGMA journal_mode = WAL');
    db.exec('PRAGMA synchronous = NORMAL');
    db.exec('PRAGMA cache_size = -10000');
    db.exec('PRAGMA temp_store = MEMORY');
  }
  return db;
};

const regexFilter = (logs: LogEntry[], pattern: string): LogEntry[] => {
  try {
    const regex = new RegExp(pattern, 'i');
    return logs.filter(log => regex.test(log.message) || regex.test(log.raw));
  } catch {
    return logs;
  }
};

interface SearchFilters {
  level?: string;
  source?: string;
  startDate?: number;
  endDate?: number;
  regex?: string;
}

interface SearchResult {
  logs: LogEntry[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export const setupSearch = () => {
  ipcMain.handle('search-logs', async (_, query: string, filters: SearchFilters = {}, page: number = 1, pageSize: number = 100) => {
    const db = getDb();
    
    let countSql = 'SELECT COUNT(*) as total FROM logs l';
    let dataSql = 'SELECT l.* FROM logs l';
    const params: any[] = [];
    const conditions: string[] = [];

    if (query && query.trim()) {
      countSql += ' JOIN logs_fts f ON l.id = f.rowid';
      dataSql += ' JOIN logs_fts f ON l.id = f.rowid';
      conditions.push('logs_fts MATCH ?');
      params.push(query);
    }

    if (filters.level && filters.level !== 'all') {
      conditions.push('l.level = ?');
      params.push(filters.level);
    }

    if (filters.source && filters.source !== 'all') {
      conditions.push('l.source = ?');
      params.push(filters.source);
    }

    if (filters.startDate) {
      conditions.push('l.timestamp >= ?');
      params.push(filters.startDate);
    }

    if (filters.endDate) {
      conditions.push('l.timestamp <= ?');
      params.push(filters.endDate);
    }

    if (conditions.length > 0) {
      const whereClause = ' WHERE ' + conditions.join(' AND ');
      countSql += whereClause;
      dataSql += whereClause;
    }

    dataSql += ' ORDER BY l.timestamp DESC LIMIT ? OFFSET ?';

    const countResult = db.prepare(countSql).get(...params) as { total: number };
    const total = countResult.total;

    const offset = (page - 1) * pageSize;
    let logs = db.prepare(dataSql).all(...params, pageSize, offset) as LogEntry[];

    if (filters.regex) {
      logs = regexFilter(logs, filters.regex);
    }

    const totalPages = Math.ceil(total / pageSize);

    return {
      logs,
      total,
      page,
      pageSize,
      totalPages
    };
  });

  ipcMain.handle('quick-search', async (_, query: string, limit: number = 50) => {
    const db = getDb();
    
    let logs: LogEntry[] = [];
    
    if (query && query.trim()) {
      const stmt = db.prepare(`
        SELECT l.* FROM logs l
        JOIN logs_fts f ON l.id = f.rowid
        WHERE logs_fts MATCH ?
        ORDER BY rank
        LIMIT ?
      `);
      logs = stmt.all(query, limit) as LogEntry[];
    } else {
      const stmt = db.prepare('SELECT * FROM logs ORDER BY timestamp DESC LIMIT ?');
      logs = stmt.all(limit) as LogEntry[];
    }

    return { logs, total: logs.length, page: 1, pageSize: limit, totalPages: 1 };
  });

  ipcMain.handle('get-total-logs', async () => {
    const db = getDb();
    const result = db.prepare('SELECT COUNT(*) as total FROM logs').get() as { total: number };
    return result.total;
  });
};
