const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const crypto = require('crypto');
const Razorpay = require('razorpay');

const authenticateJWT = require('../middleware/auth');
const { requireTeamRole } = require('../middleware/teamRbac');
const SubscriptionPlan = require('../models/SubscriptionPlan');
const Subscription = require('../models/Subscription');
const PaymentTransaction = require('../models/PaymentTransaction');
const billingService = require('../services/billing.service');
const logger = require('../config/logger');

// Initialize Razorpay SDK client
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID || 'rzp_test_placeholder',
  key_secret: process.env.RAZORPAY_KEY_SECRET || 'rzp_secret_placeholder'
});

/**
 * POST /api/payment/create-order
 * Create a new Razorpay payment order for subscription upgrade.
 */
router.post('/create-order', authenticateJWT, requireTeamRole(['OWNER']), async (req, res, next) => {
  try {
    const { planId, billingCycle = 'monthly' } = req.body;
    
    if (!planId) {
      return res.status(400).json({ message: 'planId is required.' });
    }

    if (!['monthly', 'yearly'].includes(billingCycle)) {
      return res.status(400).json({ message: 'billingCycle must be monthly or yearly.' });
    }

    // Find subscription plan by ObjectId or by Plan Name (Starter, Professional, etc.)
    let plan;
    if (mongoose.Types.ObjectId.isValid(planId)) {
      plan = await SubscriptionPlan.findById(planId);
    } else {
      plan = await SubscriptionPlan.findOne({ name: planId, isActive: true });
    }

    if (!plan) {
      return res.status(404).json({ message: 'Selected plan is not available.' });
    }

    const price = plan.price || 0;
    const cycleMultiplier = billingCycle === 'yearly' ? 10 : 1;
    const amountInINR = price * cycleMultiplier;
    
    // Razorpay amount is in paise (1 INR = 100 paise)
    const amountInPaise = Math.round(amountInINR * 100);

    if (amountInPaise <= 0) {
      return res.status(400).json({ message: 'Cannot create order for zero-amount plans.' });
    }

    // Place order via Razorpay SDK
    const rzpOrder = await razorpay.orders.create({
      amount: amountInPaise,
      currency: plan.currency || 'INR',
      receipt: `rcpt_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
      notes: {
        userId: req.user._id.toString(),
        organizationId: req.organization._id.toString(),
        planName: plan.name,
        billingCycle
      }
    });

    // Save pending transaction in our database
    const transactionId = `txn_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    await PaymentTransaction.create({
      userId: req.user._id,
      organizationId: req.organization._id,
      provider: 'razorpay',
      providerOrderId: rzpOrder.id,
      transactionId,
      amount: amountInINR,
      currency: plan.currency || 'INR',
      status: 'pending',
      metadata: {
        planName: plan.name,
        billingCycle,
        source: 'billing_upgrade'
      }
    });

    res.status(200).json({
      orderId: rzpOrder.id,
      amount: rzpOrder.amount,
      currency: rzpOrder.currency,
      key: process.env.RAZORPAY_KEY_ID
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/payment/verify
 * Validate dynamic signature submitted by checkout modal and activate subscription plan.
 */
router.post('/verify', authenticateJWT, requireTeamRole(['OWNER']), async (req, res, next) => {
  const auditService = require('../services/audit.service');
  const { razorpay_payment_id, razorpay_order_id, razorpay_signature } = req.body;
  try {
    if (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature) {
      return res.status(400).json({ message: 'Missing Razorpay signature verification details.' });
    }

    // Verify cryptographic HMAC SHA256 signature
    const hmac = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET || 'rzp_secret_placeholder');
    hmac.update(`${razorpay_order_id}|${razorpay_payment_id}`);
    const generatedSignature = hmac.digest('hex');

    if (generatedSignature !== razorpay_signature) {
      await auditService.logRequestAudit(
        req,
        'Payment Failure',
        `Signature verification failed for order ${razorpay_order_id}.`,
        'Failure'
      );
      try {
        const Notification = require('../models/Notification');
        await Notification.create({
          organizationId: req.organization._id,
          userId: req.user._id,
          email: req.user.email,
          type: 'PAYMENT_FAILURE',
          title: 'Payment Failed',
          message: `Signature verification failed for order ${razorpay_order_id}.`
        });
      } catch (notifErr) {
        logger.error(`[payment-routes] Failed to create payment failure notification: ${notifErr.message}`);
      }
      return res.status(400).json({ message: 'Invalid payment signature verification failed.' });
    }

    // Fetch matching pending transaction
    const transaction = await PaymentTransaction.findOne({ providerOrderId: razorpay_order_id });
    if (!transaction) {
      return res.status(404).json({ message: 'Transaction reference not found.' });
    }

    if (transaction.status === 'succeeded') {
      return res.status(200).json({ message: 'Payment has already been processed.' });
    }

    // Update transaction attributes
    transaction.status = 'succeeded';
    transaction.providerPaymentId = razorpay_payment_id;
    await transaction.save();

    const planName = transaction.metadata?.planName || 'Professional';
    const billingCycle = transaction.metadata?.billingCycle || 'monthly';

    // Retrieve active plan metadata
    const plan = await SubscriptionPlan.findOne({ name: planName, isActive: true });
    if (!plan) {
      return res.status(404).json({ message: `Target plan "${planName}" is not available.` });
    }

    // Fetch subscription document
    const subscription = await Subscription.findOne({ organizationId: req.organization._id });
    if (!subscription) {
      return res.status(404).json({ message: 'Subscription reference not found for this workspace.' });
    }

    // Activate the subscription immediately in the database
    await billingService.changePlanImmediate(
      req.user,
      req.organization,
      subscription,
      plan,
      billingCycle,
      'paid',
      transaction.transactionId
    );

    // Audit Log for Payment Success
    await auditService.logRequestAudit(
      req,
      'Payment Success',
      `Payment succeeded for plan ${plan.name} (${billingCycle}). Order ID: ${razorpay_order_id}. Payment ID: ${razorpay_payment_id}.`
    );

    try {
      const Notification = require('../models/Notification');
      await Notification.create({
        organizationId: req.organization._id,
        userId: req.user._id,
        email: req.user.email,
        type: 'PAYMENT_SUCCESS',
        title: 'Payment Successful',
        message: `Your payment was verified successfully for the ${plan.name} plan.`
      });
    } catch (notifErr) {
      logger.error(`[payment-routes] Failed to create payment success notification: ${notifErr.message}`);
    }

    res.status(200).json({
      message: 'Plan upgraded successfully.',
      planName: plan.name
    });
  } catch (error) {
    // Log payment error audit
    await auditService.logRequestAudit(
      req,
      'Payment Failure',
      `Payment processing failed: ${error.message}`,
      'Failure'
    );
    try {
      const Notification = require('../models/Notification');
      await Notification.create({
        organizationId: req.organization._id,
        userId: req.user._id,
        email: req.user.email,
        type: 'PAYMENT_FAILURE',
        title: 'Payment Failed',
        message: `Payment processing failed: ${error.message}`
      });
    } catch (notifErr) {
      logger.error(`[payment-routes] Failed to create payment failure notification: ${notifErr.message}`);
    }
    next(error);
  }
});

/**
 * POST /api/payment/webhook
 * Razorpay Webhook receiver for async notification events.
 */
router.post('/webhook', async (req, res, next) => {
  const logger = require('../config/logger');
  try {
    const signature = req.headers['x-razorpay-signature'];
    if (!signature) {
      return res.status(400).json({ message: 'Missing Razorpay webhook signature.' });
    }

    const secret = process.env.RAZORPAY_WEBHOOK_SECRET || 'webhook_secret_placeholder';
    
    // Validate signature using rawBody
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(req.rawBody || JSON.stringify(req.body));
    const generatedSignature = hmac.digest('hex');

    if (generatedSignature !== signature) {
      logger.warn('[webhook] Webhook signature verification failed.');
      return res.status(400).json({ message: 'Invalid webhook signature.' });
    }

    const event = req.body.event;
    const payload = req.body.payload;

    logger.info(`Received Razorpay webhook event: ${event}`);

    let providerOrderId = '';
    let providerPaymentId = '';
    let isSuccess = false;
    let isFailure = false;
    let failureReason = '';

    if (event === 'order.paid' && payload.order) {
      providerOrderId = payload.order.entity.id;
      isSuccess = true;
    } else if (event === 'payment.captured' && payload.payment) {
      providerOrderId = payload.payment.entity.order_id;
      providerPaymentId = payload.payment.entity.id;
      isSuccess = true;
    } else if (event === 'payment.failed' && payload.payment) {
      providerOrderId = payload.payment.entity.order_id;
      providerPaymentId = payload.payment.entity.id;
      isFailure = true;
      failureReason = payload.payment.entity.error_description || 'Payment failed';
    }

    if (!providerOrderId) {
      return res.status(200).json({ status: 'ok', message: 'Event ignored: no order ID.' });
    }

    // Find pending transaction
    const transaction = await PaymentTransaction.findOne({ providerOrderId });
    if (!transaction) {
      logger.warn(`[webhook] Transaction not found for order: ${providerOrderId}`);
      return res.status(200).json({ status: 'ok', message: 'Transaction not found.' });
    }

    // Prevent duplicate processing
    if (transaction.status === 'succeeded') {
      logger.info(`[webhook] Transaction ${transaction.transactionId} already marked as succeeded. Preventing duplicate processing.`);
      return res.status(200).json({ status: 'ok', message: 'Payment already processed.' });
    }

    const auditService = require('../services/audit.service');

    if (isSuccess) {
      transaction.status = 'succeeded';
      if (providerPaymentId) {
        transaction.providerPaymentId = providerPaymentId;
      }
      await transaction.save();

      const planName = transaction.metadata?.planName || 'Professional';
      const billingCycle = transaction.metadata?.billingCycle || 'monthly';

      const plan = await SubscriptionPlan.findOne({ name: planName, isActive: true });
      if (!plan) {
        logger.error(`[webhook] Plan "${planName}" not found for transaction: ${transaction.transactionId}`);
        return res.status(404).json({ message: `Plan ${planName} not found` });
      }

      const User = require('../models/User');
      const Organization = require('../models/Organization');
      const Subscription = require('../models/Subscription');

      const user = await User.findById(transaction.userId);
      const organization = await Organization.findById(transaction.organizationId);
      if (!user || !organization) {
        logger.error(`[webhook] User/Org not found for transaction: ${transaction.transactionId}`);
        return res.status(404).json({ message: 'User or Org not found' });
      }

      const subscription = await Subscription.findOne({ organizationId: organization._id });
      if (!subscription) {
        logger.error(`[webhook] Subscription reference not found for Org: ${organization._id}`);
        return res.status(404).json({ message: 'Subscription reference not found' });
      }

      // Activate subscription & generate invoice in immediate activation logic
      await billingService.changePlanImmediate(
        user,
        organization,
        subscription,
        plan,
        billingCycle,
        'paid',
        transaction.transactionId
      );

      // Audit Log for Payment Success
      await auditService.logAudit({
        userId: user._id,
        action: 'Payment Success',
        description: `Razorpay payment captured via webhook. Order ID: ${providerOrderId}. Transaction ID: ${transaction.transactionId}.`,
        status: 'Success'
      });

      try {
        const Notification = require('../models/Notification');
        await Notification.create({
          organizationId: organization._id,
          userId: user._id,
          email: user.email,
          type: 'PAYMENT_SUCCESS',
          title: 'Payment Successful',
          message: `Your payment was captured successfully for the ${plan.name} plan via webhook.`
        });
      } catch (notifErr) {
        logger.error(`[webhook] Failed to create payment success notification: ${notifErr.message}`);
      }

      logger.info(`[webhook] Successfully processed payment and activated plan for organization: ${organization.name}`);

    } else if (isFailure) {
      transaction.status = 'failed';
      await transaction.save();

      // Audit Log for Payment Failure
      await auditService.logAudit({
        userId: transaction.userId,
        action: 'Payment Failure',
        description: `Razorpay payment failed via webhook. Order ID: ${providerOrderId}. Reason: ${failureReason}.`,
        status: 'Failure'
      });

      try {
        const User = require('../models/User');
        const Notification = require('../models/Notification');
        let userEmail = '';
        if (transaction.userId) {
          const u = await User.findById(transaction.userId);
          if (u) userEmail = u.email;
        }
        await Notification.create({
          organizationId: transaction.organizationId,
          userId: transaction.userId,
          email: userEmail,
          type: 'PAYMENT_FAILURE',
          title: 'Payment Failed',
          message: `Razorpay payment failed via webhook. Reason: ${failureReason}.`
        });
      } catch (notifErr) {
        logger.error(`[webhook] Failed to create payment failure notification: ${notifErr.message}`);
      }

      logger.info(`[webhook] Razorpay payment failed for order: ${providerOrderId}`);
    }

    res.status(200).json({ status: 'ok' });
  } catch (error) {
    logger.error(`[webhook] Webhook execution error: ${error.message}`);
    next(error);
  }
});

module.exports = router;
