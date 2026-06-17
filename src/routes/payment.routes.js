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
  try {
    const { razorpay_payment_id, razorpay_order_id, razorpay_signature } = req.body;

    if (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature) {
      return res.status(400).json({ message: 'Missing Razorpay signature verification details.' });
    }

    // Verify cryptographic HMAC SHA256 signature
    const hmac = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET || 'rzp_secret_placeholder');
    hmac.update(`${razorpay_order_id}|${razorpay_payment_id}`);
    const generatedSignature = hmac.digest('hex');

    if (generatedSignature !== razorpay_signature) {
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

    res.status(200).json({
      message: 'Plan upgraded successfully.',
      planName: plan.name
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
