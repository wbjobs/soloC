export const config = {
  server: {
    port: parseInt(process.env.PORT || '3000', 10),
    nodeEnv: process.env.NODE_ENV || 'development',
  },
  kafka: {
    brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(','),
    clientId: process.env.KAFKA_CLIENT_ID || 'radio-signal-processor',
    topicTasks: process.env.KAFKA_TOPIC_TASKS || 'signal-processing-tasks',
    topicResults: process.env.KAFKA_TOPIC_RESULTS || 'signal-processing-results',
    groupId: process.env.KAFKA_GROUP_ID || 'processing-workers',
  },
  influxdb: {
    url: process.env.INFLUXDB_URL || 'http://localhost:8086',
    token: process.env.INFLUXDB_TOKEN || 'my-super-secret-token',
    org: process.env.INFLUXDB_ORG || 'radio-astronomy',
    bucket: process.env.INFLUXDB_BUCKET || 'signal-processing-metrics',
  },
  storage: {
    dataDir: process.env.DATA_DIR || './data',
    resultsDir: process.env.RESULTS_DIR || './results',
  },
  processing: {
    fftWindowSize: parseInt(process.env.FFT_WINDOW_SIZE || '1024', 10),
    prestoNumPeriods: parseInt(process.env.PRESTO_NUM_PERIODS || '1000', 10),
    minSnrThreshold: parseFloat(process.env.MIN_SNR_THRESHOLD || '5.0'),
  },
};
