const crypto = require('crypto');

function genId(prefix, hexLen) {
  return prefix + crypto.randomBytes(Math.ceil(hexLen / 2))
    .toString('hex')
    .slice(0, hexLen);
}

module.exports = { genId };
