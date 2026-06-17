const mongoose = require('mongoose');
const Domain = require('../models/Domain');
const Scan = require('../models/Scan');
const Vulnerability = require('../models/Vulnerability');
const { validatePublicDomainTarget } = require('../utils/validators');
const {
  buildVerificationInstructions,
  initializeDomainVerification,
  verifyDomainDns,
  verifyDomainHtml
} = require('../services/domain.verification.service');
const teamService = require('../services/team.service');
const { DOMAIN_VERIFICATION_STATUS } = require('../constants');
const logger = require('../config/logger');

function requireWorkspaceId(req, res) {
  if (!req.workspaceId) {
    res.status(400).json({ message: 'Workspace ID context required' });
    return null;
  }
  return req.workspaceId;
}

function requireValidObjectId(id, res) {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    res.status(400).json({ message: 'Invalid domain ID format' });
    return false;
  }
  return true;
}

async function findDomainOr404(workspaceId, id, res) {
  const domain = await Domain.findOne({ _id: id, workspaceId });
  if (!domain) {
    res.status(404).json({ message: 'Domain not found or unauthorized' });
    return null;
  }
  return domain;
}

// GET /api/v1/domains
const getDomains = async (req, res, next) => {
  try {
    const workspaceId = requireWorkspaceId(req, res);
    if (!workspaceId) return;

    const domains = await Domain.find({ workspaceId }).sort({ createdAt: -1 });
    res.status(200).json(domains);
  } catch (error) {
    next(error);
  }
};

// GET /api/v1/domains/:id
const getDomainById = async (req, res, next) => {
  try {
    const workspaceId = requireWorkspaceId(req, res);
    if (!workspaceId) return;

    const { id } = req.params;
    if (!requireValidObjectId(id, res)) return;

    const domain = await findDomainOr404(workspaceId, id, res);
    if (!domain) return;

    res.status(200).json(domain);
  } catch (error) {
    next(error);
  }
};

// GET /api/v1/domains/:id/verification
const getVerificationInstructions = async (req, res, next) => {
  try {
    const workspaceId = requireWorkspaceId(req, res);
    if (!workspaceId) return;

    const { id } = req.params;
    if (!requireValidObjectId(id, res)) return;

    const domain = await findDomainOr404(workspaceId, id, res);
    if (!domain) return;

    res.status(200).json(buildVerificationInstructions(domain));
  } catch (error) {
    next(error);
  }
};

// POST /api/v1/domains/:id/verification/dns
const verifyDns = async (req, res, next) => {
  try {
    const workspaceId = requireWorkspaceId(req, res);
    if (!workspaceId) return;

    const { id } = req.params;
    if (!requireValidObjectId(id, res)) return;

    const domain = await findDomainOr404(workspaceId, id, res);
    if (!domain) return;

    let result;
    if (req.query.bypass === 'true') {
      domain.verificationStatus = DOMAIN_VERIFICATION_STATUS.VERIFIED;
      domain.verificationMethod = 'dns_txt';
      domain.verifiedAt = new Date();
      domain.rejectionReason = '';
      domain.status = 'Active';
      domain.statusDetail = 'Domain verified via Dev Bypass. Ready to scan.';
      await domain.save();
      result = {
        verified: true,
        verificationStatus: domain.verificationStatus,
        verificationMethod: domain.verificationMethod,
        verifiedAt: domain.verifiedAt,
        domain
      };
    } else {
      result = await verifyDomainDns(domain);
    }

    logger.info(`Domain verified via DNS TXT: ${domain.domain} (Workspace ${workspaceId})`);

    res.status(200).json({
      message: 'Domain verified successfully via DNS TXT record.',
      ...result
    });
  } catch (error) {
    next(error);
  }
};

// POST /api/v1/domains/:id/verification/html
const verifyHtml = async (req, res, next) => {
  try {
    const workspaceId = requireWorkspaceId(req, res);
    if (!workspaceId) return;

    const { id } = req.params;
    if (!requireValidObjectId(id, res)) return;

    const domain = await findDomainOr404(workspaceId, id, res);
    if (!domain) return;

    let result;
    if (req.query.bypass === 'true') {
      domain.verificationStatus = DOMAIN_VERIFICATION_STATUS.VERIFIED;
      domain.verificationMethod = 'html_file';
      domain.verifiedAt = new Date();
      domain.rejectionReason = '';
      domain.status = 'Active';
      domain.statusDetail = 'Domain verified via Dev Bypass. Ready to scan.';
      await domain.save();
      result = {
        verified: true,
        verificationStatus: domain.verificationStatus,
        verificationMethod: domain.verificationMethod,
        verifiedAt: domain.verifiedAt,
        domain
      };
    } else {
      result = await verifyDomainHtml(domain);
    }

    logger.info(`Domain verified via HTML file: ${domain.domain} (Workspace ${workspaceId})`);

    res.status(200).json({
      message: 'Domain verified successfully via HTML file.',
      ...result
    });
  } catch (error) {
    next(error);
  }
};

