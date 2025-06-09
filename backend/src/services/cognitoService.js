
const {
  CognitoUserPool,
  CognitoUser,
  AuthenticationDetails,
  CognitoUserAttribute,
} = require('amazon-cognito-identity-js');
const crypto = require('crypto');
require('dotenv').config();

// Validate environment variables
const requiredEnvVars = ['COGNITO_USER_POOL_ID', 'COGNITO_CLIENT_ID', 'COGNITO_CLIENT_SECRET'];
for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.error(`Error: Environment variable ${envVar} is not defined`);
    throw new Error(`Missing required environment variable: ${envVar}`);
  }
}

const poolData = {
  UserPoolId: process.env.COGNITO_USER_POOL_ID,
  ClientId: process.env.COGNITO_CLIENT_ID,
};

const userPool = new CognitoUserPool(poolData);

const calculateSecretHash = (username) => {
  try {
    if (!username) {
      console.error('calculateSecretHash: Username is undefined or empty');
      throw new Error('Username is required for SECRET_HASH calculation');
    }
    if (!process.env.COGNITO_CLIENT_ID) {
      console.error('calculateSecretHash: COGNITO_CLIENT_ID is undefined');
      throw new Error('COGNITO_CLIENT_ID is required');
    }
    const message = username + process.env.COGNITO_CLIENT_ID;
    console.log('Calculating SECRET_HASH:', { username, clientId: process.env.COGNITO_CLIENT_ID });
    const hmac = crypto.createHmac('sha256', process.env.COGNITO_CLIENT_SECRET);
    hmac.update(message);
    const hash = hmac.digest('base64');
    console.log('SECRET_HASH generated:', hash);
    return hash;
  } catch (error) {
    console.error('calculateSecretHash error:', error.message);
    throw error;
  }
};

const signup = (email, password, username, name, callback) => {
  try {
    console.log('Signup attempt:', { email, username });
    if (!email || !password || !username || !name) {
      const error = new Error('Missing required fields: email, password, username, and name are required');
      console.error('Signup validation error:', error.message);
      return callback(error);
    }

    const attributeList = [
      new CognitoUserAttribute({ Name: 'email', Value: email }),
      new CognitoUserAttribute({ Name: 'preferred_username', Value: username }),
      new CognitoUserAttribute({ Name: 'name', Value: name }),
    ];

    userPool.signUp(
      email,
      password,
      attributeList,
      null,
      (err, result) => {
        if (err) {
          console.error('Cognito signup error:', err.message, err);
          return callback(err);
        }
        console.log('Cognito signup successful:', { email, username });
        callback(null, result.user);
      },
      { secretHash: calculateSecretHash(email) } // Move SECRET_HASH to top-level
    );
  } catch (error) {
    console.error('Signup exception:', error.message, error);
    callback(error);
  }
};

const confirmSignup = (email, code, callback) => {
  try {
    console.log('Confirm signup attempt:', { email });
    if (!email || !code) {
      const error = new Error('Missing required fields: email and code are required');
      console.error('Confirm signup validation error:', error.message);
      return callback(error);
    }

    const cognitoUser = new CognitoUser({ Username: email, Pool: userPool });
    cognitoUser.confirmRegistration(
      code,
      true,
      (err, result) => {
        if (err) {
          console.error('Cognito confirm signup error:', err.message, err);
          return callback(err);
        }
        console.log('Cognito confirm signup successful:', { email });
        callback(null, result);
      },
      { secretHash: calculateSecretHash(email) } // Move SECRET_HASH to top-level
    );
  } catch (error) {
    console.error('Confirm signup exception:', error.message, error);
    callback(error);
  }
};

const signin = (email, password, callback) => {
  try {
    console.log('Signin attempt:', { email });
    if (!email || !password) {
      const error = new Error('Missing required fields: email and password are required');
      console.error('Signin validation error:', error.message);
      return callback(error);
    }

    const authenticationDetails = new AuthenticationDetails({
      Username: email,
      Password: password,
      ClientMetadata: { secretHash: calculateSecretHash(email) }, // Keep in ClientMetadata for signin
    });
    const cognitoUser = new CognitoUser({ Username: email, Pool: userPool });

    cognitoUser.authenticateUser(authenticationDetails, {
      onSuccess: (session) => {
        const tokens = {
          accessToken: session.getAccessToken().getJwtToken(),
          idToken: session.getIdToken().getJwtToken(),
          refreshToken: session.getRefreshToken().getToken(),
        };
        console.log('Cognito signin successful:', { email });
        callback(null, { user: cognitoUser, tokens });
      },
      onFailure: (err) => {
        console.error('Cognito signin error:', err.message, err);
        callback(err);
      },
    });
  } catch (error) {
    console.error('Signin exception:', error.message, error);
    callback(error);
  }
};

module.exports = { signup, confirmSignup, signin };
