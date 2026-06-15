const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const User = require('../models/User');
const Workspace = require('../models/Workspace');
const SubscriptionPlan = require('../models/SubscriptionPlan');
const Payment = require('../models/Payment');
const SupportTicket = require('../models/SupportTicket');
const AuditLog = require('../models/AuditLog');
const logger = require('./logger');

const dbSeeder = async () => {
  try {
    logger.info('Running database seeder...');

    // 1. Seed Subscription Plans
    const plansCount = await SubscriptionPlan.countDocuments();
    let plans = [];
    if (plansCount === 0) {
      logger.info('Seeding default subscription plans...');
      plans = await SubscriptionPlan.insertMany([
        {
          name: 'Free',
          price: 0,
          domainLimit: 1,
          scanLimit: 5,
          features: ['Basic OWASP checks', 'Monthly PDF Reports', 'Community support']
        },
        {
          name: 'Starter',
          price: 29,
          domainLimit: 3,
          scanLimit: 20,
          features: ['Daily OWASP scans', 'SSL Expiry check', 'Email alerts', 'Standard Support']
        },
        {
          name: 'Professional',
          price: 99,
          domainLimit: 10,
          scanLimit: 100,
          features: ['Continuous Monitoring', 'API access', 'Custom Scan configs', 'Priority support', 'Teams management']
        },
        {
          name: 'Enterprise',
          price: 299,
          domainLimit: 50,
          scanLimit: 1000,
          features: ['Custom scanning agents', 'SAML SSO integration', 'Compliance reports (HIPAA/PCI-DSS)', 'Dedicated TAM', 'Custom API webhooks']
        }
      ]);
    } else {
      plans = await SubscriptionPlan.find();
    }

    // 2. Seed Super Admin User
    const superAdminEmail = 'superadmin@breachradar.com';
    let superAdmin = await User.findOne({ email: superAdminEmail });
    if (!superAdmin) {
      logger.info(`Creating default Super Admin user (${superAdminEmail})...`);
      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash('Password123!', salt);

      superAdmin = new User({
        email: superAdminEmail,
        passwordHash,
        role: 'super_admin',
        status: 'active',
        profile: {
          name: 'Breach Radar Super Admin',
          avatar: '',
          phoneNumber: '+15550199'
        }
      });

      await superAdmin.save();

      // Create workspace for Super Admin
      const workspace = new Workspace({
        name: "Super Admin's Workspace",
        owner: superAdmin._id,
        members: []
      });
      await workspace.save();

      superAdmin.preferences.activeWorkspaceId = workspace._id;
      await superAdmin.save();

      logger.info('Super Admin user created successfully. User: superadmin@breachradar.com / Password123!');
    }

    // Find or create a normal user to link to tickets/payments
    let testUser = await User.findOne({ role: 'user' });
    if (!testUser) {
      // Just check if we have any other user
      testUser = await User.findOne({ email: { $ne: superAdminEmail } });
    }

    if (testUser) {
      // 3. Seed Support Tickets if empty
      const ticketsCount = await SupportTicket.countDocuments();
      if (ticketsCount === 0) {
        logger.info('Seeding mock support tickets...');
        await SupportTicket.insertMany([
          {
            userId: testUser._id,
            title: 'Scan stuck in Queued status',
            description: 'My scan has been showing "Queued" for over 4 hours. Can you check if the scanner is active?',
            status: 'open',
            priority: 'high',
            messages: [
              {
                senderId: testUser._id,
                senderName: testUser.profile.name,
                message: 'Hello support, my scan is currently stuck. Help please.'
              }
            ]
          },
          {
            userId: testUser._id,
            title: 'SSO request for Enterprise plan',
            description: 'We are looking to upgrade to the Enterprise plan and want to configure SAML SSO. Do you support Okta integration?',
            status: 'assigned',
            priority: 'medium',
            assignedTo: superAdmin._id,
            messages: [
              {
                senderId: testUser._id,
                senderName: testUser.profile.name,
                message: 'Looking for details regarding Okta integration.'
              },
              {
                senderId: superAdmin._id,
                senderName: superAdmin.profile.name,
                message: 'Hello! Yes, we do support Okta and Azure AD integration on the Enterprise plan. Let me know your details.'
              }
            ]
          },
          {
            userId: testUser._id,
            title: 'Billing Query: Duplicate Charge',
            description: 'I was billed twice for the Professional plan upgrade this month. Please refund the duplicate transaction.',
            status: 'closed',
            priority: 'critical',
            messages: [
              {
                senderId: testUser._id,
                senderName: testUser.profile.name,
                message: 'Please resolve this duplicate billing charge.'
              },
              {
                senderId: superAdmin._id,
                senderName: superAdmin.profile.name,
                message: 'Apologies for the inconvenience. The duplicate charge has been refunded successfully.'
              }
            ]
          }
        ]);
      }

      // 4. Seed Payments if empty
      const paymentsCount = await Payment.countDocuments();
      if (paymentsCount === 0) {
        logger.info('Seeding mock payment history...');
        await Payment.insertMany([
          {
            userId: testUser._id,
            amount: 29.00,
            currency: 'USD',
            status: 'succeeded',
            planName: 'Starter',
            transactionId: 'ch_3N8f9iKx89a01xYt890aBcd1',
            refunded: false,
            createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
          },
          {
            userId: testUser._id,
            amount: 99.00,
            currency: 'USD',
            status: 'succeeded',
            planName: 'Professional',
            transactionId: 'ch_3N9z1aKx89a02xYt891cDef2',
            refunded: false,
            createdAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000)
          },
          {
            userId: testUser._id,
            amount: 99.00,
            currency: 'USD',
            status: 'refunded',
            planName: 'Professional',
            transactionId: 'ch_3N1x4aKx89a03xYt892eGhi3',
            refunded: true,
            createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)
          }
        ]);
      }
    }

    // 5. Seed initial Audit Logs if empty
    const auditLogsCount = await AuditLog.countDocuments();
    if (auditLogsCount === 0) {
      logger.info('Seeding initial audit logs...');
      await AuditLog.insertMany([
        {
          userId: superAdmin._id,
          action: 'Login',
          description: 'Super Admin logged in successfully.',
          ipAddress: '127.0.0.1',
          userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
          status: 'Success'
        },
        {
          userId: superAdmin._id,
          action: 'Role Changes',
          description: 'Created superadmin role config.',
          ipAddress: '127.0.0.1',
          userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
          status: 'Success'
        }
      ]);
    }

    logger.info('Database seeder finished checking/seeding.');
  } catch (error) {
    logger.error(`Database seeder error: ${error.message}`);
  }
};

module.exports = dbSeeder;
