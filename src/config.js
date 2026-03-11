const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

function ensureJwtSecret() {
  const envPath = path.join(__dirname, '..', '.env');
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;

  const secret = crypto.randomBytes(32).toString('hex');
  let content = '';
  if (fs.existsSync(envPath)) {
    content = fs.readFileSync(envPath, 'utf8');
  }

  if (content.includes('JWT_SECRET=')) {
    content = content.replace(/JWT_SECRET=.*/, `JWT_SECRET=${secret}`);
  } else {
    content += `\nJWT_SECRET=${secret}\n`;
  }

  fs.writeFileSync(envPath, content);
  process.env.JWT_SECRET = secret;
  return secret;
}

const config = {
  port: parseInt(process.env.PORT, 10) || 3000,
  jwtSecret: ensureJwtSecret(),
  cloudflaredConfig: process.env.CLOUDFLARED_CONFIG || '',
  dbPath: path.join(__dirname, '..', 'gateway.db'),
};

module.exports = config;
