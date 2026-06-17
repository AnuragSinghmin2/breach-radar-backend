const express = require('express');
const authenticateJWT = require('../middleware/auth');
const apiAccessController = require('../controllers/apiAccess.controller');

const router = express.Router();

router.use(authenticateJWT);

router.get('/', apiAccessController.getApiAccess);
router.post('/generate', apiAccessController.generateApiKey);
router.post('/regenerate/:id', apiAccessController.regenerateApiKey);
router.delete('/:id', apiAccessController.revokeApiKey);

module.exports = router;
