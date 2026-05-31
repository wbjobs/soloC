import initSqlJs, { Database } from 'sql.js';
import path from 'path';
import fs from 'fs';
import { app } from 'electron';
import { HistoryRecord } from '../shared/types';

class DatabaseManager {
  private db: Database | null = null;
  private dbPath: string = '';
  private wasmPath: string = '';

  async init(): Promise<void> {
    const userData = app.getPath('userData');
    this.dbPath = path.join(userData, 'clipboard-history.db');
    this.wasmPath = path.join(
      __dirname,
      '..',
      '..',
      'node_modules',
      'sql.js',
      'dist',
      'sql-wasm.wasm'
    );

    const SQL = await initSqlJs({
      locateFile: () => this.wasmPath
    });

    if (fs.existsSync(this.dbPath)) {
      const fileBuffer = fs.readFileSync(this.dbPath);
      this.db = new SQL.Database(fileBuffer);
    } else {
      this.db = new SQL.Database();
    }

    this.initTables();
  }

  private initTables(): void {
    if (!this.db) return;

    this.db.run(`
      CREATE TABLE IF NOT EXISTS history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL,
        data TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        fromDeviceId TEXT NOT NULL,
        fromDeviceName TEXT
      )
    `);

    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_history_timestamp 
      ON history(timestamp DESC)
    `);

    this.persist();
  }

  addHistory(record: Omit<HistoryRecord, 'id'>): number {
    if (!this.db) return 0;

    const stmt = this.db.prepare(
      `INSERT INTO history (type, data, timestamp, fromDeviceId, fromDeviceName) 
       VALUES (?, ?, ?, ?, ?)`
    );

    stmt.run([
      record.type,
      record.data,
      record.timestamp,
      record.fromDeviceId,
      record.fromDeviceName || null
    ]);

    const result = this.db.exec('SELECT last_insert_rowid() as id');
    const id = result[0]?.values[0]?.[0] as number;

    this.persist();
    return id;
  }

  getHistory(limit: number = 100): HistoryRecord[] {
    if (!this.db) return [];

    const result = this.db.exec(
      `SELECT * FROM history ORDER BY timestamp DESC LIMIT ${limit}`
    );

    if (result.length === 0) return [];

    return result[0].values.map(row => ({
      id: row[0] as number,
      type: row[1] as 'text' | 'image',
      data: row[2] as string,
      timestamp: row[3] as number,
      fromDeviceId: row[4] as string,
      fromDeviceName: row[5] as string | undefined
    }));
  }

  deleteHistory(id: number): void {
    if (!this.db) return;

    this.db.run('DELETE FROM history WHERE id = ?', [id]);
    this.persist();
  }

  clearOldHistory(days: number = 30): number {
    if (!this.db) return 0;

    const cutoff = Date.now() - (days * 24 * 60 * 60 * 1000);
    const stmt = this.db.prepare('DELETE FROM history WHERE timestamp < ?');
    stmt.run([cutoff]);
    const result = this.db.exec('SELECT changes() as count');
    const count = result[0]?.values[0]?.[0] as number;
    this.persist();
    return count;
  }

  private persist(): void {
    if (!this.db || !this.dbPath) return;

    const data = this.db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(this.dbPath, buffer);
  }

  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}

export const databaseManager = new DatabaseManager();
