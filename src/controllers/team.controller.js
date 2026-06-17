const teamService = require('../services/team.service');

const getTeam = async (req, res, next) => {
  try {
    const data = await teamService.getDashboard(req.user._id, req.query);
    res.status(200).json(data);
  } catch (error) {
    next(error);
  }
};

const inviteMember = async (req, res, next) => {
  try {
    const data = await teamService.inviteMember(req.user._id, req.body);
    res.status(201).json(data);
  } catch (error) {
    next(error);
  }
};

const getInvitations = async (req, res, next) => {
  try {
    const data = await teamService.getInvitations(req.user._id, req.query);
    res.status(200).json(data);
  } catch (error) {
    next(error);
  }
};

const resendInvitation = async (req, res, next) => {
  try {
    const data = await teamService.resendInvitation(req.user._id, req.params.id);
    res.status(200).json(data);
  } catch (error) {
    next(error);
  }
};

const getEmailStatus = async (req, res, next) => {
  try {
    const data = await teamService.getEmailDebugStatus();
    res.status(200).json(data);
  } catch (error) {
    next(error);
  }
};

const revokeInvitation = async (req, res, next) => {
  try {
    const data = await teamService.revokeInvitation(req.user._id, req.params.id);
    res.status(200).json(data);
  } catch (error) {
    next(error);
  }
};

const deleteInvitation = async (req, res, next) => {
  try {
    const data = await teamService.deleteInvitation(req.user._id, req.params.id);
    res.status(200).json(data);
  } catch (error) {
    next(error);
  }
};

const updateMemberRole = async (req, res, next) => {
  try {
    const data = await teamService.updateMemberRole(req.user._id, req.params.id, req.body.role);
    res.status(200).json(data);
  } catch (error) {
    next(error);
  }
};

const updateMemberStatus = async (req, res, next) => {
  try {
    const data = await teamService.setMemberStatus(req.user._id, req.params.id, req.body.status);
    res.status(200).json(data);
  } catch (error) {
    next(error);
  }
};

const removeMember = async (req, res, next) => {
  try {
    const data = await teamService.removeMember(req.user._id, req.params.id);
    res.status(200).json(data);
  } catch (error) {
    next(error);
  }
};

const updateOrganization = async (req, res, next) => {
  try {
    const data = await teamService.updateOrganization(req.user._id, req.body);
    res.status(200).json(data);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getTeam,
  inviteMember,
  getInvitations,
  resendInvitation,
  getEmailStatus,
  revokeInvitation,
  deleteInvitation,
  updateMemberRole,
  updateMemberStatus,
  removeMember,
  updateOrganization,
};
