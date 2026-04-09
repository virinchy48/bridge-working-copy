sap.ui.define([
    "nhvr/bridgemanagement/util/providers/LeafletProvider",
    "nhvr/bridgemanagement/util/providers/MapLibreProvider",
    "nhvr/bridgemanagement/util/providers/GoogleMapsProvider",
    "nhvr/bridgemanagement/util/providers/EsriProvider"
], function (LeafletProvider, MapLibreProvider, GoogleMapsProvider, EsriProvider) {
    "use strict";

    var _providers = {
        "osm-leaflet": LeafletProvider,
        "osm-maplibre": MapLibreProvider,
        "google": GoogleMapsProvider,
        "esri": EsriProvider
    };

    return {
        /**
         * Create a map provider instance.
         * @param {string} providerKey - "osm-leaflet" | "osm-maplibre" | "google" | "esri"
         * @param {object} [config] - Optional config overrides
         * @returns {object} Provider instance implementing MapProviderInterface
         */
        create: function (providerKey, config) {
            var ProviderClass = _providers[providerKey];
            if (!ProviderClass) {
                console.warn("[MapProviderFactory] Unknown provider '" + providerKey + "', falling back to osm-leaflet");
                ProviderClass = LeafletProvider;
            }
            return new ProviderClass(config || {});
        },

        /**
         * Register a new provider (for plugin extensibility).
         */
        register: function (key, ProviderClass) {
            _providers[key] = ProviderClass;
        },

        /**
         * Get list of available provider keys.
         */
        getAvailable: function () {
            return Object.keys(_providers);
        }
    };
});
