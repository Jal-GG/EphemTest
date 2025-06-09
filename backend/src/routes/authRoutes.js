const express = require("express")
const router = express.Router();
const  {
  signup,
  signin,
  googleCallback,
  confirmSignup,
  resendConfirmationCode,
  logout
} = require('../controllers/authController.js');

router.post('/signup', signup);
router.post('/signin', signin);
router.get('/callback/google', googleCallback);
router.post('/confirm', confirmSignup);
router.post('/resend-code', resendConfirmationCode);
router.get('/logout',logout );


module.exports = router;