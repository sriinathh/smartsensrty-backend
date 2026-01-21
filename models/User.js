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
  },
  { timestamps: true }
);

module.exports = mongoose.model('User', userSchema);
