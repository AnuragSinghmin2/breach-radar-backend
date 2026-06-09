const express = require('express');
const router = express.Router();
const domainController = require('../controllers/domain.controller');
const authenticateJWT = require('../middleware/auth');
const enforceIpWhitelist = require('../middleware/ipWhitelist');
const { checkWorkspaceRole } = require('../middleware/rbac');
const { WORKSPACE_ROLES } = require('../constants');

router.use(authenticateJWT);
router.use(enforceIpWhitelist);

router.get('/', domainController.getDomains);

router.post(
  '/',
  checkWorkspaceRole([WORKSPACE_ROLES.OWNER, WORKSPACE_ROLES.ADMIN]),
  domainController.addDomain
);

router.get('/:id/verification', domainController.getVerificationInstructions);

router.post(
  '/:id/verification/dns',
  checkWorkspaceRole([WORKSPACE_ROLES.OWNER, WORKSPACE_ROLES.ADMIN]),
  domainController.verifyDns
);

router.post(
  '/:id/verification/html',
  checkWorkspaceRole([WORKSPACE_ROLES.OWNER, WORKSPACE_ROLES.ADMIN]),
  domainController.verifyHtml
);

router.get('/:id', domainController.getDomainById);

router.put(
  '/:id',
  checkWorkspaceRole([WORKSPACE_ROLES.OWNER, WORKSPACE_ROLES.ADMIN]),
  domainController.updateDomain
);

router.patch(
  '/:id/status',
  checkWorkspaceRole([WORKSPACE_ROLES.OWNER, WORKSPACE_ROLES.ADMIN]),
  domainController.toggleDomainStatus
);

router.delete(
  '/:id',
  checkWorkspaceRole([WORKSPACE_ROLES.OWNER, WORKSPACE_ROLES.ADMIN]),
  domainController.deleteDomain
);

module.exports = router;
