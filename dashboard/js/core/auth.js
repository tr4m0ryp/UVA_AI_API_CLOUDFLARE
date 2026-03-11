/* Dashboard authentication */
var Dashboard = Dashboard || {};

Dashboard.auth = (function() {
    var browserLoginBtn = null;
    var browserStatusDiv = null;
    var browserStatusText = null;
    var errorDiv = null;
    var pollInterval = null;
    var pollStartTime = 0;
    var POLL_TIMEOUT_MS = 120000;

    function init() {
        browserLoginBtn = document.getElementById('btn-browser-login');
        browserStatusDiv = document.getElementById('browser-login-status');
        browserStatusText = document.getElementById('browser-status-text');
        errorDiv = document.getElementById('login-error');

        browserLoginBtn.addEventListener('click', doBrowserLogin);
        document.getElementById('btn-logout').addEventListener('click', doLogout);
    }

    function rawPost(path, body) {
        return fetch(path, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body || {})
        }).then(function(res) {
            return res.json().then(function(data) {
                if (res.ok) return data;
                var msg = (data.error && data.error.message)
                    ? data.error.message : 'Request failed';
                return Promise.reject(new Error(msg));
            });
        });
    }

    function rawGet(path) {
        return fetch(path, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' }
        }).then(function(res) {
            return res.json().then(function(data) {
                if (res.ok) return data;
                var msg = (data.error && data.error.message)
                    ? data.error.message : 'Request failed';
                return Promise.reject(new Error(msg));
            });
        });
    }

    function doBrowserLogin() {
        hideError();
        browserLoginBtn.disabled = true;
        browserStatusDiv.classList.remove('hidden');
        browserStatusText.textContent = 'Checking existing session...';

        rawPost('/api/admin/auth/browser-login')
            .then(function(data) {
                /* If existing cookies were valid, login completed instantly */
                if (data.status === 'success') {
                    Dashboard.api.setToken(data.token);
                    Dashboard.app.showDashboard(data.email, data.name);
                    resetBrowserUI();
                    return;
                }
                browserStatusText.textContent =
                    'Waiting for login at aichat.uva.nl...';
                pollStartTime = Date.now();
                pollInterval = setInterval(pollBrowserStatus, 2000);
            })
            .catch(function(err) {
                showError(err.message);
                resetBrowserUI();
            });
    }

    function pollBrowserStatus() {
        if (Date.now() - pollStartTime > POLL_TIMEOUT_MS) {
            clearInterval(pollInterval);
            pollInterval = null;
            cancelBrowserLogin();
            showError('Login timed out. Please try again.');
            resetBrowserUI();
            return;
        }

        rawGet('/api/admin/auth/browser-status')
            .then(function(data) {
                if (data.status === 'success') {
                    clearInterval(pollInterval);
                    pollInterval = null;
                    Dashboard.api.setToken(data.token);
                    Dashboard.app.showDashboard(data.email, data.name);
                    resetBrowserUI();
                } else if (data.status === 'error') {
                    clearInterval(pollInterval);
                    pollInterval = null;
                    showError(data.message || 'Login failed');
                    resetBrowserUI();
                }
            })
            .catch(function(err) {
                clearInterval(pollInterval);
                pollInterval = null;
                showError(err.message);
                resetBrowserUI();
            });
    }

    function cancelBrowserLogin() {
        rawPost('/api/admin/auth/browser-cancel').catch(function() {});
    }

    function resetBrowserUI() {
        browserLoginBtn.disabled = false;
        browserStatusDiv.classList.add('hidden');
    }

    function doLogout() {
        if (pollInterval) {
            clearInterval(pollInterval);
            pollInterval = null;
            cancelBrowserLogin();
        }
        Dashboard.api.post('/api/admin/auth/logout', {}).catch(function() {});
        Dashboard.api.clearToken();
        Dashboard.app.showLogin();
    }

    function showError(msg) {
        errorDiv.textContent = msg;
        errorDiv.classList.remove('hidden');
    }

    function hideError() {
        errorDiv.classList.add('hidden');
    }

    return { init: init };
})();
