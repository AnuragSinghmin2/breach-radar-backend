const logger = require('../config/logger');

// Simple IP range / exact match validation check helper
const checkIpMatch = (clientIp, allowedIps) => {
  return allowedIps.some((ipPattern) => {
    // Exact IP Match
    if (ipPattern === clientIp) return true;
    
    // CIDR subnet check logic placeholder
    if (ipPattern.includes('/')) {
      const [subnet, mask] = ipPattern.split('/');
      // Real check logic will be implemented as part of business logic.
      // For now, return false unless it matches base subnet
      return clientIp.startsWith(subnet.split('.').slice(0, 3).join('.'));
    }

    return false;
  });
};

const enforceIpWhitelist = async (req, res, next) => {
  try {
    if (!req.user) {
      return next();
    }

    const Workspace = require('../models/Workspace');
    const workspaceId = req.workspaceId || req.params.workspaceId;

    if (!workspaceId) {
      return next();
    }

    // Skip whitelists for superadmins
    if (req.user.role === 'superadmin') {
      return next();
    }

    // Load workspace policies
    const workspace = await Workspace.findById(workspaceId);
    if (!workspace) {
      return next();
    }

    // Fetch trusted IPs from user settings or workspace settings
    const trustedIps = req.user.security.trustedIps || [];

    if (trustedIps.length === 0) {
      return next(); // Whitelist is empty, skip restrictions
    }

    // Fetch client IP address
    const clientIp = req.ip || req.connection.remoteAddress;

    const isAllowed = checkIpMatch(clientIp, trustedIps);
    if (!isAllowed) {
      logger.warn(`Access blocked from IP ${clientIp} for user ${req.user.email} (Not in trusted IP list)`);
      return res.status(403).json({
        message: 'Access Blocked: Request originating from outside trusted IP whitelist definitions.'
      });
    }

    next();
  } catch (error) {
    logger.error(`IP whitelist middleware error: ${error.message}`);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
};

module.exports = enforceIpWhitelist;
