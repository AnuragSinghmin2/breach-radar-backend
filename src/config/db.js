const mongoose = require('mongoose');
const logger = require('./logger');
const dns = require('dns');

dns.setServers(['8.8.8.8', '1.1.1.1']);

const connectDB = async () => {
  try {
    const connUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/cybersecurity_scanner';
    logger.info('Connecting to MongoDB...');
    
    const conn = await mongoose.connect(connUri, {
      autoIndex: true, // Build indexes in dev. Turn off in heavy prod.
      serverSelectionTimeoutMS: 10000,
    });

    logger.info(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    logger.error(`Error connecting to MongoDB: ${error.message}`);
    process.exit(1);
  }
};

module.exports = connectDB;
