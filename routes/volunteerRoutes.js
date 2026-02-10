const express = require('express');
const router = express.Router();
const User = require('../models/User');
const jwt = require('jsonwebtoken');

// Middleware to verify JWT token
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'Access token required' });
  }

  jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key', (err, user) => {
    if (err) {
      return res.status(403).json({ message: 'Invalid token' });
    }
    req.user = user;
    next();
  });
};

// Register as volunteer
router.post('/register', authenticateToken, async (req, res) => {
  try {
    const { latitude, longitude } = req.body;

    if (!latitude || !longitude) {
      return res.status(400).json({ message: 'Location coordinates required' });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    user.isVolunteer = true;
    user.volunteerLocation = {
      type: 'Point',
      coordinates: [longitude, latitude], // MongoDB uses [lng, lat]
    };
    user.volunteerLastActive = new Date();

    await user.save();

    res.json({
      message: 'Successfully registered as volunteer',
      volunteer: {
        isVolunteer: user.isVolunteer,
        location: user.volunteerLocation,
        lastActive: user.volunteerLastActive,
      },
    });
  } catch (error) {
    console.error('Volunteer registration error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update volunteer location
router.put('/location', authenticateToken, async (req, res) => {
  try {
    const { latitude, longitude } = req.body;

    if (!latitude || !longitude) {
      return res.status(400).json({ message: 'Location coordinates required' });
    }

    const user = await User.findById(req.user.id);
    if (!user || !user.isVolunteer) {
      return res.status(404).json({ message: 'Volunteer not found' });
    }

    user.volunteerLocation = {
      type: 'Point',
      coordinates: [longitude, latitude],
    };
    user.volunteerLastActive = new Date();

    await user.save();

    res.json({
      message: 'Location updated successfully',
      location: user.volunteerLocation,
      lastActive: user.volunteerLastActive,
    });
  } catch (error) {
    console.error('Location update error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Unregister as volunteer
router.delete('/unregister', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    user.isVolunteer = false;
    user.volunteerLocation = undefined;
    user.volunteerLastActive = undefined;

    await user.save();

    res.json({ message: 'Successfully unregistered as volunteer' });
  } catch (error) {
    console.error('Volunteer unregistration error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get nearby volunteers (for emergency dispatch)
router.get('/nearby/:lat/:lng/:radius', authenticateToken, async (req, res) => {
  try {
    const { lat, lng, radius } = req.params;

    if (!lat || !lng || !radius) {
      return res.status(400).json({ message: 'Latitude, longitude, and radius required' });
    }

    const latitude = parseFloat(lat);
    const longitude = parseFloat(lng);
    const searchRadius = parseFloat(radius); // in meters

    // Find volunteers within radius using MongoDB geospatial query
    const volunteers = await User.find({
      isVolunteer: true,
      volunteerLastActive: {
        $gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // Active within last 24 hours
      },
      volunteerLocation: {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [longitude, latitude],
          },
          $maxDistance: searchRadius,
        },
      },
    })
    .select('name mobile volunteerLocation volunteerLastActive')
    .limit(20); // Limit results

    res.json({
      count: volunteers.length,
      volunteers: volunteers.map(v => ({
        id: v._id,
        name: v.name,
        mobile: v.mobile,
        location: v.volunteerLocation,
        lastActive: v.volunteerLastActive,
        distance: calculateDistance(latitude, longitude, v.volunteerLocation.coordinates[1], v.volunteerLocation.coordinates[0]),
      })),
    });
  } catch (error) {
    console.error('Nearby volunteers query error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Helper function to calculate distance between two points (Haversine formula)
function calculateDistance(lat1, lng1, lat2, lng2) {
  const R = 6371e3; // Earth's radius in meters
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lng2 - lng1) * Math.PI / 180;

  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

  return R * c; // Distance in meters
}

// Alert nearby volunteers (Crowd-Shield emergency dispatch)
router.post('/alert-nearby', authenticateToken, async (req, res) => {
  try {
    const { latitude, longitude, emergencyType, userName } = req.body;

    if (!latitude || !longitude || !emergencyType) {
      return res.status(400).json({ message: 'Location coordinates and emergency type required' });
    }

    // Find nearby volunteers
    const volunteers = await User.find({
      isVolunteer: true,
      volunteerLastActive: {
        $gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // Active within last 24 hours
      },
      volunteerLocation: {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [longitude, latitude],
          },
          $maxDistance: 5000, // 5km radius
        },
      },
    })
    .select('name mobile volunteerLocation')
    .limit(10); // Get up to 10 closest volunteers

    if (volunteers.length === 0) {
      return res.json({
        message: 'No volunteers available in your area',
        alerted: 0,
        volunteers: []
      });
    }

    // Add distance to each volunteer
    const volunteersWithDistance = volunteers.map(v => ({
      id: v._id,
      name: v.name,
      mobile: v.mobile,
      distance: calculateDistance(latitude, longitude, v.volunteerLocation.coordinates[1], v.volunteerLocation.coordinates[0]) / 1000, // Convert to km
    }));

    // Note: Push notifications removed - using MongoDB only
    // Volunteers can be contacted via SMS or phone calls through the mobile numbers

    res.json({
      message: `Found ${volunteers.length} nearby volunteers`,
      alerted: volunteers.length,
      emergencyType,
      volunteers: volunteersWithDistance
    });

  } catch (error) {
    console.error('Volunteer alert error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;