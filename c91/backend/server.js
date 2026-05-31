const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const WebSocket = require('ws');
const { Parser } = require('json2csv');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3001;
const WS_PORT = 8080;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

const upload = multer({ dest: 'uploads/' });

const db = new sqlite3.Database('./vibration.db', (err) => {
  if (err) {
    console.error('Database connection error:', err.message);
  } else {
    console.log('Connected to SQLite database');
    initDatabase();
  }
});

function getUTCTimestamp() {
  return new Date().toISOString();
}

function normalizeTimestamp(ts) {
  if (!ts) return null;
  const date = new Date(ts);
  return isNaN(date.getTime()) ? null : date.toISOString();
}

function parseLocalToUTC(localTime) {
  if (!localTime) return null;
  const date = new Date(localTime);
  if (isNaN(date.getTime())) return null;
  return date.toISOString();
}

const ALARM_LEVELS = {
  NORMAL: 'normal',
  NOTICE: 'notice',
  WARNING: 'warning',
  CRITICAL: 'critical'
};

function calculateAlarmLevel(peakValue, rmsValue, thresholds) {
  const {
    peak_notice = 30,
    peak_warning = 50,
    peak_critical = 80,
    rms_notice = 10,
    rms_warning = 20,
    rms_critical = 35
  } = thresholds || {};

  let peakLevel = ALARM_LEVELS.NORMAL;
  let rmsLevel = ALARM_LEVELS.NORMAL;

  if (peakValue >= peak_critical) peakLevel = ALARM_LEVELS.CRITICAL;
  else if (peakValue >= peak_warning) peakLevel = ALARM_LEVELS.WARNING;
  else if (peakValue >= peak_notice) peakLevel = ALARM_LEVELS.NOTICE;

  if (rmsValue >= rms_critical) rmsLevel = ALARM_LEVELS.CRITICAL;
  else if (rmsValue >= rms_warning) rmsLevel = ALARM_LEVELS.WARNING;
  else if (rmsValue >= rms_notice) rmsLevel = ALARM_LEVELS.NOTICE;

  const levelPriority = {
    [ALARM_LEVELS.CRITICAL]: 4,
    [ALARM_LEVELS.WARNING]: 3,
    [ALARM_LEVELS.NOTICE]: 2,
    [ALARM_LEVELS.NORMAL]: 1
  };

  return levelPriority[peakLevel] > levelPriority[rmsLevel] ? peakLevel : rmsLevel;
}

function calculateHealthScore(currentScore, alarmLevel) {
  const scoreDeduction = {
    [ALARM_LEVELS.CRITICAL]: 20,
    [ALARM_LEVELS.WARNING]: 10,
    [ALARM_LEVELS.NOTICE]: 5,
    [ALARM_LEVELS.NORMAL]: 0
  };
  return Math.max(0, Math.min(100, currentScore - (scoreDeduction[alarmLevel] || 0)));
}

function initDatabase() {
  db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS devices (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      location TEXT,
      status TEXT DEFAULT 'normal',
      health_score REAL DEFAULT 100,
      threshold_peak_notice REAL DEFAULT 30,
      threshold_peak_warning REAL DEFAULT 50,
      threshold_peak_critical REAL DEFAULT 80,
      threshold_rms_notice REAL DEFAULT 10,
      threshold_rms_warning REAL DEFAULT 20,
      threshold_rms_critical REAL DEFAULT 35,
      created_at TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS vibration_data (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id TEXT NOT NULL,
      timestamp TEXT,
      raw_data TEXT,
      fft_data TEXT,
      peak_value REAL,
      rms_value REAL,
      alarm_level TEXT DEFAULT 'normal',
      is_anomaly INTEGER DEFAULT 0,
      data_quality TEXT DEFAULT 'high',
      FOREIGN KEY (device_id) REFERENCES devices (id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS vibration_data_downsampled (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id TEXT NOT NULL,
      timestamp TEXT,
      peak_avg REAL,
      peak_min REAL,
      peak_max REAL,
      rms_avg REAL,
      rms_min REAL,
      rms_max REAL,
      anomaly_count INTEGER DEFAULT 0,
      sample_count INTEGER DEFAULT 0,
      window_seconds INTEGER DEFAULT 60,
      FOREIGN KEY (device_id) REFERENCES devices (id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS anomaly_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id TEXT NOT NULL,
      timestamp TEXT,
      event_type TEXT NOT NULL,
      severity TEXT NOT NULL,
      description TEXT,
      peak_value REAL,
      rms_value REAL,
      acknowledged INTEGER DEFAULT 0,
      FOREIGN KEY (device_id) REFERENCES devices (id)
    )`);

    db.run(`CREATE INDEX IF NOT EXISTS idx_vibration_timestamp ON vibration_data(timestamp)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_vibration_device ON vibration_data(device_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_downsampled_timestamp ON vibration_data_downsampled(timestamp)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_anomaly_timestamp ON anomaly_events(timestamp)`);
  });
}

const wss = new WebSocket.Server({ port: WS_PORT }, () => {
  console.log(`WebSocket server running on ws://localhost:${WS_PORT}`);
});

wss.on('connection', (ws) => {
  console.log('WebSocket client connected');
  ws.on('close', () => console.log('WebSocket client disconnected'));
});

function broadcastToClients(data) {
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(data));
    }
  });
}

