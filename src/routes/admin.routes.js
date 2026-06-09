const express = require('express');
const router = express.Router();
const adminController = require('../controllers/admin.controller');
const authenticateJWT = require('../middleware/auth');
const { checkGlobalRole } = require('../middleware/rbac');
const { USER_ROLES } = require('../constants');

// Apply JWT verification and check global role: admin or superadmin
router.use(authenticateJWT);
router.use(checkGlobalRole([USER_ROLES.ADMIN, USER_ROLES.SUPERADMIN]));

router.get('/users', adminController.getUsers);
router.put('/users/:id/status', adminController.updateUserStatus);
router.get('/system-health', adminController.getSystemHealth);

module.exports = router;
