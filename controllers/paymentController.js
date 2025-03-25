// controllers/paymentController.js - Controller for Razorpay payment operations
const crypto = require('crypto');
const razorpayConfig = require('../config/razorpay');
const { default: mongoose } = require('mongoose');
const instance = razorpayConfig.instance;
const User = mongoose.model("User"); // Assuming you have a User model

// Utility function to generate receipt ID
const generateReceiptId = () => {
  return 'rcpt_' + Date.now() + '_' + Math.random().toString(36).substring(2, 15);
};

// Map Razorpay payment amount to subscription plan
const getSubscriptionPlanFromAmount = (amount) => {
  // Convert paise to rupees for comparison
  const amountInRupees = amount / 100;
  
  // These are example price points - adjust based on your actual pricing
  if (amountInRupees <= 0) return "FREE";
  else return "PREMIUM"
};

const paymentController = {
  /**
   * Create a new Razorpay order
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  createOrder: async (req, res) => {
    try {
      const { amount, currency = 'INR', notes = {}, receipt = null, plan } = req.body;
      
      if (!amount) {
        return res.status(400).json({
          success: false,
          error: 'Amount is required and must be in paise (e.g. ₹100 = 10000)'
        });
      }
      
      // Validate that plan is one of the allowed values
      if (plan && !["BASIC", "PREMIUM", "ENTERPRISE"].includes(plan)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid subscription plan'
        });
      }
      
      // Create order with Razorpay
      const orderOptions = {
        // amount: parseInt(amount), // amount in paise
        amount : 100,
        currency: currency,
        receipt: receipt || generateReceiptId(),
        notes: {
          ...notes,
          user_id: req.user?.id || 'guest', // Assuming req.user is set by auth middleware
          plan: plan || getSubscriptionPlanFromAmount(parseInt(amount))
        },
        payment_capture: razorpayConfig.defaultOptions.payment_capture
      };
      
      const order = await instance.orders.create(orderOptions);
      
      return res.status(200).json({
        success: true,
        order
      });
    } catch (error) {
      console.error('Error creating Razorpay order:', error);
      return res.status(500).json({
        success: false,
        error: error.message || 'Something went wrong while creating the order'
      });
    }
  },
  
  /**
   * Verify a Razorpay payment
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  verifyPayment: async (req, res) => {
    try {
      const {
        razorpay_order_id,
        razorpay_payment_id,
        razorpay_signature,
        user_id, // Ensure user_id is passed in the request body
        plan
      } = req.body;
      
      // Verify that all required fields are present
      if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
        return res.status(400).json({
          success: false,
          error: 'Missing required payment verification parameters'
        });
      }
      
      // Get user ID from request (either from body or from auth middleware)
      const userId = user_id || req.user?.id;
      
      if (!userId) {
        return res.status(400).json({
          success: false,
          error: 'User ID is required for subscription update'
        });
      }
      
      // Verify signature
      const generatedSignature = crypto
        .createHmac('sha256', razorpayConfig.instance.key_secret)
        .update(`${razorpay_order_id}|${razorpay_payment_id}`)
        .digest('hex');
      
      // Check if generated signature matches the signature from Razorpay
      if (generatedSignature !== razorpay_signature) {
        return res.status(400).json({
          success: false,
          error: 'Invalid payment signature'
        });
      }
      
      // Fetch payment details from Razorpay for additional verification
      const payment = await instance.payments.fetch(razorpay_payment_id);

      console.log(payment)
      
      // Check if payment is authorized or captured
      if (payment.status !== 'authorized' && payment.status !== 'captured') {
        return res.status(400).json({
          success: false,
          error: `Payment verification failed. Status: ${payment.status}`
        });
      }
      
      // Get subscription plan from request or payment notes
      const subscriptionPlan = plan || payment.notes?.plan || getSubscriptionPlanFromAmount(payment.amount);
      
      // Calculate subscription expiry date (1 year from now)
      const subscriptionExpiryDate = new Date();
      subscriptionExpiryDate.setFullYear(subscriptionExpiryDate.getFullYear() + 1);
      // Update user in database
      const updatedUser = await User.findByIdAndUpdate(
        userId,
        {
          currentSubscriptionPlan: subscriptionPlan,
          subscriptionExpiryDate: subscriptionExpiryDate,
          $push: { 
            subscriptionHistory: {
              planName: subscriptionPlan,
              dateOfPurchase: new Date(),
              expiryDate: subscriptionExpiryDate,
              amountPaid: payment.amount / 100, // Convert paise to rupees
              paymentId: razorpay_payment_id,
              status: "ACTIVE"
            }
          }
        },
        { new: true, runValidators: true }
      );

      // console.log(updatedUser);
      
      if (!updatedUser) {
        console.error('User not found for subscription update:', userId);
        return res.status(404).json({
          success: false,
          error: 'User not found'
        });
      }
      
      return res.status(200).json({
        success: true,
        message: 'Payment verified and subscription updated successfully',
        payment,
        updatedUser,
        subscriptionDetails: {
          plan: updatedUser.currentSubscriptionPlan,
          expiryDate: updatedUser.subscriptionExpiryDate
        }
      });
    } catch (error) {
      console.error('Error verifying Razorpay payment:', error);
      return res.status(500).json({
        success: false,
        error: error.message || 'Something went wrong while verifying the payment'
      });
    }
  },
  
  /**
   * Capture a payment (for payments that were not auto-captured)
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  capturePayment: async (req, res) => {
    try {
      const { payment_id, amount } = req.body;
      
      if (!payment_id || !amount) {
        return res.status(400).json({
          success: false,
          error: 'Payment ID and amount are required'
        });
      }
      
      // Capture payment
      const payment = await instance.payments.capture(payment_id, amount);
      
      return res.status(200).json({
        success: true,
        message: 'Payment captured successfully',
        payment
      });
    } catch (error) {
      console.error('Error capturing Razorpay payment:', error);
      return res.status(500).json({
        success: false,
        error: error.message || 'Something went wrong while capturing the payment'
      });
    }
  },
  
  /**
   * Refund a payment
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  refundPayment: async (req, res) => {
    try {
      const { payment_id, amount = null, notes = {}, userId } = req.body;
      
      if (!payment_id) {
        return res.status(400).json({
          success: false,
          error: 'Payment ID is required'
        });
      }
      
      if (!userId) {
        return res.status(400).json({
          success: false,
          error: 'User ID is required for subscription update'
        });
      }
      
      // Create refund
      const refundOptions = {
        payment_id,
        ...(amount && { amount }), // Optional: partial refund if amount is specified
        notes: {
          ...notes,
          refunded_by: req.user?.id || 'admin',
          reason: notes.reason || 'customer_request'
        }
      };
      
      const refund = await instance.refunds.create(refundOptions);
      
      // Update subscription status in user's history
      await User.findOneAndUpdate(
        { 
          _id: userId,
          'subscriptionHistory.paymentId': payment_id 
        },
        { 
          $set: { 'subscriptionHistory.$.status': 'CANCELLED' }
        }
      );
      
      // If refund is for the current subscription, downgrade to FREE
      const user = await User.findById(userId);
      const currentSubscription = user.subscriptionHistory.find(
        sub => sub.paymentId === payment_id && sub.status === 'CANCELLED'
      );
      
      if (currentSubscription && user.currentSubscriptionPlan !== 'FREE') {
        // Check if this was their current active subscription
        const isCurrentPlan = user.subscriptionExpiryDate &&
          currentSubscription.expiryDate.getTime() === user.subscriptionExpiryDate.getTime();
        
        if (isCurrentPlan) {
          // Downgrade to FREE plan
          await User.findByIdAndUpdate(
            userId,
            {
              currentSubscriptionPlan: 'FREE',
              subscriptionExpiryDate: null
            }
          );
        }
      }
      
      return res.status(200).json({
        success: true,
        message: 'Refund initiated successfully and subscription updated',
        refund
      });
    } catch (error) {
      console.error('Error refunding Razorpay payment:', error);
      return res.status(500).json({
        success: false,
        error: error.message || 'Something went wrong while refunding the payment'
      });
    }
  },
  
  /**
   * Handle Razorpay webhook events
   * @param {Object} req - Express request object 
   * @param {Object} res - Express response object
   */
  handleWebhook: async (req, res) => {
    try {
      // Verify webhook signature
      const webhookSignature = req.headers['x-razorpay-signature'];
      
      if (!webhookSignature) {
        return res.status(400).json({
          success: false,
          error: 'Missing webhook signature'
        });
      }
      
      // Verify webhook signature
      const webhookBody = JSON.stringify(req.body);
      const expectedSignature = crypto
        .createHmac('sha256', razorpayConfig.webhookSecret)
        .update(webhookBody)
        .digest('hex');
      
      if (expectedSignature !== webhookSignature) {
        return res.status(400).json({
          success: false,
          error: 'Invalid webhook signature'
        });
      }
      
      // Process webhook event
      const event = req.body;
      
      switch (event.event) {
        case 'payment.authorized':
          // Handle payment authorized
          console.log('Payment authorized:', event.payload.payment.entity);
          break;
          
        case 'payment.captured':
          // Handle payment captured
          console.log('Payment captured:', event.payload.payment.entity);
          
          // If user_id was stored in notes during order creation
          const userId = event.payload.payment.entity.notes?.user_id;
          
          if (userId && userId !== 'guest') {
            try {
              const payment = event.payload.payment.entity;
              
              // Get subscription plan from payment notes or amount
              const subscriptionPlan = payment.notes?.plan || 
                getSubscriptionPlanFromAmount(payment.amount);
              
              // Calculate subscription expiry date (1 year from now)
              const subscriptionExpiryDate = new Date();
              subscriptionExpiryDate.setFullYear(subscriptionExpiryDate.getFullYear() + 1);
              
              // Create subscription history entry according to User model schema
              const subscriptionHistoryEntry = {
                planName: subscriptionPlan,
                dateOfPurchase: new Date(),
                expiryDate: subscriptionExpiryDate,
                amountPaid: payment.amount / 100, // Convert paise to rupees
                paymentId: payment.id,
                status: "ACTIVE"
              };
              
              // Update user in database
              await User.findByIdAndUpdate(
                userId,
                {
                  currentSubscriptionPlan: subscriptionPlan,
                  subscriptionExpiryDate: subscriptionExpiryDate,
                  $push: { subscriptionHistory: subscriptionHistoryEntry }
                },
                { new: true, runValidators: true }
              );
              
              console.log(`Subscription updated for user ${userId}`);
            } catch (error) {
              console.error('Error updating user subscription in webhook:', error);
            }
          }
          break;
          
        case 'payment.failed':
          // Handle payment failed
          console.log('Payment failed:', event.payload.payment.entity);
          break;
          
        case 'refund.created':
          // Handle refund created
          console.log('Refund created:', event.payload.refund.entity);
          
          const refund = event.payload.refund.entity;
          const payment = refund.payment_id;
          
          // Find the user with this payment ID in their subscription history
          try {
            const user = await User.findOne({
              'subscriptionHistory.paymentId': payment
            });
            
            if (user) {
              // Update subscription status to CANCELLED
              await User.findOneAndUpdate(
                { 
                  _id: user._id,
                  'subscriptionHistory.paymentId': payment 
                },
                { 
                  $set: { 'subscriptionHistory.$.status': 'CANCELLED' }
                }
              );
              
              // Check if this was their current active subscription
              const currentSubscription = user.subscriptionHistory.find(
                sub => sub.paymentId === payment
              );
              
              if (
                currentSubscription && 
                user.subscriptionExpiryDate && 
                currentSubscription.expiryDate.getTime() === user.subscriptionExpiryDate.getTime()
              ) {
                // Downgrade to FREE plan
                await User.findByIdAndUpdate(
                  user._id,
                  {
                    currentSubscriptionPlan: 'FREE',
                    subscriptionExpiryDate: null
                  }
                );
              }
              
              console.log(`Subscription cancelled for user ${user._id} due to refund`);
            }
          } catch (error) {
            console.error('Error processing refund webhook:', error);
          }
          break;
          
        default:
          console.log('Unhandled webhook event:', event.event);
      }
      
      // Always return 200 success to Razorpay webhook
      return res.status(200).json({
        success: true,
        message: 'Webhook received successfully'
      });
    } catch (error) {
      console.error('Error processing Razorpay webhook:', error);
      // Always return 200 success to Razorpay webhook even on error
      // to prevent retries, but log the error
      return res.status(200).json({
        success: true,
        message: 'Webhook received'
      });
    }
  },
  
  /**
   * Get payment details
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  getPaymentDetails: async (req, res) => {
    try {
      const { payment_id } = req.params;
      
      if (!payment_id) {
        return res.status(400).json({
          success: false,
          error: 'Payment ID is required'
        });
      }
      
      // Fetch payment details
      const payment = await instance.payments.fetch(payment_id);
      
      return res.status(200).json({
        success: true,
        payment
      });
    } catch (error) {
      console.error('Error fetching Razorpay payment details:', error);
      return res.status(500).json({
        success: false,
        error: error.message || 'Something went wrong while fetching payment details'
      });
    }
  },
  
  /**
   * Get user's subscription details
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  getUserSubscription: async (req, res) => {
    try {
      const userId = req.params.userId || req.user?.id;
      
      if (!userId) {
        return res.status(400).json({
          success: false,
          error: 'User ID is required'
        });
      }
      
      // Find user and select only subscription-related fields
      const user = await User.findById(userId).select(
        'currentSubscriptionPlan subscriptionExpiryDate subscriptionHistory'
      );
      
      if (!user) {
        return res.status(404).json({
          success: false,
          error: 'User not found'
        });
      }
      
      // Check if subscription is active using the virtual property
      const isActive = user.isSubscriptionActive;
      
      return res.status(200).json({
        success: true,
        subscription: {
          plan: user.currentSubscriptionPlan,
          expiryDate: user.subscriptionExpiryDate,
          isActive,
          history: user.subscriptionHistory
        }
      });
    } catch (error) {
      console.error('Error fetching user subscription:', error);
      return res.status(500).json({
        success: false,
        error: error.message || 'Something went wrong while fetching subscription details'
      });
    }
  },
  
  /**
   * Check if a user's subscription is active
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  checkSubscriptionStatus: async (req, res) => {
    try {
      const userId = req.params.userId || req.user?.id;
      
      if (!userId) {
        return res.status(400).json({
          success: false,
          error: 'User ID is required'
        });
      }
      
      const user = await User.findById(userId);
      
      if (!user) {
        return res.status(404).json({
          success: false,
          error: 'User not found'
        });
      }
      
      // Use the model's method to check subscription validity
      const isActive = user.hasValidSubscription();
      
      return res.status(200).json({
        success: true,
        isSubscriptionActive: isActive,
        plan: user.currentSubscriptionPlan,
        expiryDate: user.subscriptionExpiryDate
      });
    } catch (error) {
      console.error('Error checking subscription status:', error);
      return res.status(500).json({
        success: false,
        error: error.message || 'Something went wrong while checking subscription status'
      });
    }
  }
};

module.exports = paymentController;