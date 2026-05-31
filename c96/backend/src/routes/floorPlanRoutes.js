const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const floorPlanController = require('../controllers/floorPlanController');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    const uniqueName = uuidv4() + path.extname(file.originalname);
    cb(null, uniqueName);
  }
});

const upload = multer({ storage });

router.get('/', floorPlanController.getAllFloorPlans);
router.get('/:id', floorPlanController.getFloorPlanById);
router.get('/:id/stats', floorPlanController.getFloorPlanStats);
router.post('/', upload.single('file'), floorPlanController.uploadFloorPlan);
router.delete('/:id', floorPlanController.deleteFloorPlan);

module.exports = router;
