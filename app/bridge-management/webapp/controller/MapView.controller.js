// ============================================================
// NHVR Map View Controller v2
//
// Licensing notes
// ───────────────
// • SAP UI5 (sap.m, sap.f, sap.ui.core) — Apache 2.0 / free to use via CDN
// • Leaflet.js 1.9.4              — BSD 2-Clause
// • Leaflet.Draw 1.0.4            — MIT
// • Leaflet.MarkerCluster 1.5.3   — MIT
// • Turf.js (optional, CDN)       — MIT  — used for area measurement
// • OpenStreetMap tiles           — ODbL (attribution required)
// • CartoDB tiles                 — CC-BY 3.0 (attribution required)
// • ESRI tile services            — ESRI public tile ToS (free, attribution)
// No Esri JS SDK, no proprietary libraries — only open-source CDN resources.
// ============================================================
sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/m/StandardListItem",
    "sap/m/MessageToast",
    "sap/m/Dialog",
    "sap/m/Button",
    "sap/m/VBox",
    "sap/m/HBox",
    "sap/m/Label",
    "sap/m/Input",
    "sap/m/Switch",
    "sap/m/Text",
    "sap/m/Title",
    "sap/m/Select",
    "sap/ui/core/Item",
    "sap/ui/core/HTML",
    "sap/m/MessageBox",
    "sap/ui/model/json/JSONModel",
    "nhvr/bridgemanagement/util/MapProviderFactory",
    "nhvr/bridgemanagement/util/UserAnalytics",
    "nhvr/bridgemanagement/util/AuthFetch"
], function (
    Controller, StandardListItem, MessageToast,
    Dialog, Button, VBox, HBox, Label, Input, Switch,
    Text, Title, Select, Item, HTML, MessageBox, JSONModel,
    MapProviderFactory, UserAnalytics, AuthFetch
) {
    "use strict";

    var Log = sap.base.Log;

    const BASE = "/bridge-management";

    // Escape single quotes for OData v4 string literals ( ' → '' )
    const _odataStr = (v) => String(v == null ? "" : v).replace(/'/g, "''");

    // ── Fallback base layers (overridden by MapConfig from OData) ──
    const DEFAULT_BASE_LAYERS = {
        osm: {
            url        : "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
            attribution: "© <a href='https://www.openstreetmap.org/copyright'>OpenStreetMap</a> contributors",
            maxZoom    : 19
        },
        satellite: {
            url        : "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
            attribution: "© <a href='https://www.esri.com'>Esri</a>, Maxar, Earthstar Geographics",
            maxZoom    : 18
        },
        topo: {
            url        : "https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}",
            attribution: "© <a href='https://www.esri.com'>Esri</a>, HERE, FAO, NOAA, USGS",
            maxZoom    : 18
        },
        dark: {
            url        : "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
            attribution: "© <a href='https://www.openstreetmap.org/copyright'>OpenStreetMap</a> © <a href='https://carto.com/attributions'>CARTO</a>",
            maxZoom    : 19
        }
    };

    // ── Fallback reference layers (overridden by MapConfig) ────────
    const DEFAULT_REFERENCE_LAYERS = [
        {
            id         : "aus_states",
            name       : "Australian State Boundaries",
            type       : "geojson",
            url        : "https://raw.githubusercontent.com/tonywr71/GeoJson-Data/master/australian-states.min.json",
            style      : { color: "#6400E4", weight: 1.5, fillOpacity: 0.04, opacity: 0.7 },
            description: "State / Territory administrative boundaries (GeoJSON)",
            isDefault  : true
        },
        {
            id         : "esri_hillshade",
            name       : "ESRI World Hillshade",
            type       : "xyz",
            url        : "https://services.arcgisonline.com/arcgis/rest/services/Elevation/World_Hillshade/MapServer/tile/{z}/{y}/{x}",
            opacity    : 0.4,
            description: "Subtle terrain shading overlay (ESRI public tile service)",
            isDefault  : false
        },
        {
            id         : "nhvr_hv_network",
            name       : "Heavy Vehicle Network Routes",
            type       : "geojson",
            url        : null,
            description: "NHVR approved HV route GeoJSON — configure URL in Map Config admin"
        },
        {
            id         : "flood_risk",
            name       : "Flood Risk Zones (GA)",
            type       : "wms",
            url        : null,
            wmsLayers  : "0",
            description: "Geoscience Australia flood risk WMS — configure URL in Map Config admin"
        }
    ];

    // ── Structure type display map (used in filters) ────────────────
    const STRUCTURE_TYPE_MAP = {
        chkTypeCBeam   : "CONCRETE_BEAM",
        chkTypeSBeam   : "STEEL_BEAM",
        chkTypeTimber  : "TIMBER",
        chkTypePrecast : "PRECAST_CONCRETE",
        chkTypeArch    : "ARCH",
        chkTypeTruss   : "TRUSS",
        chkTypeCulvert : "CULVERT",
        chkTypeOther   : null   // null = anything not matched above
    };

    const STATE_CHECK_IDS = ["chkStateNSW","chkStateVIC","chkStateQLD","chkStateWA","chkStateSA","chkStateTAS","chkStateNT","chkStateACT"];
    const STATUS_CHECK_IDS = ["chkStatusUnrestricted","chkStatusPosted","chkStatusClosed"];

    return Controller.extend("nhvr.bridgemanagement.controller.MapView", {

        // ── Internal state ────────────────────────────────────────────
        _map              : null,
        _clusterGroup     : null,
        _lineGroup        : null,
        _zoneGroup        : null,
        _drawnItems       : null,
        _activeDrawHandler: null,
        _drawingActive    : false,
        _drawMode         : null,        // 'polygon' | 'rect' | 'circle'
        _externalLayers   : {},
        _polygonSelection : [],
        _legendControl    : null,
        _symbologyMode    : "condition",
        _baseLayerObj     : null,
        _baseLayerKey     : "osm",
        _markers          : [],
        _markerById       : {},
        _allBridges       : [],
        _filteredBridges  : [],
        _displayBridges   : [],          // bridges currently on map / in list
        _selectedId       : null,
        _pendingIds       : null,
        _activeLayer      : "points",
        _viewMode         : "map",       // 'map' | 'split' | 'list'
        _filterSidebarOpen: true,
        _mapConfig        : null,        // loaded from MapConfigs OData entity
        _listSearchTerm   : "",
        _baseLayers       : {},          // merged default + custom from config

        // ── Lifecycle ─────────────────────────────────────────────────
        onInit: function () {
            UserAnalytics.trackView("MapView");
            // JSON model for the bridge list table
            this.getView().setModel(new JSONModel({ bridges: [] }), "listModel");

            const router = this.getOwnerComponent().getRouter();
            router.getRoute("MapView").attachPatternMatched(this._onRouteMatched, this);
        },

        _onRouteMatched: function (e) {
            const query = (e.getParameter("arguments") || {})["?query"] || {};
            const ids   = query.bridgeIds ? String(query.bridgeIds).split(",") : [];

            if (ids.length > 0) {
                if (this._allBridges.length > 0) {
                    this._applyHighlight(ids);
                } else {
                    this._pendingIds = ids;
                }
            }

            if (this._map) {
                setTimeout(() => {
                    this._map.invalidateSize();
                    if (ids.length > 0 && this._allBridges.length > 0) this._applyHighlight(ids);
                }, 300);
            }
        },

        onMapHolderRendered: function () {
            const holder = this.byId("mapHolder");
            if (holder && holder.getDomRef()) {
                const innerDiv = holder.getDomRef();
                const flexItem = innerDiv.parentElement;
                if (flexItem) {
                    flexItem.style.flex          = "1 1 auto";
                    flexItem.style.minWidth      = "0";
                    flexItem.style.minHeight     = "0";
                    flexItem.style.display       = "flex";
                    flexItem.style.flexDirection = "column";
                    flexItem.style.height        = "100%";
                }
                innerDiv.style.width          = "100%";
                innerDiv.style.height         = "100%";
                innerDiv.style.display        = "flex";
                innerDiv.style.flexDirection  = "column";
                innerDiv.style.flex           = "1 1 auto";

                // Also fix the Leaflet div itself
                const mapDiv = innerDiv.querySelector("#nhvr-leaflet-map");
                if (mapDiv) {
                    mapDiv.style.flex   = "1 1 auto";
                    mapDiv.style.height = "100%";
                    mapDiv.style.width  = "100%";
                }
            }
            this._loadMapConfig(() => setTimeout(() => this._initMap(), 300));
        },

        // ── Load OData MapConfig ──────────────────────────────────────
        _loadMapConfig: function (callback) {
            AuthFetch.getJson(`${BASE}/MapConfigs?$filter=configKey eq 'DEFAULT' and isActive eq true&$top=1`)
                .then(j => {
                    const cfg = (j.value || [])[0];
                    if (cfg) {
                        this._mapConfig = cfg;
                        // Merge custom base maps from config into _baseLayers
                        this._baseLayers = Object.assign({}, DEFAULT_BASE_LAYERS);
                        if (cfg.customBaseMaps) {
                            try {
                                JSON.parse(cfg.customBaseMaps).forEach(bm => {
                                    this._baseLayers[bm.key] = {
                                        url: bm.url, attribution: bm.attribution || "", maxZoom: bm.maxZoom || 19
                                    };
                                    // Add item to base layer select
                                    const sel = this.byId("baseLayerSelect");
                                    if (sel) {
                                        const exists = sel.getItems().some(it => it.getKey() === bm.key);
                                        if (!exists) sel.addItem(new Item({ key: bm.key, text: bm.name }));
                                    }
                                });
                            } catch (err) { /* ignore bad JSON */ }
                        }
                    } else {
                        this._baseLayers = Object.assign({}, DEFAULT_BASE_LAYERS);
                    }
                    if (callback) callback();
                })
                .catch(() => {
                    this._baseLayers = Object.assign({}, DEFAULT_BASE_LAYERS);
                    if (callback) callback();
                });
        },

        // ── Map init ─────────────────────────────────────────────────
        _initMap: function () {
            if (this._map) {
                setTimeout(() => {
                    this._map.invalidateSize();
                    if (this._pendingIds) { this._applyHighlight(this._pendingIds); this._pendingIds = null; }
                }, 150);
                return;
            }

            // Load configured map provider (non-blocking — Leaflet init continues below as default)
            var self = this;
            this._mapProvider = null;
            AuthFetch.getJson("/bridge-management/getMapApiConfig()")
            .then(function (config) {
                self._configuredProvider = config.provider || "osm-leaflet";
                // Store config for later use
                self._mapApiConfig = config;
                // Continue with existing Leaflet init (which is the default provider)
                // MapProviderFactory will be used when user switches providers
            }).catch(function () {
                self._configuredProvider = "osm-leaflet";
            });

            if (typeof L === "undefined") {
                // Leaflet CDN (cdnjs.cloudflare.com) didn't load — usually
                // a firewall / offline / cert issue. Show a clean empty
                // state instead of a console error + blank map container.
                console.warn("[MapView] Leaflet.js not loaded — showing fallback");
                var mapDiv = document.getElementById("nhvr-leaflet-map");
                if (mapDiv) {
                    mapDiv.innerHTML =
                        '<div style="display:flex;flex-direction:column;align-items:center;' +
                        'justify-content:center;height:100%;min-height:400px;padding:24px;' +
                        'background:#f7f7f7;color:#32363a;font-family:inherit;text-align:center;">' +
                        '<div style="font-size:48px;margin-bottom:16px;">&#128205;</div>' +
                        '<div style="font-size:18px;font-weight:600;margin-bottom:8px;">Map unavailable</div>' +
                        '<div style="font-size:14px;max-width:500px;color:#6a6d70;">' +
                        'The Leaflet map library could not be loaded from cdnjs.cloudflare.com. ' +
                        'This is usually a network / firewall issue. All other bridge data ' +
                        'is still accessible from the Bridges list.' +
                        '</div></div>';
                }
                return;
            }

            const cfg = this._mapConfig;
            const centerLat = cfg ? (cfg.defaultCenter_lat  || -27.0) : -27.0;
            const centerLng = cfg ? (cfg.defaultCenter_lng  || 133.0) : 133.0;
            const zoom      = cfg ? (cfg.defaultZoom        || 5)     : 5;
            const baseKey   = cfg ? (cfg.defaultBaseMap     || "osm") : "osm";

            this._map = L.map("nhvr-leaflet-map", {
                center     : [centerLat, centerLng],
                zoom,
                zoomControl: true
            });

            const baseDef = this._baseLayers[baseKey] || this._baseLayers.osm;
            this._baseLayerObj = L.tileLayer(baseDef.url, {
                attribution: baseDef.attribution,
                maxZoom    : baseDef.maxZoom
            }).addTo(this._map);
            this._baseLayerKey = baseKey;

            // Select matching base layer in toolbar
            const bSel = this.byId("baseLayerSelect");
            if (bSel) bSel.setSelectedKey(baseKey);

            // MarkerCluster
            const clusterRadius = cfg ? (cfg.clusterRadius || 60) : 60;
            const clusteringOn  = cfg ? (cfg.clusteringEnabled !== false) : true;

            if (clusteringOn && typeof L.markerClusterGroup !== "undefined") {
                this._clusterGroup = L.markerClusterGroup({
                    chunkedLoading     : true,
                    spiderfyOnMaxZoom  : true,
                    showCoverageOnHover: false,
                    zoomToBoundsOnClick: true,
                    maxClusterRadius   : clusterRadius,
                    disableClusteringAtZoom: cfg ? (cfg.maxZoomBeforeCluster || 15) : 15,
                    iconCreateFunction: function (cluster) {
                        const count    = cluster.getChildCount();
                        const children = cluster.getAllChildMarkers();
                        // Determine worst condition colour among child markers
                        let hasPoor = false, hasFair = false;
                        children.forEach(m => {
                            const fc = m.options && m.options.fillColor;
                            if (fc === "#e74c3c" || fc === "#BB0000") {
                                // Check if it's truly critical (dark) vs just poor
                                hasPoor = true;
                            }
                            if (fc === "#f39c12" || fc === "#E9730C") hasFair = true;
                        });
                        // Pick cluster colour: worst condition dominates
                        const condCls  = hasPoor     ? "nhvr-cluster-poor"
                                       : hasFair     ? "nhvr-cluster-fair"
                                       :               "nhvr-cluster-good";
                        const bgColor  = hasPoor     ? "#BB0000"
                                       : hasFair     ? "#E9730C"
                                       :               "#107E3E";
                        // Size scales with log of count
                        const sz = count < 10 ? 36 : count < 100 ? 44 : 54;
                        return L.divIcon({
                            html     : `<div class="nhvr-cluster-inner" style="background:${bgColor};width:${sz}px;height:${sz}px;font-size:${sz > 44 ? "1rem" : "0.85rem"}">${count}</div>`,
                            className: `nhvr-cluster ${condCls}`,
                            iconSize : L.point(sz, sz)
                        });
                    }
                });
                this._clusterGroup.addTo(this._map);
            }

            this._lineGroup  = L.layerGroup().addTo(this._map);
            this._zoneGroup  = L.layerGroup().addTo(this._map);
            this._drawnItems = new L.FeatureGroup();
            this._map.addLayer(this._drawnItems);

            this._initDrawHandlers();
            this._addLegend();
            this._loadBridges();
            this._loadVehicleClasses();

            // Auto-load default reference layers from config
            this._autoLoadDefaultLayers();

            setTimeout(() => { if (this._map) this._map.invalidateSize(); }, 400);
        },

        // ── Auto-load default reference layers from MapConfig ─────────
        _autoLoadDefaultLayers: function () {
            let layers = DEFAULT_REFERENCE_LAYERS;
            if (this._mapConfig && this._mapConfig.referenceLayers) {
                try { layers = JSON.parse(this._mapConfig.referenceLayers); } catch (e) { /* use default */ }
            }
            layers.filter(rl => rl.isDefault && rl.url).forEach(rl => this._enableReferenceLayer(rl));
        },

        // ══════════════════════════════════════════════════════════════
        // DRAW TOOLS
        // ══════════════════════════════════════════════════════════════
        _initDrawHandlers: function () {
            if (typeof L.Draw === "undefined") {
                console.warn("Leaflet.Draw not loaded — draw tools disabled");
                return;
            }

            const cfg        = this._mapConfig;
            let drawCfg      = { polygonColor: "#0070F2", rectangleColor: "#E9730C", circleColor: "#107E3E", fillOpacity: 0.12, weight: 2, dashArray: "6,4" };
            if (cfg && cfg.drawConfig) {
                try { drawCfg = Object.assign(drawCfg, JSON.parse(cfg.drawConfig)); } catch (e) { /* use default */ }
            }

            const makeOpts = (color) => ({
                color, fillColor: color,
                fillOpacity: drawCfg.fillOpacity,
                weight     : drawCfg.weight,
                dashArray  : drawCfg.dashArray
            });

            this._polygonDrawHandler = new L.Draw.Polygon(this._map, {
                allowIntersection: false,
                showArea         : true,
                shapeOptions     : makeOpts(drawCfg.polygonColor)
            });
            this._rectDrawHandler = new L.Draw.Rectangle(this._map, {
                shapeOptions: makeOpts(drawCfg.rectangleColor)
            });
            this._circleDrawHandler = new L.Draw.Circle(this._map, {
                shapeOptions: makeOpts(drawCfg.circleColor)
            });

            // Single listener for all draw types
            this._map.on(L.Draw.Event.CREATED, (e) => {
                this._drawnItems.clearLayers();
                this._drawnItems.addLayer(e.layer);
                this._drawingActive = false;
                this._resetDrawButtons();
                this.byId("btnClearDraw").setVisible(true);
                this._onShapeDrawn(e.layer);
            });
        },

        _resetDrawButtons: function () {
            ["btnDrawPolygon","btnDrawRect","btnDrawCircle"].forEach(id => {
                const b = this.byId(id);
                if (b) b.setType("Transparent");
            });
        },

        _activateDraw: function (handler, btnId, mode) {
            UserAnalytics.trackAction("spatial_select", "MapView", { mode: mode });
            if (!handler) { MessageToast.show("Draw tools require Leaflet.Draw"); return; }
            // Deactivate all first
            if (this._activeDrawHandler) {
                try { this._activeDrawHandler.disable(); } catch (e) { /* ignore */ }
            }
            if (this._drawingActive && this._drawMode === mode) {
                // Toggle off
                this._drawingActive = false;
                this._activeDrawHandler = null;
                this._drawMode = null;
                this._resetDrawButtons();
                return;
            }
            this._resetDrawButtons();
            handler.enable();
            this._activeDrawHandler = handler;
            this._drawingActive     = true;
            this._drawMode          = mode;
            const btn = this.byId(btnId);
            if (btn) btn.setType("Emphasized");
            const tips = { polygon: "Click to add vertices · Double-click to close", rect: "Click and drag to draw rectangle", circle: "Click to set centre · drag for radius" };
            MessageToast.show(tips[mode] || "Draw on map");
        },

        onDrawPolygon  : function () { this._activateDraw(this._polygonDrawHandler, "btnDrawPolygon",  "polygon"); },
        onDrawRectangle: function () { this._activateDraw(this._rectDrawHandler,    "btnDrawRect",     "rect");    },
        onDrawCircle   : function () { this._activateDraw(this._circleDrawHandler,  "btnDrawCircle",   "circle");  },

        onClearDrawing: function () {
            if (this._drawnItems) this._drawnItems.clearLayers();
            this._polygonSelection = [];
            this.byId("btnClearDraw").setVisible(false);
            this._resetDrawButtons();
            this._drawingActive = false;
            // Remove stats overlay if present
            if (this._statsControl && this._map) { this._statsControl.remove(); this._statsControl = null; }
            // Hide the "View in Bridge List" button when selection is cleared
            const btnView = this.byId("btnViewSelectionInList");
            if (btnView) btnView.setVisible(false);
        },

        // ── Spatial selection ─────────────────────────────────────────
        _onShapeDrawn: function (layer) {
            const bridges = this._displayBridges.length > 0 ? this._displayBridges : this._allBridges;
            let selected  = [];

            if (layer.getRadius) {
                // Circle — use Leaflet's containsPoint or manual distance check
                const centre = layer.getLatLng();
                const radius = layer.getRadius(); // metres
                selected = bridges.filter(b => {
                    const lat = parseFloat(b.latitude), lng = parseFloat(b.longitude);
                    if (isNaN(lat) || isNaN(lng)) return false;
                    return centre.distanceTo(L.latLng(lat, lng)) <= radius;
                });
            } else {
                const bounds = layer.getBounds ? layer.getBounds() : null;
                let latlngs  = null;
                try {
                    const raw = layer.getLatLngs();
                    latlngs = Array.isArray(raw[0]) ? raw[0] : raw;
                } catch (e) { /* ignore */ }

                selected = bridges.filter(b => {
                    const lat = parseFloat(b.latitude), lng = parseFloat(b.longitude);
                    if (isNaN(lat) || isNaN(lng)) return false;
                    if (bounds && !bounds.contains([lat, lng])) return false;
                    if (latlngs && latlngs.length >= 3) return this._pointInPolygon(lat, lng, latlngs);
                    return !!bounds;
                });
            }

            this._polygonSelection = selected;
            this._showSelectionStats(selected, layer);
        },

        _pointInPolygon: function (lat, lng, vertices) {
            let inside = false;
            for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
                const xi = vertices[i].lat, yi = vertices[i].lng;
                const xj = vertices[j].lat, yj = vertices[j].lng;
                if (((yi > lng) !== (yj > lng)) &&
                    (lat < (xj - xi) * (lng - yi) / (yj - yi) + xi)) {
                    inside = !inside;
                }
            }
            return inside;
        },

        // ── Selection statistics overlay ──────────────────────────────
        _showSelectionStats: function (bridges, layer) {
            const count = bridges.length;
            if (count === 0) { MessageToast.show("No bridges in selected area"); return; }

            // Compute stats
            const restricted  = bridges.filter(b => b.postingStatus !== "UNRESTRICTED").length;
            const pctRestrict = count > 0 ? Math.round(restricted / count * 100) : 0;
            const ratings     = bridges.map(b => b.conditionRating).filter(r => r != null && r > 0);
            const avgRating   = ratings.length ? (ratings.reduce((s, v) => s + v, 0) / ratings.length).toFixed(1) : "—";
            const minRating   = ratings.length ? Math.min(...ratings) : "—";
            const maxRating   = ratings.length ? Math.max(...ratings) : "—";
            const scourHigh   = bridges.filter(b => b.scourRisk === "HIGH" || b.scourRisk === "EXTREME").length;
            const closed      = bridges.filter(b => b.postingStatus === "CLOSED").length;

            // Area (use Turf if available)
            let areaStr = "";
            if (typeof turf !== "undefined" && layer.getLatLngs) {
                try {
                    const raw  = layer.getLatLngs();
                    const ring = (Array.isArray(raw[0]) ? raw[0] : raw).map(p => [p.lng, p.lat]);
                    ring.push(ring[0]); // close
                    const poly = turf.polygon([ring]);
                    const ha   = (turf.area(poly) / 10000).toFixed(1);
                    areaStr    = `<div class="nhvr-stats-row"><span>Area</span><b>${ha} ha</b></div>`;
                } catch (e) { /* ignore */ }
            } else if (layer.getRadius) {
                const r = layer.getRadius();
                const ha = ((Math.PI * r * r) / 10000).toFixed(1);
                areaStr = `<div class="nhvr-stats-row"><span>Area</span><b>${ha} ha</b></div>`;
            }

            // Remove old stats overlay
            if (this._statsControl && this._map) { this._statsControl.remove(); this._statsControl = null; }

            // Sanitise helper — ensure only safe text is injected into innerHTML
            function esc(v) { return String(v).replace(/[&<>"']/g, function (c) { return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }

            const oCtrl = this;
            const ctrl  = L.control({ position: "bottomleft" });
            ctrl.onAdd  = function () {
                const div = L.DomUtil.create("div", "nhvr-stats-overlay");
                div.innerHTML = `
                    <div class="nhvr-stats-header">
                        <span>📐 Selection — ${esc(count.toLocaleString())} bridge${count !== 1 ? "s" : ""}</span>
                        <button class="nhvr-stats-close" aria-label="Close statistics panel">✕</button>
                    </div>
                    <div class="nhvr-stats-body">
                        ${areaStr}
                        <div class="nhvr-stats-row"><span>Restricted</span><b style="color:${pctRestrict > 50 ? '#e74c3c':'#27ae60'}">${esc(restricted)} (${esc(pctRestrict)}%)</b></div>
                        <div class="nhvr-stats-row"><span>Closed</span><b style="color:${closed > 0 ? '#e74c3c':'#27ae60'}">${esc(closed)}</b></div>
                        <div class="nhvr-stats-row"><span>Avg Rating</span><b>${esc(avgRating)}/10</b></div>
                        <div class="nhvr-stats-row"><span>Min / Max</span><b>${esc(minRating)} / ${esc(maxRating)}</b></div>
                        <div class="nhvr-stats-row"><span>High Scour</span><b style="color:${scourHigh > 0 ? '#e74c3c':'#27ae60'}">${esc(scourHigh)}</b></div>
                    </div>
                    <div class="nhvr-stats-actions">
                        <button class="nhvr-stats-btn nhvr-stats-btn-primary" id="nhvrStatsExportCSV">⬇ Export CSV</button>
                        <button class="nhvr-stats-btn" id="nhvrStatsExportGeoJSON">⬇ GeoJSON</button>
                        <button class="nhvr-stats-btn" id="nhvrStatsViewList">☰ View List</button>
                        <button class="nhvr-stats-btn nhvr-stats-btn-primary" id="nhvrStatsViewBridgeList">↗ Bridge List</button>
                    </div>`;
                // Prevent map click-through
                L.DomEvent.disableClickPropagation(div);
                L.DomEvent.disableScrollPropagation(div);

                // Bind buttons after DOM insertion
                setTimeout(() => {
                    const closeBtn = document.querySelector(".nhvr-stats-close");
                    if (closeBtn) closeBtn.onclick = () => { if (oCtrl._statsControl) { oCtrl._statsControl.remove(); oCtrl._statsControl = null; } };
                    const c = document.getElementById("nhvrStatsExportCSV");
                    const g = document.getElementById("nhvrStatsExportGeoJSON");
                    const l = document.getElementById("nhvrStatsViewList");
                    const v = document.getElementById("nhvrStatsViewBridgeList");
                    if (c) c.onclick = () => oCtrl._exportToCSV(oCtrl._polygonSelection, "nhvr_selection");
                    if (g) g.onclick = () => oCtrl._exportGeoJSON(oCtrl._polygonSelection, "nhvr_selection");
                    if (l) l.onclick = () => {
                        // Switch to list mode, populate with selection
                        oCtrl._setViewMode("list");
                        oCtrl._updateListModel(oCtrl._polygonSelection);
                    };
                    if (v) v.onclick = () => oCtrl.onViewSelectionInList();
                }, 100);
                return div;
            };
            ctrl.addTo(this._map);
            this._statsControl = ctrl;

            // Store selection to localStorage for cross-view filter sync
            // v4.7.6: write parallel keys so Bridges + Restrictions can each
            // independently consume the map polygon selection.
            const ids = bridges.map(b => b.ID || b.id).filter(Boolean);
            if (ids.length > 0) {
                try {
                    const payload = JSON.stringify({ bridgeIds: ids, setAt: Date.now() });
                    localStorage.setItem("nhvr_map_selection", payload);
                    localStorage.setItem("nhvr_map_restriction_selection", payload);
                } catch (_) { /* localStorage unavailable */ }
            }

            // Show the "View in Bridge List" button in the list section toolbar
            const btnView = this.byId("btnViewSelectionInList");
            if (btnView) btnView.setVisible(true);
        },

        // ══════════════════════════════════════════════════════════════
        // VIEW MODE (Map / Split / List)
        // ══════════════════════════════════════════════════════════════
        onViewModeChange: function (e) {
            const mode = e.getParameter("item").getKey();
            this._setViewMode(mode);
        },

        // Hide table from within the list section header
        onHideListSection: function () { this._setViewMode("map"); },

        _setViewMode: function (mode) {
            this._viewMode = mode;
            const mapSection  = this.byId("mapSection");
            const listSection = this.byId("listSection");

            const mapDom  = mapSection  && mapSection.getDomRef();
            const listDom = listSection && listSection.getDomRef();

            if (mode === "map") {
                if (mapDom)  { mapDom.style.flex = "1 1 100%"; mapDom.style.display = ""; }
                if (listDom) listDom.style.display = "none";
                listSection.setVisible(false);
            } else if (mode === "split") {
                if (mapDom)  { mapDom.style.flex = "1 1 55%"; mapDom.style.display = ""; }
                listSection.setVisible(true);
                if (listDom) { listDom.style.flex = "1 1 45%"; listDom.style.display = ""; }
            } else {
                // list
                if (mapDom)  mapDom.style.display = "none";
                listSection.setVisible(true);
                if (listDom) { listDom.style.flex = "1 1 100%"; listDom.style.display = ""; }
            }

            if (this._map && mode !== "list") {
                setTimeout(() => this._map.invalidateSize(), 100);
                setTimeout(() => this._map.invalidateSize(), 400);
            }

            // Sync toolbar SegmentedButton
            const toggle = this.byId("viewModeToggle");
            if (toggle && toggle.getSelectedKey() !== mode) toggle.setSelectedKey(mode);

            // Update list model with current display bridges
            if (mode !== "map") this._updateListModel(this._displayBridges.length ? this._displayBridges : this._allBridges);
        },

        // ── List model update ─────────────────────────────────────────
        _updateListModel: function (bridges) {
            const term     = (this._listSearchTerm || "").toLowerCase();
            const filtered = term
                ? bridges.filter(b =>
                    (b.name || "").toLowerCase().includes(term)  ||
                    (b.bridgeId || "").toLowerCase().includes(term) ||
                    (b.region || "").toLowerCase().includes(term))
                : bridges;

            this.getView().getModel("listModel").setProperty("/bridges", filtered);
            const countCtrl = this.byId("listSectionCount");
            if (countCtrl) countCtrl.setText(`${filtered.length.toLocaleString()} bridges`);
            const title = this.byId("listSectionTitle");
            if (title) title.setText(this._polygonSelection.length > 0 ? "Selection" : "Bridges");
        },

        onListSearch: function (e) {
            this._listSearchTerm = e.getParameter("query") || e.getParameter("value") || "";
            this._updateListModel(this._displayBridges.length ? this._displayBridges : this._allBridges);
        },

        onExportList: function () {
            const bridges = this.getView().getModel("listModel").getProperty("/bridges") || [];
            this._exportToCSV(bridges, "nhvr_list");
        },

        onListItemPress: function (e) {
            const item = e.getParameter("listItem");
            if (!item) return;
            const ctx  = item.getBindingContext("listModel");
            if (!ctx)  return;
            const b    = ctx.getObject();
            // Show on map if in split mode
            if (this._viewMode !== "list") {
                const marker = this._markerById[b.bridgeId];
                if (marker && this._map) {
                    const ll = marker.getLatLng ? marker.getLatLng() : (marker.getBounds ? marker.getBounds().getCenter() : null);
                    if (ll) { this._map.setView(ll, 14); marker.openPopup && marker.openPopup(); }
                }
            }
            this._showDetail(b);
        },

        onLocateBridgeOnMap: function (e) {
            const ctx = e.getSource().getParent().getBindingContext("listModel");
            if (!ctx) return;
            const b   = ctx.getObject();
            if (this._viewMode === "list") {
                // Switch to split so user can see the map
                this._setViewMode("split");
                const toggle = this.byId("viewModeToggle");
                if (toggle) toggle.setSelectedKey("split");
            }
            setTimeout(() => {
                const marker = this._markerById[b.bridgeId];
                if (marker && this._map) {
                    const ll = marker.getLatLng ? marker.getLatLng() : null;
                    if (ll) { this._map.setView(ll, 15); marker.openPopup && marker.openPopup(); }
                }
            }, 200);
            this._showDetail(b);
        },

        // ══════════════════════════════════════════════════════════════
        // FILTER SIDEBAR
        // ══════════════════════════════════════════════════════════════
        onToggleFilterSidebar: function () {
            this._filterSidebarOpen = !this._filterSidebarOpen;
            const sidebar = this.byId("filterSidebar");
            if (!sidebar) return;
            const dom = sidebar.getDomRef();
            if (dom) {
                dom.style.width    = this._filterSidebarOpen ? "268px" : "0";
                dom.style.overflow = this._filterSidebarOpen ? "" : "hidden";
                dom.style.minWidth = this._filterSidebarOpen ? "268px" : "0";
            }
            sidebar.setVisible(this._filterSidebarOpen);
            if (this._map) setTimeout(() => this._map.invalidateSize(), 200);
        },

        onFilterChange: function () {
            // Auto-apply on change (live filtering)
            this.onApplyFilters();
        },

        onCondPreset: function (e) {
            const val = e.getSource().data("value").split(",");
            const minCtrl = this.byId("condRatingMin");
            const maxCtrl = this.byId("condRatingMax");
            if (minCtrl) minCtrl.setValue(val[0]);
            if (maxCtrl) maxCtrl.setValue(val[1]);
            this.onApplyFilters();
        },

        onApplyFilters: function () {
            const filters = this._collectFilters();
            this._displayBridges = this._applyFilters(this._allBridges, filters);
            this._plotMarkers(this._displayBridges, null);
            this._updateFilterCount(this._displayBridges.length);
            if (this._viewMode !== "map") this._updateListModel(this._displayBridges);
        },

        onClearAllFilters: function () {
            // Uncheck all checkboxes
            const allCheckIds = [
                ...STATE_CHECK_IDS, ...STATUS_CHECK_IDS,
                "chkFreightRoute","chkOverMassRoute","chkNhvrAssessed","chkHighPriority","chkFloodImpacted",
                "chkScourExtreme","chkScourHigh","chkScourMedium","chkScourLow","chkScourNone",
                ...Object.keys(STRUCTURE_TYPE_MAP)
            ];
            allCheckIds.forEach(id => { const c = this.byId(id); if (c) c.setSelected(false); });
            // Reset range inputs
            const setVal = (id, v) => { const ctrl = this.byId(id); if (ctrl) ctrl.setValue(String(v)); };
            setVal("condRatingMin", 1); setVal("condRatingMax", 10);
            setVal("yearBuiltMin", 1900); setVal("yearBuiltMax", 2025);
            // Reset vehicle select
            const vSel = this.byId("filterVehicle");
            if (vSel) vSel.setSelectedKey("ALL");

            this._displayBridges = [];
            this._plotMarkers(this._allBridges, null);
            this._updateFilterCount(this._allBridges.length);
            if (this._viewMode !== "map") this._updateListModel(this._allBridges);
        },

        _collectFilters: function () {
            const getVal = (id) => { const c = this.byId(id); return c ? c.getValue() : null; };
            const isChk  = (id) => { const c = this.byId(id); return c ? c.getSelected() : false; };

            // States
            const stateMap = { chkStateNSW:"NSW", chkStateVIC:"VIC", chkStateQLD:"QLD", chkStateWA:"WA",
                               chkStateSA:"SA", chkStateTAS:"TAS", chkStateNT:"NT", chkStateACT:"ACT" };
            const states   = Object.entries(stateMap).filter(([id]) => isChk(id)).map(([,s]) => s);

            // Statuses
            const statusMap = { chkStatusUnrestricted:"UNRESTRICTED", chkStatusPosted:"POSTED", chkStatusClosed:"CLOSED" };
            const statuses  = Object.entries(statusMap).filter(([id]) => isChk(id)).map(([,s]) => s);

            // Structure types
            const structTypes = Object.entries(STRUCTURE_TYPE_MAP)
                .filter(([id]) => isChk(id))
                .map(([,v]) => v); // may include null for "OTHER"

            // Scour
            const scourMap = { chkScourExtreme:"EXTREME", chkScourHigh:"HIGH", chkScourMedium:"MEDIUM", chkScourLow:"LOW", chkScourNone:null };
            const scours   = Object.entries(scourMap).filter(([id]) => isChk(id)).map(([,v]) => v);

            return {
                states,
                statuses,
                condMin      : parseInt(getVal("condRatingMin")) || 1,
                condMax      : parseInt(getVal("condRatingMax")) || 10,
                yearMin      : parseInt(getVal("yearBuiltMin"))  || 1900,
                yearMax      : parseInt(getVal("yearBuiltMax"))  || 2025,
                structTypes,
                scours,
                freightOnly  : isChk("chkFreightRoute"),
                overMassOnly : isChk("chkOverMassRoute"),
                nhvrOnly     : isChk("chkNhvrAssessed"),
                highPriority : isChk("chkHighPriority"),
                floodOnly    : isChk("chkFloodImpacted"),
                vehicleId    : (() => { const s = this.byId("filterVehicle"); return s ? s.getSelectedKey() : "ALL"; })()
            };
        },

        _applyFilters: function (bridges, f) {
            // Short-circuit: if nothing is filtered, return all
            const anyState      = f.states.length > 0;
            const anyStatus     = f.statuses.length > 0;
            const anyStruct     = f.structTypes.length > 0;
            const anyScour      = f.scours.length > 0;
            const condFiltered  = (f.condMin !== 1 || f.condMax !== 10);
            const yearFiltered  = (f.yearMin !== 1900 || f.yearMax !== 2025);
            const anyBoolFlag   = f.freightOnly || f.overMassOnly || f.nhvrOnly || f.highPriority || f.floodOnly;

            if (!anyState && !anyStatus && !anyStruct && !anyScour && !condFiltered && !yearFiltered && !anyBoolFlag) {
                return []; // empty = use allBridges (optimisation)
            }

            return bridges.filter(b => {
                if (anyState  && !f.states.includes(b.state))    return false;
                if (anyStatus && !f.statuses.includes(b.postingStatus)) return false;
                if (condFiltered) {
                    const r = b.conditionRating;
                    if (r != null && (r < f.condMin || r > f.condMax)) return false;
                }
                if (yearFiltered) {
                    const yr = parseInt(b.yearBuilt);
                    if (!isNaN(yr) && (yr < f.yearMin || yr > f.yearMax)) return false;
                }
                if (anyStruct) {
                    const knownTypes = Object.values(STRUCTURE_TYPE_MAP).filter(v => v !== null);
                    const hasOther   = f.structTypes.includes(null);
                    if (f.structTypes.includes(b.structureType)) { /* ok */ }
                    else if (hasOther && !knownTypes.includes(b.structureType)) { /* ok — "other" */ }
                    else return false;
                }
                if (anyScour) {
                    const hasNullScour = f.scours.includes(null);
                    if (hasNullScour && !b.scourRisk) { /* ok */ }
                    else if (b.scourRisk && f.scours.includes(b.scourRisk)) { /* ok */ }
                    else return false;
                }
                if (f.freightOnly  && !b.freightRoute)        return false;
                if (f.overMassOnly && !b.overMassRoute)       return false;
                if (f.nhvrOnly     && !b.nhvrRouteAssessed)   return false;
                if (f.highPriority && !b.highPriorityAsset)   return false;
                if (f.floodOnly    && !b.floodImpacted)       return false;
                return true;
            });
        },

        _updateFilterCount: function (n) {
            const total = this._allBridges.length;
            const badge = this.byId("filterCountBadge");
            if (badge) badge.setText(n < total ? `${n.toLocaleString()} / ${total.toLocaleString()}` : "");
            const sidebar = this.byId("sidebarResultCount");
            if (sidebar) sidebar.setText(`${n.toLocaleString()} of ${total.toLocaleString()} bridges`);
        },

        // ══════════════════════════════════════════════════════════════
        // EXPORT
        // ══════════════════════════════════════════════════════════════
        onExport: function () {
            const bridges = this._polygonSelection.length > 0 ? this._polygonSelection
                          : this._displayBridges.length > 0   ? this._displayBridges
                          : this._allBridges;
            this._exportToCSV(bridges, "nhvr_bridges");
        },

        onExportGeoJSON: function () {
            const bridges = this._polygonSelection.length > 0 ? this._polygonSelection
                          : this._displayBridges.length > 0   ? this._displayBridges
                          : this._allBridges;
            this._exportGeoJSON(bridges, "nhvr_bridges");
        },

        _exportToCSV: function (bridges, filename) {
            // Get columns from MapConfig or use default
            let cols = [
                {field:"bridgeId",label:"Bridge ID"},{field:"name",label:"Name"},
                {field:"state",label:"State"},{field:"region",label:"Region"},
                {field:"condition",label:"Condition"},{field:"conditionRating",label:"Cond. Rating"},
                {field:"postingStatus",label:"Posting Status"},{field:"structureType",label:"Structure Type"},
                {field:"clearanceHeightM",label:"Clearance (m)"},{field:"spanLengthM",label:"Span (m)"},
                {field:"yearBuilt",label:"Year Built"},{field:"latitude",label:"Latitude"},
                {field:"longitude",label:"Longitude"},{field:"scourRisk",label:"Scour Risk"},
                {field:"gazetteRef",label:"Gazette Ref"},{field:"nhvrRouteAssessed",label:"NHVR Assessed"},
                {field:"inspectionDate",label:"Inspection Date"},{field:"assetOwner",label:"Asset Owner"}
            ];
            if (this._mapConfig && this._mapConfig.exportColumns) {
                try {
                    const cfgCols = JSON.parse(this._mapConfig.exportColumns).filter(c => c.include !== false);
                    if (cfgCols.length > 0) cols = cfgCols;
                } catch (e) { /* use default */ }
            }
            const BOM  = "\uFEFF";
            const esc  = (v) => {
                const s = (v === null || v === undefined) ? "" : String(v);
                return /[,"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
            };
            const body = bridges.map(b => cols.map(c => {
                const v = b[c.field];
                return esc(typeof v === "boolean" ? (v ? "Yes" : "No") : v);
            }).join(",")).join("\r\n");
            const csv  = BOM + cols.map(c => esc(c.label)).join(",") + "\r\n" + body;
            this._downloadBlob(csv, `${filename}_${new Date().toISOString().slice(0,10)}.csv`, "text/csv;charset=utf-8;");
            MessageToast.show(`Exported ${bridges.length.toLocaleString()} bridges to CSV`);
        },

        _exportGeoJSON: function (bridges, filename) {
            const features = bridges
                .filter(b => b.latitude && b.longitude)
                .map(b => ({
                    type: "Feature",
                    geometry: {
                        type       : "Point",
                        coordinates: [parseFloat(b.longitude), parseFloat(b.latitude)]
                    },
                    properties: {
                        bridgeId     : b.bridgeId,
                        name         : b.name,
                        state        : b.state,
                        region       : b.region,
                        condition    : b.condition,
                        conditionRating: b.conditionRating,
                        postingStatus: b.postingStatus,
                        structureType: b.structureType,
                        clearanceHeightM: b.clearanceHeightM,
                        yearBuilt    : b.yearBuilt,
                        scourRisk    : b.scourRisk,
                        nhvrAssessed : b.nhvrRouteAssessed
                    }
                }));
            const geojson = JSON.stringify({ type: "FeatureCollection", features }, null, 2);
            this._downloadBlob(geojson, `${filename}_${new Date().toISOString().slice(0,10)}.geojson`, "application/geo+json");
            MessageToast.show(`Exported ${features.length.toLocaleString()} features as GeoJSON`);
        },

        _downloadBlob: function (content, filename, mime) {
            const blob = new Blob([content], { type: mime });
            const url  = URL.createObjectURL(blob);
            const a    = document.createElement("a");
            a.href     = url;
            a.download = filename;
            a.click();
            URL.revokeObjectURL(url);
        },

        // ══════════════════════════════════════════════════════════════
        // SYMBOLOGY
        // ══════════════════════════════════════════════════════════════
        onSymbologyChange: function (e) {
            const oItem = e.getParameter("selectedItem");
            if (!oItem) return;
            this._symbologyMode = oItem.getKey();
            const visible = this._displayBridges.length > 0 ? this._displayBridges : this._allBridges;
            this._renderActiveLayer(visible, null);
            this._updateLegend();
        },

        _getFeatureColor: function (b) {
            switch (this._symbologyMode) {
                case "structureType": {
                    const map = {
                        CONCRETE_BEAM: "#0070F2", STEEL_BEAM: "#E9730C", TIMBER: "#8B4513",
                        PRECAST_CONCRETE: "#107E3E", ARCH: "#6400E4", SUSPENSION: "#BB0000",
                        CULVERT: "#6A6D70", TRUSS: "#E91E63", COMPOSITE: "#00BCD4"
                    };
                    return map[b.structureType] || "#9E9E9E";
                }
                case "scourRisk": {
                    const map = { EXTREME: "#BB0000", HIGH: "#E9730C", MEDIUM: "#f39c12", LOW: "#107E3E" };
                    return map[b.scourRisk] || "#9E9E9E";
                }
                case "yearBuilt": {
                    const yr = parseInt(b.yearBuilt) || 1970;
                    if (yr >= 2000) return "#107E3E";
                    if (yr >= 1980) return "#0070F2";
                    if (yr >= 1960) return "#f39c12";
                    return "#BB0000";
                }
                case "condition":
                default:
                    return this._conditionColor(b.conditionRating) || this._statusColor(b.postingStatus);
            }
        },

        // ── Legend ────────────────────────────────────────────────────
        _updateLegend: function () {
            if (this._legendControl && this._map) { this._legendControl.remove(); this._legendControl = null; }
            this._addLegend();
        },

        _addLegend: function () {
            if (!this._map) return;
            const mode    = this._symbologyMode || "condition";
            const LEGENDS = {
                condition: [
                    "<b style='display:block;margin-bottom:5px'>Condition Rating</b>",
                    "<span style='color:#27ae60'>●</span> Good (7–10)<br>",
                    "<span style='color:#f39c12'>●</span> Fair (5–6)<br>",
                    "<span style='color:#e74c3c'>●</span> Poor (1–4)<br>",
                    "<hr style='margin:5px 0;border-color:#ddd'>",
                    "<b style='display:block;margin-bottom:3px'>Border = Status</b>",
                    "<span style='color:#BB0000'>◎</span> Closed<br>",
                    "<span style='color:#E9730C'>◎</span> Posted"
                ],
                structureType: [
                    "<b style='display:block;margin-bottom:5px'>Structure Type</b>",
                    "<span style='color:#0070F2'>●</span> Concrete Beam<br>",
                    "<span style='color:#E9730C'>●</span> Steel Beam<br>",
                    "<span style='color:#8B4513'>●</span> Timber<br>",
                    "<span style='color:#107E3E'>●</span> Precast Concrete<br>",
                    "<span style='color:#6400E4'>●</span> Arch<br>",
                    "<span style='color:#BB0000'>●</span> Suspension<br>",
                    "<span style='color:#E91E63'>●</span> Truss<br>",
                    "<span style='color:#9E9E9E'>●</span> Other"
                ],
                scourRisk: [
                    "<b style='display:block;margin-bottom:5px'>Scour Risk Level</b>",
                    "<span style='color:#BB0000'>●</span> Extreme<br>",
                    "<span style='color:#E9730C'>●</span> High<br>",
                    "<span style='color:#f39c12'>●</span> Medium<br>",
                    "<span style='color:#107E3E'>●</span> Low<br>",
                    "<span style='color:#9E9E9E'>●</span> Not Assessed"
                ],
                yearBuilt: [
                    "<b style='display:block;margin-bottom:5px'>Year Built</b>",
                    "<span style='color:#107E3E'>●</span> 2000+ (Modern)<br>",
                    "<span style='color:#0070F2'>●</span> 1980–1999<br>",
                    "<span style='color:#f39c12'>●</span> 1960–1979<br>",
                    "<span style='color:#BB0000'>●</span> Pre-1960"
                ]
            };

            const legend = L.control({ position: "bottomright" });
            legend.onAdd = function () {
                const div = L.DomUtil.create("div", "nhvr-legend-card");
                div.innerHTML = (LEGENDS[mode] || LEGENDS.condition).join("");
                return div;
            };
            legend.addTo(this._map);
            this._legendControl = legend;
        },

        // ══════════════════════════════════════════════════════════════
        // BASE LAYER & REFERENCE LAYERS
        // ══════════════════════════════════════════════════════════════
        onBaseLayerChange: function (e) {
            const oItem = e.getParameter("selectedItem");
            if (!oItem) return;
            const key = oItem.getKey();
            const def = this._baseLayers[key];
            if (!def || !this._map) return;
            if (this._baseLayerObj) this._map.removeLayer(this._baseLayerObj);
            this._baseLayerObj = L.tileLayer(def.url, {
                attribution: def.attribution,
                maxZoom    : def.maxZoom || 19
            });
            this._map.addLayer(this._baseLayerObj);
            this._baseLayerObj.bringToBack();
            this._baseLayerKey = key;
        },

        onOpenLayerManager: function () {
            const oCtrl = this;
            let refLayers = DEFAULT_REFERENCE_LAYERS;
            if (this._mapConfig && this._mapConfig.referenceLayers) {
                try { refLayers = JSON.parse(this._mapConfig.referenceLayers); } catch (e) { /* use default */ }
            }

            const toggleRows = refLayers.map((rl, idx) => {
                const isOn = !!oCtrl._externalLayers[rl.id];
                return new HBox({
                    alignItems: "Center",
                    class     : "sapUiTinyMarginBottom",
                    items: [
                        new Switch({
                            id   : `_extSw_${idx}_${rl.id}`,
                            state: isOn,
                            change: function (ev) {
                                if (ev.getParameter("state")) oCtrl._enableReferenceLayer(rl);
                                else oCtrl._disableExternalLayer(rl.id);
                            }
                        }),
                        new VBox({
                            items: [
                                new Label({ text: rl.name, design: "Bold" }),
                                new Text({ text: rl.description || "" })
                            ]
                        }).addStyleClass("sapUiSmallMarginBegin")
                    ]
                });
            });

            const nameInput  = new Input({ placeholder: "Layer display name", width: "100%" });
            const urlInput   = new Input({ placeholder: "https://... (WMS, GeoJSON, XYZ, ESRI REST)", width: "100%" });
            const typeSelect = new Select({ width: "130px", items: [
                new Item({ key: "geojson",      text: "GeoJSON URL"    }),
                new Item({ key: "wms",          text: "WMS Service"    }),
                new Item({ key: "xyz",          text: "XYZ Tiles"      }),
                new Item({ key: "esri_feature", text: "ESRI Feature Svc" })
            ]});
            const wmsInput = new Input({ placeholder: "WMS layer names (default: 0)", width: "100%" });

            const dialog = new Dialog({
                title: "Reference Layers", contentWidth: "520px",
                content: [ new VBox({ items: [
                    new Title({ text: "Pre-configured Layers", level: "H4" }),
                    new HTML({ content: "<div style='height:6px'/>" }),
                    ...toggleRows,
                    new HTML({ content: "<hr style='border:none;border-top:1px solid #E5E8EB;margin:12px 0'/>" }),
                    new Title({ text: "Add Custom Layer", level: "H4" }),
                    new Label({ text: "Name", design: "Bold" }), nameInput,
                    new Label({ text: "URL",  design: "Bold" }), urlInput,
                    new HBox({ alignItems: "Center", items: [
                        new VBox({ items: [new Label({ text: "Type" }), typeSelect] }),
                        new VBox({ width: "100%", items: [
                            new Label({ text: "WMS Layers (if WMS)" }), wmsInput
                        ]}).addStyleClass("sapUiSmallMarginBegin")
                    ]}),
                    new HTML({ content: "<div style='font-size:0.78rem;color:#6A6D70;margin-top:8px'>ESRI Feature Service: URL must end in /FeatureServer/0. GeoJSON: needs CORS. XYZ: {z}/{y}/{x} template.</div>" })
                ]}).addStyleClass("sapUiSmallMargin") ],
                buttons: [
                    new Button({ text: "Add Layer", type: "Emphasized", icon: "sap-icon://add",
                        press: function () {
                            const url = urlInput.getValue().trim();
                            const name = nameInput.getValue().trim() || "Custom Layer";
                            const type = typeSelect.getSelectedKey();
                            const wms  = wmsInput.getValue().trim() || "0";
                            if (!url) { MessageToast.show("Enter a URL"); return; }
                            oCtrl._addCustomLayer(name, url, type, wms);
                            dialog.close();
                        }
                    }),
                    new Button({ text: "Remove All Custom", press: function () {
                        Object.keys(oCtrl._externalLayers).filter(id => id.startsWith("custom_"))
                            .forEach(id => oCtrl._disableExternalLayer(id));
                        MessageToast.show("Custom layers removed");
                    }}),
                    new Button({ text: "Close", press: function () { dialog.close(); } })
                ],
                afterClose: function () { dialog.destroy(); }
            });
            dialog.open();
        },

        _enableReferenceLayer: function (rl) {
            if (this._externalLayers[rl.id]) return;
            if (!rl.url) { MessageToast.show(`"${rl.name}" URL not configured — set it in Admin → Map Config`); return; }
            if (rl.type === "wms")          this._addWMSLayer(rl.id, rl.url, rl.wmsLayers || "0", rl.name);
            else if (rl.type === "geojson") this._addGeoJSONLayerFromURL(rl.id, rl.url, rl.name, rl.style);
            else if (rl.type === "xyz")     this._addXYZLayer(rl.id, rl.url, rl.name, rl.opacity);
            else if (rl.type === "esri_feature") this._addESRIFeatureLayer(rl.id, rl.url, rl.name);
        },

        _addCustomLayer: function (name, url, type, wmsLayers) {
            const id = "custom_" + Date.now();
            if (type === "wms")          this._addWMSLayer(id, url, wmsLayers, name);
            else if (type === "geojson") this._addGeoJSONLayerFromURL(id, url, name);
            else if (type === "xyz")     this._addXYZLayer(id, url, name);
            else if (type === "esri_feature") this._addESRIFeatureLayer(id, url, name);
        },

        _addWMSLayer: function (id, url, layers, name) {
            try {
                const lyr = L.tileLayer.wms(url, { layers: layers || "0", format: "image/png", transparent: true, opacity: 0.7, attribution: name || id });
                lyr.addTo(this._map);
                this._externalLayers[id] = lyr;
                MessageToast.show(`WMS layer "${name || id}" added`);
            } catch (err) { MessageToast.show(`WMS add failed: ${err.message}`); }
        },

        _addGeoJSONLayerFromURL: function (id, url, name, style) {
            const defStyle = style || { color: "#6400E4", weight: 2, fillOpacity: 0.1, opacity: 0.8 };
            fetch(url, { mode: "cors" })
                .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
                .then(data => {
                    const lyr = L.geoJSON(data, {
                        style: defStyle,
                        pointToLayer: (f, ll) => L.circleMarker(ll, { radius: 6, ...defStyle }),
                        onEachFeature: (feature, layer) => {
                            if (feature.properties) {
                                const rows = Object.entries(feature.properties).filter(([, v]) => v != null).slice(0, 10)
                                    .map(([k, v]) => `<tr><td style='padding:2px 8px;color:#8396A8;font-size:0.78rem'>${k}</td><td style='padding:2px 8px;font-size:0.78rem;font-weight:600'>${v}</td></tr>`).join("");
                                layer.bindPopup(`<div style='font-size:0.82rem'><b style='display:block;margin-bottom:4px'>${name}</b><table style='border-collapse:collapse'>${rows}</table></div>`);
                            }
                        }
                    });
                    lyr.addTo(this._map);
                    this._externalLayers[id] = lyr;
                    MessageToast.show(`GeoJSON layer "${name}" loaded`);
                })
                .catch(e => MessageToast.show(`GeoJSON load failed: ${e.message} — check CORS`));
        },

        _addXYZLayer: function (id, url, name, opacity) {
            try {
                const lyr = L.tileLayer(url, { attribution: name || id, opacity: opacity != null ? opacity : 0.8, maxZoom: 19 });
                lyr.addTo(this._map);
                this._externalLayers[id] = lyr;
                MessageToast.show(`Tile layer "${name || id}" added`);
            } catch (err) { MessageToast.show(`Tile layer failed: ${err.message}`); }
        },

        // ESRI Feature Service — fetch as GeoJSON via REST query (no SDK needed)
        _addESRIFeatureLayer: function (id, serviceUrl, name) {
            const queryUrl = `${serviceUrl}/query?where=1%3D1&outFields=*&f=geojson&resultRecordCount=1000`;
            this._addGeoJSONLayerFromURL(id, queryUrl, name + " (ESRI)");
        },

        _disableExternalLayer: function (id) {
            const lyr = this._externalLayers[id];
            if (lyr && this._map) { this._map.removeLayer(lyr); delete this._externalLayers[id]; }
        },

        // ══════════════════════════════════════════════════════════════
        // BRIDGE DATA & RENDERING
        // ══════════════════════════════════════════════════════════════
        _loadBridges: function () {
            AuthFetch.getJson(
                `${BASE}/Bridges?$top=9999&$select=bridgeId,name,region,state,condition,conditionRating,` +
                `postingStatus,structureType,clearanceHeightM,spanLengthM,yearBuilt,` +
                `inspectionDate,latitude,longitude,route_ID,nhvrRouteAssessed,scourRisk,` +
                `freightRoute,overMassRoute,highPriorityAsset,floodImpacted,` +
                `sourceRefURL,gazetteRef,assetOwner`
            )
            .then(j => {
                this._allBridges     = j.value || [];
                this._displayBridges = [];
                this._plotMarkers(this._allBridges, null);
                this._updateFilterCount(this._allBridges.length);
                if (this._pendingIds) { this._applyHighlight(this._pendingIds); this._pendingIds = null; }
                // If a non-map view is active, populate list
                if (this._viewMode !== "map") this._updateListModel(this._allBridges);
            })
            .catch(e => console.error("Bridge load error", e));
        },

        _loadVehicleClasses: function () {
            AuthFetch.getJson(`${BASE}/VehicleClasses?$select=ID,name`)
                .then(j => {
                    const sel = this.byId("filterVehicle");
                    if (!sel) return;
                    (j.value || []).forEach(v => sel.addItem(new Item({ key: v.ID, text: v.name })));
                })
                .catch(function (err) { Log.warning("[MapView] vehicle classes load failed", err); });
        },

        _plotMarkers    : function (bridges, hl) { this._renderActiveLayer(bridges, hl); },
        _applyHighlight : function (ids)          { this._renderActiveLayer(this._allBridges, ids); },

        onLayerToggle: function (e) {
            this._activeLayer = e.getParameter("item").getKey();
            const visible = this._displayBridges.length > 0 ? this._displayBridges : this._allBridges;
            this._renderActiveLayer(visible, null);
        },

        _renderActiveLayer: function (bridges, highlightIds) {
            if (this._clusterGroup) this._clusterGroup.clearLayers();
            if (this._lineGroup)    this._lineGroup.clearLayers();
            if (this._zoneGroup)    this._zoneGroup.clearLayers();
            this._markers    = [];
            this._markerById = {};

            if (this._activeLayer === "points" || this._activeLayer === "lines") {
                this._plotMarkersAndLines(bridges, highlightIds, this._activeLayer === "lines");
            } else {
                this._plotZones(bridges);
            }
        },

        _plotMarkersAndLines: function (bridges, highlightIds, showLines) {
            bridges.forEach(b => {
                const lat = parseFloat(b.latitude);
                const lng = parseFloat(b.longitude);
                if (isNaN(lat) || isNaN(lng)) return;

                const isHL  = Array.isArray(highlightIds) && highlightIds.includes(b.bridgeId);
                const color = this._getFeatureColor(b);
                const border = b.postingStatus === "CLOSED" ? "#BB0000"
                             : b.postingStatus === "POSTED"  ? "#E9730C" : "#fff";

                if (showLines) {
                    const span = (b.spanLengthM || 50) / 111320 * 0.8;
                    const line = L.polyline([[lat, lng - span], [lat, lng + span]], {
                        color  : isHL ? "#FFD700" : color,
                        weight : isHL ? 8 : 5,
                        opacity: 0.9
                    });
                    line.bindPopup(this._buildPopup(b), { className: "nhvr-popup-v2", maxWidth: 320 });
                    line.on("click", () => this._showDetail(b));
                    this._lineGroup.addLayer(line);
                    this._markerById[b.bridgeId] = line;
                    this._markers.push(line);
                } else {
                    const marker = L.circleMarker([lat, lng], {
                        radius     : isHL ? 14 : 9,
                        fillColor  : color,
                        color      : isHL ? "#FFD700" : border,
                        weight     : isHL ? 4 : (b.postingStatus !== "UNRESTRICTED" ? 3 : 2),
                        opacity    : 1,
                        fillOpacity: 0.92
                    });
                    marker.bindPopup(this._buildPopup(b), { className: "nhvr-popup-v2", maxWidth: 320 });
                    marker.on("click", () => this._showDetail(b));
                    if (this._clusterGroup) {
                        this._clusterGroup.addLayer(marker);
                    } else {
                        marker.addTo(this._map);
                    }
                    this._markers.push(marker);
                    this._markerById[b.bridgeId] = marker;
                }
            });

            if (highlightIds && highlightIds.length > 0) {
                const pts = highlightIds.filter(id => this._markerById[id]);
                if (pts.length > 0) {
                    const ll = pts.map(id => {
                        const l = this._markerById[id];
                        return l.getLatLng ? l.getLatLng() : l.getBounds().getCenter();
                    });
                    this._map.fitBounds(L.latLngBounds(ll), { padding: [80, 80], maxZoom: 13 });
                }
                if (highlightIds.length === 1) {
                    const b = this._allBridges.find(x => x.bridgeId === highlightIds[0]);
                    if (b) this._showDetail(b);
                }
            }
        },

        _plotZones: function (bridges) {
            bridges.forEach(b => {
                const lat = parseFloat(b.latitude);
                const lng = parseFloat(b.longitude);
                if (isNaN(lat) || isNaN(lng)) return;
                const isClosed = b.postingStatus === "CLOSED";
                const isPosted = b.postingStatus === "POSTED";
                if (!isClosed && !isPosted && b.condition !== "CRITICAL") return;
                const color  = isClosed ? "#BB0000" : isPosted ? "#E9730C" : "#6A6D70";
                const zone   = L.circle([lat, lng], {
                    radius: isClosed ? 800 : 500,
                    fillColor: color, color, weight: 2, fillOpacity: 0.18, opacity: 0.7,
                    dashArray: isClosed ? null : "6,4"
                });
                zone.bindPopup(this._buildPopup(b), { className: "nhvr-popup-v2", maxWidth: 320 });
                zone.on("click", () => this._showDetail(b));
                this._zoneGroup.addLayer(zone);
                this._markerById[b.bridgeId] = zone;
            });
        },

        // ══════════════════════════════════════════════════════════════
        // ELEGANT POPUP
        // ══════════════════════════════════════════════════════════════
        _buildPopup: function (b) {
            const cr    = b.conditionRating;
            const cColor = cr >= 7 ? "#16a34a" : cr >= 5 ? "#d97706" : cr ? "#dc2626" : "#6b7280";
            const cLabel = cr >= 7 ? "Good" : cr >= 5 ? "Fair" : cr ? "Poor" : "—";
            const postColor = { UNRESTRICTED: "#16a34a", POSTED: "#d97706", CLOSED: "#dc2626" };
            const postBg    = postColor[b.postingStatus] || "#6b7280";
            const scourColor = { EXTREME:"#dc2626", HIGH:"#ea580c", MEDIUM:"#d97706", LOW:"#16a34a" };
            const scourBg    = scourColor[b.scourRisk] || "#6b7280";

            const badge = (text, bg) =>
                `<span style="background:${bg};color:#fff;padding:2px 8px;border-radius:20px;font-size:0.72rem;font-weight:600;white-space:nowrap">${text}</span>`;

            const row = (label, value) =>
                `<div style="display:flex;justify-content:space-between;align-items:center;padding:3px 0;border-bottom:1px solid #f1f5f9">
                    <span style="color:#94a3b8;font-size:0.75rem;font-weight:500">${label}</span>
                    <span style="color:#1e293b;font-size:0.78rem;font-weight:600">${value || "—"}</span>
                </div>`;

            const nhvrBadge = b.nhvrRouteAssessed
                ? badge("NHVR ✓", "#0070F2")
                : badge("Not Assessed", "#94a3b8");

            return `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;min-width:260px">
                <!-- Header strip with condition colour -->
                <div style="background:${cColor};color:#fff;padding:10px 14px;border-radius:8px 8px 0 0;margin:-13px -13px 0">
                    <div style="font-size:0.95rem;font-weight:700;margin-bottom:3px">${b.name || b.bridgeId}</div>
                    <div style="font-size:0.76rem;opacity:0.88">${b.bridgeId} · ${b.state || ""}${b.region ? " — " + b.region : ""}</div>
                </div>
                <!-- 3-column stats strip -->
                <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:0;border-bottom:1px solid #e2e8f0;margin-top:10px">
                    <div style="text-align:center;padding:6px 4px;border-right:1px solid #e2e8f0">
                        <div style="font-size:1.1rem;font-weight:700;color:${cColor}">${cr || "—"}</div>
                        <div style="font-size:0.68rem;color:#94a3b8">RATING</div>
                    </div>
                    <div style="text-align:center;padding:6px 4px;border-right:1px solid #e2e8f0">
                        <div style="font-size:1.1rem;font-weight:700;color:#1e293b">${b.clearanceHeightM != null ? b.clearanceHeightM + "m" : "—"}</div>
                        <div style="font-size:0.68rem;color:#94a3b8">CLEARANCE</div>
                    </div>
                    <div style="text-align:center;padding:6px 4px">
                        <div style="font-size:1.1rem;font-weight:700;color:#1e293b">${b.yearBuilt || "—"}</div>
                        <div style="font-size:0.68rem;color:#94a3b8">BUILT</div>
                    </div>
                </div>
                <!-- Detail rows -->
                <div style="padding:6px 0">
                    ${row("Condition", `<span style="color:${cColor};font-weight:700">${cLabel}</span>`)}
                    ${b.structureType ? row("Structure", b.structureType.replace(/_/g," ")) : ""}
                    ${b.spanLengthM   ? row("Span Length", b.spanLengthM + " m") : ""}
                    ${b.scourRisk     ? row("Scour Risk", badge(b.scourRisk, scourBg)) : ""}
                    ${row("Status", badge(b.postingStatus || "UNKNOWN", postBg))}
                    ${row("NHVR", nhvrBadge)}
                </div>
                <!-- Action footer -->
                <div style="display:flex;gap:6px;margin-top:8px;border-top:1px solid #f1f5f9;padding-top:8px">
                    <a href="#/BridgeDetail/${b.bridgeId}"
                       style="flex:1;text-align:center;padding:5px;background:#0070F2;color:#fff;border-radius:6px;font-size:0.75rem;font-weight:600;text-decoration:none">
                        Full Record →
                    </a>
                    ${b.sourceRefURL
                        ? `<a href="${b.sourceRefURL}" target="_blank"
                              style="flex:1;text-align:center;padding:5px;background:#f8fafc;border:1px solid #e2e8f0;color:#475569;border-radius:6px;font-size:0.75rem;font-weight:600;text-decoration:none">
                              Open Data ↗
                           </a>`
                        : ""}
                </div>
            </div>`;
        },

        // ── Condition / status colour helpers ─────────────────────────
        _conditionColor: function (r) {
            if (r == null) return null;
            if (r >= 7) return "#27ae60";
            if (r >= 5) return "#f39c12";
            return "#e74c3c";
        },

        _statusColor: function (s) {
            return { UNRESTRICTED: "#107E3E", POSTED: "#E9730C", CLOSED: "#BB0000" }[s] || "#6A6D70";
        },

        // ══════════════════════════════════════════════════════════════
        // DETAIL SIDE PANEL
        // ══════════════════════════════════════════════════════════════
        _showDetail: function (b) {
            this._selectedId = b.bridgeId;
            const panel = this.byId("detailPanel");
            if (panel) panel.setVisible(true);

            this.byId("detPanelTitle").setText(b.name || b.bridgeId);

            const condState = { GOOD:"Success", FAIR:"Warning", POOR:"Error", CRITICAL:"Error" };
            const postState = { UNRESTRICTED:"Success", POSTED:"Warning", CLOSED:"Error" };

            const setStatus = (id, text, stateKey, stateMap) => {
                const c = this.byId(id);
                if (c) { c.setText(text || "—"); c.setState(stateMap[stateKey] || "None"); }
            };
            const setText = (id, v) => { const c = this.byId(id); if (c) c.setText(String(v || "—")); };

            setStatus("detConditionStatus", b.condition, b.condition, condState);
            setStatus("detPostingStatus",   b.postingStatus, b.postingStatus, postState);

            // Metric strip
            setText("detMetricRating",    b.conditionRating ? `${b.conditionRating}/10` : "—");
            setText("detMetricClearance", b.clearanceHeightM != null ? `${b.clearanceHeightM} m` : "—");
            setText("detMetricYear",      b.yearBuilt || "—");

            setText("detBridgeId",     b.bridgeId);
            setText("detRegion",       `${b.region || "—"}, ${b.state || "—"}`);
            setText("detStructureType", b.structureType || "—");
            setText("detClearance",    b.clearanceHeightM != null ? `${b.clearanceHeightM} m` : "—");
            setText("detSpan",         b.spanLengthM     != null ? `${b.spanLengthM} m`     : "—");
            setText("detInspection",   b.inspectionDate ? new Date(b.inspectionDate).toLocaleDateString("en-AU") : "Not recorded");
            setText("detCoords",       `${b.latitude || "—"}, ${b.longitude || "—"}`);

            // Badges
            const scourColor = { EXTREME:"Error", HIGH:"Error", MEDIUM:"Warning", LOW:"Success" };
            const scourBadge = this.byId("detScourStatus");
            if (scourBadge) {
                scourBadge.setText(b.scourRisk ? `Scour: ${b.scourRisk}` : "");
                scourBadge.setState(scourColor[b.scourRisk] || "None");
                scourBadge.setVisible(!!b.scourRisk);
            }
            const freightBadge = this.byId("detFreightStatus");
            if (freightBadge) { freightBadge.setText(b.freightRoute ? "Freight Route" : ""); freightBadge.setVisible(!!b.freightRoute); }
            const nhvrBadge = this.byId("detNhvrStatus");
            if (nhvrBadge) { nhvrBadge.setText(b.nhvrRouteAssessed ? "NHVR Assessed" : "Not Assessed"); nhvrBadge.setState(b.nhvrRouteAssessed ? "Success" : "None"); }

            // Route
            if (b.route_ID) {
                AuthFetch.getJson(`${BASE}/Routes(${b.route_ID})?$select=routeCode,description`)
                    .then(j => setText("detRoute", `${j.routeCode} — ${j.description || ""}`))
                    .catch(() => setText("detRoute", "—"));
            } else {
                setText("detRoute", "No route assigned");
            }

            this._loadBridgeRestrictions(b.bridgeId);
        },

        _loadBridgeRestrictions: function (bridgeId) {
            const list = this.byId("detRestrictionList");
            if (!list) return;
            list.destroyItems();
            AuthFetch.getJson(
                `${BASE}/Bridges?$filter=bridgeId eq '${_odataStr(bridgeId)}'` +
                `&$expand=restrictions($filter=status eq 'ACTIVE';$select=restrictionType,value,unit,permitRequired)` +
                `&$select=bridgeId`
            )
            .then(j => {
                const rlist = (j.value && j.value[0] && j.value[0].restrictions) || [];
                if (rlist.length === 0) {
                    list.addItem(new StandardListItem({ title: "No active restrictions", icon: "sap-icon://accept" }));
                    return;
                }
                rlist.forEach(r =>
                    list.addItem(new StandardListItem({
                        title      : `${r.restrictionType}: ${r.value} ${r.unit}`,
                        description: r.permitRequired ? "Permit Required" : "",
                        icon       : "sap-icon://alert",
                        iconInset  : false,
                        info       : "ACTIVE",
                        infoState  : "Warning"
                    }))
                );
            })
            .catch(function (err) { Log.warning("[MapView] restrictions load failed", err); });
        },

        onCloseDetail: function () {
            const panel = this.byId("detailPanel");
            if (panel) panel.setVisible(false);
            this._selectedId = null;
        },

        onOpenBridgeDetail: function () {
            if (this._selectedId) {
                this.getOwnerComponent().getRouter().navTo("BridgeDetail", { bridgeId: this._selectedId });
            }
        },

        onNavToInspection: function () {
            if (this._selectedId) {
                this.getOwnerComponent().getRouter().navTo("InspectionCreate", { bridgeId: this._selectedId });
            }
        },

        onZoomToSelected: function () {
            if (this._selectedId && this._map) {
                const marker = this._markerById[this._selectedId];
                if (marker) {
                    const ll = marker.getLatLng ? marker.getLatLng() : null;
                    if (ll) { this._map.setView(ll, 15); marker.openPopup && marker.openPopup(); }
                }
            }
        },

        // ══════════════════════════════════════════════════════════════
        // NAVIGATION & UTILITIES
        // ══════════════════════════════════════════════════════════════
        onCenterMap: function () {
            const cfg = this._mapConfig;
            const lat = cfg ? (cfg.defaultCenter_lat || -27.0) : -27.0;
            const lng = cfg ? (cfg.defaultCenter_lng || 133.0) : 133.0;
            const zoom = cfg ? (cfg.defaultZoom || 5) : 5;
            if (this._map) this._map.setView([lat, lng], zoom);
        },

        onRefresh: function () {
            if (this._map) {
                this._displayBridges = [];
                this._polygonSelection = [];
                this._loadBridges();
                MessageToast.show("Map data refreshed");
            }
        },

        onNavHome     : function () { this._navTo("Home"); },
        onNavToBridges: function () { this._navTo("BridgesList"); },

        // ── Map → Bridge List filter sync ────────────────────────────
        onViewSelectionInList: function () {
            const bridges = this._polygonSelection.length > 0 ? this._polygonSelection : [];
            if (bridges.length === 0) {
                MessageToast.show("No polygon selection active. Draw a shape on the map first.");
                return;
            }
            const ids = bridges.map(b => b.ID || b.id).filter(Boolean);
            try {
                const payload = JSON.stringify({ bridgeIds: ids, setAt: Date.now() });
                localStorage.setItem("nhvr_map_selection", payload);
                // v4.7.6: parallel key for Restrictions list round-trip
                localStorage.setItem("nhvr_map_restriction_selection", payload);
            } catch (_) { /* localStorage unavailable */ }
            this._navTo("BridgesList");
        },

        // v4.7.6: Map → Restrictions List filter sync
        onViewSelectionInRestrictions: function () {
            const bridges = this._polygonSelection.length > 0 ? this._polygonSelection : [];
            if (bridges.length === 0) {
                MessageToast.show("No polygon selection active. Draw a shape on the map first.");
                return;
            }
            const ids = bridges.map(b => b.ID || b.id).filter(Boolean);
            try {
                localStorage.setItem("nhvr_map_restriction_selection", JSON.stringify({ bridgeIds: ids, setAt: Date.now() }));
            } catch (_) { /* localStorage unavailable */ }
            this._navTo("RestrictionsList");
        },

        _navTo: function (name, params) {
            this.getOwnerComponent().getRouter().navTo(name, params || {});
        },

        // ── Provider switching via MapProviderFactory ─────────────────
        onSwitchMapProvider: function (providerKey) {
            if (this._mapProvider && this._mapProvider.name === providerKey) return;

            try {
                // Create new provider
                var config = {
                    apiKey: providerKey === "google" ? (this._mapApiConfig && this._mapApiConfig.googleMapsApiKey) :
                            providerKey === "esri" ? (this._mapApiConfig && this._mapApiConfig.esriApiKey) : ""
                };
                var newProvider = MapProviderFactory.create(providerKey, config);

                // Store current center/zoom before switching
                var currentCenter, currentZoom;
                if (this._map) {
                    var c = this._map.getCenter();
                    currentCenter = [c.lat, c.lng];
                    currentZoom = this._map.getZoom();
                }

                // Destroy old map
                if (this._map) {
                    this._map.remove();
                    this._map = null;
                }

                // Initialize new provider
                var self = this;
                newProvider.init("nhvr-leaflet-map", {
                    center: currentCenter || [-25, 134],
                    zoom: currentZoom || 4
                }).then(function () {
                    self._mapProvider = newProvider;
                    // If Leaflet provider, also keep _map reference for backward compat
                    if (newProvider.getMap) {
                        self._map = newProvider.getMap();
                    }
                    // Reload bridge markers
                    self._loadBridgeData();
                    sap.m.MessageToast.show("Map switched to " + providerKey);
                }).catch(function (err) {
                    sap.m.MessageBox.error("Failed to switch map: " + err.message + ". Falling back to OpenStreetMap.");
                    // Fallback to Leaflet
                    self.onSwitchMapProvider("osm-leaflet");
                });
            } catch (e) {
                sap.m.MessageToast.show("Provider not available: " + e.message);
            }
        },

        onExit: function () {
            if (this._activeDrawHandler) try { this._activeDrawHandler.disable(); } catch (e) { /* ignore */ }
            if (this._map) { this._map.remove(); this._map = null; }
        }
    });
});
