// routes/paymentRoutes.js - Routes for payment functionality
const express = require('express');
const cors  = require('cors');
const router = express.Router();
const paymentController = require('../controllers/paymentController');
const { authenticateUser } = require('../middleware/auth'); // Your auth middleware

router.use(cors());

// /webhook stays public and unauthenticated -- Razorpay calls it
// server-to-server and can't send a user JWT. Its security comes entirely
// from the HMAC signature check inside handleWebhook, not from a login.
router.post('/webhook', paymentController.handleWebhook);

// /verify now REQUIRES login (added authenticateUser) -- verifyPayment
// uses req.user.id as the sole source of truth for which account to
// credit, and no longer trusts a user_id field from the request body.
router.post('/verify', authenticateUser, paymentController.verifyPayment);

// Protected routes (require authentication)
router.post('/create-order', authenticateUser, paymentController.createOrder);
router.post('/capture', authenticateUser, paymentController.capturePayment);
router.post('/refund', authenticateUser, paymentController.refundPayment);
router.get('/:payment_id', authenticateUser, paymentController.getPaymentDetails);

module.exports = router;
