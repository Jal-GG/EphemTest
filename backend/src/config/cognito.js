const AWS = require('aws-sdk')

const cognito = new AWS.CognitoIdentityServiceProvider({
  region: process.env.COGNITO_REGION,
});

module.exports =  cognito;
