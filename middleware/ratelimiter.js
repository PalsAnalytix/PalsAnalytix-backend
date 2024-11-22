// middleware/rateLimiter.js
const rateLimit = require("express-rate-limit");

const signupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // 5 requests per hour
  message: "Too many signup attempts, please try again later",
});

const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 3, // 3 requests per 15 minutes
  message: "Too many OTP requests, please try again later",
});

module.exports = {
  signupLimiter,
  otpLimiter,
};
