const mongoose = require('mongoose');
const { MONITORING_EVENT_TYPES, MONITORING_EVENT_STATUS } = require('../constants');

const MonitoringEventSchema = new mongoose.Schema({
  workspaceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Workspace',
    default: null,
    index: true
  },
  domainId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Domain',
    default: null,
    index: true
  },
  type: {
    type: String,
    enum: Object.values(MONITORING_EVENT_TYPES),
    required: true,
    index: true
  },
  status: {
    type: String,
    enum: Object.values(MONITORING_EVENT_STATUS),
    default: MONITORING_EVENT_STATUS.SUCCESS,
    index: true
  },
  message: {
    type: String,
    required: true,
    trim: true
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  }
}, {
  timestamps: true
});

MonitoringEventSchema.index({ workspaceId: 1, createdAt: -1 });
MonitoringEventSchema.index({ type: 1, createdAt: -1 });

module.exports = mongoose.model('MonitoringEvent', MonitoringEventSchema);
