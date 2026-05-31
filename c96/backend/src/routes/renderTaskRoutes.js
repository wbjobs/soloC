const express = require('express');
const router = express.Router();
const renderTaskController = require('../controllers/renderTaskController');

router.get('/', renderTaskController.getAllTasks);
router.get('/:id', renderTaskController.getTaskById);
router.post('/', renderTaskController.createTask);
router.put('/:id', renderTaskController.updateTask);
router.delete('/:id', renderTaskController.deleteTask);

module.exports = router;
