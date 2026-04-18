# Claude Code Prompt: Port Interactive Map View to Any CAP/UI5 App

> **Copy-paste this entire prompt into a new Claude Code session** pointed at your target CAP/UI5 application. It will build a full-featured interactive Map View tile (modelled after the BIS Bridge Management app) and wire it to any object type you specify.

---

## 🎯 MISSION

Build a production-ready **Interactive Map View** for the `{ENTITY_NAME}` entity in this CAP/UI5 application. The Map View must include:

1. **Leaflet map** with OSM/Satellite/Topo/Dark base layer switching
2. **Marker clustering** (grouped pins at low zoom)
3. **Multiple symbology modes** (color by rating/status/type/year)
4. **Collapsible filter sidebar** with multi-select checkboxes + range sliders
5. **Drawing tools** (polygon / rectangle / circle) for spatial selection
6. **Spatial selection stats** (count, area, filtered stats) in bottom-left overlay
7. **View mode toggle** (Map / Split / List)
8. **Popup cards** on marker click with full details + navigation link
9. **Detail side panel** (sliding right drawer, 320px)
10. **Export to CSV and GeoJSON** (respects current filter + spatial selection)
11. **Reference/overlay layer manager** (GeoJSON, WMS, XYZ tile layers, ESRI Feature Services)
12. **Deep-link support** (`#/Map?objectIds=1,2,3` auto-selects those markers)

---

## 📋 BEFORE YOU START — FILL IN THE BLANKS

Replace these placeholders throughout this document and the generated code:

| Placeholder | Meaning | Example |
|-------------|---------|---------|
| `{ENTITY_NAME}` | Singular name of the object | `Customer` / `Asset` / `Store` / `Sensor` |
| `{ENTITY_NAME_LC}` | Lowercase version | `customer` / `asset` / `store` / `sensor` |
| `{ENTITY_NAME_PLURAL}` | Plural OData entity set name | `Customers` / `Assets` / `Stores` / `Sensors` |
| `{ENTITY_KEY_FIELD}` | Business-key field name | `customerId` / `assetId` / `storeCode` |
| `{ENTITY_LABEL}` | Display field | `name` / `label` / `displayName` |
| `{LAT_FIELD}` | WGS84 latitude field | `latitude` / `lat` / `geoLat` |
| `{LNG_FIELD}` | WGS84 longitude field | `longitude` / `lng` / `geoLng` |
| `{SYMBOLOGY_FIELD}` | Field for color-coding markers | `priority` / `status` / `rating` |
| `{DETAIL_ROUTE}` | Route to open on "Full Record" click | `CustomerDetail` / `AssetDetail` |
| `{BASE_ODATA}` | Service base path | `/my-service` / `/customer-api` |
| `{APP_NAMESPACE}` | UI5 namespace prefix | `com.acme.customers` / `org.bms` |

---

## 🚦 PHASE 0 — VERIFY PREREQUISITES

Before writing any code, confirm:

```bash
# Does the entity exist with lat/lng fields?
grep -rn "entity {ENTITY_NAME}\|{ENTITY_NAME_PLURAL} :" db/schema/ srv/

# If {LAT_FIELD}/{LNG_FIELD} do NOT exist, add them to the CDS schema:
# entity {ENTITY_NAME} { ... latitude: Decimal(10,7); longitude: Decimal(10,7); ... }
```

**MANDATORY**: `{ENTITY_NAME}` must have `latitude` and `longitude` columns (any name — map them via the placeholders above). If missing, stop and tell the user; they need to add them and seed data first.

---

## 📦 PHASE 1 — ADD CDN LIBRARIES TO index.html

Locate the app's main `index.html` (usually `app/{app}/webapp/index.html`) and add these CDN links **before** the SAP UI5 bootstrap:

```html
<!-- Leaflet 1.9.4 — core mapping -->
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css" />
<script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js"></script>

<!-- MarkerCluster 1.5.3 — grouped pins -->
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet.markercluster/1.5.3/MarkerCluster.css" />
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet.markercluster/1.5.3/MarkerCluster.Default.css" />
<script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet.markercluster/1.5.3/leaflet.markercluster.js"></script>

<!-- Leaflet.Draw 1.0.4 — polygon/rectangle/circle selection -->
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet.draw/1.0.4/leaflet.draw.css"/>
<script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet.draw/1.0.4/leaflet.draw.js"></script>

<!-- Turf.js 6.5.0 — polygon area calculation -->
<script src="https://cdnjs.cloudflare.com/ajax/libs/Turf.js/6.5.0/turf.min.js"></script>
```

Also update the **Content-Security-Policy** in `server.js` (or wherever CSP is set) to permit these sources:

```javascript
"script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: https://cdnjs.cloudflare.com; " +
"style-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com; " +
"img-src 'self' data: blob: https://*.tile.openstreetmap.org https://*.arcgisonline.com; " +
"connect-src 'self' https://*.arcgisonline.com https://raw.githubusercontent.com https://tiles.openfreemap.org; " +
"worker-src 'self' blob:;"
```

