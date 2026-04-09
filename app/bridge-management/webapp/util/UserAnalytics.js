/**
 * NHVR User Analytics — lightweight client-side usage tracking.
 * Tracks page views, user actions, and session data.
 * Data stored in localStorage for admin review via Analytics dashboard.
 * Non-critical — all operations wrapped in try-catch.
 */
sap.ui.define([], function () {
    "use strict";

    var SESSION_KEY = "nhvr_session_id";
    var VIEWS_KEY = "nhvr_analytics_views";
    var ACTIONS_KEY = "nhvr_analytics_actions";
    var MAX_ENTRIES = 1000;

    function _getSessionId() {
        var id = window.sessionStorage.getItem(SESSION_KEY);
        if (!id) {
            id = "s-" + Date.now() + "-" + Math.random().toString(36).substr(2, 8);
            window.sessionStorage.setItem(SESSION_KEY, id);
        }
        return id;
    }

    function _getUserId() {
        try {
            // Try to get user from SAP UI5 shell
            var shell = sap.ushell && sap.ushell.Container && sap.ushell.Container.getUser();
            if (shell) return shell.getId() || "unknown";
        } catch (e) { /* */ }
        return "local-dev";
    }

    function _append(storageKey, entry) {
        try {
            var arr = JSON.parse(window.localStorage.getItem(storageKey) || "[]");
            arr.push(entry);
            if (arr.length > MAX_ENTRIES) arr = arr.slice(-MAX_ENTRIES);
            window.localStorage.setItem(storageKey, JSON.stringify(arr));
        } catch (e) { /* quota exceeded or private mode */ }
    }

    return {
        /**
         * Track a page/screen view.
         * Call in onInit or onRouteMatched of each controller.
         * @param {string} screen - Screen name (e.g., "Dashboard", "BridgeDetail", "Permits")
         * @param {object} [meta] - Optional metadata (e.g., { bridgeId: "BR-001" })
         */
        trackView: function (screen, meta) {
            _append(VIEWS_KEY, {
                screen: screen,
                user: _getUserId(),
                sessionId: _getSessionId(),
                timestamp: new Date().toISOString(),
                meta: meta || null
            });
        },

        /**
         * Track a user action.
         * Call on button clicks, form submissions, exports, etc.
         * @param {string} action - Action name (e.g., "export_excel", "close_bridge", "assess_route")
         * @param {string} screen - Screen where action occurred
         * @param {object} [detail] - Optional detail (e.g., { bridgeId: "BR-001", verdict: "APPROVED" })
         */
        trackAction: function (action, screen, detail) {
            _append(ACTIONS_KEY, {
                action: action,
                screen: screen,
                user: _getUserId(),
                sessionId: _getSessionId(),
                timestamp: new Date().toISOString(),
                detail: detail || null
            });
        },

        /**
         * Get all tracked page views (for analytics dashboard).
         * @returns {Array}
         */
        getViews: function () {
            try { return JSON.parse(window.localStorage.getItem(VIEWS_KEY) || "[]"); } catch (e) { return []; }
        },

        /**
         * Get all tracked actions (for analytics dashboard).
         * @returns {Array}
         */
        getActions: function () {
            try { return JSON.parse(window.localStorage.getItem(ACTIONS_KEY) || "[]"); } catch (e) { return []; }
        },

        /**
         * Get summary stats for analytics dashboard.
         * @returns {object} { totalViews, totalActions, uniqueScreens, topScreens[], recentActions[] }
         */
        getSummary: function () {
            var views = this.getViews();
            var actions = this.getActions();
            var screenCounts = {};
            views.forEach(function (v) {
                screenCounts[v.screen] = (screenCounts[v.screen] || 0) + 1;
            });
            var topScreens = Object.keys(screenCounts)
                .map(function (k) { return { screen: k, count: screenCounts[k] }; })
                .sort(function (a, b) { return b.count - a.count; })
                .slice(0, 10);

            return {
                totalViews: views.length,
                totalActions: actions.length,
                uniqueScreens: Object.keys(screenCounts).length,
                topScreens: topScreens,
                recentActions: actions.slice(-20).reverse()
            };
        },

        /**
         * Clear all analytics data.
         */
        clear: function () {
            try {
                window.localStorage.removeItem(VIEWS_KEY);
                window.localStorage.removeItem(ACTIONS_KEY);
            } catch (e) { /* */ }
        }
    };
});
