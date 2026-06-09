const mongoose = require('mongoose');
const { REPORT_TEMPLATES, REPORT_STATUS } = require('../constants');

const ReportSchema = new mongoose.Schema({
  workspaceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Workspace',
    required: true,
    index: true
  },
  domainId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Domain',
    required: true
  },
  scanId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Scan'
  },
  title: {
    type: String,
    required: true,
    trim: true
  },
  reportNumber: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  template: {
    type: String,
    enum: Object.values(REPORT_TEMPLATES),
    default: REPORT_TEMPLATES.EXECUTIVE
  },
  status: {
    type: String,
    enum: Object.values(REPORT_STATUS),
    default: REPORT_STATUS.COMPLETED
  },
  owner: {
    type: String,
    default: 'Security Team'
  },
  sections: [{
    type: String
  }],
  fileUrl: {
    type: String,
    default: ''
  },
  fileSize: {
    type: String,
    default: ''
  },
  generatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Report', ReportSchema);
