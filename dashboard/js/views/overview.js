/* Overview - dashboard stats cards */
var Dashboard = Dashboard || {};

Dashboard.overview = (function() {

    function mount() {
        Dashboard.api.get('/api/admin/overview')
            .then(function(data) {
                document.getElementById('stat-endpoints').textContent =
                    data.endpoints.active + ' / ' + data.endpoints.total;
                document.getElementById('stat-requests-total').textContent =
                    data.requests.total;
                document.getElementById('stat-requests-today').textContent =
                    data.requests.today;

                var tunnelEl = document.getElementById('stat-tunnel');
                var tunnelSub = document.getElementById('stat-tunnel-url');
                tunnelEl.textContent = data.tunnel.status;
                if (data.tunnel.url) {
                    tunnelSub.textContent = data.tunnel.url;
                } else {
                    tunnelSub.textContent = '';
                }
            })
            .catch(function() {
                /* silently ignore, stats will show defaults */
            });
    }

    return { mount: mount };
})();
