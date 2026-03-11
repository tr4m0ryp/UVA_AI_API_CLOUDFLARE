/* Connectivity -- Tunnel control + Cloudflare setup + AI model settings */
var Dashboard = Dashboard || {};

Dashboard.connectivity = (function() {
    var refreshTimer = null;

    function mount() {
        document.getElementById('btn-tunnel-start').onclick = startTunnel;
        document.getElementById('btn-tunnel-stop').onclick = stopTunnel;
        loadStatus();
        loadToken();
        loadAiSettings();
        refreshTimer = setInterval(loadStatus, 5000);
    }

    function unmount() {
        if (refreshTimer) {
            clearInterval(refreshTimer);
            refreshTimer = null;
        }
    }

    /* --- Tunnel status --- */

    function loadStatus() {
        Dashboard.api.get('/api/admin/tunnel/status')
            .then(function(data) { renderStatus(data); })
            .catch(function() {});
    }

    function renderStatus(data) {
        var statusEl = document.getElementById('tunnel-status-text');
        var urlEl = document.getElementById('tunnel-url');
        var dotEl = document.getElementById('tunnel-status-dot');
        var startBtn = document.getElementById('btn-tunnel-start');
        var stopBtn = document.getElementById('btn-tunnel-stop');

        statusEl.textContent = data.status.charAt(0).toUpperCase() + data.status.slice(1);

        if (data.status === 'running') {
            dotEl.className = 'status-dot';
            startBtn.disabled = true;
            stopBtn.disabled = false;
        } else if (data.status === 'starting') {
            dotEl.className = 'status-dot warning';
            startBtn.disabled = true;
            stopBtn.disabled = false;
        } else {
            dotEl.className = 'status-dot offline';
            startBtn.disabled = false;
            stopBtn.disabled = true;
        }

        if (data.url) {
            urlEl.innerHTML = '<a href="' + data.url + '" target="_blank" style="color: var(--accent); font-weight: 600;">' + data.url + '</a>';
        } else {
            urlEl.textContent = data.error || 'No tunnel active';
        }
    }

    function startTunnel() {
        Dashboard.api.post('/api/admin/tunnel/start')
            .then(function() { loadStatus(); })
            .catch(function(err) { alert('Error: ' + err.message); });
    }

    function stopTunnel() {
        Dashboard.api.post('/api/admin/tunnel/stop')
            .then(function() { loadStatus(); })
            .catch(function(err) { alert('Error: ' + err.message); });
    }

    /* --- Tunnel token --- */

    function loadToken() {
        Dashboard.api.get('/api/admin/tunnel/token')
            .then(function(data) {
                var statusEl = document.getElementById('tunnel-token-status');
                if (data.configured) {
                    statusEl.textContent = 'Token configured';
                    document.getElementById('tunnel-token').placeholder = '(token saved -- enter new value to replace)';
                }
            })
            .catch(function() {});
    }

    function saveToken() {
        var token = document.getElementById('tunnel-token').value.trim();
        var statusEl = document.getElementById('tunnel-token-status');
        statusEl.textContent = 'Saving...';

        Dashboard.api.put('/api/admin/tunnel/token', { token: token })
            .then(function() {
                statusEl.textContent = token ? 'Token saved' : 'Token cleared';
                document.getElementById('tunnel-token').value = '';
                if (token) {
                    document.getElementById('tunnel-token').placeholder = '(token saved -- enter new value to replace)';
                }
                setTimeout(function() { statusEl.textContent = token ? 'Token configured' : ''; }, 3000);
            })
            .catch(function(err) {
                statusEl.textContent = 'Error: ' + err.message;
            });
    }

    /* --- AI model settings --- */

    function loadAiSettings() {
        Dashboard.api.get('/api/admin/ai')
            .then(function(data) {
                if (data.default_model) {
                    document.getElementById('ai-default-model').value = data.default_model;
                }
            })
            .catch(function() {});
    }

    function saveAi() {
        var settings = {
            default_model: document.getElementById('ai-default-model').value,
        };

        var statusEl = document.getElementById('ai-save-status');
        statusEl.textContent = 'Saving...';

        Dashboard.api.put('/api/admin/ai', settings)
            .then(function() {
                statusEl.textContent = 'Saved';
                setTimeout(function() { statusEl.textContent = ''; }, 2000);
            })
            .catch(function(err) {
                statusEl.textContent = 'Error: ' + err.message;
            });
    }

    return {
        mount: mount,
        unmount: unmount,
        saveToken: saveToken,
        saveAi: saveAi
    };
})();
