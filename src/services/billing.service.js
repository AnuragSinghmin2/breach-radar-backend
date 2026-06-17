const crypto = require('crypto');
const SubscriptionPlan = require('../models/SubscriptionPlan');
const Subscription = require('../models/Subscription');
const PaymentTransaction = require('../models/PaymentTransaction');
const Invoice = require('../models/Invoice');
const Domain = require('../models/Domain');
const Scan = require('../models/Scan');
const TeamMember = require('../models/TeamMember');
const teamService = require('./team.service');
const paymentService = require('./payment.service');
const invoicePdfService = require('./invoicePdf.service');

const PLAN_ORDER = ['Starter', 'Professional', 'Business', 'Enterprise'];

function addMonths(date, count) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + count);
  return next;
}

function cycleMultiplier(cycle) {
  return cycle === 'yearly' ? 10 : 1;
}

function formatCurrency(amount, currency = 'INR') {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amount || 0);
}

function generateInvoiceNumber() {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const suffix = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `INV-${date}-${suffix}`;
}

function mapPlan(plan) {
  const monthly = plan.price || 0;
  return {
    id: plan._id,
    name: plan.name,
    displayName: plan.displayName || plan.name,
    monthly,
    yearly: monthly * cycleMultiplier('yearly'),
    currency: plan.currency || 'INR',
    billingInterval: plan.billingInterval,
    seatLimit: plan.seatLimit,
    domainLimit: plan.domainLimit,
    scanLimit: plan.scanLimit,
    sortOrder: plan.sortOrder,
    isActive: plan.isActive,
    features: plan.features || [],
  };
}

function mapInvoice(invoice) {
  return {
    id: invoice._id,
    invoiceNumber: invoice.invoiceNumber,
    date: invoice.generatedAt || invoice.createdAt,
    amount: invoice.amount,
    tax: invoice.tax,
    currency: invoice.currency,
    amountLabel: formatCurrency(invoice.amount + invoice.tax, invoice.currency),
    planName: invoice.planName,
    status: invoice.paymentStatus,
    transactionId: invoice.transactionId,
  };
}

function mapTransaction(transaction) {
  return {
    id: transaction._id,
    transactionId: transaction.transactionId,
    provider: transaction.provider,
    amount: transaction.amount,
    currency: transaction.currency,
    amountLabel: formatCurrency(transaction.amount, transaction.currency),
    status: transaction.status,
    createdAt: transaction.createdAt,
  };
}

async function ensureSubscription(user, organization) {
  let subscription = await Subscription.findOne({ organizationId: organization._id });

  if (!subscription) {
    subscription = await Subscription.create({
      userId: organization.ownerId || user._id,
      organizationId: organization._id,
      currentPlan: organization.subscriptionPlan || 'Starter',
      billingCycle: 'monthly',
      startDate: new Date(),
      nextBillingDate: addMonths(new Date(), 1),
      paymentStatus: 'free',
      status: 'active',
    });
  }

  return subscription;
}

async function getUsageMetrics(user, organization, subscription, plan) {
  const workspaceId = user.preferences?.activeWorkspaceId;
  const since = subscription.startDate || new Date(new Date().getFullYear(), new Date().getMonth(), 1);

  const [domainsUsed, scansUsed, seatsUsed] = await Promise.all([
    workspaceId ? Domain.countDocuments({ workspaceId }) : 0,
    workspaceId ? Scan.countDocuments({ workspaceId, createdAt: { $gte: since } }) : 0,
    TeamMember.countDocuments({ organizationId: organization._id, status: { $in: ['ACTIVE', 'PENDING', 'SUSPENDED'] } }),
  ]);

  const domainLimit = plan?.domainLimit || 1;
  const scanLimit = plan?.scanLimit || 5;
  const seatLimit = plan?.seatLimit || organization.maxSeats || 1;

  const displayLimit = (val) => (val >= 999999 ? 'Unlimited' : val);

  return [
    { key: 'domains', label: 'Domains', used: domainsUsed, limit: displayLimit(domainLimit), rawLimit: domainLimit, tone: 'green' },
    { key: 'scans', label: 'Scans', used: scansUsed, limit: displayLimit(scanLimit), rawLimit: scanLimit, tone: 'blue' },
    { key: 'seats', label: 'Seats', used: seatsUsed, limit: displayLimit(seatLimit), rawLimit: seatLimit, tone: 'orange' },
  ];
}

