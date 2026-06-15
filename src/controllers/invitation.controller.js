const teamService = require('../services/team.service');

const getInvitation = async (req, res, next) => {
  try {
    const data = await teamService.getInvitationByToken(req.params.token);
    res.status(200).json(data);
  } catch (error) {
    next(error);
  }
};

const acceptInvitation = async (req, res, next) => {
  try {
    const data = await teamService.acceptInvitation(req.user._id, req.params.token, req);
    res.status(200).json(data);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getInvitation,
  acceptInvitation,
};
