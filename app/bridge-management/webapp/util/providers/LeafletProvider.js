sap.ui.define([], function () {
    "use strict";

    var LeafletProvider = function (config) {
        this._config = config || {};
        this._map = null;
        this._layers = {};
        this._clusterGroup = null;
        this._drawnItems = null;
        this._drawHandlers = {};
    };

    LeafletProvider.prototype = {
        name: "osm-leaflet",

        init: function (containerId, options) {
            options = options || {};
            var center = options.center || [-25, 134];
            var zoom = options.zoom || 4;

            this._map = L.map(containerId, {
                center: center,
                zoom: zoom,
                minZoom: options.minZoom || 3,
                maxZoom: options.maxZoom || 19
            });

            // Default basemap
            this._baseLayers = {
                streets: L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
                    attribution: "&copy; OpenStreetMap contributors", maxZoom: 19
                }),
                satellite: L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
                    attribution: "Tiles &copy; Esri", maxZoom: 18
                }),
                topo: L.tileLayer("https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", {
                    attribution: "OpenTopoMap", maxZoom: 17
                }),
                dark: L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png", {
                    attribution: "CARTO", maxZoom: 19
                })
            };
            this._currentBasemap = "streets";
            this._baseLayers.streets.addTo(this._map);

            // Cluster group
            if (typeof L.markerClusterGroup === "function") {
                this._clusterGroup = L.markerClusterGroup({
                    maxClusterRadius: options.clusterRadius || 50,
                    disableClusteringAtZoom: options.maxZoomBeforeCluster || 15
                });
                this._map.addLayer(this._clusterGroup);
            }

            // Draw support
            if (typeof L.Draw !== "undefined") {
                this._drawnItems = L.featureGroup().addTo(this._map);
            }

            return Promise.resolve();
        },

        destroy: function () {
            if (this._map) {
                this._map.remove();
                this._map = null;
            }
        },

        // ── Basemaps ──────────────────────────────────────────────
        setBasemap: function (type) {
            if (this._baseLayers[this._currentBasemap]) {
                this._map.removeLayer(this._baseLayers[this._currentBasemap]);
            }
            if (this._baseLayers[type]) {
                this._baseLayers[type].addTo(this._map);
                this._currentBasemap = type;
            }
        },

        getAvailableBasemaps: function () {
            return Object.keys(this._baseLayers);
        },

        // ── Layers ────────────────────────────────────────────────
        addMarkerLayer: function (id, geojsonFeatures, options) {
            options = options || {};
            var layer = L.geoJSON(geojsonFeatures, {
                pointToLayer: function (feature, latlng) {
                    var color = (options.colorFn && options.colorFn(feature)) || "#0070F2";
                    var icon = L.divIcon({
                        className: "nhvr-marker",
                        html: '<div style="background:' + color + ';width:12px;height:12px;border-radius:50%;border:2px solid #fff;"></div>',
                        iconSize: [16, 16]
                    });
                    return L.marker(latlng, { icon: icon });
                },
                onEachFeature: options.onEachFeature || null
            });

            if (this._clusterGroup && options.cluster !== false) {
                this._clusterGroup.addLayer(layer);
            } else {
                layer.addTo(this._map);
            }
            this._layers[id] = layer;
            return layer;
        },

        addPolylineLayer: function (id, coordinates, options) {
            options = options || {};
            var latlngs = coordinates.map(function (c) { return [c[1], c[0]]; });
            var layer = L.polyline(latlngs, {
                color: options.color || "#0070F2",
                weight: options.weight || 4,
                opacity: options.opacity || 0.8,
                dashArray: options.dashArray || null
            }).addTo(this._map);
            this._layers[id] = layer;
            return layer;
        },

        addPolygonLayer: function (id, coordinates, options) {
            options = options || {};
            var latlngs = coordinates.map(function (c) { return [c[1], c[0]]; });
            var layer = L.polygon(latlngs, {
                color: options.color || "#0070F2",
                fillOpacity: options.fillOpacity || 0.2
            }).addTo(this._map);
            this._layers[id] = layer;
            return layer;
        },

        removeLayer: function (id) {
            if (this._layers[id]) {
                this._map.removeLayer(this._layers[id]);
                if (this._clusterGroup) this._clusterGroup.removeLayer(this._layers[id]);
                delete this._layers[id];
            }
        },

        toggleLayer: function (id, visible) {
            if (this._layers[id]) {
                if (visible) this._map.addLayer(this._layers[id]);
                else this._map.removeLayer(this._layers[id]);
            }
        },

        // ── Interaction ───────────────────────────────────────────
        fitBounds: function (bounds) {
            if (bounds && bounds.isValid && bounds.isValid()) {
                this._map.fitBounds(bounds, { padding: [30, 30] });
            } else if (Array.isArray(bounds)) {
                this._map.fitBounds(bounds, { padding: [30, 30] });
            }
        },

        setCenter: function (lat, lng, zoom) {
            this._map.setView([lat, lng], zoom);
        },

        getCenter: function () {
            var c = this._map.getCenter();
            return { lat: c.lat, lng: c.lng, zoom: this._map.getZoom() };
        },

        onClick: function (callback) {
            this._map.on("click", function (e) { callback(e.latlng.lat, e.latlng.lng, e); });
        },

        onMoveEnd: function (callback) {
            this._map.on("moveend", callback);
        },

        // ── Drawing ───────────────────────────────────────────────
        enableDraw: function (type, callback) {
            if (!this._drawnItems || !L.Draw) return;
            var handler;
            if (type === "polygon") handler = new L.Draw.Polygon(this._map);
            else if (type === "rectangle") handler = new L.Draw.Rectangle(this._map);
            else if (type === "circle") handler = new L.Draw.Circle(this._map);
            if (handler) {
                handler.enable();
                this._drawHandlers[type] = handler;
                this._map.once(L.Draw.Event.CREATED, function (e) {
                    this._drawnItems.addLayer(e.layer);
                    callback(e.layer);
                }.bind(this));
            }
        },

        disableDraw: function () {
            Object.keys(this._drawHandlers).forEach(function (key) {
                if (this._drawHandlers[key].disable) this._drawHandlers[key].disable();
            }.bind(this));
        },

        clearDrawn: function () {
            if (this._drawnItems) this._drawnItems.clearLayers();
        },

        // ── Clustering ────────────────────────────────────────────
        enableClustering: function (layerId, options) {
            // Already handled via _clusterGroup in init
        },

        // ── Popup ─────────────────────────────────────────────────
        addPopup: function (marker, content) {
            if (marker && marker.bindPopup) marker.bindPopup(content);
        },

        // ── Reference layers ──────────────────────────────────────
        addWMSLayer: function (id, url, layers, options) {
            options = options || {};
            var layer = L.tileLayer.wms(url, {
                layers: layers,
                format: options.format || "image/png",
                transparent: true,
                opacity: options.opacity || 0.7,
                attribution: options.attribution || ""
            }).addTo(this._map);
            this._layers[id] = layer;
            return layer;
        },

        addEsriFeatureLayer: function (id, url, options) {
            // Basic implementation — fetch GeoJSON from ESRI REST endpoint
            var self = this;
            options = options || {};
            var queryUrl = url + "/query?where=1%3D1&outFields=*&f=geojson";
            return fetch(queryUrl).then(function (r) { return r.json(); }).then(function (geojson) {
                return self.addMarkerLayer(id, geojson, options);
            });
        },

        addXYZTileLayer: function (id, urlTemplate, options) {
            options = options || {};
            var layer = L.tileLayer(urlTemplate, {
                attribution: options.attribution || "",
                maxZoom: options.maxZoom || 19,
                opacity: options.opacity || 1
            }).addTo(this._map);
            this._layers[id] = layer;
            return layer;
        },

        // ── Spatial queries ───────────────────────────────────────
        pointInPolygon: function (lat, lng, polygonLayer) {
            if (polygonLayer && polygonLayer.getBounds) {
                return polygonLayer.getBounds().contains([lat, lng]);
            }
            return false;
        },

        // ── Raw map access (escape hatch) ─────────────────────────
        getMap: function () { return this._map; },
        getClusterGroup: function () { return this._clusterGroup; }
    };

    return LeafletProvider;
});
