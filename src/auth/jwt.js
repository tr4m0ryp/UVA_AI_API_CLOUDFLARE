const jwt = require('jsonwebtoken');
const config = require('../config');

function signToken(payload) {
  return jwt.sign(payload, config.jwtSecret, { expiresIn: '7d' });
}

function verifyToken(token) {
  try {
    return jwt.verify(token, config.jwtSecret);
  } catch {
    return null;
  }
}

module.exports = { signToken, verifyToken };
