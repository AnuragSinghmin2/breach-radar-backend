const mongoose = require('mongoose');
const Domain = require('../models/Domain');
const Scan = require('../models/Scan');
const Vulnerability = require('../models/Vulnerability');
const { SEVERITY_LEVELS, VULN_STATUS } = require('../constants');

function toObjectId(workspaceId) {
  return workspaceId instanceof mongoose.Types.ObjectId
    ? workspaceId
    : new mongoose.Types.ObjectId(workspaceId);
}

const SCORE_LABELS = [
  { min: 80, label: 'Excellent' },
  { min: 60, label: 'Good' },
  { min: 0, label: 'Needs Attention' }
];

function resolveScoreLabel(score) {
  if (score === 0) return 'Not Scanned';
  return SCORE_LABELS.find((entry) => score >= entry.min)?.label || 'Needs Attention';
}

async function getDomainStats(workspaceId) {
  const workspaceObjectId = toObjectId(workspaceId);

  const [result] = await Domain.aggregate([
    { $match: { workspaceId: workspaceObjectId } },
    {
      $facet: {
        totalDomains: [{ $count: 'count' }],
        securityScore: [
          {
            $match: {
              $or: [
                { lastScanAt: { $ne: null } },
                { score: { $gt: 0 } }
              ]
            }
          },
          {
            $group: {
              _id: null,
              avgScore: { $avg: '$score' }
            }
          }
        ]
      }
    }
  ]);

  const totalDomains = result?.totalDomains[0]?.count || 0;
  const avgScore = result?.securityScore[0]?.avgScore;

  if (avgScore == null) {
    return {
      totalDomains,
      securityScore: 0,
      securityScoreLabel: 'Not Scanned'
    };
  }

  const securityScore = Math.round(avgScore);

  return {
    totalDomains,
    securityScore,
    securityScoreLabel: resolveScoreLabel(securityScore)
  };
}

async function getSeverityCounts(workspaceId) {
  const workspaceObjectId = toObjectId(workspaceId);

  const [result] = await Vulnerability.aggregate([
    {
      $match: {
        workspaceId: workspaceObjectId,
        status: VULN_STATUS.OPEN
      }
    },
    {
      $group: {
        _id: null,
        criticalCount: {
          $sum: {
            $cond: [{ $eq: ['$severity', SEVERITY_LEVELS.CRITICAL] }, 1, 0]
          }
        },
        highCount: {
          $sum: {
            $cond: [{ $eq: ['$severity', SEVERITY_LEVELS.HIGH] }, 1, 0]
          }
        },
        mediumCount: {
          $sum: {
            $cond: [{ $eq: ['$severity', SEVERITY_LEVELS.MEDIUM] }, 1, 0]
          }
        },
        lowCount: {
          $sum: {
            $cond: [{ $eq: ['$severity', SEVERITY_LEVELS.LOW] }, 1, 0]
          }
        }
      }
    }
  ]);

  return {
    criticalCount: result?.criticalCount || 0,
    highCount: result?.highCount || 0,
    mediumCount: result?.mediumCount || 0,
    lowCount: result?.lowCount || 0
  };
}

async function getTotalScans(workspaceId) {
  const workspaceObjectId = toObjectId(workspaceId);

  const [result] = await Scan.aggregate([
    { $match: { workspaceId: workspaceObjectId } },
    { $count: 'count' }
  ]);

  return result?.count || 0;
}

async function getDashboardStats(workspaceId) {
  const [domainStats, severityCounts, totalScans] = await Promise.all([
    getDomainStats(workspaceId),
    getSeverityCounts(workspaceId),
    getTotalScans(workspaceId)
  ]);

  return {
    totalDomains: domainStats.totalDomains,
    totalScans,
    criticalCount: severityCounts.criticalCount,
    highCount: severityCounts.highCount,
    mediumCount: severityCounts.mediumCount,
    lowCount: severityCounts.lowCount,
    securityScore: domainStats.securityScore,
    securityScoreLabel: domainStats.securityScoreLabel
  };
}

module.exports = {
  getDashboardStats
};
