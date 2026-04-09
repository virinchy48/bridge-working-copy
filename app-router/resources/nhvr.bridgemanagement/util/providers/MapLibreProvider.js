sap.ui.define([], function () {
    "use strict";

    var MapLibreProvider = function (config) {
        this._config = config || {};
        this._map = null;
        this._layers = {};
        this._sources = {};
    };

    MapLibreProvider.prototype = {
        name: "osm-maplibre",

        init: function (containerId, options) {
            options = options || {};
            var center = options.center || [134, -25]; // MapLibre uses [lng, lat]
            var zoom = options.zoom || 4;

            this._map = new maplibregl.Map({
                container: containerId,
                style: "https://tiles.openfreemap.org/styles/liberty",
                center: center,
                zoom: zoom,
                minZoom: options.minZoom || 3,
                maxZoom: options.maxZoom || 19
            });

            this._basemapStyles = {
                streets: "https://tiles.openfreemap.org/styles/liberty",
                satellite: "https://tiles.openfreemap.org/styles/liberty", // fallback
                topo: "https://tiles.openfreemap.org/styles/liberty",
                dark: "https://tiles.openfreemap.org/styles/liberty"
            };

            var self = this;
            return new Promise(function (resolve) {
                self._map.on("load", resolve);
            });
        },

        destroy: function () {
            if (this._map) { this._map.remove(); this._map = null; }
        },

        setBasemap: function (type) {
            if (this._basemapStyles[type]) {
                this._map.setStyle(this._basemapStyles[type]);
            }
        },

        getAvailableBasemaps: function () {
            return Object.keys(this._basemapStyles);
        },

        addMarkerLayer: function (id, geojsonFeatures, options) {
            this._map.addSource(id, { type: "geojson", data: geojsonFeatures });
            this._map.addLayer({
                id: id, type: "circle", source: id,
                paint: { "circle-radius": 6, "circle-color": (options && options.color) || "#0070F2", "circle-stroke-width": 2, "circle-stroke-color": "#fff" }
            });
            this._layers[id] = true;
        },

        addPolylineLayer: function (id, coordinates, options) {
            options = options || {};
            this._map.addSource(id, { type: "geojson", data: { type: "Feature", geometry: { type: "LineString", coordinates: coordinates } } });
            this._map.addLayer({
                id: id, type: "line", source: id,
                paint: { "line-color": options.color || "#0070F2", "line-width": options.weight || 4, "line-opacity": options.opacity || 0.8 }
            });
            this._layers[id] = true;
        },

        addPolygonLayer: function (id, coordinates, options) {
            options = options || {};
            this._map.addSource(id, { type: "geojson", data: { type: "Feature", geometry: { type: "Polygon", coordinates: [coordinates] } } });
            this._map.addLayer({
                id: id, type: "fill", source: id,
                paint: { "fill-color": options.color || "#0070F2", "fill-opacity": options.fillOpacity || 0.2 }
            });
            this._layers[id] = true;
        },

        removeLayer: function (id) {
            if (this._layers[id]) {
                if (this._map.getLayer(id)) this._map.removeLayer(id);
                if (this._map.getSource(id)) this._map.removeSource(id);
                delete this._layers[id];
            }
        },

        toggleLayer: function (id, visible) {
            if (this._map.getLayer(id)) {
                this._map.setLayoutProperty(id, "visibility", visible ? "visible" : "none");
            }
        },

        fitBounds: function (bounds) {
            if (Array.isArray(bounds) && bounds.length === 2) {
                this._map.fitBounds(bounds, { padding: 30 });
            }
        },

        setCenter: function (lat, lng, zoom) {
            this._map.flyTo({ center: [lng, lat], zoom: zoom });
        },

        getCenter: function () {
            var c = this._map.getCenter();
            return { lat: c.lat, lng: c.lng, zoom: this._map.getZoom() };
        },

        onClick: function (callback) {
            this._map.on("click", function (e) { callback(e.lngLat.lat, e.lngLat.lng, e); });
        },

        onMoveEnd: function (callback) {
            this._map.on("moveend", callback);
        },

        enableDraw: function () { /* MapLibre draw requires maplibre-gl-draw plugin */ },
        disableDraw: function () {},
        clearDrawn: function () {},
        enableClustering: function () {},
        addPopup: function (lngLat, content) {
            new maplibregl.Popup().setLngLat(lngLat).setHTML(content).addTo(this._map);
        },
        addWMSLayer: function () {},
        addEsriFeatureLayer: function () { return Promise.resolve(); },
        addXYZTileLayer: function (id, urlTemplate, options) {
            this._map.addSource(id, { type: "raster", tiles: [urlTemplate], tileSize: 256 });
            this._map.addLayer({ id: id, type: "raster", source: id });
            this._layers[id] = true;
        },
        pointInPolygon: function () { return false; },

        getMap: function () { return this._map; }
    };

    return MapLibreProvider;
});
