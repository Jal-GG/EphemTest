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

const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    // If no auth header, continue as guest
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      req.user = null;
      return next();
    }

    const token = authHeader.split(' ')[1];
    const keys = await getPublicKeys();
    const decodedHeader = jwt.decode(token, { complete: true });
    
    if (!decodedHeader || !decodedHeader.header.kid) {
      req.user = null;
      return next();
    }

    const key = keys.find(k => k.kid === decodedHeader.header.kid);
    if (!key) {
      req.user = null;
      return next();
    }

    const pem = jwkToPem(key);
    
    const decoded = await new Promise((resolve, reject) => {
      jwt.verify(token, pem, { algorithms: ["RS256"] }, (err, decoded) => {
        if (err) {
          resolve(null);
        } else {
          resolve(decoded);
        }
      });
    });

    if (!decoded || !decoded.email) {
      req.user = null;
      return next();
    }

    const user = await User.findOne({ email: decoded.email });
    if (user) {
      req.user = {
        id: user._id,
        email: user.email,
      };
    } else {
      req.user = null;
    }

    next();
  } catch (error) {
    console.error('Optional auth error:', error);
    req.user = null;
    next();
  }
};

module.exports = optionalAuth;