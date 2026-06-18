const express = require('express');
const authenticateJWT = require('../middleware/auth');
const { requireTeamRole } = require('../middleware/teamRbac');
const billingController = require('../controllers/billing.controller');

const requireSuperAdmin = require('../middleware/requireSuperAdmin');

const router = express.Router();

// 1. Apply JWT authentication for all paths
router.use(authenticateJWT);

// Super Admin Health Checks
router.get('/health', requireSuperAdmin, billingController.getBillingHealth);

// Get summaries and records
router.get('/', requireTeamRole(['OWNER', 'ADMIN']), billingController.getBillingOverview);
router.get('/current-plan', requireTeamRole(['OWNER', 'ADMIN']), billingController.getCurrentPlan);
router.get('/usage', requireTeamRole(['OWNER', 'ADMIN']), billingController.getUsage);
router.get('/invoices', requireTeamRole(['OWNER', 'ADMIN']), billingController.getInvoices);
router.get('/invoices/:id/pdf', requireTeamRole(['OWNER', 'ADMIN']), billingController.getInvoicePdf);
router.get('/timeline', requireTeamRole(['OWNER', 'ADMIN']), billingController.getTimeline);

// Plan manipulation (Upgrade / Downgrade / Cancel)
router.post('/upgrade', requireTeamRole(['OWNER']), billingController.upgradePlan);
router.post('/downgrade', requireTeamRole(['OWNER']), billingController.downgradePlan);
router.post('/cancel', requireTeamRole(['OWNER']), billingController.cancelSubscription);
router.put('/usage-alerts', requireTeamRole(['OWNER', 'ADMIN']), billingController.updateUsageAlertSettings);

// Backward compatibility with legacy settings calls
router.post('/change-plan', requireTeamRole(['OWNER']), billingController.upgradePlan);

module.exports = router;

