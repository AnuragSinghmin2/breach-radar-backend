const logger = require('../config/logger');

const compilePdfReport = async (reportId, data) => {
  logger.info(`PDF compile stub triggered for report: ${reportId}`);
  return 'https://storage.securescan.local/reports/stub.pdf';
};

module.exports = {
  compilePdfReport
};
