/**
 * JWT Authentication Middleware
 * Verifies JWT tokens and attaches user info to request
 */

const jwt = require('jsonwebtoken');

const authenticateToken = (req, res, next) => {
  try {
    // Get token from Authorization header
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      console.warn('⚠️ No authorization token provided');
      return res.status(401).json({
        success: false,
        message: 'Access token required',
      });
    }

    // Verify token
    const secret = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-this-in-production';
    jwt.verify(token, secret, (err, user) => {
      if (err) {
        console.error('❌ Token verification failed:', err.message);
        return res.status(403).json({
          success: false,
          message: 'Invalid or expired token',
        });
      }

      // Attach user info to request - support both userId and id
      req.user = {
        id: user.id || user.userId || user._id,
        userId: user.userId || user.id || user._id,
        ...user, // Spread all user props
      };
      console.log('✅ User authenticated:', req.user.id);
      next();
    });
  } catch (error) {
    console.error('❌ Authentication error:', error);
    return res.status(500).json({
      success: false,
      message: 'Authentication error',
    });
  }
};

module.exports = authenticateToken;
