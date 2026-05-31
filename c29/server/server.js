const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const deviceState = {
  temperature: 45,
  pressure: 8.5,
  speed: 1200,
  isRunning: true,
  operationMode: 'normal'
};

const thresholds = {
  temperature: { min: 0, max: 80 },
  pressure: { min: 5, max: 15 },
  speed: { min: 500, max: 3000 }
};

const historyData = [];
const MAX_HISTORY_SIZE = 10000;

function generateDeviceData() {
  const variation = deviceState.operationMode === 'normal' ? 0.02 :
                    deviceState.operationMode === 'warning' ? 0.08 : 0.15;

  if (deviceState.isRunning) {
    deviceState.temperature += (Math.random() - 0.48) * variation * 10;
    deviceState.pressure += (Math.random() - 0.48) * variation * 2;
    deviceState.speed += Math.floor((Math.random() - 0.48) * variation * 100);

    deviceState.temperature = Math.max(10, Math.min(95, deviceState.temperature));
    deviceState.pressure = Math.max(3, Math.min(18, deviceState.pressure));
    deviceState.speed = Math.max(300, Math.min(3500, deviceState.speed));
  }

  const alarms = [];
  if (deviceState.temperature > thresholds.temperature.max) {
    alarms.push({ type: 'temperature', level: 'critical', message: `温度过高: ${deviceState.temperature.toFixed(1)}°C`, part: 'engine' });
  } else if (deviceState.temperature < thresholds.temperature.min) {
    alarms.push({ type: 'temperature', level: 'warning', message: `温度过低: ${deviceState.temperature.toFixed(1)}°C`, part: 'engine' });
  }

  if (deviceState.pressure > thresholds.pressure.max) {
    alarms.push({ type: 'pressure', level: 'critical', message: `压力过高: ${deviceState.pressure.toFixed(2)} MPa`, part: 'pump' });
  } else if (deviceState.pressure < thresholds.pressure.min) {
    alarms.push({ type: 'pressure', level: 'warning', message: `压力过低: ${deviceState.pressure.toFixed(2)} MPa`, part: 'pump' });
  }

  if (deviceState.speed > thresholds.speed.max) {
    alarms.push({ type: 'speed', level: 'critical', message: `转速过高: ${deviceState.speed} RPM`, part: 'motor' });
  } else if (deviceState.speed < thresholds.speed.min && deviceState.isRunning) {
    alarms.push({ type: 'speed', level: 'warning', message: `转速过低: ${deviceState.speed} RPM`, part: 'motor' });
  }

  const data = {
    ...deviceState,
    alarms,
    timestamp: new Date().toISOString()
  };

  historyData.push(data);
  if (historyData.length > MAX_HISTORY_SIZE) {
    historyData.shift();
  }

  return data;
}

wss.on('connection', (ws) => {
  console.log('Client connected');

  const initialData = generateDeviceData();
  ws.send(JSON.stringify({ type: 'init', data: initialData }));

  const interval = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      const data = generateDeviceData();
      ws.send(JSON.stringify({ type: 'data', data }));
    }
  }, 1000);

  ws.on('message', (message) => {
    try {
      const parsed = JSON.parse(message);
      
      if (parsed.type === 'control') {
        const { action, value } = parsed.payload;
        
        switch (action) {
          case 'toggle':
            deviceState.isRunning = !deviceState.isRunning;
            break;
          case 'setMode':
            deviceState.operationMode = value;
            break;
          case 'setTemperature':
            deviceState.temperature = parseFloat(value);
            break;
          case 'setPressure':
            deviceState.pressure = parseFloat(value);
            break;
          case 'setSpeed':
            deviceState.speed = parseInt(value);
            break;
        }

        wss.clients.forEach((client) => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({
              type: 'control_ack',
              data: generateDeviceData()
            }));
          }
        });
      }
    } catch (e) {
      console.error('Message parse error:', e);
    }
  });

  ws.on('close', () => {
    console.log('Client disconnected');
    clearInterval(interval);
  });
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/api/device', (req, res) => {
  res.json(generateDeviceData());
});

