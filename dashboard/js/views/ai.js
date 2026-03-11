/* AI Backend - UvA backend settings */
var Dashboard = Dashboard || {};

Dashboard.ai = (function() {

    function mount() {
        loadSettings();
    }

    function loadSettings() {
        Dashboard.api.get('/api/admin/ai')
            .then(function(data) {
                if (data.uva_base_url) {
                    document.getElementById('ai-base-url').value = data.uva_base_url;
                }
                if (data.uva_cookie) {
                    document.getElementById('ai-cookie').value = data.uva_cookie;
                }
                if (data.default_model) {
                    document.getElementById('ai-default-model').value = data.default_model;
                }
            })
            .catch(function() {});
    }

    function save() {
        var settings = {
            uva_base_url: document.getElementById('ai-base-url').value.trim(),
            uva_cookie: document.getElementById('ai-cookie').value.trim(),
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
        save: save
    };
})();
