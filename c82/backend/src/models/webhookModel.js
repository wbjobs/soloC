const ch = require('../config/clickhouse');
const { v4: uuidv4 } = require('uuid');

class WebhookModel {
  async createSubscription(data) {
    const id = uuidv4();
    const {
      urlId,
      webhookUrl,
      name,
      secret = '',
      isActive = 1,
      notifyOnChange = 1,
      includeDiffSummary = 1,
      includeSnapshotLink = 1,
    } = data;

    await ch.querying(`
      INSERT INTO webhook_subscriptions (
        id, url_id, webhook_url, name, secret, is_active,
        notify_on_change, include_diff_summary, include_snapshot_link
      ) VALUES (
        '${id}', '${urlId}', '${webhookUrl.replace(/'/g, "''")}',
        '${(name || webhookUrl).replace(/'/g, "''")}', '${secret.replace(/'/g, "''")}',
        ${isActive}, ${notifyOnChange}, ${includeDiffSummary}, ${includeSnapshotLink}
      )
    `);
    return this.getSubscriptionById(id);
  }

  async getSubscriptionById(id) {
    const result = await ch.querying(`
      SELECT *
      FROM webhook_subscriptions
      WHERE id = '${id}'
      LIMIT 1
    `);
    return result.data[0];
  }

  async getSubscriptionsByUrlId(urlId) {
    const result = await ch.querying(`
      SELECT *
      FROM webhook_subscriptions
      WHERE url_id = '${urlId}' AND is_active = 1
      ORDER BY created_at DESC
    `);
    return result.data;
  }

  async getAllSubscriptions() {
    const result = await ch.querying(`
      SELECT *
      FROM webhook_subscriptions
      ORDER BY created_at DESC
    `);
    return result.data;
  }

  async updateSubscription(id, updates) {
    const setClauses = Object.entries(updates)
      .map(([key, value]) => {
        const column = key.replace(/([A-Z])/g, '_$1').toLowerCase();
        if (typeof value === 'string') {
          return `${column} = '${value.replace(/'/g, "''")}'`;
        }
        return `${column} = ${value}`;
      })
      .join(', ');

    await ch.querying(`
      ALTER TABLE webhook_subscriptions
      UPDATE ${setClauses}
      WHERE id = '${id}'
    `);
    return this.getSubscriptionById(id);
  }

  async deleteSubscription(id) {
    await ch.querying(`
      ALTER TABLE webhook_subscriptions
      UPDATE is_active = 0
      WHERE id = '${id}'
    `);
    return true;
  }

  async updateLastCalled(id, status) {
    await ch.querying(`
      ALTER TABLE webhook_subscriptions
      UPDATE last_called_at = now(), last_status = ${status}
      WHERE id = '${id}'
    `);
    return true;
  }

  async createLog(data) {
    const id = uuidv4();
    const { subscriptionId, diffId, payload = '', responseStatus = 0, responseBody = '', errorMessage = '' } = data;

    const payloadEscaped = payload.replace(/'/g, "\\'").replace(/\\/g, '\\\\');
    const responseBodyEscaped = responseBody.replace(/'/g, "\\'").replace(/\\/g, '\\\\');
    const errorMessageEscaped = errorMessage.replace(/'/g, "\\'").replace(/\\/g, '\\\\');

    await ch.querying(`
      INSERT INTO webhook_logs (
        id, subscription_id, diff_id, payload, response_status, response_body, error_message
      ) VALUES (
        '${id}', '${subscriptionId}', '${diffId}', '${payloadEscaped}',
        ${responseStatus}, '${responseBodyEscaped}', '${errorMessageEscaped}'
      )
    `);
    return id;
  }

  async getLogsBySubscriptionId(subscriptionId, limit = 50) {
    const result = await ch.querying(`
      SELECT *
      FROM webhook_logs
      WHERE subscription_id = '${subscriptionId}'
      ORDER BY created_at DESC
      LIMIT ${limit}
    `);
    return result.data;
  }
}

module.exports = new WebhookModel();
