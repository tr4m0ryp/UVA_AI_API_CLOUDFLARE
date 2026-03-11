/* Logs - request log viewer + filters */
var Dashboard = Dashboard || {};

Dashboard.logs = (function() {
    var currentOffset = 0;
    var pageSize = 50;
    var totalLogs = 0;
    var refreshTimer = null;

    function mount() {
        currentOffset = 0;
        loadLogs();
        document.getElementById('log-filter-method').onchange = function() {
            currentOffset = 0;
            loadLogs();
        };
        document.getElementById('btn-logs-refresh').onclick = function() {
            currentOffset = 0;
            loadLogs();
        };
        /* Auto-refresh every 10s */
        refreshTimer = setInterval(loadLogs, 10000);
    }

    function unmount() {
        if (refreshTimer) {
            clearInterval(refreshTimer);
            refreshTimer = null;
        }
    }

    function loadLogs() {
        var method = document.getElementById('log-filter-method').value;
        var query = '?limit=' + pageSize + '&offset=' + currentOffset;
        if (method) query += '&method=' + method;

        Dashboard.api.get('/api/admin/logs' + query)
            .then(function(data) {
                totalLogs = data.total;
                renderLogs(data.logs);
                renderPagination();
            })
            .catch(function() {});
    }

    function renderLogs(logs) {
        var tbody = document.getElementById('logs-tbody');
        if (!logs.length) {
            tbody.innerHTML = '<tr><td colspan="6" class="empty-state">' +
                'No requests logged yet.</td></tr>';
            return;
        }

        tbody.innerHTML = logs.map(function(log) {
            var statusClass = getStatusClass(log.status_code);
            return '<tr>' +
                '<td><span class="badge badge-method">' + log.method + '</span></td>' +
                '<td><code class="endpoint-path">' + escHtml(log.path) + '</code></td>' +
                '<td><span class="' + statusClass + '">' + log.status_code + '</span></td>' +
                '<td class="hide-mobile"><span class="duration">' + log.duration_ms + 'ms</span></td>' +
                '<td class="hide-mobile">' + (log.client_ip || '-') + '</td>' +
                '<td><span class="log-timestamp">' + formatTime(log.timestamp) + '</span></td>' +
                '</tr>';
        }).join('');
    }

    function renderPagination() {
        var info = document.getElementById('logs-page-info');
        var start = totalLogs > 0 ? currentOffset + 1 : 0;
        var end = Math.min(currentOffset + pageSize, totalLogs);
        info.textContent = start + '-' + end + ' of ' + totalLogs;

        document.getElementById('btn-logs-prev').disabled = currentOffset === 0;
        document.getElementById('btn-logs-next').disabled = currentOffset + pageSize >= totalLogs;
    }

    function prevPage() {
        currentOffset = Math.max(0, currentOffset - pageSize);
        loadLogs();
    }

    function nextPage() {
        if (currentOffset + pageSize < totalLogs) {
            currentOffset += pageSize;
            loadLogs();
        }
    }

    function getStatusClass(code) {
        if (code < 300) return 'status-2xx';
        if (code < 400) return 'status-3xx';
        if (code < 500) return 'status-4xx';
        return 'status-5xx';
    }

    function formatTime(ts) {
        if (!ts) return '-';
        var d = new Date(ts + 'Z');
        return d.toLocaleString();
    }

    function escHtml(str) {
        var div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    return {
        mount: mount,
        unmount: unmount,
        prevPage: prevPage,
        nextPage: nextPage
    };
})();
