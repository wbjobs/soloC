import Database from 'better-sqlite3';
import path from 'path';
import { PerformanceMetrics, ResourceTiming, AlertRecord } from './types';

const dbPath = path.join(__dirname, '..', 'performance.db');
const db = new Database(dbPath, { timeout: 30000 });

db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('temp_store = MEMORY');
db.pragma('mmap_size = 30000000000');
db.pragma('cache_size = -20000');

db.exec(`
  CREATE TABLE IF NOT EXISTS metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    url TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    lcp REAL,
    fid REAL,
    cls REAL,
    navigation TEXT
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS resources (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    metricsId INTEGER NOT NULL,
    name TEXT NOT NULL,
    entryType TEXT NOT NULL,
    startTime REAL NOT NULL,
    duration REAL NOT NULL,
    initiatorType TEXT NOT NULL,
    transferSize INTEGER NOT NULL,
    encodedBodySize INTEGER NOT NULL,
    decodedBodySize INTEGER NOT NULL,
    domainLookupStart REAL NOT NULL,
    domainLookupEnd REAL NOT NULL,
    connectStart REAL NOT NULL,
    connectEnd REAL NOT NULL,
    secureConnectionStart REAL NOT NULL,
    requestStart REAL NOT NULL,
    responseStart REAL NOT NULL,
    responseEnd REAL NOT NULL,
    FOREIGN KEY (metricsId) REFERENCES metrics(id)
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    url TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    metric TEXT NOT NULL,
    value REAL NOT NULL,
    threshold REAL NOT NULL
  )
`);

db.exec(`CREATE INDEX IF NOT EXISTS idx_metrics_url ON metrics(url)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_metrics_timestamp ON metrics(timestamp)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_alerts_url ON alerts(url)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_alerts_timestamp ON alerts(timestamp)`);

const insertMetricsStmt = db.prepare(`
  INSERT INTO metrics (url, timestamp, lcp, fid, cls, navigation)
  VALUES (?, ?, ?, ?, ?, ?)
`);

const insertResourceStmt = db.prepare(`
  INSERT INTO resources (
    metricsId, name, entryType, startTime, duration, initiatorType,
    transferSize, encodedBodySize, decodedBodySize, domainLookupStart,
    domainLookupEnd, connectStart, connectEnd, secureConnectionStart,
    requestStart, responseStart, responseEnd
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const insertMetricsTransaction = db.transaction((metrics: PerformanceMetrics) => {
  const result = insertMetricsStmt.run(
    metrics.url,
    metrics.timestamp,
    metrics.lcp || null,
    metrics.fid || null,
    metrics.cls || null,
    metrics.navigation ? JSON.stringify(metrics.navigation) : null
  );
  
  const metricsId = result.lastInsertRowid as number;
  
  for (const resource of metrics.resources) {
    insertResourceStmt.run(
      metricsId,
      resource.name,
      resource.entryType,
      resource.startTime,
      resource.duration,
      resource.initiatorType,
      resource.transferSize,
      resource.encodedBodySize,
      resource.decodedBodySize,
      resource.domainLookupStart,
      resource.domainLookupEnd,
      resource.connectStart,
      resource.connectEnd,
      resource.secureConnectionStart,
      resource.requestStart,
      resource.responseStart,
      resource.responseEnd
    );
  }
  
  return metricsId;
});

export function insertMetrics(metrics: PerformanceMetrics): number {
  return insertMetricsTransaction(metrics);
}

export function getMetricsByUrl(url: string, limit: number = 100) {
  const stmt = db.prepare(`
    SELECT * FROM metrics
    WHERE url = ?
    ORDER BY timestamp DESC
    LIMIT ?
  `);
  
  return stmt.all(url, limit);
}

export function getAllMetrics(limit: number = 100) {
  const stmt = db.prepare(`
    SELECT * FROM metrics
    ORDER BY timestamp DESC
    LIMIT ?
  `);
  
  return stmt.all(limit);
}

export function getResourcesByMetricsId(metricsId: number) {
  const stmt = db.prepare(`
    SELECT * FROM resources
    WHERE metricsId = ?
    ORDER BY startTime ASC
  `);
  
  return stmt.all(metricsId);
}

export function getStatistics() {
  const stmt = db.prepare(`
    SELECT
      COUNT(*) as totalRecords,
      COUNT(DISTINCT url) as uniqueUrls,
      MIN(timestamp) as firstRecord,
      MAX(timestamp) as lastRecord,
      AVG(lcp) as avgLcp,
      AVG(fid) as avgFid,
      AVG(cls) as avgCls
    FROM metrics
  `);
  
  return stmt.get();
}

export function getUrlStatistics() {
  const stmt = db.prepare(`
    SELECT
      url,
      COUNT(*) as recordCount,
      AVG(lcp) as avgLcp,
      AVG(fid) as avgFid,
      AVG(cls) as avgCls,
      MAX(timestamp) as lastSeen
    FROM metrics
    GROUP BY url
    ORDER BY recordCount DESC
  `);
  
  return stmt.all();
}

const insertAlertStmt = db.prepare(`
  INSERT INTO alerts (url, timestamp, metric, value, threshold)
  VALUES (?, ?, ?, ?, ?)
`);

export function insertAlert(alert: Omit<AlertRecord, 'id'>): number {
  const result = insertAlertStmt.run(
    alert.url,
    alert.timestamp,
    alert.metric,
    alert.value,
    alert.threshold
  );
  return result.lastInsertRowid as number;
}

export function getRecentAlerts(limit: number = 100) {
  const stmt = db.prepare(`
    SELECT * FROM alerts
    ORDER BY timestamp DESC
    LIMIT ?
  `);
  return stmt.all(limit);
}

export function getAlertsByUrl(url: string, limit: number = 100) {
  const stmt = db.prepare(`
    SELECT * FROM alerts
    WHERE url = ?
    ORDER BY timestamp DESC
    LIMIT ?
  `);
  return stmt.all(url, limit);
}

const getLastAlertForUrlStmt = db.prepare(`
  SELECT MAX(timestamp) as lastAlertTime
  FROM alerts
  WHERE url = ? AND metric = ?
`);

export function getLastAlertTime(url: string, metric: string): number | null {
  const result = getLastAlertForUrlStmt.get(url, metric) as { lastAlertTime: number | null };
  return result?.lastAlertTime || null;
}

export default db;
