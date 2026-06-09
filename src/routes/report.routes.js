const express = require('express');
const router = express.Router();
const reportController = require('../controllers/report.controller');
const authenticateJWT = require('../middleware/auth');
const enforceIpWhitelist = require('../middleware/ipWhitelist');
const { checkWorkspaceRole } = require('../middleware/rbac');
const { WORKSPACE_ROLES } = require('../constants');

router.use(authenticateJWT);
router.use(enforceIpWhitelist);

router.get('/', reportController.getReports);
router.post('/', checkWorkspaceRole([WORKSPACE_ROLES.OWNER, WORKSPACE_ROLES.ADMIN, WORKSPACE_ROLES.ANALYST]), reportController.generateReport);
router.get('/:id', reportController.getReportFile);

module.exports = router;
