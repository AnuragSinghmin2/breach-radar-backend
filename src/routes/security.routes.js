const express = require('express');
const authenticateJWT = require('../middleware/auth');
const securityController = require('../controllers/security.controller');

const router = express.Router();

router.use(authenticateJWT);

router.post('/change-password', securityController.changePassword);
router.post('/enable-2fa', securityController.enable2FA);
router.post('/disable-2fa', securityController.disable2FA);
router.get('/sessions', securityController.getSessions);
router.delete('/sessions/:id', securityController.revokeSession);

module.exports = router;