---

## 📦 PHASE 2 — ADD ODATA SERVICE PROJECTIONS (Optional but Recommended)

Add a **MapConfig** entity to `db/schema/` (e.g. `db/schema/map.cds`):

```cds
namespace {APP_NAMESPACE};

entity MapConfig {
    key configKey            : String(50);      // "DEFAULT", "ADMIN", etc.
        isActive             : Boolean default true;
        defaultCenter_lat    : Decimal(10,7);
        defaultCenter_lng    : Decimal(10,7);
        defaultZoom          : Integer default 5;
        defaultBaseMap       : String(30) default 'osm';
        clusteringEnabled    : Boolean default true;
        clusterRadius        : Integer default 60;
        maxZoomBeforeCluster : Integer default 15;
        customBaseMaps       : LargeString;     // JSON array
        referenceLayers      : LargeString;     // JSON array
        drawConfig           : LargeString;     // JSON object
        exportColumns        : LargeString;     // JSON array
}
```

Expose via service (`srv/services/{ENTITY_NAME_LC}.cds`):

```cds
using {APP_NAMESPACE} from '../../db/schema';
extend service {AppService} with {
    entity MapConfigs @(restrict: [
        { grant: ['READ'], to: 'authenticated-user' },
        { grant: ['CREATE','UPDATE','DELETE'], to: 'Admin' }
    ]) as projection on {APP_NAMESPACE}.MapConfig;
}
```

Seed `db/data/{APP_NAMESPACE}-MapConfig.csv`:

```csv
configKey,isActive,defaultCenter_lat,defaultCenter_lng,defaultZoom,defaultBaseMap,clusteringEnabled,clusterRadius
DEFAULT,true,-27.0,133.0,5,osm,true,60
```

---

## 📄 PHASE 3 — CREATE THE VIEW FILE

Create `app/{app}/webapp/view/MapView.view.xml` with this structure. **Replace every `{...}` placeholder.**

