// ============================================================
// P12: International Standards Adapter
// Provides profile-aware field labels, units and rating scale
// references for AU / NZ / EU / US bridge engineering standards.
// This is a display/labelling adapter only — data is not converted.
// ============================================================
sap.ui.define([], function () {
    "use strict";

    var PROFILES = {
        AU: {
            label: "Australia (AS 5100)",
            massUnit: "t", lengthUnit: "m", speedUnit: "km/h",
            conditionScale: "1-10",
            ratingStandard: "AS 5100.7",
            fields: {
                maxMass:            "Max GVM (t)",
                conditionRating:    "Condition Rating (1-10)",
                bridgeId:           "Bridge ID",
                inspectionStandard: "AS 5100.7 / BIMM"
            }
        },
        NZ: {
            label: "New Zealand (NZTA)",
            massUnit: "t", lengthUnit: "m", speedUnit: "km/h",
            conditionScale: "0-100",
            ratingStandard: "NZTA Bridge Manual",
            fields: {
                maxMass:            "Gross Mass (t)",
                conditionRating:    "Condition Index (0-100)",
                bridgeId:           "Structure ID",
                inspectionStandard: "NZTA Bridge Inspection Manual"
            }
        },
        EU: {
            label: "European Union (Eurocode)",
            massUnit: "t", lengthUnit: "m", speedUnit: "km/h",
            conditionScale: "1-5",
            ratingStandard: "Eurocode 1 (EN 1991-2)",
            fields: {
                maxMass:            "Gross Vehicle Mass (t)",
                conditionRating:    "Element Condition Grade (1-5)",
                bridgeId:           "Structure Reference",
                inspectionStandard: "EN 1337 / ISO 13822"
            }
        },
        US: {
            label: "USA (AASHTO)",
            massUnit: "kips", lengthUnit: "ft", speedUnit: "mph",
            conditionScale: "0-9",
            ratingStandard: "AASHTO LRFR",
            fields: {
                maxMass:            "Operating Rating (kips)",
                conditionRating:    "NBI Condition Rating (0-9)",
                bridgeId:           "Structure Number",
                inspectionStandard: "NBIS / AASHTO Manual"
            }
        }
    };

    var STORAGE_KEY = "nhvr_standards_profile";
    var _active = (typeof localStorage !== "undefined" && localStorage.getItem(STORAGE_KEY)) || "AU";

    return {
        /**
         * Returns array of { key, text } for Select control binding.
         */
        getProfiles: function () {
            return Object.keys(PROFILES).map(function (k) {
                return { key: k, text: PROFILES[k].label };
            });
        },

        /** Returns the currently active profile key (e.g. "AU"). */
        getActive: function () {
            return _active;
        },

        /**
         * Sets the active profile key and persists to localStorage.
         * @param {string} key - One of AU, NZ, EU, US
         */
        setProfile: function (key) {
            if (PROFILES[key]) {
                _active = key;
                if (typeof localStorage !== "undefined") {
                    localStorage.setItem(STORAGE_KEY, key);
                }
            }
        },

        /**
         * Returns the full profile object for a given key (defaults to active profile).
         * @param {string} [key] - Optional key; uses active if omitted
         */
        getProfile: function (key) {
            return PROFILES[key || _active] || PROFILES.AU;
        },

        /**
         * Returns the translated field label for the active profile.
         * @param {string} fieldKey - e.g. "maxMass", "conditionRating"
         */
        getLabel: function (fieldKey) {
            return (PROFILES[_active] || PROFILES.AU).fields[fieldKey] || fieldKey;
        },

        /** Returns mass unit for active profile (e.g. "t", "kips"). */
        getMassUnit: function () {
            return (PROFILES[_active] || PROFILES.AU).massUnit;
        },

        /** Returns the rating standard name for active profile. */
        getRatingStandard: function () {
            return (PROFILES[_active] || PROFILES.AU).ratingStandard;
        },

        /** Returns condition scale description for active profile. */
        getConditionScale: function () {
            return (PROFILES[_active] || PROFILES.AU).conditionScale;
        },

        /** Returns speed unit for active profile. */
        getSpeedUnit: function () {
            return (PROFILES[_active] || PROFILES.AU).speedUnit;
        },

        // ── Unit Conversion Functions ─────────────────────────────────
        convertMass: function (value, fromUnit, toUnit) {
            if (value == null || isNaN(value)) return null;
            var v = parseFloat(value);
            // Normalize to tonnes
            var inTonnes;
            switch (fromUnit) {
                case "t": inTonnes = v; break;
                case "kg": inTonnes = v / 1000; break;
                case "kips": inTonnes = v * 0.453592; break;
                case "lb": inTonnes = v * 0.000453592; break;
                default: inTonnes = v;
            }
            // Convert from tonnes to target
            switch (toUnit) {
                case "t": return Math.round(inTonnes * 1000) / 1000;
                case "kg": return Math.round(inTonnes * 1000 * 100) / 100;
                case "kips": return Math.round(inTonnes / 0.453592 * 1000) / 1000;
                case "lb": return Math.round(inTonnes / 0.000453592 * 100) / 100;
                default: return inTonnes;
            }
        },

        convertLength: function (value, fromUnit, toUnit) {
            if (value == null || isNaN(value)) return null;
            var v = parseFloat(value);
            // Normalize to metres
            var inMetres;
            switch (fromUnit) {
                case "m": inMetres = v; break;
                case "km": inMetres = v * 1000; break;
                case "ft": inMetres = v * 0.3048; break;
                case "mi": inMetres = v * 1609.344; break;
                case "mm": inMetres = v / 1000; break;
                default: inMetres = v;
            }
            switch (toUnit) {
                case "m": return Math.round(inMetres * 1000) / 1000;
                case "km": return Math.round(inMetres / 1000 * 1000) / 1000;
                case "ft": return Math.round(inMetres / 0.3048 * 1000) / 1000;
                case "mi": return Math.round(inMetres / 1609.344 * 1000) / 1000;
                case "mm": return Math.round(inMetres * 1000 * 100) / 100;
                default: return inMetres;
            }
        },

        convertSpeed: function (value, fromUnit, toUnit) {
            if (value == null || isNaN(value)) return null;
            var v = parseFloat(value);
            // Normalize to km/h
            var inKmh;
            switch (fromUnit) {
                case "km/h": inKmh = v; break;
                case "mph": inKmh = v * 1.60934; break;
                case "m/s": inKmh = v * 3.6; break;
                default: inKmh = v;
            }
            switch (toUnit) {
                case "km/h": return Math.round(inKmh * 100) / 100;
                case "mph": return Math.round(inKmh / 1.60934 * 100) / 100;
                case "m/s": return Math.round(inKmh / 3.6 * 100) / 100;
                default: return inKmh;
            }
        },

        /**
         * Convert condition rating between scales.
         * AS5100: 1-10 (10=excellent), AASHTO: 0-9 (9=excellent), NZ: 0-100, EU: 1-5 (1=best)
         */
        convertRating: function (value, fromScale, toScale) {
            if (value == null || isNaN(value)) return null;
            var v = parseFloat(value);
            // Normalize to 0-1 fraction (1 = best)
            var fraction;
            switch (fromScale) {
                case "AS5100": fraction = (v - 1) / 9; break;        // 1-10 → 0-1
                case "AASHTO": fraction = v / 9; break;              // 0-9 → 0-1
                case "NZ": fraction = v / 100; break;                // 0-100 → 0-1
                case "EU": fraction = 1 - ((v - 1) / 4); break;     // 1-5 inverted → 0-1
                default: fraction = v;
            }
            fraction = Math.max(0, Math.min(1, fraction));
            switch (toScale) {
                case "AS5100": return Math.round(fraction * 9 + 1);           // 0-1 → 1-10
                case "AASHTO": return Math.round(fraction * 9);               // 0-1 → 0-9
                case "NZ": return Math.round(fraction * 100);                 // 0-1 → 0-100
                case "EU": return Math.round((1 - fraction) * 4 + 1);        // 0-1 → 5-1 inverted
                default: return fraction;
            }
        },

        /**
         * Get the unit system for a given standards profile.
         */
        getUnitsForProfile: function (profile) {
            var systems = {
                AU: { mass: "t", length: "m", speed: "km/h", rating: "AS5100" },
                NZ: { mass: "t", length: "m", speed: "km/h", rating: "NZ" },
                EU: { mass: "t", length: "m", speed: "km/h", rating: "EU" },
                US: { mass: "kips", length: "ft", speed: "mph", rating: "AASHTO" }
            };
            return systems[profile] || systems.AU;
        }
    };
});
