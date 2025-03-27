// routes/paymentRoutes.js - Routes for payment functionality
const express = require('express');
const cors  = require('cors');
const router = express.Router();
const paymentController = require('../controllers/paymentController');
const { authenticateUser } = require('../middleware/auth'); // Your auth middleware

router.use(cors());
// Public routes
router.post('/webhook', paymentController.handleWebhook);
router.post('/verify', paymentController.verifyPayment);

// Protected routes (require authentication)
router.post('/create-order', authenticateUser, paymentController.createOrder);
router.post('/capture', authenticateUser, paymentController.capturePayment);
router.post('/refund', authenticateUser, paymentController.refundPayment);
router.get('/:payment_id', authenticateUser, paymentController.getPaymentDetails);

module.exports = router;