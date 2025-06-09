const AgoraService = require('../services/agoraService');

class AgoraController {
    static async generateToken(req, res) {
        try {
            const { channelName, uid } = req.body;
            
            if (!channelName) {
                return res.status(400).json({ error: 'Channel name is required' });
            }

            const tokenData = AgoraService.generateToken(
                channelName,
                uid || 0 // If uid is not provided, use 0 as default
            );

            res.json(tokenData);
        } catch (error) {
            console.error('Error generating Agora token:', error);
            res.status(500).json({ error: 'Failed to generate token' });
        }
    }
}

module.exports = AgoraController;
