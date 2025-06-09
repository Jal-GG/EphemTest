const Room = require("../models/Room");
const jwt = require("jsonwebtoken");
const jwkToPem = require("jwk-to-pem");
const axios = require("axios");
const User = require("../models/User");

const COGNITO_USER_POOL_ID = process.env.COGNITO_USER_POOL_ID;
const AWS_REGION = process.env.AWS_REGION;

const getPublicKeys = async () => {
  const url = `https://cognito-idp.${AWS_REGION}.amazonaws.com/${COGNITO_USER_POOL_ID}/.well-known/jwks.json`;
  const { data } = await axios.get(url);
  return data.keys;
};

const authenticateSocket = async (token) => {
  try {
    if (!token) return null;

    const keys = await getPublicKeys();
    const decodedHeader = jwt.decode(token, { complete: true });
    
    if (!decodedHeader || !decodedHeader.header.kid) return null;

    const key = keys.find(k => k.kid === decodedHeader.header.kid);
    if (!key) return null;

    const pem = jwkToPem(key);
    
    const decoded = await new Promise((resolve, reject) => {
      jwt.verify(token, pem, { algorithms: ["RS256"] }, (err, decoded) => {
        if (err) resolve(null);
        else resolve(decoded);
      });
    });

    if (!decoded || !decoded.email) return null;

    const user = await User.findOne({ email: decoded.email });
    return user ? { id: user._id, email: user.email } : null;
  } catch (error) {
    console.error('Socket auth error:', error);
    return null;
  }
};

