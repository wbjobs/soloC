import express from 'express';
import cors from 'cors';
import { WebSocketServer, WebSocket } from 'ws';
import http from 'http';
import {
  insertMetrics,
  getMetricsByUrl,
  getAllMetrics,
  getResourcesByMetricsId,
  getStatistics,
  getUrlStatistics,
  insertAlert,
  getRecentAlerts,
  getAlertsByUrl,
  getLastAlertTime
} from './database';
import { PerformanceMetrics, AlertThresholds, AlertMessage } from './types';

const app = express();
const PORT = 3000;
const WS_PORT = 3001;

const ALERT_THRESHOLDS: AlertThresholds = {
  lcp: 4000,
  fid: 300,
  cls: 0.25
};

const ALERT_COOLDOWN = 60000;

interface QueueItem {
  metrics: PerformanceMetrics;
  resolve: (id: number) => void;
  reject: (error: Error) => void;
}

const requestQueue: QueueItem[] = [];
let isProcessing = false;
const BATCH_SIZE = 50;
const BATCH_TIMEOUT = 100;

const wss = new WebSocketServer({ port: WS_PORT });
const clients = new Set<WebSocket>();

wss.on('connection', (ws) => {
  console.log('New WebSocket client connected');
  clients.add(ws);
  
  ws.on('close', () => {
    console.log('WebSocket client disconnected');
    clients.delete(ws);
  });
  
  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
    clients.delete(ws);
  });
});

function broadcastAlert(alert: AlertMessage) {
  const message = JSON.stringify(alert);
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  }
}

function checkAndTriggerAlerts(metrics: PerformanceMetrics): AlertMessage[] {
  const alerts: AlertMessage[] = [];
  const now = Date.now();
  
  const metricChecks = [
    { key: 'lcp' as const, name: 'LCP', value: metrics.lcp, threshold: ALERT_THRESHOLDS.lcp, format: (v: number) => `${(v / 1000).toFixed(2)}s` },
    { key: 'fid' as const, name: 'FID', value: metrics.fid, threshold: ALERT_THRESHOLDS.fid, format: (v: number) => `${v.toFixed(0)}ms` },
    { key: 'cls' as const, name: 'CLS', value: metrics.cls, threshold: ALERT_THRESHOLDS.cls, format: (v: number) => v.toFixed(3) }
  ];
  
  for (const check of metricChecks) {
    if (check.value !== undefined && check.value > check.threshold) {
      const lastAlertTime = getLastAlertTime(metrics.url, check.key);
      
      if (!lastAlertTime || now - lastAlertTime > ALERT_COOLDOWN) {
        const alertMessage: AlertMessage = {
          type: 'ALERT',
          url: metrics.url,
          timestamp: now,
          metric: check.key,
          value: check.value,
          threshold: check.threshold,
          message: `${check.name} 指标异常: 当前值 ${check.format(check.value)}，阈值为 ${check.format(check.threshold)}`
        };
        
        insertAlert({
          url: metrics.url,
          timestamp: now,
          metric: check.key,
          value: check.value,
          threshold: check.threshold
        });
        
        alerts.push(alertMessage);
        broadcastAlert(alertMessage);
      }
    }
  }
  
  return alerts;
}

function processQueue() {
  if (isProcessing || requestQueue.length === 0) return;
  
  isProcessing = true;
  
  const batch = requestQueue.splice(0, Math.min(BATCH_SIZE, requestQueue.length));
  
  try {
    for (const item of batch) {
      const id = insertMetrics(item.metrics);
      checkAndTriggerAlerts(item.metrics);
      item.resolve(id);
    }
  } catch (error) {
    for (const item of batch) {
      item.reject(error as Error);
    }
  }
  
  isProcessing = false;
  
  if (requestQueue.length > 0) {
    setTimeout(processQueue, BATCH_TIMEOUT);
  }
}

function enqueueMetrics(metrics: PerformanceMetrics): Promise<number> {
  return new Promise((resolve, reject) => {
    requestQueue.push({ metrics, resolve, reject });
    
    if (requestQueue.length >= BATCH_SIZE) {
      setImmediate(processQueue);
    } else {
      setTimeout(processQueue, BATCH_TIMEOUT);
    }
  });
}

const server = http.createServer(app);

app.use(cors());
app.use(express.json({ limit: '10mb' }));

app.post('/api/metrics', async (req, res) => {
  try {
    const metrics: PerformanceMetrics = req.body;
    
    if (!metrics.url || !metrics.timestamp) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    const id = await enqueueMetrics(metrics);
    res.json({ success: true, id });
  } catch (error) {
    console.error('Error inserting metrics:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/alerts', (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 100;
    const alerts = getRecentAlerts(limit);
    res.json(alerts);
  } catch (error) {
    console.error('Error getting alerts:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/alerts/url', (req, res) => {
  try {
    const url = req.query.url as string;
    const limit = parseInt(req.query.limit as string) || 100;
    
    if (!url) {
      return res.status(400).json({ error: 'URL parameter is required' });
    }
    
    const alerts = getAlertsByUrl(url, limit);
    res.json(alerts);
  } catch (error) {
    console.error('Error getting alerts by URL:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/thresholds', (req, res) => {
  res.json(ALERT_THRESHOLDS);
});

app.get('/api/metrics', (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 100;
    const metrics = getAllMetrics(limit);
    res.json(metrics);
  } catch (error) {
    console.error('Error getting metrics:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/metrics/url', (req, res) => {
  try {
    const url = req.query.url as string;
    const limit = parseInt(req.query.limit as string) || 100;
    
    if (!url) {
      return res.status(400).json({ error: 'URL parameter is required' });
    }
    
    const metrics = getMetricsByUrl(url, limit);
    res.json(metrics);
  } catch (error) {
    console.error('Error getting metrics by URL:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/metrics/:id/resources', (req, res) => {
  try {
    const metricsId = parseInt(req.params.id);
    const resources = getResourcesByMetricsId(metricsId);
    res.json(resources);
  } catch (error) {
    console.error('Error getting resources:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/statistics', (req, res) => {
  try {
    const stats = getStatistics();
    res.json(stats);
  } catch (error) {
    console.error('Error getting statistics:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/statistics/urls', (req, res) => {
  try {
    const urlStats = getUrlStatistics();
    res.json(urlStats);
  } catch (error) {
    console.error('Error getting URL statistics:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

server.listen(PORT, () => {
  console.log(`Performance Monitor Server running on port ${PORT}`);
  console.log(`WebSocket Server running on port ${WS_PORT}`);
  console.log(`API Endpoints:`);
  console.log(`  POST /api/metrics - Submit performance metrics`);
  console.log(`  GET /api/metrics - Get all metrics`);
  console.log(`  GET /api/metrics/url?url=... - Get metrics by URL`);
  console.log(`  GET /api/metrics/:id/resources - Get resources by metrics ID`);
  console.log(`  GET /api/statistics - Get overall statistics`);
  console.log(`  GET /api/statistics/urls - Get URL statistics`);
  console.log(`  GET /api/alerts - Get recent alerts`);
  console.log(`  GET /api/alerts/url?url=... - Get alerts by URL`);
  console.log(`  GET /api/thresholds - Get alert thresholds`);
});
