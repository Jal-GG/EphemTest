const { RtcTokenBuilder, RtcRole } = require('agora-access-token');
const agoraConfig = require('../config/agoraConfig');

class AgoraService {
    static generateToken(channelName, uid, role = RtcRole.PUBLISHER) {
        if (!agoraConfig.appId || !agoraConfig.appCertificate) {
            throw new Error('Agora credentials not configured');
        }

        const expirationTimeInSeconds = agoraConfig.tokenExpirationTime;
        const currentTimestamp = Math.floor(Date.now() / 1000);
        const privilegeExpiredTs = currentTimestamp + expirationTimeInSeconds;

        const token = RtcTokenBuilder.buildTokenWithUid(
            agoraConfig.appId,
            agoraConfig.appCertificate,
            channelName,
            uid,
            role,
            privilegeExpiredTs
        );

        return {
            token,
            appId: agoraConfig.appId,
            channelName,
            uid,
            role,
            expireAt: privilegeExpiredTs
        };
    }
}

module.exports = AgoraService;