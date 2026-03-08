require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.CORS_ORIGIN || "http://localhost:8000", // allow your frontend origin
    methods: ["GET", "POST"]
  }
});

app.use(express.static(path.join(__dirname, 'public')));


function generateRoomCode(length = 6) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < length; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

const rooms = {};
// Track room deletion timeouts for grace period
const roomDeletionTimeouts = {};

// Each room will store an array of drawing actions and chat messages
// rooms[roomCode] = { users: Set, history: Array, chat: Array }

io.on('connection', (socket) => {
  // Default: no userId until client registers
  socket.data.userId = undefined;
  console.log('A user connected:', socket.id);

  // Listen for userId registration from client
  socket.on('registerUser', (userId) => {
    socket.data.userId = userId;
    console.log(`Socket ${socket.id} registered userId: ${userId}`);
  });

  socket.on('joinRoom', (payload) => {
    // Support old string or new object payload
    let roomCode, userId;
    if (typeof payload === 'object' && payload !== null) {
      roomCode = payload.code && payload.code.length > 0 ? payload.code.toUpperCase() : null;
      userId = payload.userId;
    } else {
      roomCode = payload && payload.length > 0 ? payload.toUpperCase() : null;
      userId = undefined;
    }
    if (!roomCode) {
      // Create new room
      do {
        roomCode = generateRoomCode();
      } while (rooms[roomCode]);
      rooms[roomCode] = { users: new Set(), history: [], chat: [] };
    }
    // Join existing room or create if not exists
    if (!rooms[roomCode]) {
      rooms[roomCode] = { users: new Set(), history: [], chat: [] };
    }
    if (rooms[roomCode].users.size >= 12) {
      socket.emit('roomError', 'Room is full.');
      return;
    }
    socket.join(roomCode);
    // If a grace period timer exists for this room, cancel it (room is active again)
    if (roomDeletionTimeouts[roomCode]) {
      clearTimeout(roomDeletionTimeouts[roomCode]);
      delete roomDeletionTimeouts[roomCode];
    }
    // Store userId for this connection (if provided)
    socket.data.roomCode = roomCode;
    socket.data.userId = userId;
    // Track userId in room (for future features)
    if (userId) {
      rooms[roomCode].users.add(userId);
    } else {
      rooms[roomCode].users.add(socket.id);
    }
    socket.emit('roomJoined', roomCode);
    // Always send drawing history to the new user (even if empty)
    socket.emit('drawingHistory', rooms[roomCode].history || []);
    // Always send chat history to the new user (even if empty)
    socket.emit('chatHistory', rooms[roomCode].chat || []);

    // Notify all clients in the room of the updated user list
    const userList = Array.from(rooms[roomCode].users);
    io.to(roomCode).emit('userList', userList);

    // Notify all clients in the room of the join event (except the joining user)
    socket.to(roomCode).emit('userJoined', { userId, roomCode });

    console.log(`Socket ${socket.id} (userId: ${userId}) joined room ${roomCode}`);
  });

  socket.on('drawing', (data) => {
    const room = data.room;
    if (room && rooms[room]) {
      // Save drawing action to history
      if (rooms[room].history) {
        rooms[room].history.push(data);
        // Limit history to last 2000 actions for memory
        if (rooms[room].history.length > 2000) rooms[room].history.shift();
      }
      socket.to(room).emit('drawing', data);
    }
  });

  // --- Chat message event ---
  socket.on('chatMessage', (msg) => {
    const { room } = msg;
    if (room && rooms[room]) {
      // Store chat history in memory
      if (rooms[room].chat) {
        rooms[room].chat.push(msg);
        if (rooms[room].chat.length > 500) rooms[room].chat.shift();
      }
      socket.to(room).emit('chatMessage', msg);
    }
  });

    // Allow user to leave a room
  socket.on('leaveRoom', () => {
    const roomCode = socket.data.roomCode;
    const userId = socket.data.userId;
    if (roomCode && rooms[roomCode]) {
      if (userId) {
        rooms[roomCode].users.delete(userId);
      } else {
        rooms[roomCode].users.delete(socket.id);
      }
      // Notify all clients in the room of the updated user list
      const userList = Array.from(rooms[roomCode].users);
      io.to(roomCode).emit('userList', userList);
      // Notify all clients in the room of the leave event
      socket.to(roomCode).emit('userLeft', { userId, roomCode });
      if (rooms[roomCode].users.size === 0) {
        // Start grace period timer (e.g., 10 seconds)
        if (!roomDeletionTimeouts[roomCode]) {
          roomDeletionTimeouts[roomCode] = setTimeout(() => {
            delete rooms[roomCode];
            delete roomDeletionTimeouts[roomCode];
            console.log(`Room ${roomCode} deleted after grace period.`);
          }, 10000); // 10 seconds
        }
      }
    }
    socket.leave(roomCode);
    socket.data.roomCode = undefined;
    // Optionally, send an event to client to confirm leaving
  });

  socket.on('disconnect', () => {
    const roomCode = socket.data.roomCode;
    const userId = socket.data.userId;
    if (roomCode && rooms[roomCode]) {
      if (userId) {
        rooms[roomCode].users.delete(userId);
      } else {
        rooms[roomCode].users.delete(socket.id);
      }
      // Notify all clients in the room of the updated user list
      const userList = Array.from(rooms[roomCode].users);
      io.to(roomCode).emit('userList', userList);
      // Notify all clients in the room of the leave event
      socket.to(roomCode).emit('userLeft', { userId, roomCode });
      if (rooms[roomCode].users.size === 0) {
        // Start grace period timer (e.g., 10 seconds)
        if (!roomDeletionTimeouts[roomCode]) {
          roomDeletionTimeouts[roomCode] = setTimeout(() => {
            delete rooms[roomCode];
            delete roomDeletionTimeouts[roomCode];
            console.log(`Room ${roomCode} deleted after grace period.`);
          }, 10000); // 10 seconds
        }
      }
    }
    console.log(`User disconnected: ${socket.id} (userId: ${userId})`);
  });
});

const PORT = process.env.PORT || 3000;
const SERVER_URL = process.env.SERVER_URL || `http://localhost:${PORT}`;
server.listen(PORT, () => {
  console.log(`Server running on ${SERVER_URL}`);
});
