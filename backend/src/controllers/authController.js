const cognito = require("../config/cognito");
const axios = require("axios");
const getSecretHash = require("../utils/cognitoHelpers");
const User = require("../models/User");
const jwt = require("jsonwebtoken");
const qs = require("querystring");


const signup = async (req, res) => {
  const { email, password } = req.body;

  const params = {
    ClientId: process.env.COGNITO_CLIENT_ID,
    Username: email,
    Password: password,
    SecretHash: getSecretHash(email),
    UserAttributes: [{ Name: "email", Value: email }],
  };

  try {
    const existingUser = await User.findOne({ email });

    if (existingUser) {
      if (existingUser.auth.type === "google") {
        existingUser.auth.type = "email";
        existingUser.auth.password = password; 
        await existingUser.save();

        await cognito.signUp(params).promise();

        return res.status(200).json({
          message:
            "Account updated with password. Please verify your email to continue.",
        });
      } else {
        return res.status(400).json({
          error: "Email already registered with email/password login.",
        });
      }
    }

    await cognito.signUp(params).promise();

    await User.create({
      email,
      isEmailVerified: false,
      auth: {
        type: "email",
        password, // Will be hashed
      },
    });

    res.status(200).json({
      message: "Signup successful. Please verify your email.",
    });
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: err.message });
  }
};


const signin = async (req, res) => {
  const { email, password } = req.body;

  const params = {
    AuthFlow: "USER_PASSWORD_AUTH",
    ClientId: process.env.COGNITO_CLIENT_ID,
    AuthParameters: {
      USERNAME: email,
      PASSWORD: password,
      SECRET_HASH: getSecretHash(email),
    },
  };

  try {
    const result = await cognito.initiateAuth(params).promise();
    console.log(result.AuthenticationResult.IdToken)
    res.status(200).json({message : "LoggedIn Successfully",IdToken : result.AuthenticationResult.IdToken});
  } catch (err) {
    console.error(err);
    res.status(401).json({ error: "Invalid credentials" });
  }
};



const confirmSignup = async (req, res) => {
  const { email, code } = req.body;

  const params = {
    ClientId: process.env.COGNITO_CLIENT_ID,
    Username: email,
    ConfirmationCode: code,
    SecretHash: getSecretHash(email),
  };

  try {
    await cognito.confirmSignUp(params).promise();
    await User.findOneAndUpdate(
      { email },
      { isEmailVerified: true },
      { new: true }
    );

    res
      .status(200)
      .json({ message: "Email confirmed successfully. You can now sign in." });
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: err.message });
  }
};

const resendConfirmationCode = async (req, res) => {
  const { email } = req.body;

  const params = {
    ClientId: process.env.COGNITO_CLIENT_ID,
    Username: email,
    SecretHash: getSecretHash(email),
  };

  try {
    await cognito.resendConfirmationCode(params).promise();
    res.status(200).json({ message: "Confirmation code resent to email." });
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: err.message });
  }
};


const googleCallback = async (req, res) => {
  const code = req.query.code;
  const redirectUri = process.env.COGNITO_REDIRECT_URI;

  try {
    const data = {
      grant_type: "authorization_code",
      client_id: process.env.COGNITO_CLIENT_ID,
      redirect_uri: redirectUri,
      code,
    };

    if (process.env.COGNITO_CLIENT_SECRET) {
      data.client_secret = process.env.COGNITO_CLIENT_SECRET;
    }

    const tokenRes = await axios.post(
      `https://${process.env.COGNITO_DOMAIN}/oauth2/token`,
      qs.stringify(data),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );

    // console.log(tokenRes);

    const idToken = tokenRes.data.id_token;
    const accessToken = tokenRes.data.access_token;
    console.log(idToken)
    const decoded = jwt.decode(idToken);

    // Try to get email from id token
    let email = decoded.email || decoded["cognito:email"];
    console.log(email);
    // If no email in id token, fetch user info explicitly
    if (!email) {
      const userInfoRes = await axios.get(
        `https://${process.env.COGNITO_DOMAIN}/oauth2/userInfo`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );

      email = userInfoRes.data.email;
    }
   
    if (!email) {
      throw new Error("Email not found in token or user info response");
    }

    let user = await User.findOne({ email });
    if (!user) {
      user = await User.create({
        email,
        isEmailVerified: true, // Google emails are verified
        auth: {
          type: "google",
          googleId: decoded.sub, // Store Google ID
        },
      });
    } else {
      // Update existing user if needed
      user = await User.findOneAndUpdate(
        { email },
        {
          isEmailVerified: true,
          "auth.type": "google",
          "auth.googleId": decoded.sub,
        },
        { new: true }
      );
    }

    res.status(200).json({ message: "Login successful", user, idToken});
  } catch (err) {
    console.error("Google OAuth error:", err);
    res.status(500).json({ error: "OAuth callback failed" });
  }
};


const forgotPasswordInitiate = async (req, res) => {
  const { email } = req.body;

  const params = {
    ClientId: process.env.COGNITO_CLIENT_ID,
    Username: email,
    SecretHash: getSecretHash(email),
  };

  try {
    await cognito.forgotPassword(params).promise();
    res.status(200).json({ message: "Password reset code sent to email." });
  } catch (err) {
    console.error("Forgot password error:", err);
    res.status(400).json({ error: err.message });
  }
};

const forgotPasswordConfirm = async (req, res) => {
  const { email, code, newPassword } = req.body;

  const params = {
    ClientId: process.env.COGNITO_CLIENT_ID,
    Username: email,
    ConfirmationCode: code,
    Password: newPassword,
    SecretHash: getSecretHash(email),
  };

  try {
    await cognito.confirmForgotPassword(params).promise();
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // 3. Update password in MongoDB (will be hashed by pre-save hook)
    user.auth.password = newPassword;
    await user.save();
    res
      .status(200)
      .json({ message: "Password reset successful. You can now log in." });
  } catch (err) {
    console.error("Confirm forgot password error:", err);
    if (err.code === "CodeMismatchException") {
      return res.status(400).json({ error: "Invalid verification code" });
    }
    if (err.code === "ExpiredCodeException") {
      return res.status(400).json({ error: "Verification code has expired" });
    }

    res.status(400).json({ error: err.message });
  }
};
const logout = async (req, res) => {
  try {
   
  const clientId = '1gfvudlkmt986drghfh760qo0m';
  const logoutUri = 'http://localhost:5173'; 
  const cognitoDomain = 'https://eu-north-1cudzxvawo.auth.eu-north-1.amazoncognito.com';

  const logoutUrl = `${cognitoDomain}/logout?client_id=${clientId}&logout_uri=${encodeURIComponent(logoutUri)}`;

  res.redirect(logoutUrl);

  } catch (err) {
    console.error("Logout error:", err);
    res.status(500).json({ error: "Logout failed" });
  }
};



module.exports = {
  signup,
  signin,
  googleCallback,
  confirmSignup,
  resendConfirmationCode,
  forgotPasswordConfirm,
  forgotPasswordInitiate,
  logout
};
