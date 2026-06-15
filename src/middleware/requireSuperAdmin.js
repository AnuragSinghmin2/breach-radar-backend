const { checkGlobalRole } = require('./rbac');
const { USER_ROLES } = require('../constants');

// Check if req.user has super_admin role
const requireSuperAdmin = checkGlobalRole([USER_ROLES.SUPER_ADMIN]);

module.exports = requireSuperAdmin;
