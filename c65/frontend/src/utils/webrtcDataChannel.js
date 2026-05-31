export class ChunkedDataChannel {
  constructor(channel, options = {}) {
    this.channel = channel;
    this.chunkSize = options.chunkSize || 16 * 1024;
    this.maxBufferThreshold = options.maxBufferThreshold || 2 * 1024 * 1024;
    this.messageId = 0;
    this.receiveBuffers = new Map();
    this.pendingMessages = [];
    this.isPaused = false;
    this.ackMap = new Map();
    this.retryCount = options.retryCount || 3;
    this.retryDelay = options.retryDelay || 1000;

    this.setupChannelListeners();
  }

  setupChannelListeners() {
    this.channel.addEventListener('open', () => {
      console.log('DataChannel opened');
      this.processPendingMessages();
    });

    this.channel.addEventListener('message', (event) => {
      this.handleIncomingMessage(event.data);
    });

    this.channel.addEventListener('close', () => {
      console.log('DataChannel closed');
    });

    this.channel.addEventListener('error', (error) => {
      console.error('DataChannel error:', error);
    });
  }

  async send(data) {
    return new Promise((resolve, reject) => {
      const messageId = ++this.messageId;
      const serialized = typeof data === 'string' ? data : JSON.stringify(data);
      const totalSize = serialized.length;
      const totalChunks = Math.ceil(totalSize / this.chunkSize);

      for (let i = 0; i < totalChunks; i++) {
        const start = i * this.chunkSize;
        const end = Math.min(start + this.chunkSize, totalSize);
        const chunk = serialized.slice(start, end);

        const chunkMessage = {
          type: 'chunk',
          messageId,
          chunkIndex: i,
          totalChunks,
          data: chunk
        };

        this.pendingMessages.push(chunkMessage);
      }

      this.ackMap.set(messageId, {
        resolve,
        reject,
        totalChunks,
        receivedAcks: new Set(),
        retries: 0
      });

      this.processPendingMessages();
    });
  }

  processPendingMessages() {
    if (this.isPaused || this.channel.readyState !== 'open') return;

    while (this.pendingMessages.length > 0) {
      if (this.channel.bufferedAmount > this.maxBufferThreshold) {
        this.isPaused = true;
        setTimeout(() => {
          this.isPaused = false;
          this.processPendingMessages();
        }, 100);
        return;
      }

      const message = this.pendingMessages.shift();
      this.channel.send(JSON.stringify(message));
    }
  }

  handleIncomingMessage(data) {
    try {
      const message = JSON.parse(data);

      if (message.type === 'chunk') {
        this.handleChunk(message);
      } else if (message.type === 'ack') {
        this.handleAck(message);
      }
    } catch (e) {
      console.error('Failed to parse message:', e);
    }
  }

  handleChunk(chunk) {
    const { messageId, chunkIndex, totalChunks, data } = chunk;

    if (!this.receiveBuffers.has(messageId)) {
      this.receiveBuffers.set(messageId, {
        chunks: new Array(totalChunks),
        receivedCount: 0,
        totalChunks
      });
    }

    const buffer = this.receiveBuffers.get(messageId);
    if (!buffer.chunks[chunkIndex]) {
      buffer.chunks[chunkIndex] = data;
      buffer.receivedCount++;

      this.sendAck(messageId, chunkIndex);

      if (buffer.receivedCount === totalChunks) {
        const fullMessage = buffer.chunks.join('');
        this.receiveBuffers.delete(messageId);

        try {
          const parsed = JSON.parse(fullMessage);
          this.onMessage(parsed);
        } catch (e) {
          this.onMessage(fullMessage);
        }
      }
    }
  }

  sendAck(messageId, chunkIndex) {
    if (this.channel.readyState === 'open') {
      this.channel.send(JSON.stringify({
        type: 'ack',
        messageId,
        chunkIndex
      }));
    }
  }

  handleAck(ack) {
    const { messageId, chunkIndex } = ack;
    const pending = this.ackMap.get(messageId);

    if (pending) {
      pending.receivedAcks.add(chunkIndex);

      if (pending.receivedAcks.size === pending.totalChunks) {
        pending.resolve();
        this.ackMap.delete(messageId);
      }
    }
  }

  onMessage(message) {
    console.log('Received complete message:', message);
  }

  close() {
    this.channel.close();
  }
}

export class CongestionController {
  constructor() {
    this.baseDelay = 10;
    this.currentDelay = 10;
    this.maxDelay = 1000;
    this.successfulTransfers = 0;
    this.failedTransfers = 0;
  }

  recordSuccess() {
    this.successfulTransfers++;
    this.currentDelay = Math.max(this.baseDelay, this.currentDelay * 0.9);
  }

  recordFailure() {
    this.failedTransfers++;
    this.currentDelay = Math.min(this.maxDelay, this.currentDelay * 1.5);
  }

  getDelay() {
    return this.currentDelay;
  }
}

export class WebRTCManager {
  constructor(config = {}) {
    this.peerConnection = null;
    this.dataChannel = null;
    this.chunkedChannel = null;
    this.congestionController = new CongestionController();
    this.onMessageCallback = null;
    this.iceServers = config.iceServers || [
      { urls: 'stun:stun.l.google.com:19302' }
    ];
  }

  createPeerConnection() {
    this.peerConnection = new RTCPeerConnection({
      iceServers: this.iceServers
    });

    this.peerConnection.addEventListener('icecandidate', (event) => {
      if (event.candidate && this.onIceCandidate) {
        this.onIceCandidate(event.candidate);
      }
    });

    this.peerConnection.addEventListener('connectionstatechange', () => {
      console.log('Connection state:', this.peerConnection.connectionState);
    });

    this.peerConnection.addEventListener('datachannel', (event) => {
      this.setupDataChannel(event.channel);
    });
  }

  setupDataChannel(channel) {
    this.dataChannel = channel;
    this.chunkedChannel = new ChunkedDataChannel(channel);
    this.chunkedChannel.onMessage = (message) => {
      if (this.onMessageCallback) {
        this.onMessageCallback(message);
      }
    };
  }

  async createOffer() {
    this.createPeerConnection();
    const dataChannel = this.peerConnection.createDataChannel('collab', {
      ordered: true,
      maxRetransmits: 3
    });
    this.setupDataChannel(dataChannel);

    const offer = await this.peerConnection.createOffer();
    await this.peerConnection.setLocalDescription(offer);
    return offer;
  }

  async createAnswer(offer) {
    this.createPeerConnection();
    await this.peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await this.peerConnection.createAnswer();
    await this.peerConnection.setLocalDescription(answer);
    return answer;
  }

  async setRemoteDescription(description) {
    await this.peerConnection.setRemoteDescription(new RTCSessionDescription(description));
  }

  async addIceCandidate(candidate) {
    await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
  }

  async send(data) {
    if (this.chunkedChannel) {
      try {
        await this.chunkedChannel.send(data);
        this.congestionController.recordSuccess();
      } catch (error) {
        this.congestionController.recordFailure();
        throw error;
      }
    }
  }

  onMessage(callback) {
    this.onMessageCallback = callback;
  }

  close() {
    if (this.chunkedChannel) {
      this.chunkedChannel.close();
    }
    if (this.peerConnection) {
      this.peerConnection.close();
    }
  }
}
