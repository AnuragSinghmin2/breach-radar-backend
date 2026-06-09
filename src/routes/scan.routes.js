const express = require('express');
const router = express.Router();
const scanController = require('../controllers/scan.controller');
const authenticateJWT = require('../middleware/auth');
const enforceIpWhitelist = require('../middleware/ipWhitelist');
const { checkWorkspaceRole } = require('../middleware/rbac');
const { WORKSPACE_ROLES } = require('../constants');

// All scan routes require a valid JWT (and IP whitelist when configured)
router.use(authenticateJWT);
router.use(enforceIpWhitelist);

// Scan history — any authenticated workspace member
router.get('/', scanController.getScans);

// Start scan — workspace Owner or Admin
router.post(
  '/',
  checkWorkspaceRole([WORKSPACE_ROLES.OWNER, WORKSPACE_ROLES.ADMIN]),
  scanController.startScan
);

// Scan status — any authenticated workspace member
router.get('/:id/status', scanController.getScanStatus);

// Scan results (mock findings) — any authenticated workspace member
router.get('/:id/results', scanController.getScanResults);

// Re-run scan — Owner, Admin, or Analyst
router.post(
  '/:id/rerun',
  checkWorkspaceRole([WORKSPACE_ROLES.OWNER, WORKSPACE_ROLES.ADMIN, WORKSPACE_ROLES.ANALYST]),
  scanController.rerunScan
);

// Full scan record — any authenticated workspace member
router.get('/:id', scanController.getScanById);

module.exports = router;
