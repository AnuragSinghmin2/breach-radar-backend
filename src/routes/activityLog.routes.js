const express = require('express');
const router = express.Router();
const authenticateJWT = require('../middleware/auth');
const activityLogController = require('../controllers/activityLog.controller');

router.use(authenticateJWT);

router.get('/', activityLogController.getLogs);
router.get('/export', activityLogController.exportLogsCsv);

module.exports = router;
