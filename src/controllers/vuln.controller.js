const Vulnerability = require('../models/Vulnerability');
const Domain = require('../models/Domain');
const { SEVERITY_LEVELS, VULN_STATUS } = require('../constants');
const teamService = require('../services/team.service');

// GET /api/v1/vulnerabilities
const getVulnerabilities = async (req, res, next) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) {
      return res.status(400).json({ message: 'Workspace ID context required' });
    }

    const { status, severity, domain } = req.query;
    const query = { workspaceId };

    if (status && status !== 'All') {
      query.status = status;
    }

    if (severity && severity !== 'all') {
      const normalized =
        severity.charAt(0).toUpperCase() + severity.slice(1).toLowerCase();
      if (Object.values(SEVERITY_LEVELS).includes(normalized)) {
        query.severity = normalized;
      }
    }

    if (domain) {
      const domainObj = await Domain.findOne({
        workspaceId,
        domain: domain.trim().toLowerCase()
      });
      if (!domainObj) {
        return res.status(200).json([]);
      }
      query.domainId = domainObj._id;
    }

    const vulnerabilities = await Vulnerability.find(query)
      .populate('domainId', 'domain')
      .sort({ detectedAt: -1 });

    res.status(200).json(vulnerabilities);
  } catch (error) {
    next(error);
  }
};

// GET /api/v1/vulnerabilities/:id
const getVulnerabilityDetails = async (req, res, next) => {
  try {
    const workspaceId = req.workspaceId;
    const { id } = req.params;

    const vulnerability = await Vulnerability.findOne({ _id: id, workspaceId })
      .populate('domainId', 'domain');

    if (!vulnerability) {
      return res.status(404).json({ message: 'Vulnerability not found or unauthorized.' });
    }

    res.status(200).json(vulnerability);
  } catch (error) {
    next(error);
  }
};

// PATCH /api/v1/vulnerabilities/:id/status
const updateVulnerabilityStatus = async (req, res, next) => {
  try {
    const workspaceId = req.workspaceId;
    const { id } = req.params;
    const { status } = req.body;

    if (!status || !Object.values(VULN_STATUS).includes(status)) {
      return res.status(400).json({ message: 'Valid status is required.' });
    }

    const vulnerability = await Vulnerability.findOne({ _id: id, workspaceId });
    if (!vulnerability) {
      return res.status(404).json({ message: 'Vulnerability not found or unauthorized.' });
    }

    vulnerability.status = status;
    if (status === VULN_STATUS.RESOLVED) {
      vulnerability.resolvedAt = new Date();
      vulnerability.resolvedBy = req.user._id;
    } else {
      vulnerability.resolvedAt = undefined;
      vulnerability.resolvedBy = undefined;
    }

    await vulnerability.save();
    await vulnerability.populate('domainId', 'domain');
    await teamService.recordWorkspaceActivity({
      userId: req.user._id,
      action: 'Vulnerability status change',
      target: vulnerability.domainId?.domain || vulnerability.title || String(vulnerability._id),
      metadata: { vulnerabilityId: vulnerability._id, status }
    });

    res.status(200).json({
      message: 'Vulnerability status updated successfully.',
      vulnerability
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getVulnerabilities,
  getVulnerabilityDetails,
  updateVulnerabilityStatus
};
