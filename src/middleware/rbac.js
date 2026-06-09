const logger = require('../config/logger');

// Check global role of the user (e.g. user, admin, superadmin)
const checkGlobalRole = (allowedRoles) => {
  return (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({ message: 'Authentication required' });
      }

      if (!allowedRoles.includes(req.user.role)) {
        logger.warn(`Unauthorized access attempt by ${req.user.email} with role ${req.user.role}`);
        return res.status(403).json({ message: 'Forbidden: Insufficient privileges' });
      }

      next();
    } catch (error) {
      logger.error(`Global RBAC middleware error: ${error.message}`);
      return res.status(500).json({ message: 'Internal Server Error' });
    }
  };
};

// Check workspace specific role of user (e.g. Owner, Admin, Analyst)
const checkWorkspaceRole = (allowedRoles) => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({ message: 'Authentication required' });
      }

      const Workspace = require('../models/Workspace');
      const workspaceId = req.params.workspaceId || req.workspaceId;

      if (!workspaceId) {
        return res.status(400).json({ message: 'Workspace ID context is missing' });
      }

      const workspace = await Workspace.findById(workspaceId);
      if (!workspace) {
        return res.status(404).json({ message: 'Workspace not found' });
      }

      // Check if user is owner of workspace
      const isOwner = workspace.owner.toString() === req.user._id.toString();
      
      // Find user role inside members
      const member = workspace.members.find(
        (m) => m.user.toString() === req.user._id.toString()
      );

      const userRole = isOwner ? 'Owner' : (member ? member.role : null);

      if (!userRole) {
        return res.status(403).json({ message: 'Access denied: You are not a member of this workspace' });
      }

      if (!allowedRoles.includes(userRole)) {
        logger.warn(`Workspace unauthorized attempt by user ${req.user.email} in workspace ${workspaceId}`);
        return res.status(403).json({ message: 'Forbidden: Insufficient workspace permissions' });
      }

      // Keep workspace instance in context for downstream handlers
      req.workspace = workspace;
      next();
    } catch (error) {
      logger.error(`Workspace RBAC middleware error: ${error.message}`);
      return res.status(500).json({ message: 'Internal Server Error' });
    }
  };
};

module.exports = {
  checkGlobalRole,
  checkWorkspaceRole
};
