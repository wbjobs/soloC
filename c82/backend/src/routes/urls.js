const express = require('express');
const router = express.Router();
const urlModel = require('../models/urlModel');
const snapshotModel = require('../models/snapshotModel');
const diffModel = require('../models/diffModel');
const scheduler = require('../services/scheduler');

router.get('/', async (req, res) => {
  try {
    const urls = await urlModel.getAll();
    res.json(urls);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const url = await urlModel.getById(req.params.id);
    if (!url) {
      return res.status(404).json({ error: 'URL not found' });
    }
    res.json(url);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { url, name } = req.body;
    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }
    const newUrl = await urlModel.create(url, name);
    res.status(201).json(newUrl);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const updated = await urlModel.update(req.params.id, req.body);
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await urlModel.delete(req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/:id/crawl', async (req, res) => {
  try {
    await scheduler.manualCrawl(req.params.id);
    res.json({ success: true, message: 'Crawl completed' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id/snapshots', async (req, res) => {
  try {
    const { limit = 50 } = req.query;
    const snapshots = await snapshotModel.getByUrlId(req.params.id, parseInt(limit));
    res.json(snapshots);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id/diffs', async (req, res) => {
  try {
    const { limit = 50 } = req.query;
    const diffs = await diffModel.getByUrlId(req.params.id, parseInt(limit));
    res.json(diffs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id/stats', async (req, res) => {
  try {
    const stats = await diffModel.getStats(req.params.id);
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
