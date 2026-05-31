const ch = require('../config/clickhouse');

async function initDatabase() {
  try {
    await ch.querying(`CREATE DATABASE IF NOT EXISTS ${process.env.CLICKHOUSE_DATABASE || 'webmonitor'}`);
    console.log('Database created');

    await ch.querying(`
      CREATE TABLE IF NOT EXISTS urls (
        id UUID,
        url String,
        name String,
        created_at DateTime DEFAULT now(),
        is_active UInt8 DEFAULT 1,
        use_puppeteer UInt8 DEFAULT 1,
        enable_scroll UInt8 DEFAULT 1,
        wait_for_selector String DEFAULT '',
        custom_timeout UInt32 DEFAULT 30000
      ) ENGINE = MergeTree()
      ORDER BY (id, created_at)
    `);
    console.log('urls table created');

    await ch.querying(`
      CREATE TABLE IF NOT EXISTS snapshots (
        id UUID,
        url_id UUID,
        url String,
        dom_hash String,
        content String,
        content_length UInt32 DEFAULT 0,
        text_length UInt32 DEFAULT 0,
        link_count UInt32 DEFAULT 0,
        image_count UInt32 DEFAULT 0,
        crawled_at DateTime DEFAULT now(),
        status UInt8 DEFAULT 200,
        render_engine String DEFAULT 'puppeteer'
      ) ENGINE = MergeTree()
      ORDER BY (url_id, crawled_at)
    `);
    console.log('snapshots table created');

    await ch.querying(`
      CREATE TABLE IF NOT EXISTS diffs (
        id UUID,
        url_id UUID,
        snapshot_from_id UUID,
        snapshot_to_id UUID,
        diff_data String,
        changed_nodes UInt32,
        added_text UInt32,
        removed_text UInt32,
        created_at DateTime
      ) ENGINE = MergeTree()
      ORDER BY (url_id, created_at)
    `);
    console.log('diffs table created');

    await ch.querying(`
      CREATE TABLE IF NOT EXISTS webhook_subscriptions (
        id UUID,
        url_id UUID,
        webhook_url String,
        name String,
        secret String,
        is_active UInt8 DEFAULT 1,
        notify_on_change UInt8 DEFAULT 1,
        include_diff_summary UInt8 DEFAULT 1,
        include_snapshot_link UInt8 DEFAULT 1,
        created_at DateTime DEFAULT now(),
        last_called_at DateTime,
        last_status UInt8
      ) ENGINE = MergeTree()
      ORDER BY (url_id, created_at)
    `);
    console.log('webhook_subscriptions table created');

    await ch.querying(`
      CREATE TABLE IF NOT EXISTS webhook_logs (
        id UUID,
        subscription_id UUID,
        diff_id UUID,
        payload String,
        response_status UInt16,
        response_body String,
        error_message String,
        created_at DateTime DEFAULT now()
      ) ENGINE = MergeTree()
      ORDER BY (subscription_id, created_at)
    `);
    console.log('webhook_logs table created');

    console.log('Database initialization completed!');
    process.exit(0);
  } catch (error) {
    console.error('Database initialization failed:', error);
    process.exit(1);
  }
}

initDatabase();
