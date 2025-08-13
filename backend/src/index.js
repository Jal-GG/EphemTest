const express = require('express');
const connectDB = require('./config/database');
const socketIo = require('socket.io');
const cors = require('cors');
const authRoutes = require('./routes/authRoutes');
const roomRoutes = require('./routes/roomRoutes');
const authenticateUser = require('./middlewares/authMiddleware');
const setupRoomSocket = require('./sockets/roomSocket');
const http = require('http');
const agoraRoutes = require("./routes/agoraRoutes")
const paymentRoutes = require('./routes/paymentRoutes')

const app = express();
const server = http.createServer(app);

// Connect to MongoDB
connectDB();

const corsOptions = {
  origin: "*",
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Cookie', 'Set-Cookie'],
};

const io = socketIo(server, {
  cors: corsOptions,
  transports: ['websocket', 'polling']
});

// Setup room socket handlers
setupRoomSocket(io);

// CORS setup
app.use(cors(corsOptions));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/rooms', roomRoutes);
app.use('/api/agora', agoraRoutes)
app.use('/api/payments', paymentRoutes); 

app.get('/', (_req, res) => {
  res.send('Hello from backend!');
});

app.get('/api/ping', authenticateUser, (req, res) => {
  res.json({ response: 'pong' });
});

// Error handling middleware
app.use((err, _req, res, _next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal Server Error' });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
  console.log(`Auth endpoints available at: http://localhost:${PORT}/api/auth/*`);
  console.log(`Room endpoints available at: http://localhost:${PORT}/api/rooms/*`);
  console.log(`Socket.io ready for real-time features`);
});

module.exports = app;