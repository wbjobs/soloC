const env = require('../config/env');

const PLACES = [
  'Pacific Ocean', 'California, USA', 'Japan', 'Indonesia', 'Chile',
  'Philippines', 'Mexico', 'Alaska, USA', 'Italy', 'Haiti',
  'New Zealand', 'Peru', 'Iran', 'Turkey', 'Taiwan',
  'Papua New Guinea', 'Nepal', 'Ecuador', 'Argentina', 'Russia'
];

const generateRandomEarthquake = () => {
  const magnitude = (Math.random() * 7.5 + 1.0).toFixed(2);
  const latitude = (Math.random() * 170 - 85).toFixed(6);
  const longitude = (Math.random() * 360 - 180).toFixed(6);
  const depth = (Math.random() * 600).toFixed(2);
  const place = PLACES[Math.floor(Math.random() * PLACES.length)];
  const now = new Date().toISOString();

  return {
    id: `eq_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    magnitude: parseFloat(magnitude),
    latitude: parseFloat(latitude),
    longitude: parseFloat(longitude),
    depth: parseFloat(depth),
    place,
    time: now,
    source: 'USGS-SIMULATED'
  };
};

class KafkaSimulator {
  constructor(wsService, dbService) {
    this.wsService = wsService;
    this.dbService = dbService;
    this.intervalId = null;
    this.isRunning = false;
  }

  start() {
    if (this.isRunning) return;
    
    console.log('[Kafka-Simulator] Starting USGS earthquake stream simulation...');
    this.isRunning = true;

    this.intervalId = setInterval(() => {
      const earthquake = generateRandomEarthquake();
      this.processMessage(earthquake);
    }, env.SIMULATION_INTERVAL);

    console.log(`[Kafka-Simulator] Simulation running at ${env.SIMULATION_INTERVAL / 1000}s interval`);
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      this.isRunning = false;
      console.log('[Kafka-Simulator] Simulation stopped');
    }
  }

  async processMessage(message) {
    try {
      console.log(`[Kafka-Simulator] Received: M${message.magnitude} @ ${message.place}`);
      
      await this.dbService.saveEarthquake(message);
      this.wsService.broadcastEarthquake(message);
    } catch (error) {
      console.error('[Kafka-Simulator] Error processing message:', error);
    }
  }
}

module.exports = KafkaSimulator;