const setupRoomSocket = (io) => {
  // Keep track of connected users per room
  const roomUsers = new Map(); // roomId -> Map(socketId -> userInfo)

  io.on("connection", (socket) => {
    console.log("User connected:", socket.id);
    socket.on("join-room", async (data) => {
      try {
        const { roomId, token, guestName, avatar } = data;
        
        // Authenticate user (optional)
        const user = await authenticateSocket(token);
        const isGuest = !user;
    
        // Find room
        const room = await Room.findOne({ roomId })
          .populate("host", "email profile")
          .populate("participants.user", "email profile");
    
        if (!room) {
          socket.emit("error", { message: "Room not found" });
          return;
        }
    
        if (room.status === "ended") {
          socket.emit("error", { message: "Room has ended" });
          return;
        }
    
        if (isGuest && !room.settings.allowGuests) {
          socket.emit("error", { message: "Guest access not allowed" });
          return;
        }
    
        // Create unique user identifier
        const userId = user?.id?.toString() || `guest_${socket.id}`;
        
        // Use the avatar name from the frontend, don't override it
        const displayName = avatar?.name;
    
        // Use the complete avatar data sent from frontend
        const avatarData = {
          id: avatar?.id || "william",
          name: displayName,
          folder: avatar?.folder || "/assets/AVATARS/AVATAR01",
          scale: avatar?.scale || { x: 1, y: 2.3, z: 1 },
          directions: avatar?.directions || [
            "BACK", "DOWNLEFT", "DOWNRIGHT", "FRONT", "LEFT", "RIGHT", "UPLEFT", "UPRIGHT", "SIT"
          ],
          frameTiming: avatar?.frameTiming || [4, 3, 3, 4, 3, 3],
          nameTagHeight: avatar?.nameTagHeight || 0.5,
          sittingTagHeight: avatar?.sittingTagHeight || 0.65,
          collisionWidth: avatar?.collisionWidth || 0.5,
          collisionHeight: avatar?.collisionHeight || 0.5,
          moveSpeed: avatar?.moveSpeed || 0.05,
          position: { x: 0, y: -1.3, z: 1.1 },
          rotation: { x: 0, y: 47, z: 0 },
        };
    
        // Store socket info
        socket.userId = userId;
        socket.roomId = roomId;
        socket.isGuest = isGuest;
        socket.guestName = guestName;
        socket.displayName = displayName;
    
        // Join socket room
        socket.join(roomId);
    
        // Initialize room users map if not exists
        if (!roomUsers.has(roomId)) {
          roomUsers.set(roomId, new Map());
        }
    
        const currentRoomUsers = roomUsers.get(roomId);
    
        // Remove any existing entries for this user
        for (const [socketId, userInfo] of currentRoomUsers.entries()) {
          if (userInfo.userId === userId) {
            currentRoomUsers.delete(socketId);
          }
        }
    
        // Add current user to room users
        currentRoomUsers.set(socket.id, {
          userId,
          socketId: socket.id,
          isGuest,
          name: displayName,
          avatar: avatarData,
          isOnline: true,
        });
    
        // Update participant in database
        let participant = null;
        
        // If this is the host joining, ensure we use their avatar data
        if (!isGuest && room.host.toString() === userId) {
          participant = room.participants.find(p => p.user?.toString() === userId);
          if (participant) {
            // Update existing host participant
            participant.avatar = avatarData;
            participant.isOnline = true;
          } else {
            // Add host as participant if not already present
            participant = {
              user: userId,
              isGuest: false,
              avatar: avatarData,
              isOnline: true,
              joinedAt: new Date()
            };
            room.participants.push(participant);
          }
        } else {
          // For non-host users, find by user ID or guest name
          if (!isGuest) {
            participant = room.participants.find(p => p.user?.toString() === userId);
          } else {
            participant = room.participants.find(p => p.guestName === guestName);
          }

          if (!participant) {
            // Add new participant
            participant = {
              user: isGuest ? null : userId,
              isGuest,
              guestName: isGuest ? guestName : undefined,
              avatar: avatarData,
              isOnline: true,
              joinedAt: new Date()
            };
            room.participants.push(participant);
          } else {
            // Update existing participant
            participant.isOnline = true;
            participant.avatar = avatarData;
            participant.joinedAt = new Date();
          }
        }

        // Clean up any duplicate entries
        const uniqueParticipants = new Map();
        room.participants.forEach(p => {
          const key = p.isGuest ? p.guestName : p.user?.toString();
          if (key) {
            uniqueParticipants.set(key, p);
          }
        });
        room.participants = Array.from(uniqueParticipants.values());

        // If this is the host joining, ensure they're the first participant
        if (!isGuest && room.host.toString() === userId) {
          const hostParticipant = room.participants.find(p => p.user?.toString() === userId);
          if (hostParticipant) {
            room.participants = [
              hostParticipant,
              ...room.participants.filter(p => p.user?.toString() !== userId)
            ];
          }
        }

        await room.save();
    
        // Send room data to joining user
        socket.emit("room-joined", { room });
    
        // Send current user info to others in room (excluding the user who just joined)
        socket.to(roomId).emit("user-joined", {
          userId,
          isGuest,
          name: displayName,
          avatar: avatarData,
        });
    
        // Send all existing users to the new user
        for (const [socketId, userInfo] of currentRoomUsers.entries()) {
          if (socketId !== socket.id) { // Don't send user's own info
            socket.emit("user-joined", {
              userId: userInfo.userId,
              isGuest: userInfo.isGuest,
              name: userInfo.name,
              avatar: userInfo.avatar,
            });
          }
        }
    
        console.log(`User ${displayName} (${userId}) joined room ${roomId}`);
      } catch (error) {
        console.error("Join room error:", error);
        socket.emit("error", { message: "Failed to join room" });
      }
    });

    // Avatar movement
    socket.on("avatar-move", (data) => {
      const { position, rotation } = data;
      
      // Update position in room users
      if (socket.roomId && roomUsers.has(socket.roomId)) {
        const currentRoomUsers = roomUsers.get(socket.roomId);
        const userInfo = currentRoomUsers.get(socket.id);
        if (userInfo) {
          userInfo.avatar.position = position;
          userInfo.avatar.rotation = rotation;
        }
      }

      // Broadcast to others in room
      socket.to(socket.roomId).emit("avatar-moved", {
        userId: socket.userId,
        position,
        rotation,
      });
    });

    // Avatar state changes (sitting, etc.)
    socket.on("avatar-state-change", (data) => {
      const { isSitting, sittingChair, image } = data;
      
      // Update state in room users
      if (socket.roomId && roomUsers.has(socket.roomId)) {
        const currentRoomUsers = roomUsers.get(socket.roomId);
        const userInfo = currentRoomUsers.get(socket.id);
        if (userInfo) {
          userInfo.avatar.isSitting = isSitting;
          userInfo.avatar.sittingChair = sittingChair;
          userInfo.avatar.image = image;
        }
      }

      // Broadcast to others in room
      socket.to(socket.roomId).emit("avatar-state-changed", {
        userId: socket.userId,
        isSitting,
        sittingChair,
        image,
      });
    });

    // Chat message
    socket.on("chat-message", async (data) => {
      try {
        const { message } = data;
        const room = await Room.findOne({ roomId: socket.roomId });
        
        if (room) {
          const chatMessage = {
            sender: socket.displayName || socket.userId,
            message,
            timestamp: new Date(),
          };
          
          room.chatMessages.push(chatMessage);
          await room.save();

          io.to(socket.roomId).emit("chat-message", chatMessage);
        }
      } catch (error) {
        console.error("Chat message error:", error);
      }
    });

    // Screen share
    socket.on("screen-share", async (data) => {
      try {
        const { screenId, mediaType, mediaUrl, page } = data;
        const room = await Room.findOne({ roomId: socket.roomId });
        
        if (room) {
          const screenIndex = room.sharedContent.screens.findIndex(s => s.screenId === screenId);
          const screenData = {
            screenId,
            mediaType,
            mediaUrl,
            page,
            sharedBy: socket.displayName || socket.userId,
            sharedAt: new Date(),
          };

          if (screenIndex >= 0) {
            room.sharedContent.screens[screenIndex] = screenData;
          } else {
            room.sharedContent.screens.push(screenData);
          }

          await room.save();
          io.to(socket.roomId).emit("screen-updated", screenData);
        }
      } catch (error) {
        console.error("Screen share error:", error);
      }
    });

    // Whiteboard update
    socket.on("whiteboard-update", async (data) => {
      try {
        const { whiteboardData } = data;
        const room = await Room.findOne({ roomId: socket.roomId });
        
        if (room) {
          room.sharedContent.whiteboard = {
            data: whiteboardData,
            lastUpdated: new Date(),
            updatedBy: socket.displayName || socket.userId,
          };
          
          await room.save();
          socket.to(socket.roomId).emit("whiteboard-updated", { whiteboardData });
        }
      } catch (error) {
        console.error("Whiteboard update error:", error);
      }
    });

    // Voice/Video controls
    socket.on("toggle-mic", (data) => {
      socket.to(socket.roomId).emit("user-mic-toggled", {
        userId: socket.userId,
        isMuted: data.isMuted,
      });
    });

    socket.on("toggle-video", (data) => {
      socket.to(socket.roomId).emit("user-video-toggled", {
        userId: socket.userId,
        isVideoOff: data.isVideoOff,
      });
    });

    // WebRTC signaling for voice/video
    socket.on("webrtc-offer", (data) => {
      socket.to(data.targetUserId).emit("webrtc-offer", {
        offer: data.offer,
        fromUserId: socket.userId,
      });
    });

    socket.on("webrtc-answer", (data) => {
      socket.to(data.targetUserId).emit("webrtc-answer", {
        answer: data.answer,
        fromUserId: socket.userId,
      });
    });

    socket.on("webrtc-ice-candidate", (data) => {
      socket.to(data.targetUserId).emit("webrtc-ice-candidate", {
        candidate: data.candidate,
        fromUserId: socket.userId,
      });
    });

    // Disconnect
    socket.on("disconnect", async () => {
      try {
        if (socket.roomId) {
          // Remove from room users
          if (roomUsers.has(socket.roomId)) {
            const currentRoomUsers = roomUsers.get(socket.roomId);
            currentRoomUsers.delete(socket.id);
            
            // Clean up empty room
            if (currentRoomUsers.size === 0) {
              roomUsers.delete(socket.roomId);
            }
          }

          // Update database
          const room = await Room.findOne({ roomId: socket.roomId });
          if (room && !socket.isGuest) {
            const participant = room.participants.find(p => 
              p.user?.toString() === socket.userId
            );
            if (participant) {
              participant.isOnline = false;
              await room.save();
            }
          }

          socket.to(socket.roomId).emit("user-left", {
            userId: socket.userId,
          });
        }
        
        console.log(`User ${socket.displayName || socket.userId} disconnected`);
      } catch (error) {
        console.error("Disconnect error:", error);
      }
    });
  });
};

module.exports = setupRoomSocket;