function downsampleData(deviceId, callback) {
  const now = new Date();
  const windowStart = new Date(now.getTime() - 60 * 1000).toISOString();

  db.get(`
    SELECT 
      COUNT(*) as count,
      AVG(peak_value) as peak_avg,
      MIN(peak_value) as peak_min,
      MAX(peak_value) as peak_max,
      AVG(rms_value) as rms_avg,
      MIN(rms_value) as rms_min,
      MAX(rms_value) as rms_max,
      SUM(is_anomaly) as anomaly_count
    FROM vibration_data
    WHERE device_id = ? AND timestamp >= ?
  `, [deviceId, windowStart], (err, result) => {
    if (err) {
      console.error('Downsample error:', err);
      return callback && callback(err);
    }

    if (result && result.count > 0) {
      const stmt = db.prepare(`
        INSERT INTO vibration_data_downsampled 
        (device_id, timestamp, peak_avg, peak_min, peak_max, rms_avg, rms_min, rms_max, anomaly_count, sample_count)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      stmt.run(
        deviceId,
        getUTCTimestamp(),
        result.peak_avg,
        result.peak_min,
        result.peak_max,
        result.rms_avg,
        result.rms_min,
        result.rms_max,
        result.anomaly_count,
        result.count
      );
      stmt.finalize();
    }

    callback && callback(null, result);
  });
}

function cleanupOldData(deviceId, callback) {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  
  db.run(`
    DELETE FROM vibration_data 
    WHERE device_id = ? AND timestamp < ?
  `, [deviceId, sevenDaysAgo], (err) => {
    if (err) console.error('Cleanup error:', err);
    callback && callback(err);
  });
}

app.post('/api/devices', (req, res) => {
  const { 
    id, name, location,
    threshold_peak_notice, threshold_peak_warning, threshold_peak_critical,
    threshold_rms_notice, threshold_rms_warning, threshold_rms_critical
  } = req.body;

  if (!id || !name) {
    return res.status(400).json({ error: 'Device ID and name are required' });
  }

  const stmt = db.prepare(`
    INSERT OR REPLACE INTO devices 
    (id, name, location, threshold_peak_notice, threshold_peak_warning, threshold_peak_critical,
     threshold_rms_notice, threshold_rms_warning, threshold_rms_critical, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  stmt.run(
    id, name, location || '',
    threshold_peak_notice || 30,
    threshold_peak_warning || 50,
    threshold_peak_critical || 80,
    threshold_rms_notice || 10,
    threshold_rms_warning || 20,
    threshold_rms_critical || 35,
    getUTCTimestamp(),
    function(err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json({ success: true, id });
    }
  );
  stmt.finalize();
});

app.put('/api/devices/:id/thresholds', (req, res) => {
  const { id } = req.params;
  const {
    threshold_peak_notice, threshold_peak_warning, threshold_peak_critical,
    threshold_rms_notice, threshold_rms_warning, threshold_rms_critical
  } = req.body;

  db.get('SELECT * FROM devices WHERE id = ?', [id], (err, device) => {
    if (err || !device) {
      return res.status(404).json({ error: 'Device not found' });
    }

    const stmt = db.prepare(`
      UPDATE devices SET
        threshold_peak_notice = ?,
        threshold_peak_warning = ?,
        threshold_peak_critical = ?,
        threshold_rms_notice = ?,
        threshold_rms_warning = ?,
        threshold_rms_critical = ?
      WHERE id = ?
    `);
    
    stmt.run(
      threshold_peak_notice || device.threshold_peak_notice,
      threshold_peak_warning || device.threshold_peak_warning,
      threshold_peak_critical || device.threshold_peak_critical,
      threshold_rms_notice || device.threshold_rms_notice,
      threshold_rms_warning || device.threshold_rms_warning,
      threshold_rms_critical || device.threshold_rms_critical,
      id,
      function(err) {
        if (err) {
          return res.status(500).json({ error: err.message });
        }
        res.json({ success: true });
      }
    );
    stmt.finalize();
  });
});

app.get('/api/devices', (req, res) => {
  db.all('SELECT * FROM devices', [], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

app.get('/api/devices/:id', (req, res) => {
  db.get('SELECT * FROM devices WHERE id = ?', [req.params.id], (err, row) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (!row) {
      return res.status(404).json({ error: 'Device not found' });
    }
    res.json(row);
  });
});

app.post('/api/data/:deviceId', (req, res) => {
  const { deviceId } = req.params;
  const { raw_data, fft_data, peak_value, rms_value, timestamp } = req.body;

  if (!raw_data) {
    return res.status(400).json({ error: 'Raw data is required' });
  }

  const dataTimestamp = timestamp ? normalizeTimestamp(timestamp) : getUTCTimestamp();

  db.get('SELECT * FROM devices WHERE id = ?', [deviceId], (err, device) => {
    if (err || !device) {
      return res.status(404).json({ error: 'Device not found' });
    }

    const alarmLevel = calculateAlarmLevel(peak_value, rms_value, device);
    const is_anomaly = alarmLevel !== ALARM_LEVELS.NORMAL ? 1 : 0;

    const stmt = db.prepare(
      'INSERT INTO vibration_data (device_id, timestamp, raw_data, fft_data, peak_value, rms_value, alarm_level, is_anomaly) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    );
    stmt.run(deviceId, dataTimestamp, JSON.stringify(raw_data), fft_data ? JSON.stringify(fft_data) : null, 
             peak_value, rms_value, alarmLevel, is_anomaly, function(err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }

      broadcastToClients({
        type: 'vibration_data',
        device_id: deviceId,
        timestamp: dataTimestamp,
        peak_value,
        rms_value,
        alarm_level: alarmLevel,
        is_anomaly
      });

      if (is_anomaly) {
        const eventStmt = db.prepare(
          'INSERT INTO anomaly_events (device_id, timestamp, event_type, severity, description, peak_value, rms_value) VALUES (?, ?, ?, ?, ?, ?, ?)'
        );
        const description = `Alarm Level: ${alarmLevel.toUpperCase()}, Peak: ${peak_value.toFixed(2)}, RMS: ${rms_value.toFixed(2)}`;
        eventStmt.run(deviceId, dataTimestamp, 'threshold_exceeded', alarmLevel, description, peak_value, rms_value);
        eventStmt.finalize();

        const newHealth = calculateHealthScore(device.health_score, alarmLevel);
        db.run('UPDATE devices SET health_score = ?, status = ? WHERE id = ?', [newHealth, alarmLevel, deviceId]);

        broadcastToClients({
          type: 'anomaly',
          device_id: deviceId,
          timestamp: dataTimestamp,
          severity: alarmLevel,
          peak_value,
          rms_value
        });
      }

      downsampleData(deviceId);
      cleanupOldData(deviceId);

      res.json({ success: true, id: this.lastID, is_anomaly, alarm_level: alarmLevel, timestamp: dataTimestamp });
    });
    stmt.finalize();
  });
});

app.get('/api/data/:deviceId', (req, res) => {
  const { deviceId } = req.params;
  const { start_time, end_time, limit = 100, downsampled } = req.query;

  const table = downsampled === 'true' ? 'vibration_data_downsampled' : 'vibration_data';
  let query = `SELECT * FROM ${table} WHERE device_id = ?`;
  let params = [deviceId];

  const utcStartTime = parseLocalToUTC(start_time);
  const utcEndTime = parseLocalToUTC(end_time);

  if (utcStartTime) {
    query += ' AND timestamp >= ?';
    params.push(utcStartTime);
  }
  if (utcEndTime) {
    query += ' AND timestamp <= ?';
    params.push(utcEndTime);
  }
  query += ' ORDER BY timestamp DESC LIMIT ?';
  params.push(parseInt(limit));

  db.all(query, params, (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (downsampled !== 'true') {
      rows.forEach(row => {
        if (row.raw_data) row.raw_data = JSON.parse(row.raw_data);
        if (row.fft_data) row.fft_data = JSON.parse(row.fft_data);
      });
    }
    res.json(rows);
  });
});

app.get('/api/health', (req, res) => {
  db.all('SELECT id, name, location, health_score, status FROM devices', [], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

app.get('/api/anomalies', (req, res) => {
  const { device_id, limit = 50 } = req.query;
  let query = 'SELECT * FROM anomaly_events';
  let params = [];

  if (device_id) {
    query += ' WHERE device_id = ?';
    params.push(device_id);
  }
  query += ' ORDER BY timestamp DESC LIMIT ?';
  params.push(parseInt(limit));

  db.all(query, params, (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

app.post('/api/anomalies/:id/acknowledge', (req, res) => {
  db.run('UPDATE anomaly_events SET acknowledged = 1 WHERE id = ?', [req.params.id], function(err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json({ success: true });
  });
});

app.get('/api/export/:deviceId', (req, res) => {
  const { deviceId } = req.params;
  const { start_time, end_time } = req.query;

  let query = 'SELECT * FROM vibration_data WHERE device_id = ?';
  let params = [deviceId];

  const utcStartTime = parseLocalToUTC(start_time);
  const utcEndTime = parseLocalToUTC(end_time);

  if (utcStartTime) {
    query += ' AND timestamp >= ?';
    params.push(utcStartTime);
  }
  if (utcEndTime) {
    query += ' AND timestamp <= ?';
    params.push(utcEndTime);
  }
  query += ' ORDER BY timestamp ASC';

  db.all(query, params, (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }

    const data = rows.map(row => ({
      timestamp: row.timestamp,
      device_id: row.device_id,
      peak_value: row.peak_value,
      rms_value: row.rms_value,
      alarm_level: row.alarm_level,
      is_anomaly: row.is_anomaly ? 'Yes' : 'No'
    }));

    const parser = new Parser();
    const csv = parser.parse(data);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="vibration_data_${deviceId}.csv"`);
    res.send('\uFEFF' + csv);
  });
});

app.post('/api/import/:deviceId', upload.single('file'), (req, res) => {
  const { deviceId } = req.params;
  const file = req.file;

  if (!file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const filePath = file.path;
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  
  if (lines.length < 2) {
    fs.unlinkSync(filePath);
    return res.status(400).json({ error: 'Invalid CSV format' });
  }

  const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
  const timestampIdx = headers.indexOf('timestamp');
  const peakIdx = headers.indexOf('peak_value');
  const rmsIdx = headers.indexOf('rms_value');

  if (timestampIdx === -1 || peakIdx === -1 || rmsIdx === -1) {
    fs.unlinkSync(filePath);
    return res.status(400).json({ error: 'CSV must contain timestamp, peak_value, rms_value columns' });
  }

  db.get('SELECT * FROM devices WHERE id = ?', [deviceId], (err, device) => {
    if (err || !device) {
      fs.unlinkSync(filePath);
      return res.status(404).json({ error: 'Device not found' });
    }

    const records = [];
    let importedCount = 0;
    let anomalyCount = 0;

    for (let i = 1; i < lines.length; i++) {
      if (!lines[i].trim()) continue;
      const values = lines[i].split(',');
      const timestamp = normalizeTimestamp(values[timestampIdx]);
      const peak_value = parseFloat(values[peakIdx]);
      const rms_value = parseFloat(values[rmsIdx]);

      if (!timestamp || isNaN(peak_value) || isNaN(rms_value)) continue;

      const alarmLevel = calculateAlarmLevel(peak_value, rms_value, device);
      const is_anomaly = alarmLevel !== ALARM_LEVELS.NORMAL ? 1 : 0;

      records.push([deviceId, timestamp, peak_value, rms_value, alarmLevel, is_anomaly]);
      
      if (is_anomaly) anomalyCount++;
      importedCount++;
    }

    const stmt = db.prepare(`
      INSERT INTO vibration_data (device_id, timestamp, peak_value, rms_value, alarm_level, is_anomaly)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    db.serialize(() => {
      records.forEach(record => stmt.run(record));
      stmt.finalize();

      fs.unlinkSync(filePath);

      res.json({
        success: true,
        imported: importedCount,
        anomalies: anomalyCount,
        device_id: deviceId
      });
    });
  });
});

app.get('/api/report/:deviceId', (req, res) => {
  const { deviceId } = req.params;
  const { start_time, end_time, days = 7 } = req.query;

  let endTime = end_time ? new Date(end_time) : new Date();
  let startTime = start_time ? new Date(start_time) : new Date(endTime.getTime() - days * 24 * 60 * 60 * 1000);

  const params = [deviceId, startTime.toISOString(), endTime.toISOString()];

  db.get(`
    SELECT 
      COUNT(*) as total_records,
      AVG(peak_value) as peak_avg,
      MIN(peak_value) as peak_min,
      MAX(peak_value) as peak_max,
      AVG(rms_value) as rms_avg,
      MIN(rms_value) as rms_min,
      MAX(rms_value) as rms_max,
      SUM(CASE WHEN alarm_level = 'critical' THEN 1 ELSE 0 END) as critical_count,
      SUM(CASE WHEN alarm_level = 'warning' THEN 1 ELSE 0 END) as warning_count,
      SUM(CASE WHEN alarm_level = 'notice' THEN 1 ELSE 0 END) as notice_count,
      SUM(CASE WHEN is_anomaly = 1 THEN 1 ELSE 0 END) as anomaly_count
    FROM vibration_data
    WHERE device_id = ? AND timestamp >= ? AND timestamp <= ?
  `, params, (err, stats) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }

    db.get('SELECT * FROM devices WHERE id = ?', [deviceId], (err, device) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }

      db.all(`
        SELECT * FROM anomaly_events
        WHERE device_id = ? AND timestamp >= ? AND timestamp <= ?
        ORDER BY timestamp DESC
      `, params, (err, events) => {
        const report = {
          device: device,
          period: {
            start: startTime.toISOString(),
            end: endTime.toISOString(),
            days: Math.round((endTime - startTime) / (24 * 60 * 60 * 1000))
          },
          statistics: stats,
          anomaly_events: events,
          health_trend: {
            current_score: device.health_score,
            anomaly_rate: stats.total_records > 0 ? (stats.anomaly_count / stats.total_records * 100).toFixed(2) : 0,
            risk_level: stats.critical_count > 10 ? 'High' : stats.warning_count > 20 ? 'Medium' : 'Low'
          },
          recommendations: []
        };

        if (stats.critical_count > 0) {
          report.recommendations.push('建议立即停机检查，存在严重振动异常');
        }
        if (stats.warning_count > stats.total_records * 0.1) {
          report.recommendations.push('警告事件频繁，建议安排维护计划');
        }
        if (stats.peak_max > (device.threshold_peak_critical || 80) * 0.8) {
          report.recommendations.push('峰值接近临界阈值，建议检查设备平衡');
        }
        if (report.recommendations.length === 0) {
          report.recommendations.push('设备运行正常，继续保持定期监控');
        }

        res.json(report);
      });
    });
  });
});

app.put('/api/devices/:id/health-reset', (req, res) => {
  db.run('UPDATE devices SET health_score = 100, status = ? WHERE id = ?', ['normal', req.params.id], function(err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json({ success: true });
  });
});

app.listen(PORT, () => {
  console.log(`Backend server running on http://localhost:${PORT}`);
});
