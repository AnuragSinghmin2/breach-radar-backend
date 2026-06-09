const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboard.controller');
const authenticateJWT = require('../middleware/auth');
const enforceIpWhitelist = require('../middleware/ipWhitelist');

router.use(authenticateJWT);
router.use(enforceIpWhitelist);

router.get('/', dashboardController.getDashboard);

module.exports = router;
