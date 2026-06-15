require('dotenv').config();
const http = require('http');
const app = require('./app');
const connectDB = require('./config/db');
const { connectRedis } = require('./config/redis');
const { initializeQueues } = require('./services/queue.service');
const { startScanWorker } = require('./workers/scan.worker');
const { startReportWorker } = require('./workers/report.worker');
const { startAlertWorker } = require('./workers/alert.worker');
const { startMonitoringWorker } = require('./workers/monitoring.worker');
const { startSslWorker } = require('./workers/ssl.worker');
const { startDomainExpiryWorker } = require('./workers/domainExpiry.worker');
const { startMonitoringScheduler } = require('./schedulers/monitoring.scheduler');
const logger = require('./config/logger');

const PORT = process.env.PORT || 5000;
const server = http.createServer(app);

console.log("MONGODB_URI =", process.env.MONGODB_URI);

const startServer = async () => {
  try {
    // 1. Establish Database Connection
    await connectDB();

    // 1b. Seed database with initial configs and mock records
    const dbSeeder = require('./config/dbSeeder');
    await dbSeeder();

    // 2. Establish Redis and background workers when available
    const redis = connectRedis();

    if (redis) {
      try {
        initializeQueues();
        startScanWorker();
        startReportWorker();
        startAlertWorker();
        startMonitoringWorker();
        startSslWorker();
        startDomainExpiryWorker();
      } catch (queueError) {
        logger.warn(`Queue/worker setup skipped: ${queueError.message}. Mock scans will run in-process.`);
      }
    } else {
      logger.warn('Redis unavailable. Scans will run in-process via background jobs.');
    }

    startMonitoringScheduler();

    // 4. Start HTTP Server Listener
    server.listen(PORT, () => {
      logger.info(`Server listening on port ${PORT} in ${process.env.NODE_ENV || 'development'} mode.`);
    });
  } catch (error) {
    logger.error(`Critical server initialization crash: ${error.message}`);
    process.exit(1);
  }
};

// Handle Uncaught Exceptions
process.on('uncaughtException', (err) => {
  logger.error(`Uncaught Exception Error: ${err.message}`);
  logger.error(err.stack);
  process.exit(1);
});

// Handle Unhandled Rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error(`Unhandled Promise Rejection: ${reason}`);
  process.exit(1);
});

startServer();
