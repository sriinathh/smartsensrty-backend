/**
 * Guardian Model - Trusted emergency contacts
 */

const mongoose = require('mongoose');

const guardianSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    guardianId: {
      type: String,
      unique: true,
      default: () => `guardian_${Date.now()}`,
    },
    name: {
      type: String,
      required: true,
    },
    phone: {
      type: String,
      required: true,
    },
    email: {
      type: String,
      sparse: true,
    },
    relationship: {
      type: String,
      enum: [
        'spouse',
        'parent',
        'child',
        'sibling',
        'friend',
        'colleague',
        'emergency_contact',
        'other',
      ],
      default: 'other',
    },
    trustScore: {
      type: Number,
      min: 0,
      max: 1.0,
      default: 0.8,
    },
    lastKnownLocation: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point',
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
        sparse: true,
      },
      address: String,
      timestamp: Date,
    },
    notificationPreferences: {
      sms: { type: Boolean, default: true },
      push: { type: Boolean, default: true },
      email: { type: Boolean, default: false },
      quiet_hours: {
        enabled: { type: Boolean, default: false },
        start: String, // "22:00"
        end: String, // "08:00"
      },
    },
    responseHistory: [
      {
        sosEventId: String,
        notifiedAt: Date,
        respondedAt: Date,
        responseAction: String, // 'accepted', 'declined'
        timeToRespond: Number, // milliseconds
      },
    ],
    responseStats: {
      totalNotifications: { type: Number, default: 0 },
      totalResponses: { type: Number, default: 0 },
      acceptanceRate: { type: Number, default: 0 },
      averageResponseTime: { type: Number, default: 0 }, // milliseconds
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    verificationToken: String,
    verificationTokenExpires: Date,
    isActive: {
      type: Boolean,
      default: true,
    },
    addedAt: {
      type: Date,
      default: Date.now,
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
    deletedAt: Date,
  },
  {
    timestamps: true,
  }
);

// Geospatial index for location queries
guardianSchema.index({ 'lastKnownLocation.coordinates': '2dsphere' });
guardianSchema.index({ userId: 1, isActive: 1 });

module.exports = mongoose.model('Guardian', guardianSchema);
