const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    googleId: { type: String, unique: true, sparse: true },
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    profilePic: { type: String },
    mobile: { type: String },
    address: { type: String },
    password: { type: String },
    profileImage: { type: String },
    // Volunteer network fields
    isVolunteer: { type: Boolean, default: false },
    volunteerLocation: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], default: [0, 0] }, // [longitude, latitude]
    },
    volunteerLastActive: { type: Date },
    // Medical profile for emergency response
    medicalProfile: {
      bloodType: String,
      allergies: [String],
      medications: [String],
      emergencyContact: String,
      conditions: [String],
    },
  },
  { timestamps: true }
);

// Add geospatial index for volunteer location queries
userSchema.index({ volunteerLocation: '2dsphere' });

module.exports = mongoose.model('User', userSchema);
