const express = require('express');
const authenticateJWT = require('../middleware/auth');
const invitationController = require('../controllers/invitation.controller');

const router = express.Router();

router.get('/:token', invitationController.getInvitation);
router.post('/:token/accept', authenticateJWT, invitationController.acceptInvitation);

module.exports = router;
