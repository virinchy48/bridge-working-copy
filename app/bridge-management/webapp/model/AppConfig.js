/**
 * AppConfig.js — NHVR Application Mode Configuration
 *
 * Fetches the server-side app mode (full | lite) on startup.
 * In LITE mode the following feature keys are hidden across all views:
 *   defects, inspections, inspectionOrders, workOrders, permits, routeAssessment
 *
 * Usage:
 *   AppConfig.init().then(() => { if (AppConfig.isLite()) { ... } });
 *   AppConfig.isFeatureHidden("defects")  → true when NHVR_APP_MODE=lite
 */
sap.ui.define([], function () {
    'use strict';

    const LITE_FEATURES = ['defects','inspections','permits','routeAssessment'];

    // Nav routes to intercept in lite mode
    const LITE_HIDDEN_ROUTES = ['DefectRegister','InspectionDashboard','InspectionCreate',
                                 'InspectionCreateNew','Permits','RouteAssessment'];

    let _mode     = 'full';
    let _hidden   = [];
    let _version  = '3.2.1';
    let _resolved = false;
    let _promise  = null;

    const AppConfig = {

        /**
         * Fetch config from backend once. Subsequent calls return cached promise.
         * Falls back to 'full' mode on any error (fail-open for config, fail-closed for auth).
         */
        init: function () {
            if (_promise) return _promise;

            _promise = fetch('/bridge-management/getAppConfig', {
                headers: { 'Accept': 'application/json', 'x-csrf-token': 'fetch' }
            })
            .then(r => r.ok ? r.json() : Promise.reject(r.status))
            .then(data => {
                _mode    = (data.mode || 'full').toLowerCase();
                _hidden  = _mode === 'lite' ? LITE_FEATURES : (JSON.parse(data.liteFeatures || '[]'));
                _version = data.version || '3.2.1';
                _resolved = true;
            })
            .catch(err => {
                // Fail gracefully — default to full mode if config endpoint unreachable
                console.warn('[AppConfig] Could not fetch app config, defaulting to full mode:', err);
                _mode     = 'full';
                _hidden   = [];
                _resolved = true;
            });

            return _promise;
        },

        /** Returns true if running in lite mode */
        isLite: function () { return _mode === 'lite'; },

        /** Returns the current mode string: 'full' | 'lite' */
        getMode: function () { return _mode; },

        /** Returns app version string */
        getVersion: function () { return _version; },

        /**
         * Returns true if a given featureKey should be hidden in current mode.
         * @param {string} featureKey - e.g. 'defects', 'inspections', 'permits'
         */
        isFeatureHidden: function (featureKey) {
            return _hidden.includes(featureKey);
        },

        /**
         * Returns true if a route name should be blocked in current mode.
         * Used by the router to redirect away from lite-hidden routes.
         * @param {string} routeName - manifest route name
         */
        isRouteHidden: function (routeName) {
            if (_mode !== 'lite') return false;
            return LITE_HIDDEN_ROUTES.includes(routeName);
        },

        /**
         * Apply lite-mode visibility to a set of sap.m controls by feature key mapping.
         * @param {Object} controlMap  - { featureKey: sap.ui.core.Control | Control[] }
         */
        applyToControls: function (controlMap) {
            if (!controlMap) return;
            Object.keys(controlMap).forEach(key => {
                const hidden  = this.isFeatureHidden(key);
                const targets = Array.isArray(controlMap[key]) ? controlMap[key] : [controlMap[key]];
                targets.forEach(ctrl => { if (ctrl && ctrl.setVisible) ctrl.setVisible(!hidden); });
            });
        },

        /**
         * Returns subtitle string for ShellBar showing mode.
         * e.g.  "v3.2.1 · DEV | LITE MODE"
         */
        getModeLabel: function () {
            return _mode === 'lite' ? ' · LITE MODE' : '';
        }
    };

    return AppConfig;
});
