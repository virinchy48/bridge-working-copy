/**
 * ReferenceData.js
 *
 * Fetches and caches geographic reference data (states, regions) from the
 * OData service at runtime. Replaces hardcoded REGIONS / STATE_OPTIONS
 * constants that previously appeared in BridgeForm, Reports, and MassEdit.
 *
 * Usage:
 *   ReferenceData.load().then(function () {
 *       var regions = ReferenceData.getRegions("NSW");
 *       var items   = ReferenceData.getStateItems();
 *   });
 */
sap.ui.define([], function () {
    "use strict";

    const BASE = "/bridge-management";

    // Internal cache
    var _regionsMap  = {};   // { "NSW": ["Hunter", "Illawarra", ...], ... }
    var _states      = [];   // ["ACT", "NSW", "NT", "QLD", "SA", "TAS", "VIC", "WA"]
    var _loadPromise = null;

    var ReferenceData = {

        /**
         * Load state and region data from OData (Bridges entity).
         * Safe to call multiple times — returns the cached promise after the
         * first successful load.
         * @returns {Promise}
         */
        load: function () {
            if (_loadPromise) return _loadPromise;

            _loadPromise = fetch(
                BASE + "/Bridges?$select=state,region&$top=5000",
                {
                    headers    : { Accept: "application/json" },
                    credentials: "include"
                }
            )
            .then(function (response) {
                if (!response.ok) {
                    throw new Error("OData request failed: HTTP " + response.status);
                }
                return response.json();
            })
            .then(function (data) {
                var bridges    = data.value || [];
                var regionSets = {};
                var stateSet   = new Set();

                bridges.forEach(function (bridge) {
                    var state  = (bridge.state  || "").trim();
                    var region = (bridge.region || "").trim();
                    if (!state) return;
                    stateSet.add(state);
                    if (region) {
                        if (!regionSets[state]) regionSets[state] = new Set();
                        regionSets[state].add(region);
                    }
                });

                _states     = Array.from(stateSet).sort();
                _regionsMap = {};
                _states.forEach(function (state) {
                    _regionsMap[state] = regionSets[state]
                        ? Array.from(regionSets[state]).sort()
                        : [];
                });
            })
            .catch(function (err) {
                console.warn("[ReferenceData] Could not load from OData:", err.message);
                _loadPromise = null; // reset so a retry is possible on next navigation
            });

            return _loadPromise;
        },

        /**
         * Returns the sorted list of regions for a given state code.
         * @param {string} stateCode  e.g. "NSW"
         * @returns {string[]}
         */
        getRegions: function (stateCode) {
            return _regionsMap[stateCode] || [];
        },

        /**
         * Returns all loaded states as SAP UI5 Item-compatible objects.
         * Includes a blank "All States" entry at position 0.
         * @returns {{ key: string, text: string }[]}
         */
        getStateItems: function () {
            return [{ key: "", text: "— All States —" }].concat(
                _states.map(function (s) { return { key: s, text: s }; })
            );
        },

        /**
         * Returns state options in the [key, label] pair format used by
         * the MassEdit editable-grid column config.
         * @returns {string[][]}
         */
        getStateOptions: function () {
            return [["", "—"]].concat(
                _states.map(function (s) { return [s, s]; })
            );
        },

        /**
         * Returns true if reference data has been loaded successfully.
         * @returns {boolean}
         */
        isLoaded: function () {
            return _states.length > 0;
        }
    };

    return ReferenceData;
});
