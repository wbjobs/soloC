const ch = require('../config/clickhouse');
const { v4: uuidv4 } = require('uuid');

class SnapshotModel {
  async create(urlId, url, domHash, content, status = 200, stats = {}, renderEngine = 'puppeteer') {
    const id = uuidv4();
    const contentEscaped = content.replace(/'/g, "\\'").replace(/\\/g, '\\\\');
    const { contentLength = 0, textLength = 0, linkCount = 0, imageCount = 0 } = stats;
    
    await ch.querying(`
      INSERT INTO snapshots (
        id, url_id, url, dom_hash, content, content_length, text_length, link_count, image_count, status, render_engine
      )
      VALUES (
        '${id}', '${urlId}', '${url.replace(/'/g, "''")}', '${domHash}', '${contentEscaped}', ${contentLength}, ${textLength}, ${linkCount}, ${imageCount}, ${status}, '${renderEngine}'
      )
    `);
    return this.getById(id);
  }

  async getById(id) {
    const result = await ch.querying(`
      SELECT id, url_id, url, dom_hash, content, crawled_at, status
      FROM snapshots
      WHERE id = '${id}'
      LIMIT 1
    `);
    return result.data[0];
  }

  async getByUrlId(urlId, limit = 50) {
    const result = await ch.querying(`
      SELECT id, url_id, url, dom_hash, crawled_at, status
      FROM snapshots
      WHERE url_id = '${urlId}'
      ORDER BY crawled_at DESC
      LIMIT ${limit}
    `);
    return result.data;
  }

  async getLatestByUrlId(urlId) {
    const result = await ch.querying(`
      SELECT id, url_id, url, dom_hash, content, crawled_at, status
      FROM snapshots
      WHERE url_id = '${urlId}'
      ORDER BY crawled_at DESC
      LIMIT 1
    `);
    return result.data[0];
  }

  async getByDateRange(urlId, startDate, endDate) {
    const result = await ch.querying(`
      SELECT id, url_id, url, dom_hash, crawled_at, status
      FROM snapshots
      WHERE url_id = '${urlId}'
        AND crawled_at >= '${startDate}'
        AND crawled_at <= '${endDate}'
      ORDER BY crawled_at DESC
    `);
    return result.data;
  }

  async getFullContent(id) {
    const result = await ch.querying(`
      SELECT content
      FROM snapshots
      WHERE id = '${id}'
      LIMIT 1
    `);
    return result.data[0]?.content;
  }
}

module.exports = new SnapshotModel();