```xml
<mvc:View
    controllerName="{APP_NAMESPACE}.controller.MapView"
    xmlns:mvc="sap.ui.core.mvc"
    xmlns="sap.m"
    xmlns:core="sap.ui.core"
    xmlns:f="sap.f"
    xmlns:layout="sap.ui.layout">

    <Page showHeader="false" enableScrolling="false">
        <VBox class="nhvrMapRoot" height="100vh">

            <!-- ═══ TOP TOOLBAR ═══ -->
            <OverflowToolbar id="mapToolbar">
                <Button icon="sap-icon://home" press=".onNavHome" tooltip="Home"/>
                <Title text="{ENTITY_NAME} Map" level="H3"/>
                <ToolbarSpacer/>

                <SegmentedButton id="viewModeSeg" selectedKey="map" selectionChange=".onViewModeChange">
                    <items>
                        <SegmentedButtonItem key="map" icon="sap-icon://map" tooltip="Map"/>
                        <SegmentedButtonItem key="split" icon="sap-icon://vertical-bar-chart-2" tooltip="Split"/>
                        <SegmentedButtonItem key="list" icon="sap-icon://list" tooltip="List"/>
                    </items>
                </SegmentedButton>

                <Select id="symbologySelect" change=".onSymbologyChange">
                    <core:Item key="{SYMBOLOGY_FIELD}" text="By {SYMBOLOGY_FIELD}"/>
                    <core:Item key="status" text="By Status"/>
                </Select>

                <Select id="baseLayerSelect" change=".onBaseLayerChange">
                    <core:Item key="osm" text="Street"/>
                    <core:Item key="sat" text="Satellite"/>
                    <core:Item key="topo" text="Topo"/>
                    <core:Item key="dark" text="Dark"/>
                </Select>

                <Button id="btnToggleFilters" icon="sap-icon://filter" press=".onToggleFilters" tooltip="Filters"/>
                <ObjectStatus id="filterCountBadge" text="" state="Information" visible="false"/>

                <!-- Drawing tools -->
                <Button id="btnDrawPoly" icon="sap-icon://multi-select" press=".onStartPolygonDraw" tooltip="Draw polygon"/>
                <Button id="btnDrawRect" icon="sap-icon://border" press=".onStartRectDraw" tooltip="Draw rectangle"/>
                <Button id="btnDrawCircle" icon="sap-icon://circle-task" press=".onStartCircleDraw" tooltip="Draw circle"/>
                <Button id="btnClearDraw" icon="sap-icon://clear-all" press=".onClearDrawing" tooltip="Clear drawing" visible="false"/>

                <Button icon="sap-icon://download" text="CSV" press=".onExportCsv"/>
                <Button icon="sap-icon://globe" text="GeoJSON" press=".onExportGeoJSON"/>
                <Button icon="sap-icon://layer" press=".onOpenLayerManager" tooltip="Reference layers"/>
                <Button icon="sap-icon://home" press=".onRecenterMap" tooltip="Re-center"/>
                <Button icon="sap-icon://refresh" press=".onRefresh" tooltip="Refresh"/>
            </OverflowToolbar>

            <!-- ═══ MAIN ROW ═══ -->
            <HBox id="mapMainRow" class="nhvrMapMainRow" height="100%">

                <!-- Filter sidebar (left) -->
                <VBox id="filterSidebar" class="nhvrMapFilterSidebar" visible="false">
                    <HBox class="sapUiSmallMargin" alignItems="Center">
                        <Title text="Filter {ENTITY_NAME}s" level="H4"/>
                        <ToolbarSpacer/>
                        <Button icon="sap-icon://decline" type="Transparent" press=".onToggleFilters"/>
                    </HBox>
                    <Text id="filterResultCount" text="" class="sapUiTinyMargin"/>
                    <ScrollContainer vertical="true" horizontal="false" height="100%" class="nhvrFilterScroll">
                        <!-- TODO: Add your entity-specific filter panels here.
                             Example: state checkboxes, condition range, status checkboxes -->
                        <Panel headerText="Status" expandable="true" expanded="true">
                            <MultiComboBox id="filterStatus" width="100%" selectionChange=".onFilterChange">
                                <core:Item key="ACTIVE" text="Active"/>
                                <core:Item key="INACTIVE" text="Inactive"/>
                            </MultiComboBox>
                        </Panel>
                        <!-- Add more filter panels as needed -->
                    </ScrollContainer>
                    <HBox class="sapUiSmallMargin" justifyContent="SpaceBetween">
                        <Button text="Apply" type="Emphasized" press=".onApplyFilters"/>
                        <Button text="Clear All" press=".onClearFilters"/>
                    </HBox>
                </VBox>

                <!-- Map + List content area -->
                <HBox id="mapContentArea" class="nhvrMapContentArea" width="100%">

                    <!-- Map section -->
                    <VBox id="mapSection" class="nhvrMapSection" width="100%">
                        <core:HTML id="mapHolder"
                            content="&lt;div id='leaflet-map-container' style='width:100%;height:100%;min-height:500px;'&gt;&lt;/div&gt;"
                            afterRendering=".onMapHolderRendered"/>
                    </VBox>

                    <!-- List section (hidden by default) -->
                    <VBox id="listSection" class="nhvrMapListSection" visible="false">
                        <Toolbar>
                            <Title text="{ENTITY_NAME}s"/>
                            <Text id="listCountText" text=""/>
                            <ToolbarSpacer/>
                            <Button text="View in {ENTITY_NAME_PLURAL} List" press=".onViewInList"/>
                        </Toolbar>
                        <SearchField id="listSearch" liveChange=".onListSearch" placeholder="Search..."/>
                        <Table id="resultTable" items="{listModel>/items}" growing="true" growingThreshold="50">
                            <columns>
                                <Column><Text text="{ENTITY_KEY_FIELD}"/></Column>
                                <Column><Text text="{ENTITY_LABEL}"/></Column>
                                <Column><Text text="Status"/></Column>
                                <Column><Text text="Actions"/></Column>
                            </columns>
                            <items>
                                <ColumnListItem>
                                    <Link text="{listModel>{ENTITY_KEY_FIELD}}" press=".onOpenDetail"/>
                                    <Text text="{listModel>{ENTITY_LABEL}}"/>
                                    <ObjectStatus text="{listModel>status}" state="Information"/>
                                    <Button icon="sap-icon://locate-me" press=".onLocateOnMap"/>
                                </ColumnListItem>
                            </items>
                        </Table>
                    </VBox>
                </HBox>

                <!-- Detail panel (right, hidden by default) -->
                <VBox id="detailPanel" class="nhvrDetailPanelV2" visible="false"/>

            </HBox>
        </VBox>
    </Page>
</mvc:View>
```

---

## 📄 PHASE 4 — CREATE THE CONTROLLER FILE

Create `app/{app}/webapp/controller/MapView.controller.js`:

