require('dotenv').config();
const connectDB = require('../src/config/db');
const { getRedisClient } = require('../src/config/redis');
const Domain = require('../src/models/Domain');
const Scan = require('../src/models/Scan');
const Vulnerability = require('../src/models/Vulnerability');
const User = require('../src/models/User');

async function main() {
  console.log('Connecting to database...');
  await connectDB();
  console.log('Connected to MongoDB!');

  const userCount = await User.countDocuments();
  const domainCount = await Domain.countDocuments();
  const scanCount = await Scan.countDocuments();
  const vulnCount = await Vulnerability.countDocuments();

  console.log('Database Stats:', {
    users: userCount,
    domains: domainCount,
    scans: scanCount,
    vulnerabilities: vulnCount
  });

  const domains = await Domain.find().limit(10);
  console.log('Recent Domains:', domains.map(d => ({
    id: d._id,
    domain: d.domain,
    status: d.status,
    verificationStatus: d.verificationStatus,
    verificationToken: d.verificationToken
  })));

  console.log('Testing Redis connection...');
  const redis = getRedisClient();
  if (redis) {
    try {
      await redis.ping();
      console.log('Redis connected successfully and pinged!');
    } catch (e) {
      console.error('Redis ping failed:', e.message);
    }
  } else {
    console.log('Redis connection was null/failed.');
  }
}

main().catch(err => {
  console.error('Check failed:', err);
}).finally(() => {
  process.exit(0);
});