async function getOverview(userId) {
  const { user, organization, actorMember } = await teamService.getContext(userId);
  const [plansRaw, subscription] = await Promise.all([
    SubscriptionPlan.find({ isActive: true }).sort({ sortOrder: 1, price: 1 }),
    ensureSubscription(user, organization),
  ]);

  const plans = plansRaw.map(mapPlan);
  const currentPlan = plansRaw.find((plan) => plan.name === subscription.currentPlan)
    || plansRaw.find((plan) => plan.name === organization.subscriptionPlan)
    || plansRaw[0];

  const [invoices, transactions, usage] = await Promise.all([
    Invoice.find({ organizationId: organization._id }).sort({ generatedAt: -1, createdAt: -1 }).limit(12),
    PaymentTransaction.find({ organizationId: organization._id }).sort({ createdAt: -1 }).limit(12),
    getUsageMetrics(user, organization, subscription, currentPlan),
  ]);

  return {
    organization: {
      id: organization._id,
      name: organization.name,
      subscriptionPlan: organization.subscriptionPlan,
      maxSeats: organization.maxSeats,
    },
    role: actorMember.role,
    subscription: {
      id: subscription._id,
      currentPlan: subscription.currentPlan,
      billingCycle: subscription.billingCycle,
      startDate: subscription.startDate,
      expiryDate: subscription.expiryDate,
      nextBillingDate: subscription.nextBillingDate,
      paymentStatus: subscription.paymentStatus,
      status: subscription.status,
      autoRenew: subscription.autoRenew,
      transactionId: subscription.transactionId,
    },
    activePlan: currentPlan ? mapPlan(currentPlan) : null,
    plans,
    usage,
    invoices: invoices.map(mapInvoice),
    transactions: transactions.map(mapTransaction),
    paymentMethod: {
      provider: transactions[0]?.provider || 'manual',
      last4: transactions[0]?.metadata?.last4 || '',
      billingEmail: user.email,
    },
  };
}

/**
 * Validates whether an organization can downgrade to a target plan based on current usage.
 */
async function validatePlanDowngrade(user, organization, subscription, targetPlan) {
  const currentPlan = subscription.currentPlan;
  
  // Verify plan orders
  const currentIndex = PLAN_ORDER.indexOf(currentPlan);
  const targetIndex = PLAN_ORDER.indexOf(targetPlan.name);
  
  if (currentIndex <= targetIndex) {
    // Not a downgrade (either upgrade or same plan change)
    return { isDowngrade: false, valid: true };
  }

  const usage = await getUsageMetrics(user, organization, subscription, targetPlan);
  const violations = [];

  for (const metric of usage) {
    if (metric.rawLimit < 999999 && metric.used > metric.rawLimit) {
      violations.push(
        `Your active ${metric.label.toLowerCase()} count (${metric.used}) exceeds the target plan limit (${metric.limit}).`
      );
    }
  }

  if (violations.length > 0) {
    return {
      isDowngrade: true,
      valid: false,
      message: `Cannot downgrade subscription plan. Please address the following usage limits:`,
      violations
    };
  }

  return { isDowngrade: true, valid: true };
}

/**
 * Handle subscription upgrades (requires gateway details).
 */
async function upgradePlan(userId, { planName, billingCycle, provider }) {
  const { user, organization, actorMember } = await teamService.getContext(userId);
  if (actorMember.role !== 'OWNER') {
    const error = new Error('Only the organization owner can upgrade the billing plan.');
    error.statusCode = 403;
    throw error;
  }

  const normalizedPlanName = String(planName || '').trim();
  const normalizedBillingCycle = String(billingCycle || 'monthly').trim();
  const normalizedProvider = String(provider || 'stripe').trim();

  if (!['monthly', 'yearly'].includes(normalizedBillingCycle)) {
    const error = new Error('Billing cycle must be monthly or yearly.');
    error.statusCode = 400;
    throw error;
  }

  const plan = await SubscriptionPlan.findOne({ name: normalizedPlanName, isActive: true });
  if (!plan) {
    const error = new Error('Selected plan is not available.');
    error.statusCode = 404;
    throw error;
  }

  const subscription = await ensureSubscription(user, organization);
  const amount = (plan.price || 0) * cycleMultiplier(normalizedBillingCycle);

  // If price is 0 (free tier plan upgrade, e.g. switching back from Professional to Starter, though that is usually a downgrade check)
  if (amount === 0) {
    return changePlanImmediate(user, organization, subscription, plan, normalizedBillingCycle, 'free', 'free_upgrade_txn');
  }

  // Initiate gateway transaction
  const paymentDetails = await paymentService.initiatePayment({
    userId: user._id,
    organizationId: organization._id,
    planName: plan.name,
    billingCycle: normalizedBillingCycle,
    amount,
    provider: normalizedProvider
  });

  return {
    message: `Payment initiated for ${plan.name} plan.`,
    checkoutData: paymentDetails.checkoutData,
    transaction: paymentDetails.transaction
  };
}

/**
 * Handle subscription downgrades (checks usage limits).
 */
