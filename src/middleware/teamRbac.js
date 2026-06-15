const TeamMember = require('../models/TeamMember');
const teamService = require('../services/team.service');

const requireTeamRole = (allowedRoles) => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({ message: 'Authentication required' });
      }

      const organization = await teamService.ensureOrganizationForUser(req.user);
      const member = await TeamMember.findOne({
        organizationId: organization._id,
        userId: req.user._id,
        status: { $ne: 'SUSPENDED' },
      });

      if (!member) {
        return res.status(403).json({ message: 'Access denied: You are not an active team member.' });
      }

      if (!allowedRoles.includes(member.role)) {
        return res.status(403).json({ message: 'Forbidden: Insufficient team permissions.' });
      }

      req.organization = organization;
      req.teamMember = member;
      next();
    } catch (error) {
      next(error);
    }
  };
};

module.exports = { requireTeamRole };
