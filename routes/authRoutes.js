const express = require('express');
const passport = require('passport');
const jwt = require('jsonwebtoken');

const router = express.Router();

// Google OAuth endpoint
router.get(
  '/google',
  passport.authenticate('google', { scope: ['profile', 'email'] })
);

// Google OAuth callback
router.get(
  '/google/callback',
  passport.authenticate('google', { session: false }),
  (req, res) => {
    try {
      const token = jwt.sign(
        { userId: req.user._id },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      );

      // Redirect to frontend with token
      res.redirect(`http://localhost:3000/auth-success?token=${token}`);
    } catch (error) {
      console.error('JWT generation failed:', error);
      res.redirect(`http://localhost:3000/auth-failure?error=${error.message}`);
    }
  }
);

module.exports = router;
