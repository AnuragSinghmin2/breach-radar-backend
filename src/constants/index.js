const USER_ROLES = {
  USER: 'user',
  ADMIN: 'admin',
  SUPERADMIN: 'superadmin'
};

const WORKSPACE_ROLES = {
  OWNER: 'Owner',
  ADMIN: 'Admin',
  ANALYST: 'Analyst'
};

const SCAN_TYPES = {
  FULL: 'Full Scan',
  QUICK: 'Quick Scan',
  CUSTOM: 'Custom Scan'
};

const SCAN_STATUS = {
  QUEUED: 'Queued',
  IN_PROGRESS: 'In Progress',
  COMPLETED: 'Completed',
  FAILED: 'Failed',
  SCHEDULED: 'Scheduled'
};

const SEVERITY_LEVELS = {
  CRITICAL: 'Critical',
  HIGH: 'High',
  MEDIUM: 'Medium',
  LOW: 'Low'
};

const VULN_STATUS = {
  OPEN: 'Open',
  IN_PROGRESS: 'In Progress',
  RESOLVED: 'Resolved'
};

const REPORT_TEMPLATES = {
  EXECUTIVE: 'Executive',
  TECHNICAL: 'Technical',
  COMPLIANCE: 'Compliance'
};

const REPORT_STATUS = {
  COMPLETED: 'Completed',
  IN_PROGRESS: 'In Progress',
  FAILED: 'Failed'
};

const DOMAIN_VERIFICATION_STATUS = {
  PENDING: 'pending_verification',
  VERIFIED: 'verified',
  REJECTED: 'rejected'
};

const DOMAIN_VERIFICATION_METHODS = {
  DNS_TXT: 'dns_txt',
  HTML_FILE: 'html_file'
};

const MAX_VERIFICATION_ATTEMPTS = 5;

const ALERT_TYPES = {
  SSL_EXPIRY: 'ssl_expiry',
  DOMAIN_EXPIRY: 'domain_expiry',
  CRITICAL_FINDING: 'critical_finding',
  DAILY_SUMMARY: 'daily_summary',
  SCHEDULED_SCAN: 'scheduled_scan'
};

const ALERT_STATUS = {
  ACTIVE: 'Active',
  ACKNOWLEDGED: 'Acknowledged',
  RESOLVED: 'Resolved'
};

const MONITORING_EVENT_TYPES = {
  DAILY_SCAN: 'daily_scan',
  SSL_CHECK: 'ssl_check',
  DOMAIN_EXPIRY_CHECK: 'domain_expiry_check',
  DAILY_SUMMARY: 'daily_summary'
};

const MONITORING_EVENT_STATUS = {
  SUCCESS: 'success',
  WARNING: 'warning',
  FAILED: 'failed'
};

const EXPIRY_THRESHOLDS = {
  WARNING_DAYS: 30,
  HIGH_DAYS: 7
};

module.exports = {
  USER_ROLES,
  WORKSPACE_ROLES,
  SCAN_TYPES,
  SCAN_STATUS,
  SEVERITY_LEVELS,
  VULN_STATUS,
  REPORT_TEMPLATES,
  REPORT_STATUS,
  DOMAIN_VERIFICATION_STATUS,
  DOMAIN_VERIFICATION_METHODS,
  MAX_VERIFICATION_ATTEMPTS,
  ALERT_TYPES,
  ALERT_STATUS,
  MONITORING_EVENT_TYPES,
  MONITORING_EVENT_STATUS,
  EXPIRY_THRESHOLDS
};
