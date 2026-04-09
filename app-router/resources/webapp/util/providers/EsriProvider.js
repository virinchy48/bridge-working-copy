sap.ui.define([], function () {
    "use strict";

    var _esriLoaded = false;
    var _esriLoadPromise = null;

    function _loadEsriApi(apiKey) {
        if (_esriLoaded) return Promise.resolve();
        if (_esriLoadPromise) return _esriLoadPromise;
        _esriLoadPromise = new Promise(function (resolve, reject) {
            var link = document.createElement("link");
            link.rel = "stylesheet";
            link.href = "https://js.arcgis.com/4.28/esri/themes/light/main.css";
            document.head.appendChild(link);

            var script = document.createElement("script");
            script.src = "https://js.arcgis.com/4.28/";
            script.async = true;
            script.onload = function () { _esriLoaded = true; resolve(); };
            script.onerror = function () { _esriLoadPromise = null; reject(new Error("Failed to load ArcGIS JS SDK")); };
            document.head.appendChild(script);
        });
        return _esriLoadPromise;
    }

    var EsriProvider = function (config) {
        this._config = config || {};
        this._map = null;
        this._view = null;
        this._layers = {};
    };

    EsriProvider.prototype = {
        name: "esri",

        init: function (containerId, options) {
            var self = this;
            options = options || {};
            var apiKey = this._config.apiKey || options.apiKey || "";

            return _loadEsriApi(apiKey).then(function () {
                return new Promise(function (resolve) {
                    require(["esri/Map", "esri/views/MapView", "esri/config"], function (Map, MapView, esriConfig) {
                        if (apiKey) esriConfig.apiKey = apiKey;

                        var center = options.center || [-25, 134];
                        self._map = new Map({ basemap: "streets-vector" });
                        self._view = new MapView({
                            container: containerId,
                            map: self._map,
                            center: [center[1], center[0]], // Esri uses [lng, lat]
                            zoom: options.zoom || 4,
                            constraints: {
                                minZoom: options.minZoom || 3,
                                maxZoom: options.maxZoom || 19
                            }
                        });
                        self._view.when(resolve);
                    });
                });
            });
        },

        destroy: function () {
            if (this._view) { this._view.destroy(); this._view = null; }
            if (this._map) { this._map = null; }
        },

        setBasemap: function (type) {
            var basemapMap = { streets: "streets-vector", satellite: "satellite", topo: "topo-vector", dark: "dark-gray-vector" };
            if (this._map) this._map.basemap = basemapMap[type] || "streets-vector";
        },

        getAvailableBasemaps: function () {
            return ["streets", "satellite", "topo", "dark"];
        },

        addMarkerLayer: function (id, geojsonFeatures, options) {
            var self = this;
            options = options || {};
            return new Promise(function (resolve) {
                require(["esri/layers/GeoJSONLayer"], function (GeoJSONLayer) {
                    var blob = new Blob([JSON.stringify(geojsonFeatures)], { type: "application/json" });
                    var url = URL.createObjectURL(blob);
                    var layer = new GeoJSONLayer({
                        url: url,
                        renderer: {
                            type: "simple",
                            symbol: {
                                type: "simple-marker",
                                color: (options && options.color) || "#0070F2",
                                size: 8,
                                outline: { color: "white", width: 1.5 }
                            }
                        }
                    });
                    self._map.add(layer);
                    self._layers[id] = layer;
                    resolve(layer);
                });
            });
        },

        addPolylineLayer: function (id, coordinates, options) {
            var self = this;
            options = options || {};
            return new Promise(function (resolve) {
                require(["esri/Graphic", "esri/layers/GraphicsLayer"], function (Graphic, GraphicsLayer) {
                    var layer = new GraphicsLayer();
                    var graphic = new Graphic({
                        geometry: {
                            type: "polyline",
                            paths: [coordinates]
                        },
                        symbol: {
                            type: "simple-line",
                            color: options.color || "#0070F2",
                            width: options.weight || 4
                        }
                    });
                    layer.add(graphic);
                    self._map.add(layer);
                    self._layers[id] = layer;
                    resolve(layer);
                });
            });
        },

        addPolygonLayer: function (id, coordinates, options) {
            var self = this;
            options = options || {};
            return new Promise(function (resolve) {
                require(["esri/Graphic", "esri/layers/GraphicsLayer"], function (Graphic, GraphicsLayer) {
                    var layer = new GraphicsLayer();
                    var graphic = new Graphic({
                        geometry: { type: "polygon", rings: [coordinates] },
                        symbol: {
                            type: "simple-fill",
                            color: [0, 112, 242, (options.fillOpacity || 0.2) * 255],
                            outline: { color: options.color || "#0070F2", width: 2 }
                        }
                    });
                    layer.add(graphic);
                    self._map.add(layer);
                    self._layers[id] = layer;
                    resolve(layer);
                });
            });
        },

        removeLayer: function (id) {
            if (this._layers[id]) {
                this._map.remove(this._layers[id]);
                delete this._layers[id];
            }
        },

        toggleLayer: function (id, visible) {
            if (this._layers[id]) this._layers[id].visible = visible;
        },

        fitBounds: function (bounds) {
            if (this._view && Array.isArray(bounds) && bounds.length === 2) {
                require(["esri/geometry/Extent"], function (Extent) {
                    this._view.goTo(new Extent({
                        xmin: bounds[0][1], ymin: bounds[0][0],
                        xmax: bounds[1][1], ymax: bounds[1][0],
                        spatialReference: { wkid: 4326 }
                    }));
                }.bind(this));
            }
        },

        setCenter: function (lat, lng, zoom) {
            if (this._view) this._view.goTo({ center: [lng, lat], zoom: zoom });
        },

        getCenter: function () {
            if (!this._view) return { lat: 0, lng: 0, zoom: 4 };
            var c = this._view.center;
            return { lat: c.latitude, lng: c.longitude, zoom: this._view.zoom };
        },

        onClick: function (callback) {
            if (this._view) this._view.on("click", function (e) { callback(e.mapPoint.latitude, e.mapPoint.longitude, e); });
        },

        onMoveEnd: function (callback) {
            if (this._view) this._view.watch("stationary", function (val) { if (val) callback(); });
        },

        enableDraw: function () { /* Esri Sketch widget — future phase */ },
        disableDraw: function () {},
        clearDrawn: function () {},
        enableClustering: function () {},
        addPopup: function () {},
        addWMSLayer: function () {},

        addEsriFeatureLayer: function (id, url, options) {
            var self = this;
            return new Promise(function (resolve) {
                require(["esri/layers/FeatureLayer"], function (FeatureLayer) {
                    var layer = new FeatureLayer({ url: url });
                    self._map.add(layer);
                    self._layers[id] = layer;
                    resolve(layer);
                });
            });
        },

        addXYZTileLayer: function (id, urlTemplate, options) {
            var self = this;
            require(["esri/layers/WebTileLayer"], function (WebTileLayer) {
                var layer = new WebTileLayer({ urlTemplate: urlTemplate });
                self._map.add(layer);
                self._layers[id] = layer;
            });
        },

        pointInPolygon: function () { return false; },

        getMap: function () { return this._map; },
        getView: function () { return this._view; }
    };

    return EsriProvider;
});
