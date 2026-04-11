// ============================================================
// NHVR Lookup Service — OData-driven codelist cache
// Fetches all active Lookup entries from /bridge-management/Lookups once
// per session, indexed by category. Replaces all hardcoded <core:Item>
// lists and static option arrays across controllers and views.
// ============================================================
sap.ui.define([], function () {
    "use strict";

    const BASE = "/bridge-management";
    var _cache       = {};     // { CATEGORY: [{key, text}] }
    var _loadPromise = null;
    var _isLoaded    = false;

    var _IS_LOC = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
    var _AUTH_H = _IS_LOC ? { "Authorization": "Basic " + btoa("admin:admin") } : {};

    var LookupService = {

        /**
         * Fetch all active Lookups from OData and index by category.
         * Idempotent — subsequent calls return the cached promise.
         */
        load: function () {
            if (_loadPromise) return _loadPromise;

            var opts = { headers: Object.assign({ Accept: "application/json" }, _AUTH_H) };
            if (!_IS_LOC) opts.credentials = "include";

            _loadPromise = fetch(
                BASE + "/Lookups?$filter=isActive%20eq%20true&$orderby=category,displayOrder&$top=1000",
                opts
            )
            .then(function (r) { return r.json(); })
            .then(function (data) {
                _cache = {};
                (data.value || []).forEach(function (item) {
                    if (!_cache[item.category]) _cache[item.category] = [];
                    _cache[item.category].push({
                        key  : item.code,
                        text : item.description || item.code
                    });
                });
                _isLoaded = true;
            })
            .catch(function (err) {
                console.warn("[LookupService] Failed to load lookups:", err && err.message);
                _loadPromise = null;   // allow retry on next call
            });

            return _loadPromise;
        },

        /** Returns [{key, text}] array for a category, or [] if unavailable. */
        getItems: function (category) {
            return _cache[category] || [];
        },

        /** True after a successful load(). */
        isLoaded: function () {
            return _isLoaded;
        },

        /**
         * Populates a sap.m.Select or ComboBox from a lookup category.
         * Prepends an "All …" leading item when allText is provided.
         *
         * @param {sap.m.Select} oSelect   - target control
         * @param {string}       category  - Lookup.category (e.g. "CONDITION")
         * @param {string}       allText   - label for leading "All" item (e.g. "All States");
         *                                   omit or pass false to skip it
         */
        populateSelect: function (oSelect, category, allText) {
            if (!oSelect) return;
            oSelect.removeAllItems();
            // Use an EMPTY string key for the leading "All …" item.
            // Controllers' filter builders use `if (val) parts.push(...)` —
            // a non-empty key like "ALL" would be truthy and produce
            // `status eq 'ALL'` queries that match zero rows.
            if (allText) {
                oSelect.addItem(new sap.ui.core.Item({ key: "", text: allText }));
            }
            LookupService.getItems(category).forEach(function (e) {
                oSelect.addItem(new sap.ui.core.Item({ key: e.key, text: e.text }));
            });
        },

        /**
         * Populates a required form Select: blank leading "— Select —" then enum items.
         *
         * @param {sap.m.Select} oSelect    - target control
         * @param {string}       category   - Lookup.category
         * @param {string}       blankText  - override for the blank option label
         */
        populateFormSelect: function (oSelect, category, blankText) {
            if (!oSelect) return;
            oSelect.removeAllItems();
            oSelect.addItem(new sap.ui.core.Item({ key: "", text: blankText || "— Select —" }));
            LookupService.getItems(category).forEach(function (e) {
                oSelect.addItem(new sap.ui.core.Item({ key: e.key, text: e.text }));
            });
        },

        /**
         * Returns options in MassEdit's [[key, text], ...] format with a blank leading entry.
         * Used to patch ENTITY_CONFIG.*.fields.*.options after load().
         */
        getMassEditOptions: function (category) {
            var opts = [["", "—"]];
            LookupService.getItems(category).forEach(function (e) {
                opts.push([e.key, e.text]);
            });
            return opts;
        }
    };

    return LookupService;
});
