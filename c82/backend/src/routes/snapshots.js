const express = require('express');
const router = express.Router();
const snapshotModel = require('../models/snapshotModel');

router.get('/:id', async (req, res) => {
  try {
    const snapshot = await snapshotModel.getById(req.params.id);
    if (!snapshot) {
      return res.status(404).json({ error: 'Snapshot not found' });
    }
    res.json(snapshot);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id/content', async (req, res) => {
  try {
    const content = await snapshotModel.getFullContent(req.params.id);
    if (!content) {
      return res.status(404).json({ error: 'Content not found' });
    }
    res.send(content);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
