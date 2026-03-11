const { spawn } = require('child_process');
const config = require('./config');

let tunnelProcess = null;
let tunnelUrl = null;
let tunnelStatus = 'stopped'; /* stopped | starting | running | error */
let tunnelError = null;

function getStatus() {
  return {
    status: tunnelStatus,
    url: tunnelUrl,
    error: tunnelError,
  };
}

function start() {
  if (tunnelProcess) {
    return { ok: false, message: 'Tunnel is already running' };
  }

  tunnelStatus = 'starting';
  tunnelUrl = null;
  tunnelError = null;

  let args;
  if (config.cloudflaredConfig) {
    /* Named tunnel with config file */
    args = ['tunnel', '--config', config.cloudflaredConfig, 'run'];
  } else {
    /* Quick tunnel (temporary URL) */
    args = ['tunnel', '--url', `http://localhost:${config.port}`];
  }

  try {
    tunnelProcess = spawn('cloudflared', args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (err) {
    tunnelStatus = 'error';
    tunnelError = 'Failed to start cloudflared: ' + err.message;
    return { ok: false, message: tunnelError };
  }

  /* Parse tunnel URL from stderr (cloudflared logs to stderr) */
  tunnelProcess.stderr.on('data', (data) => {
    const line = data.toString();
    const match = line.match(/https:\/\/[^\s]+\.trycloudflare\.com/);
    if (match) {
      tunnelUrl = match[0];
      tunnelStatus = 'running';
      console.log('Tunnel URL:', tunnelUrl);
    }
    /* Named tunnel uses a custom domain, detect "registered connectors" */
    if (line.includes('Registered tunnel connection')) {
      tunnelStatus = 'running';
    }
  });

  tunnelProcess.on('error', (err) => {
    tunnelStatus = 'error';
    tunnelError = err.message;
    tunnelProcess = null;
  });

  tunnelProcess.on('close', (code) => {
    if (tunnelStatus !== 'stopped') {
      tunnelStatus = code === 0 ? 'stopped' : 'error';
      if (code !== 0) tunnelError = `cloudflared exited with code ${code}`;
    }
    tunnelProcess = null;
  });

  return { ok: true };
}

function stop() {
  if (tunnelProcess) {
    tunnelStatus = 'stopped';
    tunnelProcess.kill('SIGTERM');
    tunnelProcess = null;
    tunnelUrl = null;
    tunnelError = null;
  }
}

module.exports = { getStatus, start, stop };