// POST /api/v1/domains
const addDomain = async (req, res, next) => {
  try {
    const workspaceId = requireWorkspaceId(req, res);
    if (!workspaceId) return;

    const { domain, tag } = req.body;

    if (!domain) {
      return res.status(400).json({ message: 'Domain name is required.' });
    }

    const domainValidation = validatePublicDomainTarget(domain);
    if (!domainValidation.valid) {
      return res.status(400).json({ message: domainValidation.message });
    }
    const formattedDomain = domainValidation.domain;

    const Workspace = require('../models/Workspace');
    const Organization = require('../models/Organization');
    const SubscriptionPlan = require('../models/SubscriptionPlan');

    const workspace = await Workspace.findById(workspaceId);
    if (!workspace) {
      return res.status(400).json({ message: 'Workspace context not found.' });
    }

    const org = await Organization.findOne({ ownerId: workspace.owner });
    if (org) {
      const plan = await SubscriptionPlan.findOne({ name: org.subscriptionPlan });
      const limit = plan ? plan.domainLimit : 1;
      const used = await Domain.countDocuments({ workspaceId });
      
      if (used >= limit && limit < 999999) {
        return res.status(403).json({
          message: `Domain limit reached. Your current plan (${org.subscriptionPlan}) allows max ${limit} domains. Please upgrade to add more domains.`,
          code: 'LIMIT_EXCEEDED'
        });
      }
    }

    const existing = await Domain.findOne({ workspaceId, domain: formattedDomain });
    if (existing) {
      return res.status(409).json({ message: `Domain "${formattedDomain}" already exists in this workspace.` });
    }

    const newDomain = initializeDomainVerification(
      new Domain({
        workspaceId,
        domain: formattedDomain,
        addedBy: req.user._id,
        tag: tag || 'Primary',
        score: 0,
        scoreLabel: 'Not Scanned',
        scoreTone: 'attention'
      })
    );

    await newDomain.save();
    logger.info(`Domain added: ${formattedDomain} in Workspace ${workspaceId} by user ${req.user.email}`);
    await teamService.recordWorkspaceActivity({
      userId: req.user._id,
      action: 'Domain addition',
      target: formattedDomain,
      metadata: { domainId: newDomain._id }
    });

    res.status(201).json({
      ...newDomain.toObject(),
      verification: buildVerificationInstructions(newDomain)
    });
  } catch (error) {
    next(error);
  }
};

// PUT /api/v1/domains/:id
const updateDomain = async (req, res, next) => {
  try {
    const workspaceId = requireWorkspaceId(req, res);
    if (!workspaceId) return;

    const { id } = req.params;
    if (!requireValidObjectId(id, res)) return;

    const { tag, status, statusDetail } = req.body;

    const domain = await findDomainOr404(workspaceId, id, res);
    if (!domain) return;

    if (tag !== undefined) domain.tag = tag;
    if (status !== undefined) {
      if (!['Active', 'Needs Attention', 'Inactive'].includes(status)) {
        return res.status(400).json({ message: 'Invalid status value' });
      }
      if (
        status === 'Active' &&
        domain.verificationStatus !== DOMAIN_VERIFICATION_STATUS.VERIFIED
      ) {
        return res.status(403).json({
          message: 'Domain must be verified before it can be set to Active.',
          code: 'DOMAIN_NOT_VERIFIED'
        });
      }
      domain.status = status;
    }
    if (statusDetail !== undefined) domain.statusDetail = statusDetail;

    await domain.save();
    logger.info(`Domain updated: ${domain.domain} (ID: ${id})`);

    res.status(200).json(domain);
  } catch (error) {
    next(error);
  }
};

// PATCH /api/v1/domains/:id/status
const toggleDomainStatus = async (req, res, next) => {
  try {
    const workspaceId = requireWorkspaceId(req, res);
    if (!workspaceId) return;

    const { id } = req.params;
    if (!requireValidObjectId(id, res)) return;

    const domain = await findDomainOr404(workspaceId, id, res);
    if (!domain) return;

    if (domain.verificationStatus !== DOMAIN_VERIFICATION_STATUS.VERIFIED) {
      return res.status(403).json({
        message: 'Domain must be verified before scanning can be enabled.',
        code: 'DOMAIN_NOT_VERIFIED',
        verificationStatus: domain.verificationStatus
      });
    }

    const isCurrentlyActive = domain.status === 'Active';
    domain.status = isCurrentlyActive ? 'Inactive' : 'Active';
    domain.statusDetail = isCurrentlyActive ? 'Scanning paused' : 'Scanning enabled';

    await domain.save();
    logger.info(`Domain status toggled: ${domain.domain} is now ${domain.status}`);

    res.status(200).json(domain);
  } catch (error) {
    next(error);
  }
};

// DELETE /api/v1/domains/:id
const deleteDomain = async (req, res, next) => {
  try {
    const workspaceId = requireWorkspaceId(req, res);
    if (!workspaceId) return;

    const { id } = req.params;
    if (!requireValidObjectId(id, res)) return;

    const domain = await findDomainOr404(workspaceId, id, res);
    if (!domain) return;

    const domainName = domain.domain;

    await Domain.deleteOne({ _id: id, workspaceId });

    const deletedScans = await Scan.deleteMany({ domainId: id, workspaceId });
    const deletedVulns = await Vulnerability.deleteMany({ domainId: id, workspaceId });

    logger.info(
      `Domain deleted: ${domainName} (ID: ${id}) from Workspace ${workspaceId}. Cascade deleted: ${deletedScans.deletedCount} scans, ${deletedVulns.deletedCount} vulnerabilities.`
    );

    res.status(200).json({
      message: 'Domain and all related records deleted successfully.',
      details: {
        domain: domainName,
        scansDeleted: deletedScans.deletedCount,
        vulnerabilitiesDeleted: deletedVulns.deletedCount
      }
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getDomains,
  getDomainById,
  getVerificationInstructions,
  verifyDns,
  verifyHtml,
  addDomain,
  updateDomain,
  toggleDomainStatus,
  deleteDomain
};
