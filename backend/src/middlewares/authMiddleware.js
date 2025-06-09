const jwt = require("jsonwebtoken");
const jwkToPem = require("jwk-to-pem");
const axios = require("axios");


const User = require("../models/User.js");

const COGNITO_USER_POOL_ID = process.env.COGNITO_USER_POOL_ID;
const AWS_REGION = process.env.AWS_REGION;

const getPublicKeys = async () => {
  const url = `https://cognito-idp.${AWS_REGION}.amazonaws.com/${COGNITO_USER_POOL_ID}/.well-known/jwks.json`;
  const { data } = await axios.get(url);
  return data.keys;
};

const cognitoAuthMiddleware = async (req, res, next) => {
  try {
    // 1. Get public keys from Cognito
    const keys = await getPublicKeys();
    
    // 2. Extract token from Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Authorization header missing or invalid',
      });
    }
    
    const token = authHeader.split(' ')[1];
    
    // 3. Decode token header to get the key ID (kid)
    const decodedHeader = jwt.decode(token, { complete: true });
    if (!decodedHeader || !decodedHeader.header.kid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid token format',
      });
    }
    
    // 4. Find the matching key
    const key = keys.find(k => k.kid === decodedHeader.header.kid);
    if (!key) {
      return res.status(401).json({
        success: false,
        message: 'Invalid token: no matching key found',
      });
    }
    
    // 5. Convert JWK to PEM and verify the token
    const pem = jwkToPem(key);
    
    const decoded = await new Promise((resolve, reject) => {
      jwt.verify(token, pem, { algorithms: ["RS256"] }, (err, decoded) => {
        if (err) {
          reject(new Error('Token verification failed'));
        } else {
          resolve(decoded);
        }
      });
    });
    
    // 6. Check required fields in the decoded token
    if (!decoded.email || !decoded.email_verified) {
      return res.status(403).json({
        success: false,
        message: 'Email not verified or missing in token',
      });
    }
    
    // 7. Find user in MongoDB
    const user = await User.findOne({ email: decoded.email });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }
    
    // 8. Update user's verification status if needed
    if (!user.isEmailVerified && decoded.email_verified) {
      user.isEmailVerified = true;
      await user.save();
    }
    
    // Attach the user to the request object
    req.user = {
      id: user._id,
      email: user.email,
      // Add any other user properties you need
    };
    
    // Proceed to the next middleware/route handler
    next();
    
  } catch (error) {
    console.error('Authentication error:', error);
    
    let statusCode = 401;
    let message = 'Unauthorized';
    
    if (error.message.includes('Token verification failed')) {
      message = 'Invalid token signature';
    } else if (error.message.includes('jwt malformed')) {
      message = 'Malformed token';
    } else if (error.message === 'User not found') {
      statusCode = 404;
      message = 'User not found';
    }
    
    return res.status(statusCode).json({
      success: false,
      message,
    });
  }
};

module.exports = cognitoAuthMiddleware;