async function downgradePlan(userId, { planName, billingCycle }) {
  const { user, organization, actorMember } = await teamService.getContext(userId);
  if (actorMember.role !== 'OWNER') {
    const error = new Error('Only the organization owner can change subscription tiers.');
    error.statusCode = 403;
    throw error;
  }

  const normalizedPlanName = String(planName || '').trim();
  const normalizedBillingCycle = String(billingCycle || 'monthly').trim();

  const plan = await SubscriptionPlan.findOne({ name: normalizedPlanName, isActive: true });
  if (!plan) {
    const error = new Error('Selected plan is not available.');
    error.statusCode = 404;
    throw error;
  }

  const subscription = await ensureSubscription(user, organization);

  // 1. Enforce downgrade check
  const downgradeValidation = await validatePlanDowngrade(user, organization, subscription, plan);
  if (!downgradeValidation.valid) {
    const error = new Error(
      `${downgradeValidation.message}\n` + downgradeValidation.violations.join('\n')
    );
    error.statusCode = 400;
    error.violations = downgradeValidation.violations;
    throw error;
  }

  // 2. Perform immediate free switch or manual invoice adjust since it's a downgrade
  const now = new Date();
  const amount = (plan.price || 0) * cycleMultiplier(normalizedBillingCycle);
  const transactionId = `txn_dg_${Date.now()}`;

  return changePlanImmediate(user, organization, subscription, plan, normalizedBillingCycle, amount > 0 ? 'paid' : 'free', transactionId);
}

/**
 * Execute immediate database updates to activate a plan.
 */
async function changePlanImmediate(user, organization, subscription, plan, billingCycle, paymentStatus, transactionId) {
  const now = new Date();
  const amount = (plan.price || 0) * cycleMultiplier(billingCycle);

  subscription.currentPlan = plan.name;
  subscription.billingCycle = billingCycle;
  subscription.startDate = now;
  subscription.expiryDate = null;
  subscription.nextBillingDate = addMonths(now, billingCycle === 'yearly' ? 12 : 1);
  subscription.paymentStatus = paymentStatus;
  subscription.status = 'active';
  subscription.cancelledAt = null;
  subscription.transactionId = transactionId;

  organization.subscriptionPlan = plan.name;
  organization.maxSeats = plan.seatLimit || organization.maxSeats;

  user.profile.plan = plan.name;

  // Create Invoice
  const invoice = await Invoice.create({
    invoiceNumber: generateInvoiceNumber(),
    userId: user._id,
    organizationId: organization._id,
    subscriptionId: subscription._id,
    planName: plan.name,
    amount,
    tax: 0,
    currency: plan.currency || 'INR',
    paymentStatus: amount > 0 ? 'paid' : 'pending',
    transactionId,
  });

  // Create or Update Payment Transaction
  let paymentTxn = await PaymentTransaction.findOne({ transactionId });
  if (paymentTxn) {
    paymentTxn.subscriptionId = subscription._id;
    paymentTxn.invoiceId = invoice._id;
    if (amount > 0) {
      paymentTxn.status = 'succeeded';
    }
    await paymentTxn.save();
  } else {
    await PaymentTransaction.create({
      userId: user._id,
      organizationId: organization._id,
      subscriptionId: subscription._id,
      invoiceId: invoice._id,
      provider: amount > 0 ? 'manual' : 'free',
      transactionId,
      amount,
      currency: plan.currency || 'INR',
      status: amount > 0 ? 'succeeded' : 'created',
      metadata: {
        planName: plan.name,
        billingCycle,
        source: 'immediate_activation'
      }
    });
  }

  await Promise.all([subscription.save(), organization.save(), user.save()]);

  return {
    message: `${plan.name} plan activated successfully.`,
    overview: await getOverview(user._id)
  };
}

/**
 * Cancels auto-renew or cancels the subscription directly.
 */
async function cancelSubscription(userId) {
  const { user, organization, actorMember } = await teamService.getContext(userId);
  if (actorMember.role !== 'OWNER') {
    const error = new Error('Only the organization owner can cancel billing.');
    error.statusCode = 403;
    throw error;
  }

  const subscription = await Subscription.findOne({ organizationId: organization._id });
  if (!subscription) {
    const error = new Error('Subscription details not found.');
    error.statusCode = 404;
    throw error;
  }

  subscription.status = 'cancelled';
  subscription.paymentStatus = 'cancelled';
  subscription.autoRenew = false;
  subscription.cancelledAt = new Date();
  await subscription.save();

  return {
    message: 'Subscription cancellation scheduled.',
    overview: await getOverview(user._id),
  };
}

/**
 * Compiles a specific invoice PDF buffer.
 */
async function getInvoicePdf(userId, invoiceId) {
  const { user, organization } = await teamService.getContext(userId);
  
  const invoice = await Invoice.findOne({ _id: invoiceId, organizationId: organization._id });
  if (!invoice) {
    const error = new Error('Invoice not found or unauthorized.');
    error.statusCode = 404;
    throw error;
  }

  const pdfBuffer = await invoicePdfService.generateInvoicePdf(invoice, user, organization);
  return {
    filename: `${invoice.invoiceNumber}.pdf`,
    buffer: pdfBuffer
  };
}

module.exports = {
  getOverview,
  getUsageMetrics,
  validatePlanDowngrade,
  upgradePlan,
  downgradePlan,
  cancelSubscription,
  getInvoicePdf,
  changePlanImmediate
};
