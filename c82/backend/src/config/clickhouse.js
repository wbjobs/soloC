const ClickHouse = require('@apla/clickhouse');

const ch = new ClickHouse({
  host: process.env.CLICKHOUSE_HOST || 'localhost',
  port: process.env.CLICKHOUSE_PORT || 8123,
  user: process.env.CLICKHOUSE_USER || 'default',
  password: process.env.CLICKHOUSE_PASSWORD || '',
  database: process.env.CLICKHOUSE_DATABASE || 'webmonitor',
  format: 'JSON'
});

module.exports = ch;
