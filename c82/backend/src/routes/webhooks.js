const express = require('express');
const router = express.Router();
const webhookModel = require('../models/webhookModel');
const webhookService = require('../services/webhookService');

router.get('/url/:urlId', async (req, res) => {
  try {
    const subscriptions = await webhookModel.getSubscriptionsByUrlId(req.params.urlId);
    res.json(subscriptions);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const subscription = await webhookModel.getSubscriptionById(req.params.id);
    if (!subscription) {
      return res.status(404).json({ error: 'Subscription not found' });
    }
    res.json(subscription);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id/logs', async (req, res) => {
  try {
    const { limit = 50 } = req.query;
    const logs = await webhookModel.getLogsBySubscriptionId(req.params.id, parseInt(limit));
    res.json(logs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const subscription = await webhookModel.createSubscription(req.body);
    res.status(201).json(subscription);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const updated = await webhookModel.updateSubscription(req.params.id, req.body);
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await webhookModel.deleteSubscription(req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/:id/test', async (req, res) => {
  try {
    const result = await webhookService.testWebhook(req.params.id);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