```javascript
sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageToast",
    "sap/base/Log"
], function (Controller, JSONModel, MessageToast, Log) {
    "use strict";

    var BASE = "{BASE_ODATA}";

    return Controller.extend("{APP_NAMESPACE}.controller.MapView", {

        _map: null,
        _clusterGroup: null,
        _drawnItems: null,
        _activeDrawHandler: null,
        _allObjects: [],
        _displayObjects: [],
        _markerById: {},
        _selectedObjects: [],
        _symbologyMode: "{SYMBOLOGY_FIELD}",
        _viewMode: "map",

        onInit: function () {
            this.getView().setModel(new JSONModel({ items: [] }), "listModel");

            var oRouter = this.getOwnerComponent().getRouter();
            var oRoute = oRouter.getRoute("MapView");
            if (oRoute) oRoute.attachPatternMatched(this._onRouteMatched, this);
        },

        _onRouteMatched: function (e) {
            // Support deep-link: #/Map?objectIds=1,2,3
            var args = e.getParameter("arguments") || {};
            var query = args["?query"] || {};
            if (query.objectIds) {
                this._pendingIds = String(query.objectIds).split(",").map(function (s) { return s.trim(); });
            }
        },

        // ═══ MAP INITIALIZATION ═══

        onMapHolderRendered: function () {
            if (this._map) return;  // already initialised
            var self = this;
            setTimeout(function () { self._initMap(); }, 50);
        },

        _initMap: function () {
            if (typeof L === "undefined") {
                Log.error("[MapView] Leaflet not loaded — check index.html CDN links");
                return;
            }

            var self = this;

            // 1. Load MapConfig (fallback to defaults if unavailable)
            this._loadMapConfig().then(function (cfg) {
                var centerLat = cfg.defaultCenter_lat || -27.0;
                var centerLng = cfg.defaultCenter_lng || 133.0;
                var zoom = cfg.defaultZoom || 5;

                // 2. Create map
                self._map = L.map("leaflet-map-container", {
                    center: [centerLat, centerLng],
                    zoom: zoom,
                    zoomControl: true
                });

                // 3. Add base layer
                self._addBaseLayer(cfg.defaultBaseMap || "osm");

                // 4. Create cluster group + layer groups
                self._clusterGroup = L.markerClusterGroup({
                    maxClusterRadius: cfg.clusterRadius || 60,
                    disableClusteringAtZoom: cfg.maxZoomBeforeCluster || 15,
                    iconCreateFunction: function (cluster) {
                        var count = cluster.getChildCount();
                        var size = count < 10 ? 36 : (count < 100 ? 44 : 54);
                        return L.divIcon({
                            html: "<div class='nhvr-cluster-inner' style='width:" + size + "px;height:" + size + "px;'>" + count + "</div>",
                            className: "nhvr-cluster",
                            iconSize: [size, size]
                        });
                    }
                });
                self._map.addLayer(self._clusterGroup);

                // 5. Drawn-items feature group (for polygon/rect/circle)
                self._drawnItems = new L.FeatureGroup();
                self._map.addLayer(self._drawnItems);
                self._initDrawHandlers();

                // 6. Add legend control
                self._addLegend();

                // 7. Load data
                self._loadObjects();
            });
        },

        _loadMapConfig: function () {
            return fetch(BASE + "/MapConfigs?$filter=configKey eq 'DEFAULT' and isActive eq true", {
                headers: { Accept: "application/json" }, credentials: "include"
            })
            .then(function (r) { return r.ok ? r.json() : { value: [] }; })
            .then(function (j) { return (j.value && j.value[0]) || {}; })
            .catch(function () { return {}; });
        },

        _addBaseLayer: function (key) {
            if (this._baseLayer) this._map.removeLayer(this._baseLayer);
            var layer;
            switch (key) {
                case "sat":
                    layer = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", { attribution: "ESRI", maxZoom: 19 });
                    break;
                case "topo":
                    layer = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}", { attribution: "ESRI", maxZoom: 19 });
                    break;
                case "dark":
                    layer = L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png", { attribution: "© CartoDB", maxZoom: 19 });
                    break;
                default:
                    layer = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap", maxZoom: 19 });
            }
            this._baseLayer = layer;
            layer.addTo(this._map);
            layer.bringToBack();
        },

        // ═══ DATA LOADING ═══

        _loadObjects: function () {
            var self = this;
            fetch(BASE + "/{ENTITY_NAME_PLURAL}?$top=9999&$select={ENTITY_KEY_FIELD},{ENTITY_LABEL},{LAT_FIELD},{LNG_FIELD},{SYMBOLOGY_FIELD},status", {
                headers: { Accept: "application/json" }, credentials: "include"
            })
            .then(function (r) { return r.ok ? r.json() : { value: [] }; })
            .then(function (j) {
                self._allObjects = (j.value || []).filter(function (o) {
                    return o[`{LAT_FIELD}`] && o[`{LNG_FIELD}`];
                });
                self._displayObjects = self._allObjects.slice();
                self._plotMarkers();
                self._updateListModel();

                // If deep-linked IDs pending, highlight them
                if (self._pendingIds && self._pendingIds.length > 0) {
                    self._highlightAndFit(self._pendingIds);
                    self._pendingIds = null;
                }
            })
            .catch(function (err) { Log.error("[MapView] load failed", err); });
        },

        // ═══ MARKER RENDERING ═══

        _plotMarkers: function () {
            if (!this._clusterGroup) return;
            this._clusterGroup.clearLayers();
            this._markerById = {};
            var self = this;

            this._displayObjects.forEach(function (obj) {
                var color = self._getFeatureColor(obj);
                var marker = L.circleMarker([obj["{LAT_FIELD}"], obj["{LNG_FIELD}"]], {
                    radius: 9,
                    fillColor: color,
                    color: self._getBorderColor(obj),
                    weight: 2,
                    fillOpacity: 0.85
                });
                marker.bindPopup(self._buildPopup(obj));
                marker.on("click", function () { self._showDetail(obj); });
                self._markerById[obj["{ENTITY_KEY_FIELD}"]] = marker;
                self._clusterGroup.addLayer(marker);
            });
        },

        _getFeatureColor: function (obj) {
            // Customize per entity — this example uses a generic good/fair/poor scheme
            var val = obj[this._symbologyMode];
            if (typeof val === "number") {
                if (val >= 7) return "#27ae60";   // green
                if (val >= 5) return "#f39c12";   // amber
                return "#e74c3c";                  // red
            }
            // Categorical fallback
            var map = { ACTIVE: "#27ae60", INACTIVE: "#95a5a6", CRITICAL: "#e74c3c" };
            return map[val] || "#0070F2";
        },

        _getBorderColor: function (obj) {
            if (obj.status === "CLOSED" || obj.status === "INACTIVE") return "#BB0000";
            if (obj.status === "POSTED" || obj.status === "WARNING") return "#E9730C";
            return "#FFFFFF";
        },

        _buildPopup: function (obj) {
            var esc = function (s) { return String(s == null ? "" : s).replace(/[<>&"']/g, function (c) { return { "<":"&lt;",">":"&gt;","&":"&amp;","\"":"&quot;","'":"&#39;" }[c]; }); };
            var id = esc(obj["{ENTITY_KEY_FIELD}"]);
            var label = esc(obj["{ENTITY_LABEL}"]);
            var sym = esc(obj[this._symbologyMode]);
            return [
                "<div class='nhvr-popup-v2' style='min-width:240px;'>",
                "<div style='font-weight:700;font-size:14px;margin-bottom:6px;'>" + label + "</div>",
                "<div style='color:#666;font-size:12px;'>" + id + "</div>",
                "<div style='margin-top:8px;font-size:12px;'>", this._symbologyMode, ": <strong>" + sym + "</strong></div>",
                "<div style='margin-top:10px;'><a href='#/{DETAIL_ROUTE}/" + encodeURIComponent(id) + "' style='color:#0070F2;'>Open Full Record →</a></div>",
                "</div>"
            ].join("");
        },

        _addLegend: function () {
            var legend = L.control({ position: "bottomright" });
            var self = this;
            legend.onAdd = function () {
                var div = L.DomUtil.create("div", "nhvr-legend-card");
                div.innerHTML = "<strong>Legend</strong><br/>" +
                    "<span style='color:#27ae60'>●</span> Good<br/>" +
                    "<span style='color:#f39c12'>●</span> Fair<br/>" +
                    "<span style='color:#e74c3c'>●</span> Poor";
                return div;
            };
            legend.addTo(this._map);
            this._legend = legend;
        },

        // ═══ DRAWING TOOLS ═══

        _initDrawHandlers: function () {
            if (typeof L.Draw === "undefined") return;
            var self = this;
            this._map.on(L.Draw.Event.CREATED, function (e) {
                self._drawnItems.clearLayers();
                self._drawnItems.addLayer(e.layer);
                self._onShapeDrawn(e.layerType, e.layer);
                self.byId("btnClearDraw").setVisible(true);
            });
            this._polygonDrawer = new L.Draw.Polygon(this._map, { shapeOptions: { color: "#0070F2", weight: 2, fillOpacity: 0.12 } });
            this._rectDrawer    = new L.Draw.Rectangle(this._map, { shapeOptions: { color: "#E9730C", weight: 2, fillOpacity: 0.12 } });
            this._circleDrawer  = new L.Draw.Circle(this._map, { shapeOptions: { color: "#107E3E", weight: 2, fillOpacity: 0.12 } });
        },

        onStartPolygonDraw:  function () { this._activateDrawer(this._polygonDrawer); },
        onStartRectDraw:     function () { this._activateDrawer(this._rectDrawer); },
        onStartCircleDraw:   function () { this._activateDrawer(this._circleDrawer); },
        onClearDrawing:      function () {
            this._drawnItems.clearLayers();
            this._selectedObjects = [];
            this.byId("btnClearDraw").setVisible(false);
            this._hideSelectionStats();
        },

        _activateDrawer: function (drawer) {
            if (this._activeDrawHandler) this._activeDrawHandler.disable();
            this._activeDrawHandler = drawer;
            drawer.enable();
        },

        _onShapeDrawn: function (type, layer) {
            var selected = [];
            if (type === "circle") {
                var c = layer.getLatLng(), r = layer.getRadius();
                selected = this._displayObjects.filter(function (o) {
                    return c.distanceTo([o["{LAT_FIELD}"], o["{LNG_FIELD}"]]) <= r;
                });
            } else {
                // Polygon or rectangle — use Leaflet bounds for rect, ray-casting for polygon
                var bounds = layer.getBounds();
                selected = this._displayObjects.filter(function (o) {
                    return bounds.contains([o["{LAT_FIELD}"], o["{LNG_FIELD}"]]);
                });
            }
            this._selectedObjects = selected;
            this._showSelectionStats(selected, layer, type);

            // Persist to localStorage for cross-view bridge
            try {
                localStorage.setItem("{ENTITY_NAME_LC}_map_selection", JSON.stringify({
                    ids: selected.map(function (o) { return o["{ENTITY_KEY_FIELD}"]; }),
                    setAt: Date.now()
                }));
            } catch (_) {}
        },

        _showSelectionStats: function (selected, layer, type) {
            if (this._statsControl) this._map.removeControl(this._statsControl);
            var area = 0;
            if (type === "circle") {
                var r = layer.getRadius();
                area = Math.PI * r * r / 10000; // ha
            } else if (typeof turf !== "undefined") {
                var geo = layer.toGeoJSON();
                try { area = turf.area(geo) / 10000; } catch (_) {}
            }
            var c = L.control({ position: "bottomleft" });
            c.onAdd = function () {
                var d = L.DomUtil.create("div", "nhvr-stats-overlay");
                d.innerHTML = "<div class='nhvr-stats-header'>Selection</div>" +
                              "<div>Count: <strong>" + selected.length + "</strong></div>" +
                              "<div>Area: <strong>" + area.toFixed(1) + " ha</strong></div>";
                return d;
            };
            c.addTo(this._map);
            this._statsControl = c;
        },

        _hideSelectionStats: function () {
            if (this._statsControl) { this._map.removeControl(this._statsControl); this._statsControl = null; }
        },

        // ═══ FILTERS ═══

        onToggleFilters: function () {
            var sb = this.byId("filterSidebar");
            sb.setVisible(!sb.getVisible());
            var self = this;
            setTimeout(function () { if (self._map) self._map.invalidateSize(); }, 300);
        },

        onFilterChange: function () { /* debounced auto-apply */ },
        onApplyFilters: function () {
            var statusItems = this.byId("filterStatus").getSelectedKeys() || [];
            this._displayObjects = this._allObjects.filter(function (o) {
                if (statusItems.length > 0 && statusItems.indexOf(o.status) === -1) return false;
                return true;
            });
            this._plotMarkers();
            this._updateListModel();
        },
        onClearFilters: function () {
            this.byId("filterStatus").setSelectedKeys([]);
            this._displayObjects = this._allObjects.slice();
            this._plotMarkers();
            this._updateListModel();
        },

        // ═══ VIEW MODES ═══

        onViewModeChange: function (e) {
            this._viewMode = e.getParameter("key");
            var map = this.byId("mapSection"), list = this.byId("listSection");
            if (this._viewMode === "map")  { map.setVisible(true);  list.setVisible(false); map.setWidth("100%"); }
            if (this._viewMode === "split"){ map.setVisible(true);  list.setVisible(true);  map.setWidth("55%"); list.setWidth("45%"); }
            if (this._viewMode === "list") { map.setVisible(false); list.setVisible(true);  list.setWidth("100%"); }
            var self = this;
            setTimeout(function () { if (self._map) self._map.invalidateSize(); }, 400);
        },

        onSymbologyChange: function (e) {
            this._symbologyMode = e.getParameter("selectedItem").getKey();
            this._plotMarkers();
        },

        onBaseLayerChange: function (e) {
            this._addBaseLayer(e.getParameter("selectedItem").getKey());
        },

        // ═══ LIST SYNC ═══

        _updateListModel: function () {
            this.getView().getModel("listModel").setProperty("/items", this._displayObjects);
            var t = this.byId("listCountText");
            if (t) t.setText(this._displayObjects.length + " {ENTITY_NAME_LC}s");
        },

        onListSearch: function (e) {
            var q = (e.getParameter("newValue") || "").toLowerCase();
            var filtered = this._displayObjects.filter(function (o) {
                return String(o["{ENTITY_KEY_FIELD}"]).toLowerCase().indexOf(q) >= 0
                    || String(o["{ENTITY_LABEL}"]).toLowerCase().indexOf(q) >= 0;
            });
            this.getView().getModel("listModel").setProperty("/items", filtered);
        },

        onLocateOnMap: function (e) {
            var ctx = e.getSource().getBindingContext("listModel");
            if (!ctx) return;
            var o = ctx.getObject();
            var marker = this._markerById[o["{ENTITY_KEY_FIELD}"]];
            if (marker) {
                this._map.setView(marker.getLatLng(), 15);
                marker.openPopup();
            }
        },

        onOpenDetail: function (e) {
            var ctx = e.getSource().getBindingContext("listModel");
            if (!ctx) return;
            var id = ctx.getObject()["{ENTITY_KEY_FIELD}"];
            this.getOwnerComponent().getRouter().navTo("{DETAIL_ROUTE}", { id: encodeURIComponent(id) });
        },

        _showDetail: function (obj) {
            // Populate detail side panel — customize per entity
            var panel = this.byId("detailPanel");
            panel.destroyItems();
            panel.addItem(new sap.m.VBox({
                items: [
                    new sap.m.Title({ text: obj["{ENTITY_LABEL}"] || obj["{ENTITY_KEY_FIELD}"] }),
                    new sap.m.Text({ text: obj["{ENTITY_KEY_FIELD}"] }),
                    new sap.m.Button({ text: "Open Full Record", press: function () {
                        this.getOwnerComponent().getRouter().navTo("{DETAIL_ROUTE}", { id: encodeURIComponent(obj["{ENTITY_KEY_FIELD}"]) });
                    }.bind(this) })
                ]
            }));
            panel.setVisible(true);
        },

        _highlightAndFit: function (ids) {
            var markers = ids.map(function (id) { return this._markerById[id]; }.bind(this)).filter(Boolean);
            if (markers.length === 0) return;
            var group = L.featureGroup(markers);
            this._map.fitBounds(group.getBounds().pad(0.1));
        },

        // ═══ EXPORTS ═══

        onExportCsv: function () {
            var rows = (this._selectedObjects.length ? this._selectedObjects : this._displayObjects);
            if (rows.length === 0) { MessageToast.show("Nothing to export"); return; }
            var headers = ["{ENTITY_KEY_FIELD}", "{ENTITY_LABEL}", "{LAT_FIELD}", "{LNG_FIELD}", "{SYMBOLOGY_FIELD}", "status"];
            var lines = [headers.join(",")].concat(rows.map(function (o) {
                return headers.map(function (h) {
                    var v = o[h]; return v == null ? "" : String(v).replace(/,/g, "\\,");
                }).join(",");
            }));
            var blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv" });
            var a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.download = "{ENTITY_NAME_LC}s_" + new Date().toISOString().slice(0,10) + ".csv";
            a.click();
        },

        onExportGeoJSON: function () {
            var rows = (this._selectedObjects.length ? this._selectedObjects : this._displayObjects);
            if (rows.length === 0) { MessageToast.show("Nothing to export"); return; }
            var fc = {
                type: "FeatureCollection",
                features: rows.map(function (o) {
                    return {
                        type: "Feature",
                        geometry: { type: "Point", coordinates: [o["{LNG_FIELD}"], o["{LAT_FIELD}"]] },
                        properties: o
                    };
                })
            };
            var blob = new Blob([JSON.stringify(fc, null, 2)], { type: "application/geo+json" });
            var a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.download = "{ENTITY_NAME_LC}s_" + new Date().toISOString().slice(0,10) + ".geojson";
            a.click();
        },

        // ═══ OTHER ACTIONS ═══

        onRecenterMap: function () {
            if (this._map) this._map.setView([-27.0, 133.0], 5);
        },

        onRefresh: function () {
            this._loadObjects();
            MessageToast.show("Map refreshed");
        },

        onOpenLayerManager: function () {
            // Implement reference layer toggle dialog (GeoJSON/WMS/XYZ layers)
            MessageToast.show("Layer manager — customize per entity");
        },

        onNavHome: function () {
            this.getOwnerComponent().getRouter().navTo("Home");
        },

        onViewInList: function () {
            this.getOwnerComponent().getRouter().navTo("{ENTITY_NAME_PLURAL}List");
        }

    });
});
```

