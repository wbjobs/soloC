const express = require('express');
const router = express.Router();
const diffModel = require('../models/diffModel');
const diffCalculator = require('../services/diffCalculator');
const snapshotModel = require('../models/snapshotModel');

router.get('/:id', async (req, res) => {
  try {
    const diff = await diffModel.getById(req.params.id);
    if (!diff) {
      return res.status(404).json({ error: 'Diff not found' });
    }
    res.json(diff);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id/data', async (req, res) => {
  try {
    const diffData = await diffModel.getFullDiffData(req.params.id);
    if (!diffData) {
      return res.status(404).json({ error: 'Diff data not found' });
    }
    res.json(diffData);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/compare', async (req, res) => {
  try {
    const { snapshot1Id, snapshot2Id } = req.body;
    if (!snapshot1Id || !snapshot2Id) {
      return res.status(400).json({ error: 'Both snapshot IDs are required' });
    }

    const content1 = await snapshotModel.getFullContent(snapshot1Id);
    const content2 = await snapshotModel.getFullContent(snapshot2Id);

    if (!content1 || !content2) {
      return res.status(404).json({ error: 'Snapshot content not found' });
    }

    const result = diffCalculator.compareSnapshots(
      { content: content1 },
      { content: content2 }
    );

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
