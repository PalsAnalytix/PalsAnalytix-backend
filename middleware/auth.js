// middleware/auth.js
const jwt = require('jsonwebtoken');

/**
 * Middleware to authenticate users via JWT tokens
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
const authenticateUser = async (req, res, next) => {
  try {
    // Get token from Authorization header
    const token = req.headers.authorization?.split(" ")[1];

    if (!token) {
      return res.status(401).json({ 
        success: false,
        message: "Authentication failed: No token provided" 
      });
    }

    // Verify the token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Assign the decoded user ID to req.userId and also set the full user object
    req.userId = decoded.userId || decoded.id; // adjust based on your JWT structure
    req.user = { id: req.userId }; // Create a user object that can be expanded later

    next();
  } catch (error) {
    console.error("Authentication Error:", error.message);
    return res.status(401).json({ 
      success: false,
      message: "Authentication failed: Invalid or expired token" 
    });
  }
};

/**
 * Middleware to check if user has admin role
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
const isAdmin = async (req, res, next) => {
  try {
    // This assumes you have already run the authenticateUser middleware
    if (!req.userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required"
      });
    }

    // Here you would typically check if the user is an admin in your database
    // For example:
    // const user = await User.findById(req.userId);
    // if (!user || user.role !== 'admin') {
    //   return res.status(403).json({
    //     success: false,
    //     message: "Access denied: Admin privileges required"
    //   });
    // }

    // For now, we'll just pass through since you need to implement the database check
    next();
  } catch (error) {
    console.error("Admin Authorization Error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Internal server error during authorization"
    });
  }
};

/**
 * Optional middleware that doesn't reject if no token is provided
 * Useful for routes that can work for both authenticated and unauthenticated users
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
const optionalAuth = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];

    if (!token) {
      // Instead of rejecting, just continue without setting user info
      return next();
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Set user info if token is valid
    req.userId = decoded.userId || decoded.id;
    req.user = { id: req.userId };
    
    next();
  } catch (error) {
    // On error, just continue without setting user info
    // This allows the route to still work without authentication
    console.log("Optional auth failed, continuing as unauthenticated");
    next();
  }
};

module.exports = {
  authenticateUser,
  isAdmin,
  optionalAuth
};