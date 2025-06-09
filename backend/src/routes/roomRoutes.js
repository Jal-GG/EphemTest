const express = require("express");
const router = express.Router();
const authenticateUser = require("../middlewares/authMiddleware");
const optionalAuth = require("../middlewares/optionalAuth");
const {
  createRoom,
  joinRoom,
  getRoomInfo,
  leaveRoom,
  endRoom,
} = require("../controllers/roomController");

// Protected routes (require authentication)
router.post("/create", authenticateUser, createRoom);
router.post("/:roomId/leave", authenticateUser, leaveRoom);
router.post("/:roomId/end", authenticateUser, endRoom);

// Optional auth routes (can work with or without authentication)
router.post("/:roomId/join", optionalAuth, joinRoom);
router.get("/:roomId", optionalAuth, getRoomInfo);

module.exports = router;