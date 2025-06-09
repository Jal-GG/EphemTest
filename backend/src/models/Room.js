const mongoose = require("mongoose");

const roomSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    roomId: {
      type: String,
      required: true,
      unique: true,
    },
    host: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    roomType: {
      type: String,
      enum: ["guest", "client"],
      default: "guest",
    },
    settings: {
      allowGuests: { type: Boolean, default: true },
      freeMovement: { type: Boolean, default: true },
      participantLimit: { type: Number, default: 12 },
      duration: { type: Number, default: 60 }, // in minutes
    },
    status: {
      type: String,
      enum: ["waiting", "active", "ended"],
      default: "waiting",
    },
    participants: [{
      user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
      isGuest: { type: Boolean, default: false },
      guestName: String,
      joinedAt: { type: Date, default: Date.now },
      avatar: {
        id: { type: String, default: "william" },
        name: String,
        position: {
          x: { type: Number, default: 0 },
          y: { type: Number, default: -1.3 },
          z: { type: Number, default: 1.1 },
        },
        rotation: {
          x: { type: Number, default: 0 },
          y: { type: Number, default: 47 },
          z: { type: Number, default: 0 },
        },
      },
      isOnline: { type: Boolean, default: true },
      isMuted: { type: Boolean, default: false },
      isVideoOff: { type: Boolean, default: false },
    }],
    sharedContent: {
      screens: [{
        screenId: String,
        mediaType: String, // "image", "pdf", "whiteboard"
        mediaUrl: String,
        page: Number, // for PDFs
        sharedBy: String,
        sharedAt: { type: Date, default: Date.now },
      }],
      whiteboard: {
        data: mongoose.Schema.Types.Mixed,
        lastUpdated: Date,
        updatedBy: String,
      },
    },
    chatMessages: [{
      sender: String,
      message: String,
      timestamp: { type: Date, default: Date.now },
      isSystem: { type: Boolean, default: false },
    }],
    createdAt: { type: Date, default: Date.now },
    endedAt: Date,
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Room", roomSchema);