app.get('/api/history', (req, res) => {
  const { startTime, endTime, limit = '1000' } = req.query;
  
  let filteredHistory = [...historyData];
  
  if (startTime) {
    const start = new Date(startTime).getTime();
    filteredHistory = filteredHistory.filter(item => new Date(item.timestamp).getTime() >= start);
  }
  
  if (endTime) {
    const end = new Date(endTime).getTime();
    filteredHistory = filteredHistory.filter(item => new Date(item.timestamp).getTime() <= end);
  }
  
  const limitNum = parseInt(limit);
  if (limitNum > 0 && filteredHistory.length > limitNum) {
    const step = Math.floor(filteredHistory.length / limitNum);
    filteredHistory = filteredHistory.filter((_, index) => index % step === 0).slice(0, limitNum);
  }
  
  res.json({
    history: filteredHistory,
    total: filteredHistory.length,
    available: historyData.length
  });
});

app.get('/api/history/range', (req, res) => {
  if (historyData.length === 0) {
    res.json({
      earliest: null,
      latest: null,
      total: 0
    });
    return;
  }
  
  res.json({
    earliest: historyData[0].timestamp,
    latest: historyData[historyData.length - 1].timestamp,
    total: historyData.length
  });
});

app.post('/api/history/generate', (req, res) => {
  const { hours = 1, interval = 60 } = req.body;
  const now = Date.now();
  const startTime = now - (hours * 60 * 60 * 1000);
  
  const generatedHistory = [];
  
  for (let time = startTime; time <= now; time += interval * 1000) {
    const baseTemp = 45 + Math.sin((time - startTime) / 3600000 * Math.PI) * 15;
    const basePress = 8.5 + Math.sin((time - startTime) / 1800000 * Math.PI) * 3;
    const baseSpeed = 1200 + Math.sin((time - startTime) / 600000 * Math.PI) * 400;
    
    const temp = baseTemp + (Math.random() - 0.5) * 5;
    const press = basePress + (Math.random() - 0.5) * 1;
    const speed = Math.round(baseSpeed + (Math.random() - 0.5) * 100);
    
    const alarms = [];
    
    if (temp > 80) {
      alarms.push({ type: 'temperature', level: 'critical', message: `温度过高: ${temp.toFixed(1)}°C`, part: 'engine' });
    } else if (temp > 65) {
      alarms.push({ type: 'temperature', level: 'warning', message: `温度偏高: ${temp.toFixed(1)}°C`, part: 'engine' });
    }
    
    if (press > 15) {
      alarms.push({ type: 'pressure', level: 'critical', message: `压力过高: ${press.toFixed(2)} MPa`, part: 'pump' });
    } else if (press > 12) {
      alarms.push({ type: 'pressure', level: 'warning', message: `压力偏高: ${press.toFixed(2)} MPa`, part: 'pump' });
    }
    
    if (speed > 3000) {
      alarms.push({ type: 'speed', level: 'critical', message: `转速过高: ${speed} RPM`, part: 'motor' });
    } else if (speed > 2500) {
      alarms.push({ type: 'speed', level: 'warning', message: `转速偏高: ${speed} RPM`, part: 'motor' });
    }
    
    generatedHistory.push({
      temperature: Math.max(10, Math.min(95, temp)),
      pressure: Math.max(3, Math.min(18, press)),
      speed: Math.max(300, Math.min(3500, speed)),
      isRunning: true,
      operationMode: alarms.length > 0 ? (alarms.some(a => a.level === 'critical') ? 'critical' : 'warning') : 'normal',
      alarms,
      timestamp: new Date(time).toISOString()
    });
  }
  
  historyData.length = 0;
  historyData.push(...generatedHistory);
  
  res.json({
    generated: generatedHistory.length,
    startTime: new Date(startTime).toISOString(),
    endTime: new Date(now).toISOString()
  });
});

app.post('/api/control', (req, res) => {
  const { action, value } = req.body;
  
  switch (action) {
    case 'toggle':
      deviceState.isRunning = !deviceState.isRunning;
      break;
    case 'setMode':
      deviceState.operationMode = value;
      break;
    case 'setTemperature':
      deviceState.temperature = parseFloat(value);
      break;
    case 'setPressure':
      deviceState.pressure = parseFloat(value);
      break;
    case 'setSpeed':
      deviceState.speed = parseInt(value);
      break;
  }

  res.json(generateDeviceData());
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`WebSocket server ready`);
  console.log(`History buffer initialized (max: ${MAX_HISTORY_SIZE} records)`);
});
