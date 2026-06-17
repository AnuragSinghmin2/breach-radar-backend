const express = require('express');
const authenticateJWT = require('../middleware/auth');
const { requireTeamRole } = require('../middleware/teamRbac');
const billingController = require('../controllers/billing.controller');

const router = express.Router();

// 1. Apply JWT authentication for all paths
router.use(authenticateJWT);

// Get summaries and records
router.get('/', requireTeamRole(['OWNER', 'ADMIN']), billingController.getBillingOverview);
router.get('/current-plan', requireTeamRole(['OWNER', 'ADMIN']), billingController.getCurrentPlan);
router.get('/usage', requireTeamRole(['OWNER', 'ADMIN']), billingController.getUsage);
router.get('/invoices', requireTeamRole(['OWNER', 'ADMIN']), billingController.getInvoices);
router.get('/invoices/:id/pdf', requireTeamRole(['OWNER', 'ADMIN']), billingController.getInvoicePdf);

// Plan manipulation (Upgrade / Downgrade / Cancel)
router.post('/upgrade', requireTeamRole(['OWNER']), billingController.upgradePlan);
router.post('/downgrade', requireTeamRole(['OWNER']), billingController.downgradePlan);
router.post('/cancel', requireTeamRole(['OWNER']), billingController.cancelSubscription);

// Backward compatibility with legacy settings calls
router.post('/change-plan', requireTeamRole(['OWNER']), billingController.upgradePlan);

module.exports = router;

