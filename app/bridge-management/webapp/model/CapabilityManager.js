/**
 * CapabilityManager.js
 *
 * UI singleton for multi-tenant capability-based feature gating.
 * Works alongside RoleManager.js:
 *   - RoleManager  → tab / field / action visibility for a given XSUAA role
 *   - CapabilityManager → whether a whole feature area is licensed for the tenant
 *
 * Usage:
 *   sap.ui.define([..., "nhvr/bridgemanagement/model/CapabilityManager"],
 *   function (..., CapabilityManager) {
 *       CapabilityManager.load().then(() => {
 *           if (!CapabilityManager.canView("INSPECTIONS")) { ... }
 *       });
 *   });
 */
sap.ui.define([], function () {
    "use strict";

    const BASE = "/bridge-management";

    // capabilityCode → { canView, canEdit, canAdmin, isEnabled, isCoreFeature, displayName, category }
    let _profile    = {};
    let _loaded     = false;
    let _failOpen   = false;   // true when profile endpoint is unavailable — allow all access
    let _isStale    = false;   // true when cached profile is older than 5 min on error
    let _profileLoadedAt = null; // timestamp of last successful profile load
    let _loadPromise = null;
    var PROFILE_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes

    const Manager = {

        /**
         * Load the capability profile from the backend.
         * Called once at app start (Component.js or Home.controller.js onInit).
         * Safe to call multiple times — returns cached promise after first call.
         * @returns {Promise}
         */
        load: function () {
            if (_loadPromise) return _loadPromise;

            _loadPromise = fetch(`${BASE}/getCapabilityProfile()`, {
                headers    : { Accept: "application/json" },
                credentials: "include"
            })
            .then(function (r) {
                if (!r.ok) {
                    // Endpoint not available — use cached profile if we have one, otherwise restrict all
                    console.error("[CapabilityManager] Profile fetch failed (HTTP " + r.status + "), using cached/restricted profile");
                    if (Object.keys(_profile).length > 0) {
                        // Keep existing cached profile; check staleness
                        if (_profileLoadedAt && (Date.now() - _profileLoadedAt > PROFILE_EXPIRY_MS)) {
                            _isStale = true;
                        }
                    } else {
                        // No cached profile — default to most restrictive (all denied)
                        _profile  = {};
                        _failOpen = false;
                    }
                    _loaded   = true;
                    _loadPromise = null; // allow retry on next navigation
                    return null;
                }
                return r.json();
            })
            .then(function (j) {
                if (!j) return _profile; // error path (handled in .catch or non-ok)
                _profile  = {};
                _failOpen = false;
                _isStale  = false;
                _profileLoadedAt = Date.now();
                (j.value || []).forEach(function (entry) {
                    _profile[entry.capabilityCode] = {
                        capabilityCode : entry.capabilityCode,
                        displayName    : entry.displayName,
                        category       : entry.category,
                        isCoreFeature  : !!entry.isCoreFeature,
                        isEnabled      : !!entry.isEnabled,
                        canView        : !!entry.canView,
                        canEdit        : !!entry.canEdit,
                        canAdmin       : !!entry.canAdmin
                    };
                });
                _loaded = true;
                return _profile;
            })
            .catch(function (err) {
                // Network error — use cached profile if available, otherwise restrict all access
                console.error("[CapabilityManager] Profile fetch failed, using cached/restricted profile:", err);
                if (Object.keys(_profile).length > 0) {
                    // Keep existing cached profile; check staleness
                    if (_profileLoadedAt && (Date.now() - _profileLoadedAt > PROFILE_EXPIRY_MS)) {
                        _isStale = true;
                    }
                } else {
                    // No cached profile — default to most restrictive (all denied)
                    _profile  = {};
                    _failOpen = false;
                }
                _loaded      = true;
                _loadPromise = null; // allow retry on next load() call
                return _profile;
            });

            return _loadPromise;
        },

        /** @returns {boolean} true if profile has been loaded */
        isLoaded: function () { return _loaded; },

        /** @returns {boolean} true when running in fail-open mode (profile unavailable) */
        isFailOpen: function () { return _failOpen; },

        /** @returns {boolean} true when cached profile is older than 5 minutes after a fetch error */
        isStale: function () { return _isStale; },

        /**
         * Is this capability licensed AND enabled for the current tenant?
         * @param {string} capabilityCode
         * @returns {boolean}
         */
        isEnabled: function (capabilityCode) {
            if (!_loaded) return false;
            if (_failOpen) return true;
            const e = _profile[capabilityCode];
            return !!(e && e.isEnabled);
        },

        /**
         * Can the current role VIEW this capability?
         * @param {string} capabilityCode
         * @returns {boolean}
         */
        canView: function (capabilityCode) {
            if (!_loaded) return false;
            if (_failOpen) return true;
            const e = _profile[capabilityCode];
            return !!(e && e.isEnabled && e.canView);
        },

        /**
         * Can the current role EDIT within this capability?
         * @param {string} capabilityCode
         * @returns {boolean}
         */
        canEdit: function (capabilityCode) {
            if (!_loaded) return false;
            if (_failOpen) return true;
            const e = _profile[capabilityCode];
            return !!(e && e.isEnabled && e.canEdit);
        },

        /**
         * Can the current role ADMIN this capability (configure settings)?
         * @param {string} capabilityCode
         * @returns {boolean}
         */
        canAdmin: function (capabilityCode) {
            if (!_loaded) return false;
            if (_failOpen) return true;
            const e = _profile[capabilityCode];
            return !!(e && e.isEnabled && e.canAdmin);
        },

        /**
         * Returns all capabilities grouped by category.
         * Useful for building capability summary panels.
         * @returns {object} { CORE: [...], INSPECTION: [...], ... }
         */
        getByCategory: function () {
            const grouped = {};
            Object.values(_profile).forEach(function (cap) {
                if (!grouped[cap.category]) grouped[cap.category] = [];
                grouped[cap.category].push(cap);
            });
            return grouped;
        },

        /**
         * Returns the full flat profile array (all capabilities).
         * @returns {Array}
         */
        getAll: function () {
            return Object.values(_profile);
        },

        /**
         * Apply capability gates to SAP UI5 controls in a view.
         * Each entry: { id: 'controlId', capability: 'FEATURE_CODE' }
         * Sets visible=false on controls whose capability is not canView.
         * @param {sap.ui.core.mvc.View} view
         * @param {Array} mappings
         */
        applyToControls: function (view, mappings) {
            if (!view || !mappings) return;
            var self = this;
            mappings.forEach(function (m) {
                var ctrl = view.byId(m.id);
                if (!ctrl || !ctrl.setVisible) return;
                ctrl.setVisible(self.canView(m.capability));
            });
        },

        /**
         * Filter a navigation-item array to only entries whose capability is viewable.
         * Items with no 'capability' property always pass through.
         * @param {Array} items  Each item may have a 'capability' property
         * @returns {Array}
         */
        filterNavItems: function (items) {
            var self = this;
            return (items || []).filter(function (item) {
                return !item.capability || self.canView(item.capability);
            });
        },

        /**
         * Guard a controller route — navigate home if capability not viewable.
         * Call at the top of onRouteMatched or onInit.
         * @param {string}   capabilityCode
         * @param {object}   router     sap.ui.core.routing.Router instance
         * @param {function} [onDenied] Optional callback instead of navTo("Home")
         * @returns {boolean} true if access granted
         */
        guardRoute: function (capabilityCode, router, onDenied) {
            if (this.canView(capabilityCode)) return true;
            var msg = "Your organisation's licence does not include the '"
                + ((_profile[capabilityCode] && _profile[capabilityCode].displayName) || capabilityCode)
                + "' module. Contact your NHVR platform administrator to request access.";
            if (typeof onDenied === "function") {
                onDenied(msg);
            } else {
                sap.m.MessageBox.error(msg, {
                    title: "Access Not Licensed",
                    onClose: function () {
                        if (router) router.navTo("Home");
                    }
                });
            }
            return false;
        },

        /** Reset cached profile (for testing / logout). */
        reset: function () {
            _profile     = {};
            _loaded      = false;
            _failOpen    = false;
            _isStale     = false;
            _profileLoadedAt = null;
            _loadPromise = null;
        }
    };

    return Manager;
});
