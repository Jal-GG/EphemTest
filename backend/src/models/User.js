// models/User.js
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    username: {
      type: String,
      // required: true,
      // unique: true,
      minlength: 3,
      trim: true,
    },

    isEmailVerified: {
      type: Boolean,
      default: false,
    },
    // Authentication
    auth: {
      type: {
        type: String,
        enum: ["email", "google"],
        required: true,
      },
      password: {
        type: String,
        required: function () {
          return this.auth.type === "email";
        },
      },
      googleId: {
        type: String,
        required: function () {
          return this.auth.type === "google";
        },
      },
    },
    // Avatar configuration
   profile: {
    firstName: String,
    lastName: String,
    displayName: String,
    avatar: {
      id: { type: String, default: 'william' },
      customName: String,
      image: String
    }
  },
  preferences: {
    defaultRoom: { type: String, default: 'guest' },
    notifications: { type: Boolean, default: true },
    micEnabled: { type: Boolean, default: true },
    videoEnabled: { type: Boolean, default: true }
  },
  subscription: {
    plan: { type: String, enum: ['free', 'pro', 'enterprise'], default: 'free' },
    expiresAt: Date
  },
   lastActive: { type: Date, default: Date.now },
  isOnline: { type: Boolean, default: false },
    status: {
      type: String,
      enum: ["online", "away", "busy", "offline"],
      default: "offline",
    },
    // Current session
    currentRoom: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Room",
    },
    isActive: { type: Boolean, default: true },
    lastSeen: { type: Date, default: Date.now },
  },
  {
    timestamps: true,
  }
);

// Password hashing middleware
userSchema.pre("save", async function (next) {
  if (!this.isModified("auth.password") || !this.auth.password) return next();
  this.auth.password = await bcrypt.hash(this.auth.password, 12);
  next();
});

// Password comparison method
userSchema.methods.comparePassword = async function (password) {
  if (!this.auth.password) return false;
  return bcrypt.compare(password, this.auth.password);
};

module.exports = mongoose.model("User", userSchema);
