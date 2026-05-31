class WebSocketService {
  constructor() {
    this.ws = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
    this.reconnectDelay = 1000;
    this.isConnected = false;
    this.isManualClose = false;
    this.listeners = new Map();
    this.offlineBuffer = [];
    this.maxOfflineSize = 1000;
    this.sessionId = null;
    this.groupSessionId = null;
    this.participantId = null;
  }

  connect(url = 'ws://localhost:8000/ws/eeg/') {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    this.isManualClose = false;
    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      console.log('WebSocket connected');
      this.isConnected = true;
      this.reconnectAttempts = 0;
      this.notify('connected', {});
      this.flushOfflineBuffer();
    };

    this.ws.onclose = (event) => {
      console.log('WebSocket disconnected', event);
      this.isConnected = false;
      this.notify('disconnected', { code: event.code, reason: event.reason });

      if (!this.isManualClose) {
        this.attemptReconnect();
      }
    };

    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      this.notify('error', error);
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        this.notify(data.type, data);
      } catch (e) {
        console.error('Failed to parse WebSocket message:', e);
      }
    };
  }

  attemptReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnect attempts reached');
      this.notify('reconnect_failed', {});
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(1.5, this.reconnectAttempts - 1);
    
    console.log(`Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts}) in ${delay}ms`);
    this.notify('reconnecting', { attempt: this.reconnectAttempts, maxAttempts: this.maxReconnectAttempts });

    setTimeout(() => {
      this.connect();
    }, delay);
  }

  send(data) {
    if (this.isConnected && this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
      return true;
    } else {
      if (data.type === 'eeg_data' || data.type === 'group_eeg_data') {
        this.addToOfflineBuffer(data);
      }
      this.notify('offline', { buffered: data });
      return false;
    }
  }

  addToOfflineBuffer(data) {
    this.offlineBuffer.push({
      ...data,
      timestamp: Date.now()
    });

    if (this.offlineBuffer.length > this.maxOfflineSize) {
      this.offlineBuffer.shift();
    }

    this.notify('buffer_update', { size: this.offlineBuffer.length });
  }

  flushOfflineBuffer() {
    if (this.offlineBuffer.length === 0) return;

    console.log(`Flushing ${this.offlineBuffer.length} buffered messages`);
    
    while (this.offlineBuffer.length > 0) {
      const data = this.offlineBuffer.shift();
      this.send(data);
    }

    this.notify('buffer_flushed', {});
  }

  getBufferSize() {
    return this.offlineBuffer.length;
  }

  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
  }

  off(event, callback) {
    if (!this.listeners.has(event)) return;
    
    const callbacks = this.listeners.get(event);
    const index = callbacks.indexOf(callback);
    if (index !== -1) {
      callbacks.splice(index, 1);
    }
  }

  notify(event, data) {
    if (!this.listeners.has(event)) return;
    
    this.listeners.get(event).forEach(callback => {
      try {
        callback(data);
      } catch (e) {
        console.error(`Error in listener for ${event}:`, e);
      }
    });
  }

  disconnect() {
    this.isManualClose = true;
    if (this.ws) {
      this.ws.close();
    }
  }

  startSession(name) {
    this.send({
      type: 'start_session',
      name: name
    });
  }

  endSession() {
    this.send({
      type: 'end_session'
    });
  }

  sendEEGData(channels) {
    this.send({
      type: 'eeg_data',
      channels: channels
    });
  }

  createGroupSession(name, participantName) {
    this.send({
      type: 'create_group_session',
      name: name,
      participant_name: participantName
    });
  }

  joinGroupSession(groupSessionId, participantName) {
    this.send({
      type: 'join_group_session',
      group_session_id: groupSessionId,
      participant_name: participantName
    });
  }

  leaveGroupSession() {
    this.send({
      type: 'leave_group_session'
    });
  }

  sendGroupEEGData(channels, attentionScore) {
    this.send({
      type: 'group_eeg_data',
      channels: channels,
      attention_score: attentionScore
    });
  }

  simulate() {
    this.send({
      type: 'simulate'
    });
  }
}

export default new WebSocketService();
