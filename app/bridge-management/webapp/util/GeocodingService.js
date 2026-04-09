sap.ui.define([], function () {
    "use strict";

    var _debounceTimers = {};

    function _debounce(key, fn, delay) {
        if (_debounceTimers[key]) clearTimeout(_debounceTimers[key]);
        return new Promise(function (resolve) {
            _debounceTimers[key] = setTimeout(function () {
                resolve(fn());
            }, delay || 400);
        });
    }

    var GeocodingService = {
        /**
         * Geocode an address string.
         * @param {string} address
         * @param {string} provider - "nominatim" | "google" | "esri"
         * @param {object} [config] - { apiKey }
         * @returns {Promise<Array<{lat, lng, formatted, confidence}>>}
         */
        geocode: function (address, provider, config) {
            provider = provider || "nominatim";
            config = config || {};

            if (provider === "nominatim") {
                return fetch("https://nominatim.openstreetmap.org/search?format=json&countrycodes=au&limit=6&q=" + encodeURIComponent(address))
                    .then(function (r) { return r.json(); })
                    .then(function (results) {
                        return results.map(function (r) {
                            return { lat: parseFloat(r.lat), lng: parseFloat(r.lon), formatted: r.display_name, confidence: parseFloat(r.importance || 0) };
                        });
                    });
            }

            if (provider === "google" && window.google && google.maps) {
                return new Promise(function (resolve) {
                    var geocoder = new google.maps.Geocoder();
                    geocoder.geocode({ address: address, componentRestrictions: { country: "au" } }, function (results, status) {
                        if (status === "OK") {
                            resolve(results.map(function (r) {
                                return { lat: r.geometry.location.lat(), lng: r.geometry.location.lng(), formatted: r.formatted_address, confidence: 1 };
                            }));
                        } else { resolve([]); }
                    });
                });
            }

            if (provider === "esri") {
                var url = "https://geocode-api.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates?f=json&countryCode=AU&maxLocations=6&singleLine=" + encodeURIComponent(address);
                if (config.apiKey) url += "&token=" + encodeURIComponent(config.apiKey);
                return fetch(url).then(function (r) { return r.json(); }).then(function (j) {
                    return (j.candidates || []).map(function (c) {
                        return { lat: c.location.y, lng: c.location.x, formatted: c.address, confidence: (c.score || 0) / 100 };
                    });
                });
            }

            return Promise.resolve([]);
        },

        /**
         * Reverse geocode coordinates to address.
         */
        reverseGeocode: function (lat, lng, provider, config) {
            provider = provider || "nominatim";
            config = config || {};

            if (provider === "nominatim") {
                return fetch("https://nominatim.openstreetmap.org/reverse?format=json&lat=" + lat + "&lon=" + lng + "&zoom=18&addressdetails=1")
                    .then(function (r) { return r.json(); })
                    .then(function (r) { return { address: r.display_name, components: r.address || {} }; });
            }

            if (provider === "google" && window.google && google.maps) {
                return new Promise(function (resolve) {
                    var geocoder = new google.maps.Geocoder();
                    geocoder.geocode({ location: { lat: lat, lng: lng } }, function (results, status) {
                        if (status === "OK" && results[0]) {
                            resolve({ address: results[0].formatted_address, components: {} });
                        } else { resolve({ address: "", components: {} }); }
                    });
                });
            }

            if (provider === "esri") {
                var url = "https://geocode-api.arcgis.com/arcgis/rest/services/World/GeocodeServer/reverseGeocode?f=json&location=" + lng + "," + lat;
                if (config.apiKey) url += "&token=" + encodeURIComponent(config.apiKey);
                return fetch(url).then(function (r) { return r.json(); }).then(function (j) {
                    return { address: (j.address && j.address.Match_addr) || "", components: j.address || {} };
                });
            }

            return Promise.resolve({ address: "", components: {} });
        },

        /**
         * Address autocomplete suggestions (debounced).
         */
        suggest: function (partialAddress, provider, config) {
            return _debounce("suggest", function () {
                return GeocodingService.geocode(partialAddress, provider, config);
            }, 400);
        }
    };

    return GeocodingService;
});
