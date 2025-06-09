const Room = require("../models/Room");
const { v4: uuidv4 } = require("uuid");

const createRoom = async (req, res) => {
  try {
    const {
      name,
      roomType,
      allowGuests,
      freeMovement,
      participantLimit,
      duration,
    } = req.body;

    const roomId = uuidv4().substring(0, 8);

    const room = new Room({
      name: name || `${req.user.email}'s Room`,
      roomId,
      host: req.user.id,
      roomType: roomType || "guest",
      settings: {
        allowGuests: allowGuests !== undefined ? allowGuests : true,
        freeMovement: freeMovement !== undefined ? freeMovement : true,
        participantLimit: participantLimit || 12,
        duration: duration || 60,
      },
      participants: [], // Empty participants array - host will join via socket
    });

    await room.save();
    await room.populate("host", "email profile");

    res.status(201).json({
      success: true,
      message: "Room created successfully",
      room,
      roomId,
    });
  } catch (error) {
    console.error("Create room error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create room",
      error: error.message,
    });
  }
};

const joinRoom = async (req, res) => {
  try {
    const { roomId } = req.params;
    const { avatar, guestName } = req.body;
    const isGuest = !req.user;

    const room = await Room.findOne({ roomId }).populate("host", "email profile");

    if (!room) {
      return res.status(404).json({
        success: false,
        message: "Room not found",
      });
    }

    if (room.status === "ended") {
      return res.status(400).json({
        success: false,
        message: "Room has ended",
      });
    }

    if (isGuest && !room.settings.allowGuests) {
      return res.status(403).json({
        success: false,
        message: "Guest access not allowed",
      });
    }

    if (room.participants.length >= room.settings.participantLimit) {
      return res.status(400).json({
        success: false,
        message: "Room is full",
      });
    }

    // If this is the host joining, handle them specially
    if (!isGuest && room.host.toString() === req.user.id) {
      const hostParticipant = room.participants.find(p => p.user?.toString() === req.user.id);
      if (hostParticipant) {
        // Update existing host participant
        hostParticipant.avatar = {
          ...hostParticipant.avatar,
          ...avatar,
        };
        hostParticipant.isOnline = true;
      } else {
        // Add host as participant if not already present
        room.participants.push({
          user: req.user.id,
          isGuest: false,
          avatar: {
            id: avatar?.id || "william",
            name: avatar?.name || "Host",
            position: { x: 0, y: -1.3, z: 1.1 },
            rotation: { x: 0, y: 47, z: 0 },
            ...avatar,
          },
          isOnline: true,
          joinedAt: new Date(),
        });
      }
    } else {
      // For non-host users
      const existingParticipant = room.participants.find(p => 
        isGuest ? false : p.user?.toString() === req.user?.id
      );

      if (existingParticipant) {
        existingParticipant.isOnline = true;
        existingParticipant.avatar = {
          ...existingParticipant.avatar,
          ...avatar,
        };
      } else {
        room.participants.push({
          user: isGuest ? null : req.user.id,
          isGuest,
          guestName: isGuest ? guestName : undefined,
          avatar: {
            id: avatar?.id || "william",
            name: avatar?.name || guestName || "Participant",
            position: { x: 0, y: -1.3, z: 1.1 },
            rotation: { x: 0, y: 47, z: 0 },
            ...avatar,
          },
          isOnline: true,
          joinedAt: new Date(),
        });
      }
    }

    if (room.status === "waiting") {
      room.status = "active";
    }

    await room.save();
    await room.populate("participants.user", "email profile");

    res.status(200).json({
      success: true,
      message: "Joined room successfully",
      room,
    });
  } catch (error) {
    console.error("Join room error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to join room",
      error: error.message,
    });
  }
};

const getRoomInfo = async (req, res) => {
  try {
    const { roomId } = req.params;

    const room = await Room.findOne({ roomId })
      .populate("host", "email profile")
      .populate("participants.user", "email profile");

    if (!room) {
      return res.status(404).json({
        success: false,
        message: "Room not found",
      });
    }

    res.status(200).json({
      success: true,
      room,
    });
  } catch (error) {
    console.error("Get room info error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get room info",
      error: error.message,
    });
  }
};

const leaveRoom = async (req, res) => {
  try {
    const { roomId } = req.params;
    const isGuest = !req.user;

    const room = await Room.findOne({ roomId });

    if (!room) {
      return res.status(404).json({
        success: false,
        message: "Room not found",
      });
    }

    if (isGuest) {
      // For guests, we'll handle this via socket disconnect
      return res.status(200).json({
        success: true,
        message: "Guest leaving handled via socket",
      });
    }

    const participantIndex = room.participants.findIndex(p => 
      p.user?.toString() === req.user.id
    );

    if (participantIndex === -1) {
      return res.status(400).json({
        success: false,
        message: "Not in this room",
      });
    }

    room.participants[participantIndex].isOnline = false;
    await room.save();

    res.status(200).json({
      success: true,
      message: "Left room successfully",
    });
  } catch (error) {
    console.error("Leave room error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to leave room",
      error: error.message,
    });
  }
};

const endRoom = async (req, res) => {
  try {
    const { roomId } = req.params;

    const room = await Room.findOne({ roomId });

    if (!room) {
      return res.status(404).json({
        success: false,
        message: "Room not found",
      });
    }

    if (room.host.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: "Only host can end the room",
      });
    }

    room.status = "ended";
    room.endedAt = new Date();
    await room.save();

    res.status(200).json({
      success: true,
      message: "Room ended successfully",
    });
  } catch (error) {
    console.error("End room error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to end room",
      error: error.message,
    });
  }
};

module.exports = {
  createRoom,
  joinRoom,
  getRoomInfo,
  leaveRoom,
  endRoom,
};