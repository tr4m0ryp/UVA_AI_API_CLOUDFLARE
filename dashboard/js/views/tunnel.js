/* Tunnel - Cloudflare Tunnel control panel */
var Dashboard = Dashboard || {};

Dashboard.tunnel = (function() {
    var refreshTimer = null;

    function mount() {
        loadStatus();
        document.getElementById('btn-tunnel-start').onclick = startTunnel;
        document.getElementById('btn-tunnel-stop').onclick = stopTunnel;
        refreshTimer = setInterval(loadStatus, 5000);
    }

    function unmount() {
        if (refreshTimer) {
            clearInterval(refreshTimer);
            refreshTimer = null;
        }
    }

    function loadStatus() {
        Dashboard.api.get('/api/admin/tunnel/status')
            .then(function(data) {
                renderStatus(data);
            })
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
            urlEl.innerHTML = '<a href="' + data.url + '" target="_blank">' + data.url + '</a>';
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

    return {
        mount: mount,
        unmount: unmount
    };
})();
