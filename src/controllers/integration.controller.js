const Integration = require('../models/Integration');
const { logRequestAudit } = require('../services/audit.service');

const getIntegrations = async (req, res, next) => {
  try {
    const list = await Integration.find({ workspaceId: req.workspaceId });
    res.status(200).json(list);
  } catch (error) {
    next(error);
  }
};

const connectIntegration = async (req, res, next) => {
  try {
    const { provider, webhookUrl } = req.body;
    if (!provider || !webhookUrl) {
      return res.status(400).json({ message: 'Provider and Webhook URL are required.' });
    }

    const integration = await Integration.findOneAndUpdate(
      { workspaceId: req.workspaceId, provider },
      { webhookUrl, status: 'connected' },
      { new: true, upsert: true }
    );

    await logRequestAudit(req, 'Security', `Connected integration channel: ${provider}.`);

    res.status(200).json({
      message: `${provider.charAt(0).toUpperCase() + provider.slice(1)} integration connected successfully.`,
      integration
    });
  } catch (error) {
    next(error);
  }
};

const disconnectIntegration = async (req, res, next) => {
  try {
    const { id } = req.params;
    const integration = await Integration.findOne({ _id: id, workspaceId: req.workspaceId });
    if (!integration) {
      return res.status(404).json({ message: 'Integration not found.' });
    }

    await Integration.deleteOne({ _id: id });
    await logRequestAudit(req, 'Security', `Disconnected integration channel: ${integration.provider}.`);

    res.status(200).json({ message: 'Integration disconnected successfully.' });
  } catch (error) {
    next(error);
  }
};

const testIntegration = async (req, res, next) => {
  try {
    const { webhookUrl } = req.body;
    if (!webhookUrl) {
      return res.status(400).json({ message: 'Webhook URL is required to test.' });
    }

    try {
      const payload = {
        text: 'SecureScan Webhook Integration Test Successful! 🚀',
        content: 'SecureScan Webhook Integration Test Successful! 🚀'
      };

      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (response.ok || response.status === 200 || response.status === 204) {
        return res.status(200).json({ success: true, message: 'Test notification sent successfully!' });
      } else {
        return res.status(400).json({
          success: false,
          message: `Webhook returned status code: ${response.status}`
        });
      }
    } catch (err) {
      return res.status(400).json({
        success: false,
        message: `Network error connecting to webhook: ${err.message}`
      });
    }
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getIntegrations,
  connectIntegration,
  disconnectIntegration,
  testIntegration
};
