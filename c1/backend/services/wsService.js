const WebSocket = require('ws');
const env = require('../config/env');

class WSService {
  constructor() {
    this.wss = null;
    this.clients = new Set();
  }

  start() {
    this.wss = new WebSocket.Server({ port: env.WS_PORT });

    this.wss.on('connection', (ws) => {
      this.clients.add(ws);
      console.log(`[WebSocket] New client connected. Total: ${this.clients.size}`);

      ws.on('message', (message) => {
        try {
          const data = JSON.parse(message);
          this.handleClientMessage(ws, data);
        } catch (e) {
          console.log('[WebSocket] Invalid message received');
        }
      });

      ws.on('close', () => {
        this.clients.delete(ws);
        console.log(`[WebSocket] Client disconnected. Total: ${this.clients.size}`);
      });

      ws.on('error', (error) => {
        console.error('[WebSocket] Client error:', error);
        this.clients.delete(ws);
      });

      ws.send(JSON.stringify({
        type: 'system',
        message: 'Connected to earthquake monitoring service',
        timestamp: new Date().toISOString()
      }));
    });

    console.log(`[WebSocket] Server running on port ${env.WS_PORT}`);
  }

  handleClientMessage(ws, data) {
    switch (data.type) {
      case 'ping':
        ws.send(JSON.stringify({ type: 'pong', timestamp: new Date().toISOString() }));
        break;
      default:
        console.log('[WebSocket] Unknown message type:', data.type);
    }
  }

  broadcastEarthquake(earthquake) {
    const message = JSON.stringify({
      type: 'earthquake',
      data: earthquake,
      timestamp: new Date().toISOString()
    });

    this.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });

    console.log(`[WebSocket] Broadcasted earthquake to ${this.clients.size} clients`);
  }

  close() {
    if (this.wss) {
      this.wss.close();
      this.clients.clear();
      console.log('[WebSocket] Server closed');
    }
  }
}

module.exports = WSService;
