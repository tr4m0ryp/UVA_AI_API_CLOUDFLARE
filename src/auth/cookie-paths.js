const os = require('os');
const path = require('path');
const fs = require('fs');

const home = os.homedir();

/* Firefox profile directories to search (Linux only for now) */
const firefoxDirs = [
  path.join(home, 'snap/firefox/common/.mozilla/firefox'),
  path.join(home, '.mozilla/firefox'),
];

/* Chrome/Chromium cookie DB paths */
const chromePaths = [
  path.join(home, '.config/google-chrome/Default/Cookies'),
  path.join(home, '.config/chromium/Default/Cookies'),
  path.join(home, 'snap/chromium/common/chromium/Default/Cookies'),
];

function findFirefoxProfileDir() {
  for (const dir of firefoxDirs) {
    if (fs.existsSync(dir)) return dir;
  }
  return null;
}

function findChromeCookiesDb() {
  for (const p of chromePaths) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

module.exports = { findFirefoxProfileDir, findChromeCookiesDb };
