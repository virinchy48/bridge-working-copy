// ============================================================
// NHVR NamedViews — Cross-module shared saved-filter store
// ------------------------------------------------------------
// Unified localStorage API so saved filter "views" (named presets)
// can coexist across modules (Bridges, Restrictions, Defects,
// Permits …) and be listed in one place.
//
// Storage schema (localStorage key: nhvr_named_views_v1):
//   {
//     "<module>": [
//       { id, name, module, filters, createdAt, updatedAt }
//     ]
//   }
//
// Modules in use (add as needed):
//   BRIDGES | RESTRICTIONS | DEFECTS | PERMITS
//
// This is additive — existing per-module localStorage keys such as
// nhvr_bridge_filter_presets remain untouched for backward
// compatibility. Controllers that want cross-module visibility can
// dual-write via `NamedViews.save(...)` alongside their own store.
// ============================================================
sap.ui.define([], function () {
    "use strict";

    var STORAGE_KEY = "nhvr_named_views_v1";
    var PENDING_KEY = "nhvr_named_view_pending";
    var PENDING_TTL_MS = 60 * 1000; // 60s — long enough to survive a route nav

    function _read() {
        try {
            var raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) { return {}; }
            var parsed = JSON.parse(raw);
            return (parsed && typeof parsed === "object") ? parsed : {};
        } catch (_) {
            return {};
        }
    }

    function _write(obj) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
            return true;
        } catch (_) {
            return false;
        }
    }

    function _uid() {
        return "nv_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
    }

    return {
        /** Known modules (not enforced — any string works). */
        MODULES: Object.freeze({
            BRIDGES      : "BRIDGES",
            RESTRICTIONS : "RESTRICTIONS",
            DEFECTS      : "DEFECTS",
            PERMITS      : "PERMITS"
        }),

        /**
         * List saved views for a specific module.
         * @param {string} module
         * @returns {Array}
         */
        list: function (module) {
            var all = _read();
            return (all[module] || []).slice();
        },

        /**
         * List all saved views across every module, flattened.
         * Useful for a global "My Views" picker.
         * @returns {Array}
         */
        listAll: function () {
            var all = _read();
            var out = [];
            Object.keys(all).forEach(function (m) {
                (all[m] || []).forEach(function (v) { out.push(v); });
            });
            out.sort(function (a, b) { return (b.updatedAt || 0) - (a.updatedAt || 0); });
            return out;
        },

        /**
         * Save (create or replace by name) a named view for a module.
         * @param {string} module
         * @param {string} name
         * @param {object} filters  Arbitrary filter payload specific to module
         * @returns {object} saved view record
         */
        save: function (module, name, filters) {
            if (!module || !name) { return null; }
            var all = _read();
            var list = all[module] || [];
            var now  = Date.now();
            var existing = list.filter(function (v) { return v.name === name; })[0];
            if (existing) {
                existing.filters  = filters || {};
                existing.updatedAt = now;
            } else {
                existing = {
                    id       : _uid(),
                    name     : name,
                    module   : module,
                    filters  : filters || {},
                    createdAt: now,
                    updatedAt: now
                };
                list.push(existing);
            }
            all[module] = list;
            _write(all);
            return existing;
        },

        /**
         * Remove a view by id from a module.
         * @param {string} module
         * @param {string} id
         * @returns {boolean}
         */
        remove: function (module, id) {
            var all = _read();
            var list = all[module] || [];
            var before = list.length;
            all[module] = list.filter(function (v) { return v.id !== id; });
            if (all[module].length !== before) {
                _write(all);
                return true;
            }
            return false;
        },

        /**
         * Get a single view by id across all modules.
         * @param {string} id
         * @returns {object|null}
         */
        getById: function (id) {
            var all = _read();
            var keys = Object.keys(all);
            for (var i = 0; i < keys.length; i++) {
                var hit = (all[keys[i]] || []).filter(function (v) { return v.id === id; })[0];
                if (hit) { return hit; }
            }
            return null;
        },

        /** Total count across all modules. */
        count: function () {
            var all = _read();
            return Object.keys(all).reduce(function (n, k) { return n + (all[k] || []).length; }, 0);
        },

        /**
         * Stash a view as the "pending" apply target ahead of a route nav.
         * The receiving controller calls consumePending() after the route
         * fires. sessionStorage (not localStorage) so it never leaks across
         * browser tabs, with a short TTL as a safety net.
         * @param {object} view  saved view record from list/listAll
         */
        setPending: function (view) {
            if (!view || !view.module) { return; }
            try {
                sessionStorage.setItem(PENDING_KEY, JSON.stringify({
                    view: view,
                    ts  : Date.now()
                }));
            } catch (_) { /* sessionStorage unavailable */ }
        },

        /**
         * Read and consume (delete) a pending view if it matches the given
         * module and is within TTL. Returns null if none pending.
         * @param {string} module
         * @returns {object|null} view record or null
         */
        consumePending: function (module) {
            try {
                var raw = sessionStorage.getItem(PENDING_KEY);
                if (!raw) { return null; }
                var parsed = JSON.parse(raw);
                // Always drain — stale or mismatched entries shouldn't linger
                sessionStorage.removeItem(PENDING_KEY);
                if (!parsed || !parsed.view || parsed.view.module !== module) { return null; }
                if ((Date.now() - (parsed.ts || 0)) > PENDING_TTL_MS) { return null; }
                return parsed.view;
            } catch (_) {
                return null;
            }
        },

        /** Clear everything (for tests). */
        _clearAll: function () {
            try { localStorage.removeItem(STORAGE_KEY); } catch (_) { /* ignore */ }
            try { sessionStorage.removeItem(PENDING_KEY); } catch (_) { /* ignore */ }
        }
    };
});
