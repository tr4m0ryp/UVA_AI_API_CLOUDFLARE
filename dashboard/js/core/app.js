/* Dashboard application init */
var Dashboard = Dashboard || {};

Dashboard.app = (function() {

    function init() {
        Dashboard.router.init();
        Dashboard.sidebar.init();
        Dashboard.auth.init();

        /* Mobile sidebar toggle */
        var mobileBtn = document.getElementById('mobile-sidebar-toggle');
        if (mobileBtn) {
            mobileBtn.addEventListener('click', Dashboard.sidebar.toggle);
        }

        /* Register views */
        Dashboard.router.register('overview', {
            mount: Dashboard.overview.mount
        });
        Dashboard.router.register('endpoints', {
            mount: Dashboard.endpoints.mount,
            unmount: Dashboard.endpoints.unmount
        });
        Dashboard.router.register('logs', {
            mount: Dashboard.logs.mount,
            unmount: Dashboard.logs.unmount
        });
        Dashboard.router.register('connectivity', {
            mount: Dashboard.connectivity.mount,
            unmount: Dashboard.connectivity.unmount
        });
        Dashboard.router.register('settings', {
            mount: Dashboard.settings.mount
        });

        /* Check for existing session */
        var token = Dashboard.api.getToken();
        if (token) {
            Dashboard.api.get('/api/admin/auth/me')
                .then(function(user) {
                    showDashboard(user.email, user.name);
                })
                .catch(function() {
                    showLogin();
                });
        } else {
            showLogin();
        }
    }

    function showLogin() {
        document.getElementById('app-shell').classList.add('hidden');
        document.getElementById('page-login').classList.remove('hidden');
        Dashboard.router.reset();
    }

    function showDashboard(email, name) {
        Dashboard.sidebar.setUser(name || email);
        document.getElementById('page-login').classList.add('hidden');
        document.getElementById('app-shell').classList.remove('hidden');
        Dashboard.router.start();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    return {
        showLogin: showLogin,
        showDashboard: showDashboard
    };
})();
