import axios from 'axios';
import { normalizeEarthquake } from '../utils/geo';

const API_BASE = '';
const WS_URL = 'ws://localhost:5001';

export const fetchRecentEarthquakes = async (hours = 24) => {
  try {
    const response = await axios.get(
      `${API_BASE}/api/earthquakes/recent?hours=${hours}`
    );
    const data = response.data.data || [];
    return data.map(item => normalizeEarthquake(item));
  } catch (error) {
    console.error('API Error:', error);
    throw error;
  }
};

export const fetchClusters = async (minutes = 10, eps = 150, minPts = 2) => {
  try {
    const response = await axios.get(
      `${API_BASE}/api/earthquakes/cluster?minutes=${minutes}&eps=${eps}&minPts=${minPts}`
    );
    return response.data;
  } catch (error) {
    console.error('API Error:', error);
    throw error;
  }
};

export const fetchEarthquakeById = async (id) => {
  try {
    const response = await axios.get(
      `${API_BASE}/api/earthquakes/${id}`
    );
    return response.data.data ? normalizeEarthquake(response.data.data) : null;
  } catch (error) {
    console.error('API Error:', error);
    throw error;
  }
};

export const connectWebSocket = (onOpen, onClose, onEarthquake) => {
  let ws;
  let reconnectAttempts = 0;
  let reconnectTimer = null;

  const connect = () => {
    try {
      ws = new WebSocket(WS_URL);

      ws.onopen = () => {
        console.log('[WebSocket] Connected');
        reconnectAttempts = 0;
        onOpen && onOpen();
      };

      ws.onclose = () => {
        console.log('[WebSocket] Disconnected');
        onClose && onClose();
        scheduleReconnect();
      };

      ws.onerror = (error) => {
        console.error('[WebSocket] Error:', error);
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          
          if (message.type === 'earthquake' && message.data) {
            const normalized = normalizeEarthquake(message.data);
            console.log('[WebSocket] Received earthquake:', normalized.magnitude, normalized.place);
            onEarthquake && onEarthquake(normalized);
          }
        } catch (error) {
          console.error('[WebSocket] Parse error:', error, 'raw data:', event.data);
        }
      };
    } catch (error) {
      console.error('[WebSocket] Connection error:', error);
      scheduleReconnect();
    }
  };

  const scheduleReconnect = () => {
    if (reconnectAttempts > 10) {
      console.log('[WebSocket] Max reconnect attempts reached');
      return;
    }

    const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000);
    reconnectAttempts++;
    
    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(() => {
      console.log(`[WebSocket] Reconnecting (attempt ${reconnectAttempts})...`);
      connect();
    }, delay);
  };

  connect();

  return () => {
    clearTimeout(reconnectTimer);
    if (ws) {
      ws.close();
    }
  };
};
