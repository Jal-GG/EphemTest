const express = require('express');
const router = express.Router();
const AgoraController = require('../controllers/agoraController');
const authenticateUser = require('../middlewares/authMiddleware');

// Generate Agora token for a channel
router.post('/token', authenticateUser, AgoraController.generateToken);

module.exports = router;