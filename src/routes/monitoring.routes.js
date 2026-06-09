const express = require('express');
const router = express.Router();
const monitoringController = require('../controllers/monitoring.controller');
const authenticateJWT = require('../middleware/auth');
const enforceIpWhitelist = require('../middleware/ipWhitelist');
const { checkWorkspaceRole } = require('../middleware/rbac');
const { WORKSPACE_ROLES } = require('../constants');

router.use(authenticateJWT);
router.use(enforceIpWhitelist);

router.get('/', monitoringController.getMonitoring);
router.get('/alerts', monitoringController.getAlerts);
router.get('/ssl', monitoringController.getSslMonitoring);
router.get('/domains', monitoringController.getDomainMonitoring);
router.post('/test', monitoringController.testMonitoring);
router.patch(
  '/alerts/:id/acknowledge',
  checkWorkspaceRole([WORKSPACE_ROLES.OWNER, WORKSPACE_ROLES.ADMIN, WORKSPACE_ROLES.ANALYST]),
  monitoringController.acknowledgeAlert
);

module.exports = router;
