const axios = require('axios');
const crypto = require('crypto');
const webhookModel = require('../models/webhookModel');
const diffModel = require('../models/diffModel');
const urlModel = require('../models/urlModel');

class WebhookService {
  generateSignature(payload, secret) {
    if (!secret) return '';
    return crypto
      .createHmac('sha256', secret)
      .update(JSON.stringify(payload))
      .digest('hex');
  }

  generateDiffSummary(diff, url) {
    const diffData = diff.diff_data ? JSON.parse(diff.diff_data) : [];
    
    const textDiffs = diffData.filter(d => d.type === 'text');
    const attrDiffs = diffData.filter(d => d.type === 'attribute');
    
    let addedTextCount = 0;
    let removedTextCount = 0;
    
    textDiffs.forEach(d => {
      if (d.action === 'added') addedTextCount += (d.value || '').length;
      if (d.action === 'removed') removedTextCount += (d.value || '').length;
    });

    const affectedPaths = [...new Set(attrDiffs.map(d => d.path))];

    return {
      changedNodes: diff.changed_nodes,
      addedText: diff.added_text || addedTextCount,
      removedText: diff.removed_text || removedTextCount,
      attributeChanges: attrDiffs.length,
      affectedPaths: affectedPaths.slice(0, 10),
      textChanges: textDiffs.slice(0, 5).map(d => ({
        action: d.action,
        preview: (d.value || '').substring(0, 200)
      }))
    };
  }

  async sendWebhookNotification(subscription, diff, url) {
    const frontendBase = process.env.FRONTEND_URL || 'http://localhost:3000';
    
    const payload = {
      event: 'page_changed',
      timestamp: new Date().toISOString(),
      urlId: diff.url_id,
      url: url.url,
      urlName: url.name || url.url,
      diffId: diff.id,
      snapshotFromId: diff.snapshot_from_id,
      snapshotToId: diff.snapshot_to_id,
      
      summary: {
        changedNodes: diff.changed_nodes,
        addedText: diff.added_text,
        removedText: diff.removed_text,
      },
      
      links: {
        diffViewer: `${frontendBase}/diff/${diff.url_id}/${diff.id}`,
        snapshotFrom: `${frontendBase}/snapshot/${diff.snapshot_from_id}`,
        snapshotTo: `${frontendBase}/snapshot/${diff.snapshot_to_id}`,
      },
    };

    if (subscription.include_diff_summary) {
      payload.diffDetails = this.generateDiffSummary(diff, url);
    }

    if (!subscription.include_snapshot_link) {
      delete payload.links;
    }

    const headers = {
      'Content-Type': 'application/json',
      'X-Webhook-Event': 'page_changed',
      'X-Webhook-Timestamp': payload.timestamp,
    };

    if (subscription.secret) {
      headers['X-Webhook-Signature'] = this.generateSignature(payload, subscription.secret);
    }

    let responseStatus = 0;
    let responseBody = '';
    let errorMessage = '';

    try {
      const response = await axios.post(subscription.webhook_url, payload, {
        headers,
        timeout: 10000,
      });
      responseStatus = response.status;
      responseBody = typeof response.data === 'string' ? response.data : JSON.stringify(response.data).substring(0, 500);
      
      console.log(`Webhook sent: ${subscription.webhook_url}, status: ${responseStatus}`);
    } catch (error) {
      responseStatus = error.response?.status || 0;
      responseBody = error.response?.data ? 
        (typeof error.response.data === 'string' ? error.response.data : JSON.stringify(error.response.data).substring(0, 500)) : '';
      errorMessage = error.message;
      
      console.error(`Webhook failed: ${subscription.webhook_url}, error: ${error.message}`);
    }

    await webhookModel.createLog({
      subscriptionId: subscription.id,
      diffId: diff.id,
      payload: JSON.stringify(payload),
      responseStatus,
      responseBody,
      errorMessage,
    });

    await webhookModel.updateLastCalled(subscription.id, responseStatus >= 200 && responseStatus < 300 ? 1 : 0);

    return {
      success: responseStatus >= 200 && responseStatus < 300,
      status: responseStatus,
      subscriptionId: subscription.id,
    };
  }

  async notifySubscribers(diffId) {
    const diff = await diffModel.getById(diffId);
    if (!diff) {
      console.error(`Diff not found: ${diffId}`);
      return;
    }

    const url = await urlModel.getById(diff.url_id);
    if (!url) {
      console.error(`URL not found: ${diff.url_id}`);
      return;
    }

    const subscriptions = await webhookModel.getSubscriptionsByUrlId(diff.url_id);
    console.log(`Found ${subscriptions.length} subscriptions for URL ${diff.url_id}`);

    const results = [];
    for (const subscription of subscriptions) {
      if (subscription.notify_on_change) {
        try {
          const result = await this.sendWebhookNotification(subscription, diff, url);
          results.push(result);
        } catch (error) {
          console.error(`Failed to send webhook for subscription ${subscription.id}:`, error);
          results.push({
            success: false,
            subscriptionId: subscription.id,
            error: error.message,
          });
        }
      }
    }

    return results;
  }

  async testWebhook(subscriptionId, sampleDiff = null) {
    const subscription = await webhookModel.getSubscriptionById(subscriptionId);
    if (!subscription) {
      throw new Error('Subscription not found');
    }

    const url = await urlModel.getById(subscription.url_id);
    if (!url) {
      throw new Error('URL not found');
    }

    const diff = sampleDiff || {
      id: 'test-diff-id',
      url_id: subscription.url_id,
      snapshot_from_id: 'snapshot-1',
      snapshot_to_id: 'snapshot-2',
      changed_nodes: 5,
      added_text: 120,
      removed_text: 80,
      diff_data: JSON.stringify([
        { type: 'text', action: 'added', value: 'Sample added text content' },
        { type: 'text', action: 'removed', value: 'Sample removed text' },
        { type: 'attribute', action: 'modified', path: 'div:nth-child(1)', attribute: 'class' },
      ]),
    };

    return this.sendWebhookNotification(subscription, diff, url);
  }
}

module.exports = new WebhookService();
