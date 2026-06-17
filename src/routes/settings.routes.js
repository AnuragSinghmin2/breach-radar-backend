const express = require('express');
const authenticateJWT = require('../middleware/auth');
const settingsController = require('../controllers/settings.controller');

const router = express.Router();

router.use(authenticateJWT);

router.get('/notifications', settingsController.getNotifications);
router.put('/notifications', settingsController.updateNotifications);
router.get('/scan-preferences', settingsController.getScanPreferences);
router.put('/scan-preferences', settingsController.updateScanPreferences);

module.exports = router;
