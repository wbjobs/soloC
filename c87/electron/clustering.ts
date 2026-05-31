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
  }
  return db;
};

const levenshteinDistance = (a: string, b: string): number => {
  const matrix = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  
  for (let j = 0; j <= b.length; j++) {
    matrix[0][j] = j;
  }
  
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  
  return matrix[a.length][b.length];
};

const similarity = (a: string, b: string): number => {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshteinDistance(a, b) / maxLen;
};

interface Point {
  id: number;
  message: string;
  timestamp: number;
  level: string;
}

const dbscan = (points: Point[], eps: number, minPts: number): number[][] => {
  const clusters: number[][] = [];
  const visited = new Set<number>();
  const noise = new Set<number>();

  const regionQuery = (p: Point): number[] => {
    const neighbors: number[] = [];
    for (let i = 0; i < points.length; i++) {
      const q = points[i];
      const timeDiff = Math.abs(p.timestamp - q.timestamp) / (1000 * 60);
      const msgSim = similarity(p.message, q.message);
      const levelMatch = p.level === q.level ? 1 : 0;
      
      const combinedDist = (1 - msgSim) * 0.6 + timeDiff * 0.001 + (1 - levelMatch) * 0.3;
      
      if (combinedDist < eps) {
        neighbors.push(i);
      }
    }
    return neighbors;
  };

  const expandCluster = (pIdx: number, neighbors: number[], clusterIdx: number) => {
    clusters[clusterIdx].push(pIdx);
    
    let i = 0;
    while (i < neighbors.length) {
      const qIdx = neighbors[i];
      
      if (!visited.has(qIdx)) {
        visited.add(qIdx);
        const qNeighbors = regionQuery(points[qIdx]);
        
        if (qNeighbors.length >= minPts) {
          neighbors.push(...qNeighbors.filter(n => !neighbors.includes(n)));
        }
      }
      
      if (!clusters.some(c => c.includes(qIdx))) {
        clusters[clusterIdx].push(qIdx);
      }
      
      i++;
    }
  };

  for (let i = 0; i < points.length; i++) {
    if (visited.has(i)) continue;
    
    visited.add(i);
    const neighbors = regionQuery(points[i]);
    
    if (neighbors.length < minPts) {
      noise.add(i);
    } else {
      clusters.push([]);
      expandCluster(i, neighbors, clusters.length - 1);
    }
  }

  return clusters;
};

export const setupClustering = () => {
  ipcMain.handle('get-clusters', async (_, startDate: string, endDate: string) => {
    const db = getDb();
    
    let sql = 'SELECT * FROM logs WHERE level IN (?, ?)';
    const params: any[] = ['ERROR', 'WARN'];
    
    if (startDate) {
      sql += ' AND timestamp >= ?';
      params.push(new Date(startDate).getTime());
    }
    
    if (endDate) {
      sql += ' AND timestamp <= ?';
      params.push(new Date(endDate).getTime());
    }
    
    sql += ' ORDER BY timestamp DESC LIMIT 1000';
    
    const logs = db.prepare(sql).all(...params) as LogEntry[];
    
    const points: Point[] = logs.map(log => ({
      id: log.id!,
      message: log.message,
      timestamp: log.timestamp,
      level: log.level
    }));
    
    const clusters = dbscan(points, 0.3, 3);
    
    return clusters.map((cluster, idx) => ({
      id: idx,
      size: cluster.length,
      sampleLogs: cluster.slice(0, 5).map(i => logs[i]),
      representative: logs[cluster[0]]?.message?.substring(0, 100)
    }));
  });

  ipcMain.handle('get-heatmap-data', async (_, startDate: string, endDate: string) => {
    const db = getDb();
    
    let sql = 'SELECT timestamp, level FROM logs';
    const params: any[] = [];
    const conditions: string[] = [];
    
    if (startDate) {
      conditions.push('timestamp >= ?');
      params.push(new Date(startDate).getTime());
    }
    
    if (endDate) {
      conditions.push('timestamp <= ?');
      params.push(new Date(endDate).getTime());
    }
    
    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }
    
    sql += ' ORDER BY timestamp ASC';
    
    const logs = db.prepare(sql).all(...params) as { timestamp: number; level: string }[];
    
    const heatmap: { [key: string]: { [key: string]: number } } = {};
    
    for (const log of logs) {
      const date = new Date(log.timestamp);
      const dateKey = date.toISOString().split('T')[0];
      const hour = date.getHours();
      
      if (!heatmap[dateKey]) {
        heatmap[dateKey] = {};
        for (let i = 0; i < 24; i++) {
          heatmap[dateKey][i.toString()] = 0;
        }
      }
      
      heatmap[dateKey][hour.toString()]++;
    }
    
    return heatmap;
  });
};