---

## 📄 PHASE 5 — ADD CSS STYLES

Append to `app/{app}/webapp/css/style.css` (create if it doesn't exist):

```css
/* ═══ Map View ═══ */
.nhvrMapRoot {
    display: flex;
    flex-direction: column;
    height: 100vh;
    overflow: hidden;
}

.nhvrMapMainRow {
    flex: 1 1 auto;
    min-height: 0;
    overflow: hidden;
}

.nhvrMapFilterSidebar {
    width: 268px;
    min-width: 268px;
    flex-direction: column;
    border-right: 1px solid #E5E8EB;
    background: #FAFBFC;
    transition: width 0.22s ease, min-width 0.22s ease;
}

.nhvrMapFilterSidebar > .nhvrFilterScroll {
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
}

.nhvrMapContentArea {
    flex: 1 1 auto;
    min-width: 0;
}

.nhvrMapSection {
    flex: 1 1 auto;
    position: relative;
}

.nhvrMapSection .sapUiHtml,
.nhvrMapSection .sapUiHtml > div {
    flex: 1 1 auto;
    height: 100%;
    width: 100%;
    min-height: 500px;
}

#leaflet-map-container {
    width: 100%;
    height: 100%;
    min-height: 500px;
}

.nhvrMapListSection {
    flex: 1 1 45%;
    flex-direction: column;
    overflow: hidden;
    border-left: 1px solid #E5E8EB;
}

.nhvrDetailPanelV2 {
    width: 320px;
    min-width: 320px;
    max-width: 320px;
    flex-shrink: 0;
    border-left: 1px solid #E5E8EB;
    overflow-y: auto;
    box-shadow: -4px 0 16px rgba(0,0,0,0.08);
    padding: 16px;
}

/* Popup card */
.nhvr-popup-v2 {
    padding: 10px;
    font-family: "72", "72full", Arial, sans-serif;
}

/* Cluster icons */
.nhvr-cluster {
    background: transparent;
}

.nhvr-cluster-inner {
    background: #107E3E;
    color: white;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 600;
    border: 3px solid rgba(255,255,255,0.8);
    box-shadow: 0 3px 12px rgba(0,0,0,0.2);
}

/* Legend */
.nhvr-legend-card {
    background: rgba(255,255,255,0.97);
    backdrop-filter: blur(8px);
    border-radius: 10px;
    box-shadow: 0 4px 16px rgba(0,0,0,0.15);
    max-width: 180px;
    padding: 12px;
    line-height: 1.9;
    font-size: 12px;
}

/* Selection stats overlay */
.nhvr-stats-overlay {
    background: rgba(255,255,255,0.97);
    backdrop-filter: blur(8px);
    border-radius: 12px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.18);
    padding: 12px 14px;
    font-size: 13px;
    min-width: 220px;
}

.nhvr-stats-header {
    background: linear-gradient(135deg, #0070F2, #0050B0);
    color: white;
    padding: 8px 12px;
    border-radius: 8px 8px 0 0;
    margin: -12px -14px 10px -14px;
    font-weight: 600;
}

/* Leaflet.Draw tooltip */
.leaflet-draw-tooltip {
    background: rgba(0,112,242,0.92);
    border-radius: 8px;
    color: #fff;
    font-size: 0.78rem;
    padding: 4px 12px;
    backdrop-filter: blur(4px);
}
```

---

## 📄 PHASE 6 — REGISTER ROUTE IN manifest.json

In `app/{app}/webapp/manifest.json`, under `sap.ui5.routing.routes`:

```json
{ "pattern": "Map:?query:", "name": "MapView", "target": "MapView" }
```

Under `targets`:

```json
"MapView": {
    "type": "View",
    "name": "MapView",
    "viewType": "XML",
    "viewLevel": 1
}
```

---

## 📄 PHASE 7 — ADD HOME TILE

In the Home view (e.g. `Home.view.xml`), add a tile:

```xml
<GenericTile class="sapUiTinyMarginBegin sapUiTinyMarginTop"
    header="Map View"
    subheader="Geographic Explorer"
    press=".onNavToMap">
    <tileContent>
        <TileContent>
            <content>
                <ImageContent src="sap-icon://geographic-bubble-chart"/>
            </content>
        </TileContent>
    </tileContent>
</GenericTile>
```

In the Home controller:

```javascript
onNavToMap: function () {
    this.getOwnerComponent().getRouter().navTo("MapView");
}
```

---

## ✅ PHASE 8 — TEST CHECKLIST

After implementation, verify:

- [ ] Navigate to `#/Map` — map renders with Australia centered
- [ ] Markers appear and cluster at low zoom
- [ ] Click a marker — popup shows entity data + "Open Full Record" link
- [ ] Click "Open Full Record" — navigates to detail view
- [ ] Switch base layer (Street → Satellite → Topo → Dark) — tiles change
- [ ] Toggle filter sidebar — slides in/out, map re-sizes
- [ ] Apply filter — markers update, count displays
- [ ] Draw polygon — selection stats appear bottom-left with count + area
- [ ] Draw rectangle — same
- [ ] Draw circle — same
- [ ] Clear drawing — stats disappear
- [ ] Export CSV — downloads with current filter/selection
- [ ] Export GeoJSON — downloads valid FeatureCollection
- [ ] Switch to Split view — map + list side-by-side
- [ ] Switch to List view — table only, search works
- [ ] Click Locate button in list — map centers on marker + opens popup
- [ ] Deep-link `#/Map?objectIds=1,2,3` — those markers highlight + map fits bounds
- [ ] No console errors

---

## 🚀 DEPLOYMENT NOTES

1. Ensure CSP includes all required hosts (see Phase 1)
2. Ensure HTTPS is used for all external tile/API requests
3. For production, consider self-hosting Leaflet libraries instead of CDN
4. Test on mobile viewport — filter sidebar should auto-collapse
5. Check `{LAT_FIELD}`/`{LNG_FIELD}` null-safety — skip objects without coordinates

---

**END OF PROMPT** — You now have a complete, portable, generic Map View implementation guide. Paste this into any CAP/UI5 project's Claude Code session, fill in the placeholders for your entity, and it will build the full feature in ~30 minutes.
