const express = require('express');
const router = express.Router();
const vulnController = require('../controllers/vuln.controller');
const authenticateJWT = require('../middleware/auth');
const enforceIpWhitelist = require('../middleware/ipWhitelist');
const { checkWorkspaceRole } = require('../middleware/rbac');
const { WORKSPACE_ROLES } = require('../constants');

router.use(authenticateJWT);
router.use(enforceIpWhitelist);

router.get('/', vulnController.getVulnerabilities);
router.get('/:id', vulnController.getVulnerabilityDetails);
router.patch('/:id/status', checkWorkspaceRole([WORKSPACE_ROLES.OWNER, WORKSPACE_ROLES.ADMIN, WORKSPACE_ROLES.ANALYST]), vulnController.updateVulnerabilityStatus);

module.exports = router;
