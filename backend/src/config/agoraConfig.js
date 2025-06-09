require('dotenv').config();

const agoraConfig = {
    appId: process.env.AGORA_APP_ID,
    appCertificate: process.env.AGORA_APP_CERTIFICATE,
    // Token expiration time in seconds (24 hours)
    tokenExpirationTime: 86400,
    // Privilege expiration time in seconds (24 hours)
    privilegeExpirationTime: 86400,
};

module.exports = agoraConfig;