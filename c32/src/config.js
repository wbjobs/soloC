module.exports = {
  port: process.env.PORT || 3000,
  
  postgresql: {
    host: process.env.POSTGRES_HOST || 'localhost',
    port: process.env.POSTGRES_PORT || 5432,
    database: process.env.POSTGRES_DB || 'postgres',
    user: process.env.POSTGRES_USER || 'postgres',
    password: process.env.POSTGRES_PASSWORD || 'postgres'
  },
  
  mongodb: {
    uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/impact_analysis'
  },
  
  rabbitmq: {
    url: process.env.RABBITMQ_URL || 'amqp://localhost:5672',
    queue: 'impact-analysis-tasks'
  },
  
  tenantIdColumn: process.env.TENANT_ID_COLUMN || 'tenant_id'
};
