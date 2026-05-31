const ch = require('../config/clickhouse');
const { v4: uuidv4 } = require('uuid');

class DiffModel {
  async create(urlId, snapshotFromId, snapshotToId, diffData, stats) {
    const id = uuidv4();
    const diffDataEscaped = JSON.stringify(diffData).replace(/'/g, "\\'").replace(/\\/g, '\\\\');
    
    await ch.querying(`
      INSERT INTO diffs (
        id, url_id, snapshot_from_id, snapshot_to_id,
        diff_data, changed_nodes, added_text, removed_text
      ) VALUES (
        '${id}', '${urlId}', '${snapshotFromId}', '${snapshotToId}',
        '${diffDataEscaped}', ${stats.changedNodes}, ${stats.addedText}, ${stats.removedText}
      )
    `);
    return this.getById(id);
  }

  async getById(id) {
    const result = await ch.querying(`
      SELECT 
        id, url_id, snapshot_from_id, snapshot_to_id,
        diff_data, changed_nodes, added_text, removed_text, created_at
      FROM diffs
      WHERE id = '${id}'
      LIMIT 1
    `);
    return result.data[0];
  }

  async getByUrlId(urlId, limit = 50) {
    const result = await ch.querying(`
      SELECT 
        id, url_id, snapshot_from_id, snapshot_to_id,
        changed_nodes, added_text, removed_text, created_at
      FROM diffs
      WHERE url_id = '${urlId}'
      ORDER BY created_at DESC
      LIMIT ${limit}
    `);
    return result.data;
  }

  async getByDateRange(urlId, startDate, endDate) {
    const result = await ch.querying(`
      SELECT 
        id, url_id, snapshot_from_id, snapshot_to_id,
        changed_nodes, added_text, removed_text, created_at
      FROM diffs
      WHERE url_id = '${urlId}'
        AND created_at >= '${startDate}'
        AND created_at <= '${endDate}'
      ORDER BY created_at DESC
    `);
    return result.data;
  }

  async getFullDiffData(id) {
    const result = await ch.querying(`
      SELECT diff_data
      FROM diffs
      WHERE id = '${id}'
      LIMIT 1
    `);
    const data = result.data[0]?.diff_data;
    return data ? JSON.parse(data) : null;
  }

  async getStats(urlId) {
    const result = await ch.querying(`
      SELECT
        COUNT(*) as total_diffs,
        SUM(changed_nodes) as total_changed_nodes,
        SUM(added_text) as total_added_text,
        SUM(removed_text) as total_removed_text,
        MAX(created_at) as last_change
      FROM diffs
      WHERE url_id = '${urlId}'
    `);
    return result.data[0];
  }
}

module.exports = new DiffModel();
