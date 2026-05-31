const express = require('express');
const cors = require('cors');
const env = require('./config/env');

const WSService = require('./services/wsService');
const DBService = require('./services/dbService');
const InMemoryDBService = require('./services/inMemoryDBService');
const KafkaSimulator = require('./services/kafkaSimulator');

const healthRoutes = require('./routes/health');
const createEarthquakeRoutes = require('./routes/earthquakes');

const app = express();
app.use(cors());
app.use(express.json());

let dbService = null;
let kafkaSimulator = null;
let wsService = null;

const initDB = async () => {
  const pgDB = new DBService();
  try {
    await pgDB.initialize();
    console.log('[Server] Connected to PostgreSQL');
    return pgDB;
  } catch (error) {
    console.log('[Server] PostgreSQL unavailable, switching to in-memory database');
    try {
      await pgDB.close();
    } catch (e) {}
    const inMemoryDB = new InMemoryDBService();
    await inMemoryDB.initialize();
    return inMemoryDB;
  }
};

const gracefulShutdown = async () => {
  console.log('\n[Server] Received shutdown signal. Closing gracefully...');
  
  if (kafkaSimulator) kafkaSimulator.stop();
  if (wsService) wsService.close();
  
  if (dbService) {
    try {
      await dbService.close();
    } catch (error) {
      console.error('[Server] Error during shutdown:', error);
    }
  }
  
  process.exit(0);
};

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

const startServer = async () => {
  try {
    console.log('[Server] Starting Earthquake Monitoring System...\n');
    
    dbService = await initDB();
    wsService = new WSService();
    kafkaSimulator = new KafkaSimulator(wsService, dbService);

    app.use('/api/health', healthRoutes);
    app.use('/api/earthquakes', createEarthquakeRoutes(dbService));
    
    wsService.start();
    
    const server = app.listen(env.PORT, () => {
      console.log(`[Express] REST API server running on http://localhost:${env.PORT}`);
      console.log(`\n[Server] Available endpoints:`);
      console.log(`  - GET  http://localhost:${env.PORT}/api/health`);
      console.log(`  - GET  http://localhost:${env.PORT}/api/earthquakes/recent?hours=24`);
      console.log(`  - GET  http://localhost:${env.PORT}/api/earthquakes/cluster?minutes=10&eps=150&minPts=2`);
      console.log(`  - GET  http://localhost:${env.PORT}/api/earthquakes/:id`);
      console.log(`\n[Server] WebSocket: ws://localhost:${env.WS_PORT}`);
      console.log('\n---------------------------------------------------\n');
    });
    
    kafkaSimulator.start();

    return server;
  } catch (error) {
    console.error('[Server] Failed to start server:', error);
    process.exit(1);
  }
};

startServer();
