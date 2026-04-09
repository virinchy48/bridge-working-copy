sap.ui.define([], function () {
    "use strict";

    var _apiLoaded = false;
    var _apiLoadPromise = null;

    function _loadGoogleMapsApi(apiKey) {
        if (_apiLoaded) return Promise.resolve();
        if (_apiLoadPromise) return _apiLoadPromise;
        _apiLoadPromise = new Promise(function (resolve, reject) {
            var script = document.createElement("script");
            script.src = "https://maps.googleapis.com/maps/api/js?key=" + encodeURIComponent(apiKey) + "&libraries=drawing,marker&v=weekly";
            script.async = true;
            script.defer = true;
            script.onload = function () { _apiLoaded = true; resolve(); };
            script.onerror = function () { _apiLoadPromise = null; reject(new Error("Failed to load Google Maps API")); };
            document.head.appendChild(script);
        });
        return _apiLoadPromise;
    }

    var GoogleMapsProvider = function (config) {
        this._config = config || {};
        this._map = null;
        this._layers = {};
        this._markers = {};
        this._drawingManager = null;
    };

    GoogleMapsProvider.prototype = {
        name: "google",

        init: function (containerId, options) {
            var self = this;
            options = options || {};
            var apiKey = this._config.apiKey || options.apiKey || "";
            if (!apiKey) return Promise.reject(new Error("Google Maps API key required"));

            return _loadGoogleMapsApi(apiKey).then(function () {
                var center = options.center || [-25, 134];
                self._map = new google.maps.Map(document.getElementById(containerId), {
                    center: { lat: center[0], lng: center[1] },
                    zoom: options.zoom || 4,
                    minZoom: options.minZoom || 3,
                    maxZoom: options.maxZoom || 19,
                    mapTypeId: "roadmap",
                    mapTypeControl: false,
                    streetViewControl: options.streetViewEnabled || false
                });
            });
        },

        destroy: function () {
            if (this._map) {
                // Google Maps doesn't have a destroy method; remove DOM content
                Object.keys(this._layers).forEach(function (id) { this.removeLayer(id); }.bind(this));
                this._map = null;
            }
        },

        setBasemap: function (type) {
            var typeMap = { streets: "roadmap", satellite: "satellite", topo: "terrain", dark: "roadmap" };
            if (this._map) this._map.setMapTypeId(typeMap[type] || "roadmap");
        },

        getAvailableBasemaps: function () {
            return ["streets", "satellite", "topo"];
        },

        addMarkerLayer: function (id, geojsonFeatures, options) {
            options = options || {};
            var self = this;
            var markers = [];
            var features = geojsonFeatures.features || [geojsonFeatures];
            features.forEach(function (feature) {
                if (!feature.geometry || feature.geometry.type !== "Point") return;
                var coords = feature.geometry.coordinates;
                var color = (options.colorFn && options.colorFn(feature)) || "#0070F2";
                var marker = new google.maps.Marker({
                    position: { lat: coords[1], lng: coords[0] },
                    map: self._map,
                    icon: {
                        path: google.maps.SymbolPath.CIRCLE,
                        fillColor: color,
                        fillOpacity: 0.9,
                        strokeColor: "#fff",
                        strokeWeight: 2,
                        scale: 8
                    }
                });
                if (options.onEachFeature) {
                    marker._feature = feature;
                    marker.addListener("click", function () {
                        options.onEachFeature(feature, marker);
                    });
                }
                markers.push(marker);
            });
            this._layers[id] = { type: "markers", items: markers };
            return markers;
        },

        addPolylineLayer: function (id, coordinates, options) {
            options = options || {};
            var path = coordinates.map(function (c) { return { lat: c[1], lng: c[0] }; });
            var polyline = new google.maps.Polyline({
                path: path,
                strokeColor: options.color || "#0070F2",
                strokeWeight: options.weight || 4,
                strokeOpacity: options.opacity || 0.8,
                map: this._map
            });
            this._layers[id] = { type: "polyline", item: polyline };
            return polyline;
        },

        addPolygonLayer: function (id, coordinates, options) {
            options = options || {};
            var path = coordinates.map(function (c) { return { lat: c[1], lng: c[0] }; });
            var polygon = new google.maps.Polygon({
                paths: path,
                strokeColor: options.color || "#0070F2",
                fillColor: options.color || "#0070F2",
                fillOpacity: options.fillOpacity || 0.2,
                map: this._map
            });
            this._layers[id] = { type: "polygon", item: polygon };
            return polygon;
        },

        removeLayer: function (id) {
            var layer = this._layers[id];
            if (!layer) return;
            if (layer.type === "markers") {
                layer.items.forEach(function (m) { m.setMap(null); });
            } else if (layer.item && layer.item.setMap) {
                layer.item.setMap(null);
            }
            delete this._layers[id];
        },

        toggleLayer: function (id, visible) {
            var layer = this._layers[id];
            if (!layer) return;
            if (layer.type === "markers") {
                layer.items.forEach(function (m) { m.setVisible(visible); });
            } else if (layer.item && layer.item.setVisible) {
                layer.item.setVisible(visible);
            }
        },

        fitBounds: function (bounds) {
            if (Array.isArray(bounds) && bounds.length === 2) {
                var gBounds = new google.maps.LatLngBounds(
                    { lat: bounds[0][0], lng: bounds[0][1] },
                    { lat: bounds[1][0], lng: bounds[1][1] }
                );
                this._map.fitBounds(gBounds);
            }
        },

        setCenter: function (lat, lng, zoom) {
            this._map.setCenter({ lat: lat, lng: lng });
            if (zoom) this._map.setZoom(zoom);
        },

        getCenter: function () {
            var c = this._map.getCenter();
            return { lat: c.lat(), lng: c.lng(), zoom: this._map.getZoom() };
        },

        onClick: function (callback) {
            this._map.addListener("click", function (e) {
                callback(e.latLng.lat(), e.latLng.lng(), e);
            });
        },

        onMoveEnd: function (callback) {
            this._map.addListener("idle", callback);
        },

        enableDraw: function (type, callback) {
            if (!google.maps.drawing) return;
            var modeMap = { polygon: google.maps.drawing.OverlayType.POLYGON, rectangle: google.maps.drawing.OverlayType.RECTANGLE, circle: google.maps.drawing.OverlayType.CIRCLE };
            this._drawingManager = new google.maps.drawing.DrawingManager({
                drawingMode: modeMap[type],
                drawingControl: false,
                map: this._map
            });
            google.maps.event.addListener(this._drawingManager, "overlaycomplete", function (e) {
                callback(e.overlay);
                this._drawingManager.setDrawingMode(null);
            }.bind(this));
        },

        disableDraw: function () {
            if (this._drawingManager) { this._drawingManager.setMap(null); this._drawingManager = null; }
        },

        clearDrawn: function () { this.disableDraw(); },
        enableClustering: function () { /* Use @googlemaps/markerclusterer if needed */ },

        addPopup: function (marker, content) {
            if (!marker) return;
            var infoWindow = new google.maps.InfoWindow({ content: content });
            marker.addListener("click", function () { infoWindow.open(this._map, marker); }.bind(this));
        },

        addWMSLayer: function (id, url, layers, options) {
            options = options || {};
            var overlay = new google.maps.ImageMapType({
                getTileUrl: function (coord, zoom) {
                    var proj = this._map.getProjection();
                    var s = Math.pow(2, zoom);
                    var tl = proj.fromPointToLatLng(new google.maps.Point(coord.x * 256 / s, coord.y * 256 / s));
                    var br = proj.fromPointToLatLng(new google.maps.Point((coord.x + 1) * 256 / s, (coord.y + 1) * 256 / s));
                    return url + "?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&LAYERS=" + layers + "&BBOX=" + tl.lng() + "," + br.lat() + "," + br.lng() + "," + tl.lat() + "&WIDTH=256&HEIGHT=256&SRS=EPSG:4326&FORMAT=image/png&TRANSPARENT=true";
                }.bind(this),
                tileSize: new google.maps.Size(256, 256),
                opacity: options.opacity || 0.7
            });
            this._map.overlayMapTypes.push(overlay);
            this._layers[id] = { type: "wms", item: overlay };
        },

        addEsriFeatureLayer: function () { return Promise.resolve(); },
        addXYZTileLayer: function () {},
        pointInPolygon: function () { return false; },

        getMap: function () { return this._map; }
    };

    return GoogleMapsProvider;
});
