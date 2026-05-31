module.exports = {
  PORT: process.env.PORT || 5000,
  WS_PORT: process.env.WS_PORT || 5001,
  KAFKA_BROKER: process.env.KAFKA_BROKER || 'localhost:9092',
  KAFKA_TOPIC: process.env.KAFKA_TOPIC || 'usgs-earthquakes',
  SIMULATION_INTERVAL: process.env.SIMULATION_INTERVAL || 3000,
};
