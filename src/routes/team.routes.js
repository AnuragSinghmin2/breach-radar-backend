const express = require('express');
const authenticateJWT = require('../middleware/auth');
const { requireTeamRole } = require('../middleware/teamRbac');
const teamController = require('../controllers/team.controller');

const router = express.Router();

router.use(authenticateJWT);

router.get('/', teamController.getTeam);
router.post('/invite', requireTeamRole(['OWNER', 'ADMIN']), teamController.inviteMember);
router.get('/invitations', requireTeamRole(['OWNER', 'ADMIN']), teamController.getInvitations);
router.post('/invite/:id/resend', requireTeamRole(['OWNER', 'ADMIN']), teamController.resendInvitation);
router.patch('/invite/:id/revoke', requireTeamRole(['OWNER', 'ADMIN']), teamController.revokeInvitation);
router.delete('/invite/:id', requireTeamRole(['OWNER', 'ADMIN']), teamController.deleteInvitation);
router.patch('/member/:id/role', requireTeamRole(['OWNER', 'ADMIN']), teamController.updateMemberRole);
router.patch('/member/:id/status', requireTeamRole(['OWNER', 'ADMIN']), teamController.updateMemberStatus);
router.delete('/member/:id', requireTeamRole(['OWNER', 'ADMIN']), teamController.removeMember);
router.patch('/organization', requireTeamRole(['OWNER']), teamController.updateOrganization);

module.exports = router;
