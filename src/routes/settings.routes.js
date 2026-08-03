const express = require('express');
const authenticateJWT = require('../middleware/auth');
const settingsController = require('../controllers/settings.controller');
const { requireTeamRole } = require('../middleware/teamRbac');

const router = express.Router();

router.use(authenticateJWT);

router.get('/notifications', settingsController.getNotifications);
router.put('/notifications', settingsController.updateNotifications);
router.get('/scan-preferences', settingsController.getScanPreferences);
router.put('/scan-preferences', settingsController.updateScanPreferences);
router.post('/reset-workspace', requireTeamRole(['OWNER']), settingsController.resetWorkspace);

module.exports = router;
