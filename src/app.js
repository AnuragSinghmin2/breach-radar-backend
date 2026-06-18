const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const path = require('path');

const authRoutes = require('./routes/auth.routes');
const domainRoutes = require('./routes/domain.routes');
const scanRoutes = require('./routes/scan.routes');
const vulnRoutes = require('./routes/vuln.routes');
const reportRoutes = require('./routes/report.routes');
const dashboardRoutes = require('./routes/dashboard.routes');
const monitoringRoutes = require('./routes/monitoring.routes');
const adminRoutes = require('./routes/admin.routes');
const superAdminRoutes = require('./routes/superAdmin.routes');
const userRoutes = require('./routes/user.routes');
const teamRoutes = require('./routes/team.routes');
const invitationRoutes = require('./routes/invitation.routes');
const billingRoutes = require('./routes/billing.routes');
const paymentRoutes = require('./routes/payment.routes');
const notificationRoutes = require('./routes/notification.routes');
const settingsRoutes = require('./routes/settings.routes');
const securityRoutes = require('./routes/security.routes');
const apiAccessRoutes = require('./routes/apiAccess.routes');
const integrationRoutes = require('./routes/integration.routes');
const activityLogRoutes = require('./routes/activityLog.routes');


const { generalLimiter } = require('./middleware/rateLimiter');
const errorHandler = require('./middleware/errorHandler');
const logger = require('./config/logger');

const app = express();

// Security Headers
app.use(helmet());

// Cross Origin Resource Sharing
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Cookie Parser Middleware
app.use(cookieParser());

// Request Limiters
app.use('/api/', generalLimiter);

// Payload Parsing
app.use(express.json({
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads'), {
  setHeaders: (res) => {
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  },
}));

// HTTP Request Logger
app.use(morgan('combined', {
  stream: { write: (message) => logger.http(message.trim()) }
}));

// API Endpoint Handlers Mapping
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/domains', domainRoutes);
app.use('/api/v1/scans', scanRoutes);
app.use('/api/v1/vulnerabilities', vulnRoutes);
app.use('/api/v1/reports', reportRoutes);
app.use('/api/v1/dashboard', dashboardRoutes);
app.use('/api/v1/monitoring', monitoringRoutes);
app.use('/api/v1/admin', adminRoutes);
app.use('/api/v1/super-admin', superAdminRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/team', teamRoutes);
app.use('/api/v1/invitations', invitationRoutes);
app.use('/api/v1/billing', billingRoutes);
app.use('/api/payment', paymentRoutes);
app.use('/api/v1/payment', paymentRoutes);
app.use('/api/v1/notifications', notificationRoutes);
app.use('/api/v1/settings', settingsRoutes);
app.use('/api/v1/security', securityRoutes);
app.use('/api/v1/api-access', apiAccessRoutes);
app.use('/api/v1/integrations', integrationRoutes);
app.use('/api/v1/activity-log', activityLogRoutes);
app.use('/api/team', teamRoutes);


// Base Check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', timestamp: new Date() });
});

// Capture Unknown Paths
app.use((req, res, next) => {
  const error = new Error(`Not Found - ${req.originalUrl}`);
  error.statusCode = 404;
  next(error);
});

// Centralized Application Exception Handler
app.use(errorHandler);

module.exports = app;
