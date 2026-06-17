const express = require('express');
const authenticateJWT = require('../middleware/auth');
const integrationController = require('../controllers/integration.controller');

const router = express.Router();

router.use(authenticateJWT);

router.get('/', integrationController.getIntegrations);
router.post('/', integrationController.connectIntegration);
router.delete('/:id', integrationController.disconnectIntegration);
router.post('/test', integrationController.testIntegration);

module.exports = router;
