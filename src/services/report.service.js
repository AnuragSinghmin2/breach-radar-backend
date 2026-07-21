const logger = require('../config/logger');
const reportPdfService = require('./reportPdf.service');

const compilePdfReport = async (reportId, data) => {
  logger.info(`PDF compile triggered for report: ${reportId}`);
  return reportPdfService.generateReportPdf(data);
};

module.exports = {
  compilePdfReport
};
