const express = require('express');
const router = express.Router();
const lightingConfigController = require('../controllers/lightingConfigController');

router.get('/', lightingConfigController.getAllConfigs);
router.get('/:id', lightingConfigController.getConfigById);
router.get('/floorplan/:floorPlanId', lightingConfigController.getConfigsByFloorPlan);
router.post('/', lightingConfigController.createConfig);
router.put('/:id', lightingConfigController.updateConfig);
router.delete('/:id', lightingConfigController.deleteConfig);

module.exports = router;
