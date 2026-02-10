const mongoose = require('mongoose');

const sosEvidenceSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    sosId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SOS', // Reference to the SOS log
      required: true,
    },
    type: {
      type: String,
      enum: ['panic', 'accident', 'medical', 'disaster', 'manual'],
      required: true,
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
    location: {
      latitude: Number,
      longitude: Number,
      placeName: String,
    },
    // Evidence files stored in MongoDB as base64
    evidenceFiles: [{
      type: {
        type: String,
        enum: ['video_front', 'video_back', 'audio', 'photo'],
        required: true,
      },
      filename: {
        type: String,
        required: true,
      },
      data: {
        type: String, // Base64 encoded file data
        required: true,
      },
      secureUrl: {
        type: String, // Secure access URL
        required: true,
      },
      mimeType: {
        type: String,
        required: true,
      },
      size: {
        type: Number, // File size in bytes
        required: true,
      },
      uploadedAt: {
        type: Date,
        default: Date.now,
      },
    }],
    // Metadata for legal protection
    deviceInfo: {
      deviceId: String,
      os: String,
      appVersion: String,
    },
    sharedWith: [{
      type: {
        type: String,
        enum: ['family', 'police', 'emergency_services', 'sos_logs'],
      },
      sharedAt: Date,
    }],
    // Tamper protection
    hash: String, // SHA-256 hash of evidence files
    blockchainRef: String, // Optional blockchain reference for immutable proof
  },
  { timestamps: true }
);

// Indexes for efficient queries
sosEvidenceSchema.index({ userId: 1, timestamp: -1 });
sosEvidenceSchema.index({ type: 1, timestamp: -1 });

module.exports = mongoose.model('SOSEvidence', sosEvidenceSchema);