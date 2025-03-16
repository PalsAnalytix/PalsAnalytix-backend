// config/razorpay.js - Configuration file for Razorpay
const Razorpay = require('razorpay');

const razorpayConfig = {
  // Initialize Razorpay with credentials from .env
  instance: new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
  }),
  
  // Standard options for order creation
  defaultOptions: {
    currency: 'INR',
    payment_capture: 1 // Auto-capture payments
  },
  
  // Webhook secret for verifying webhooks
  webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET
};

module.exports = razorpayConfig;