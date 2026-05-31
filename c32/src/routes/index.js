const express = require('express');
const router = express.Router();
const impactAnalysisController = require('../controllers/impactAnalysisController');

router.post('/impact-analysis', impactAnalysisController.createAnalysisTask);
router.get('/impact-analysis/:taskId', impactAnalysisController.getAnalysisResult);

module.exports = router;
