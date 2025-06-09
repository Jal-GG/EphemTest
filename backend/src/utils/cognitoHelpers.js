const crypto = require('crypto');

const getSecretHash = (username) => {
  return crypto
    .createHmac('SHA256', process.env.COGNITO_CLIENT_SECRET)
    .update(username + process.env.COGNITO_CLIENT_ID)
    .digest('base64');
};

module.exports = getSecretHash