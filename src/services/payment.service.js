const logger = require('../config/logger');

class PaymentService {
  /**
   * Deprecated. Use Razorpay order creation APIs instead.
   */
  async initiatePayment() {
    logger.warn('[Payment] Deprecated initiatePayment called.');
    throw new Error('initiatePayment is deprecated. Use Razorpay order creation endpoints instead.');
  }

  /**
   * Deprecated. Use server-side verification APIs instead.
   */
  verifySignature() {
    logger.warn('[Payment] Deprecated verifySignature called.');
    throw new Error('verifySignature is deprecated. Use Razorpay signature verification endpoints instead.');
  }

  /**
   * Deprecated. Mock webhooks are replaced with secure server-side verification.
   */
  async handleWebhookEvent() {
    logger.warn('[Payment] Deprecated handleWebhookEvent called.');
    throw new Error('handleWebhookEvent is deprecated. Mock webhooks are disabled.');
  }
}

module.exports = new PaymentService();
