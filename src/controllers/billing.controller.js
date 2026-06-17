const billingService = require('../services/billing.service');
const paymentService = require('../services/payment.service');
const SubscriptionPlan = require('../models/SubscriptionPlan');
const User = require('../models/User');
const Organization = require('../models/Organization');
const Subscription = require('../models/Subscription');
const logger = require('../config/logger');

const getBillingOverview = async (req, res, next) => {
  try {
    const data = await billingService.getOverview(req.user._id);
    res.status(200).json(data);
  } catch (error) {
    next(error);
  }
};

const getCurrentPlan = async (req, res, next) => {
  try {
    const data = await billingService.getOverview(req.user._id);
    res.status(200).json({
      currentPlan: data.subscription.currentPlan,
      subscription: data.subscription,
      activePlan: data.activePlan
    });
  } catch (error) {
    next(error);
  }
};

const getUsage = async (req, res, next) => {
  try {
    const data = await billingService.getOverview(req.user._id);
    res.status(200).json({
      usage: data.usage
    });
  } catch (error) {
    next(error);
  }
};

const getInvoices = async (req, res, next) => {
  try {
    const data = await billingService.getOverview(req.user._id);
    res.status(200).json({
      invoices: data.invoices
    });
  } catch (error) {
    next(error);
  }
};

const getInvoicePdf = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { filename, buffer } = await billingService.getInvoicePdf(req.user._id, id);
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.status(200).send(buffer);
  } catch (error) {
    next(error);
  }
};

const upgradePlan = async (req, res, next) => {
  try {
    const result = await billingService.upgradePlan(req.user._id, req.body);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

const downgradePlan = async (req, res, next) => {
  try {
    const result = await billingService.downgradePlan(req.user._id, req.body);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

const cancelSubscription = async (req, res, next) => {
  try {
    const result = await billingService.cancelSubscription(req.user._id);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getBillingOverview,
  getCurrentPlan,
  getUsage,
  getInvoices,
  getInvoicePdf,
  upgradePlan,
  downgradePlan,
  cancelSubscription
};
