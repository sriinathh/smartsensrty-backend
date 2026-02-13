/**
 * Emotion Log Model - AI-detected emotional distress logs
 */

const mongoose = require('mongoose');

const emotionLogSchema = new mongoose.Schema(
  {
    logId: {
      type: String,
      unique: true,
      default: () => `emotion_${Date.now()}`,
    },
    sosEventId: {
      type: String,
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    streamSessionId: String,
    timestamp: {
      type: Date,
      default: Date.now,
      index: true,
    },
    detectionMethod: {
      type: String,
      enum: ['voice_analysis', 'heartrate', 'motion', 'multi_modal'],
      default: 'voice_analysis',
    },
    emotions: [
      {
        emotion: {
          type: String,
          enum: ['fear', 'crying', 'panic', 'calm', 'angry', 'confused'],
        },
        confidence: {
          type: Number,
          min: 0,
          max: 1.0,
        },
        indicators: {
          pitchLevel: String,
          energyLevel: String,
          voiceStability: String,
          breathingPattern: String,
          speechRate: Number,
        },
      },
    ],
    primaryEmotion: {
      emotion: String,
      confidence: Number,
    },
    emotionIntensity: {
      type: Number,
      min: 0,
      max: 1.0,
      // Average confidence across detected emotions
    },
    audioFeatures: {
      pitch: Number,
      energy: Number,
      zeroCrossingRate: Number,
      spectralCentroid: Number,
      mfcc: [Number], // 13 coefficients
      prosody: {
        variance: Number,
        range: Number,
      },
      speechRate: Number,
    },
    audioMetadata: {
      sampleRate: Number,
      duration: Number,
      format: String,
      quality: String,
    },
    distressLevel: {
      type: String,
      enum: ['none', 'low', 'moderate', 'high', 'critical'],
    },
    distressScore: {
      type: Number,
      min: 0,
      max: 1.0,
      // Calculated from emotion confidences and indicators
    },
    triggeredSafetyCheck: Boolean,
    autoSOSTriggered: Boolean,
    sosReason: String,
    sosConfidence: Number,
    recommendations: [
      {
        recommendation: String,
        priority: {
          type: String,
          enum: ['low', 'medium', 'high', 'critical'],
        },
        action: String,
      },
    ],
    userContext: {
      time: String,
      location: {
        latitude: Number,
        longitude: Number,
        address: String,
      },
      activity: String,
      environmentNoise: String,
    },
    modelVersion: {
      type: String,
      default: '1.0',
    },
    modelAccuracy: {
      type: Number,
      min: 0,
      max: 1.0,
    },
    confidenceFactors: {
      audioQuality: Number,
      contextRelevance: Number,
      modelCertainty: Number,
    },
    falsePositiveRisk: {
      type: Number,
      min: 0,
      max: 1.0,
      // Probability this detection is a false positive
    },
    relatedEvents: [
      {
        eventId: String,
        eventType: String,
        timeOffset: Number, // milliseconds from this detection
      },
    ],
    manualReview: {
      reviewed: Boolean,
      reviewedAt: Date,
      reviewedBy: mongoose.Schema.Types.ObjectId,
      reviewNotes: String,
      accuracy: String,
      falsePositive: Boolean,
    },
    actions: [
      {
        action: String,
        timestamp: Date,
        result: String,
      },
    ],
    deleted: {
      type: Boolean,
      default: false,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

emotionLogSchema.index({ sosEventId: 1 });
emotionLogSchema.index({ userId: 1, timestamp: -1 });
emotionLogSchema.index({ 'primaryEmotion.emotion': 1 });
emotionLogSchema.index({ distressScore: 1 });
emotionLogSchema.index({ autoSOSTriggered: 1 });

module.exports = mongoose.model('EmotionLog', emotionLogSchema);
