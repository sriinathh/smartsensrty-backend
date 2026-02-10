const mongoose = require('mongoose');

const sosSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    type: {
      type: String,
      enum: ['manual', 'accident', 'panic', 'shake', 'power', 'voice', 'card'],
      required: true,
    },
    location: {
      type: String,
      required: true,
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
    // Additional fields for automatic detection
    evidence: {
      type: String, // Type of evidence collected (e.g., 'audio_recording')
      required: false,
    },
    silent: {
      type: Boolean,
      default: false, // Whether this was a silent activation
    },
    // Location coordinates if available
    coordinates: {
      latitude: Number,
      longitude: Number,
    },
    // Status tracking
    status: {
      type: String,
      enum: ['active', 'resolved', 'cancelled'],
      default: 'active',
    },
    resolvedAt: Date,
  },
  { timestamps: true }
);

// Index for faster queries
sosSchema.index({ userId: 1, timestamp: -1 });
sosSchema.index({ type: 1, timestamp: -1 });
sosSchema.index({ status: 1, timestamp: -1 });

module.exports = mongoose.model('SOS', sosSchema);