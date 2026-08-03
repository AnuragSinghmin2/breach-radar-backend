const express = require('express');
const authenticateJWT = require('../middleware/auth');
const requireSuperAdmin = require('../middleware/requireSuperAdmin');
const supportController = require('../controllers/support.controller');

const router = express.Router();

router.use(authenticateJWT);
router.use(requireSuperAdmin);

router.get('/', supportController.listSupportTickets);
router.get('/:id', supportController.getSupportTicket);
router.patch('/:id', supportController.updateSupportTicket);
router.delete('/:id', supportController.deleteSupportTicket);

module.exports = router;
