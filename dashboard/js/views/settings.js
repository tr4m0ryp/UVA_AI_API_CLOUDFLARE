/* Settings - Server configuration (.env) */
var Dashboard = Dashboard || {};

Dashboard.settings = (function() {

    function mount() {
        loadSettings();
    }

    function loadSettings() {
        Dashboard.api.get('/api/admin/settings')
            .then(function(data) {
                if (data.PORT) {
                    document.getElementById('settings-port').value = data.PORT;
                }
                if (data.CLOUDFLARED_CONFIG) {
                    document.getElementById('settings-cloudflared').value = data.CLOUDFLARED_CONFIG;
                }
            })
            .catch(function() {});
    }

    function save() {
        var settings = {
            PORT: document.getElementById('settings-port').value.trim() || '3000',
            CLOUDFLARED_CONFIG: document.getElementById('settings-cloudflared').value.trim(),
        };

        var statusEl = document.getElementById('settings-save-status');
        statusEl.textContent = 'Saving...';

        Dashboard.api.put('/api/admin/settings', settings)
            .then(function() {
                statusEl.textContent = 'Saved (restart required for port changes)';
                setTimeout(function() { statusEl.textContent = ''; }, 4000);
            })
            .catch(function(err) {
                statusEl.textContent = 'Error: ' + err.message;
            });
    }

    return {
        mount: mount,
        save: save
    };
})();
