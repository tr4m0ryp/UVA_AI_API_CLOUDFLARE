/* Endpoints - CRUD table + create/edit modal */
var Dashboard = Dashboard || {};

Dashboard.endpoints = (function() {
    var endpoints = [];
    var editingId = null;

    function mount() {
        loadEndpoints();
        document.getElementById('btn-create-endpoint').onclick = function() {
            openModal(null);
        };
    }

    function unmount() {}

    function loadEndpoints() {
        Dashboard.api.get('/api/admin/endpoints')
            .then(function(data) {
                endpoints = data;
                renderTable();
            })
            .catch(function(err) {
                console.error('Failed to load endpoints:', err);
            });
    }

    function renderTable() {
        var tbody = document.getElementById('endpoints-tbody');
        if (!endpoints.length) {
            tbody.innerHTML = '<tr><td colspan="6" class="empty-state">' +
                'No endpoints yet. Create one to get started.</td></tr>';
            return;
        }

        tbody.innerHTML = endpoints.map(function(ep) {
            var statusClass = ep.enabled ? 'active' : 'disabled';
            var statusText = ep.enabled ? 'Active' : 'Disabled';
            return '<tr>' +
                '<td><span class="badge badge-method">' + ep.method + '</span></td>' +
                '<td><code class="endpoint-path">' + escHtml(ep.path) + '</code></td>' +
                '<td><span class="badge badge-type">' + ep.handler_type + '</span></td>' +
                '<td class="hide-mobile">' + escHtml(ep.description || '-') + '</td>' +
                '<td><span class="badge-status ' + statusClass + '">' +
                    '<span class="dot"></span>' + statusText + '</span></td>' +
                '<td><div class="actions-cell">' +
                    '<button class="btn-icon" onclick="Dashboard.endpoints.edit(' + ep.id + ')" title="Edit">' +
                        '<span class="material-symbols-outlined">edit</span></button>' +
                    '<button class="btn-icon danger" onclick="Dashboard.endpoints.remove(' + ep.id + ')" title="Delete">' +
                        '<span class="material-symbols-outlined">delete</span></button>' +
                '</div></td>' +
                '</tr>';
        }).join('');
    }

    function openModal(ep) {
        editingId = ep ? ep.id : null;
        var modal = document.getElementById('modal-endpoint');
        var title = document.getElementById('modal-endpoint-title');
        title.textContent = ep ? 'Edit Endpoint' : 'Create Endpoint';

        var config = {};
        if (ep && ep.config) {
            config = typeof ep.config === 'string' ? JSON.parse(ep.config) : ep.config;
        }

        document.getElementById('ep-method').value = ep ? ep.method : 'GET';
        document.getElementById('ep-path').value = ep ? ep.path : '/';
        document.getElementById('ep-description').value = ep ? (ep.description || '') : '';
        document.getElementById('ep-enabled').checked = ep ? !!ep.enabled : true;

        /* Set handler type */
        var handlerType = ep ? ep.handler_type : 'static';
        setHandlerType(handlerType);

        /* Fill config fields */
        document.getElementById('ep-proxy-url').value = config.target_url || '';
        document.getElementById('ep-proxy-inject-auth').value = config.inject_auth || '';
        document.getElementById('ep-proxy-forward-auth').checked = !!config.forward_auth;
        document.getElementById('ep-static-status').value = config.status_code || 200;
        document.getElementById('ep-static-body').value =
            typeof config.body === 'object' ? JSON.stringify(config.body, null, 2) : (config.body || '');
        document.getElementById('ep-script-code').value = config.code || '';

        modal.classList.remove('hidden');
    }

    function closeModal() {
        document.getElementById('modal-endpoint').classList.add('hidden');
        editingId = null;
    }

    function setHandlerType(type) {
        var btns = document.querySelectorAll('.handler-type-btn');
        for (var i = 0; i < btns.length; i++) {
            btns[i].classList.toggle('active', btns[i].dataset.type === type);
        }
        document.getElementById('config-proxy').classList.toggle('hidden', type !== 'proxy');
        document.getElementById('config-static').classList.toggle('hidden', type !== 'static');
        document.getElementById('config-script').classList.toggle('hidden', type !== 'script');
        document.getElementById('ep-handler-type').value = type;
    }

    function saveEndpoint() {
        var method = document.getElementById('ep-method').value;
        var path = document.getElementById('ep-path').value;
        var description = document.getElementById('ep-description').value;
        var enabled = document.getElementById('ep-enabled').checked ? 1 : 0;
        var handlerType = document.getElementById('ep-handler-type').value;

        var config = {};
        if (handlerType === 'proxy') {
            config.target_url = document.getElementById('ep-proxy-url').value;
            var injectAuth = document.getElementById('ep-proxy-inject-auth').value;
            if (injectAuth) config.inject_auth = injectAuth;
            if (document.getElementById('ep-proxy-forward-auth').checked) {
                config.forward_auth = true;
            }
        } else if (handlerType === 'static') {
            config.status_code = parseInt(document.getElementById('ep-static-status').value, 10) || 200;
            var bodyStr = document.getElementById('ep-static-body').value;
            try { config.body = JSON.parse(bodyStr); } catch { config.body = bodyStr; }
        } else if (handlerType === 'script') {
            config.code = document.getElementById('ep-script-code').value;
        }

        var payload = {
            method: method,
            path: path,
            handler_type: handlerType,
            config: config,
            description: description,
            enabled: enabled,
        };

        var promise = editingId
            ? Dashboard.api.put('/api/admin/endpoints/' + editingId, payload)
            : Dashboard.api.post('/api/admin/endpoints', payload);

        promise
            .then(function() {
                closeModal();
                loadEndpoints();
            })
            .catch(function(err) {
                alert('Error: ' + err.message);
            });
    }

    function edit(id) {
        var ep = endpoints.find(function(e) { return e.id === id; });
        if (ep) openModal(ep);
    }

    function remove(id) {
        if (!confirm('Delete this endpoint?')) return;
        Dashboard.api.del('/api/admin/endpoints/' + id)
            .then(function() { loadEndpoints(); })
            .catch(function(err) { alert('Error: ' + err.message); });
    }

    function escHtml(str) {
        var div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    /* Expose to global for onclick handlers */
    return {
        mount: mount,
        unmount: unmount,
        edit: edit,
        remove: remove,
        setHandlerType: setHandlerType,
        saveEndpoint: saveEndpoint,
        closeModal: closeModal
    };
})();
