const ch = require('../config/clickhouse');
const { v4: uuidv4 } = require('uuid');

class UrlModel {
  async getAll() {
    const result = await ch.querying(`
      SELECT id, url, name, created_at, is_active
      FROM urls
      ORDER BY created_at DESC
    `);
    return result.data;
  }

  async getById(id) {
    const result = await ch.querying(`
      SELECT id, url, name, created_at, is_active
      FROM urls
      WHERE id = '${id}'
      LIMIT 1
    `);
    return result.data[0];
  }

  async create(url, name) {
    const id = uuidv4();
    await ch.querying(`
      INSERT INTO urls (id, url, name)
      VALUES ('${id}', '${url.replace(/'/g, "''")}', '${(name || url).replace(/'/g, "''")}')
    `);
    return this.getById(id);
  }

  async update(id, updates) {
    const setClauses = Object.entries(updates)
      .map(([key, value]) => `${key} = '${value.replace(/'/g, "''")}'`)
      .join(', ');
    
    await ch.querying(`
      ALTER TABLE urls
      UPDATE ${setClauses}
      WHERE id = '${id}'
    `);
    return this.getById(id);
  }

  async delete(id) {
    await ch.querying(`
      ALTER TABLE urls
      UPDATE is_active = 0
      WHERE id = '${id}'
    `);
    return true;
  }

  async getActiveUrls() {
    const result = await ch.querying(`
      SELECT id, url, name
      FROM urls
      WHERE is_active = 1
    `);
    return result.data;
  }
}

module.exports = new UrlModel();
