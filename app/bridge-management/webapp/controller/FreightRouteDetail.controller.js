// ============================================================
// NHVR Freight Route Detail & Assessment Controller
//
// Loads freight route + all bridge assets.
// Runs vehicle-aware full-route assessment per AS 5100.7.
// Finds alternative routes (internal DB + OSRM external).
// ============================================================
sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageToast",
    "sap/m/MessageBox",
    "sap/m/BusyDialog",
    "nhvr/bridgemanagement/model/CapabilityManager",
    "nhvr/bridgemanagement/util/AuthFetch",
    "nhvr/bridgemanagement/util/UserAnalytics",
    "nhvr/bridgemanagement/util/LookupService",
    "sap/base/Log"
], function (Controller, JSONModel, MessageToast, MessageBox, BusyDialog, CapabilityManager, AuthFetch, UserAnalytics, LookupService, Log) {
    "use strict";

    const BASE = "/bridge-management";

    var _IS_LOC = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
    var _AUTH_H = _IS_LOC ? { "Authorization": "Basic " + btoa("admin:admin") } : {};
    function _credOpts(extraHeaders) {
        var opts = { headers: Object.assign({ Accept: "application/json" }, _AUTH_H, extraHeaders || {}) };
        if (!_IS_LOC) opts.credentials = "include";
        return opts;
    }

    // UUIDs flowing in from the URL must be validated before we paste them
    // into an OData key predicate / $filter — a stray quote or a typo
    // produces a 400 with no useful empty-state handling otherwise.
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    return Controller.extend("nhvr.bridgemanagement.controller.FreightRouteDetail", {

        onInit: function () {
            this._routeId  = null;
            this._routeData = null;
            this._lastResult = null;

            // Models
            this.getView().setModel(new JSONModel({ bridges: [] }),    "assessModel");
            this.getView().setModel(new JSONModel({ alternatives: [] }), "altModel");

            const oRouter = this.getOwnerComponent().getRouter();
            oRouter.getRoute("FreightRouteDetail").attachPatternMatched(this._onRouteMatched, this);

            // Vehicle Class dropdown sourced from Lookup table (VEHICLE_CLASS category)
            var self = this;
            LookupService.load().then(function () {
                LookupService.populateFormSelect(self.byId("selVehicleClass"), "VEHICLE_CLASS");
            });
        },

        _onRouteMatched: function (oEvent) {
            const args = oEvent.getParameter("arguments");
            this._routeId   = args && args.routeId;
            UserAnalytics.trackView("FreightRouteDetail", { routeId: this._routeId });
            this._routeData = null;
            this._lastResult = null;

            CapabilityManager.load().then(() => {
                if (!CapabilityManager.guardRoute("FREIGHT_ROUTES", this.getOwnerComponent().getRouter())) return;
                this._loadRouteHeader();
                this._loadRouteBridges();
            });

            // Reset panels and results
            this.byId("resultBanner").setVisible(false);
            this.byId("altRoutesPanel").setVisible(false);
            this.byId("btnExportResult").setVisible(false);
            this.getView().getModel("assessModel").setProperty("/bridges", []);
            this.getView().getModel("altModel").setProperty("/alternatives", []);

            // Destroy route map so it reinitialises for the new route
            if (this._rmap) {
                this._rmap.remove();
                this._rmap = null;
                this._rRouteLayer = null;
                this._rBridgeLayer = null;
                this._rAltLayer = null;
            }
            const mapBtn = this.byId("btnShowRouteMap");
            if (mapBtn) mapBtn.setVisible(false);
            const mapPanel = this.byId("frdMapPanel");
            if (mapPanel) mapPanel.setVisible(false);

            // Clear vehicle input fields so previous values don't persist across routes
            const fields = ["inGVM", "inGCM", "inHeight", "inWidth", "inLength", "inSpeed"];
            fields.forEach(id => {
                const ctrl = this.byId(id);
                if (ctrl) ctrl.setValue("");
            });
            const vc = this.byId("selVehicleClass");
            if (vc) vc.setSelectedKey("");
            const ac = this.byId("assetCount");
            if (ac) ac.setText("Run assessment to evaluate bridges on this route");
        },

        // ── Load route header info ────────────────────────────────────
        _loadRouteHeader: function () {
            if (!this._routeId) return;
            if (!UUID_RE.test(this._routeId)) {
                this._showRouteNotFound("Invalid route identifier in URL");
                return;
            }
            // routeId is a validated UUID — safe to paste into the key
            // predicate. OData v4 represents UUIDs as unquoted GUIDs.
            AuthFetch.getJson(`${BASE}/FreightRoutes(${this._routeId})`)
                .then(route => {
                    if (!route) { this._showRouteNotFound("Route not found"); return; }
                    this._routeData = route;
                    this.byId("frdTitle").setText(`Route Assessment — ${route.routeCode}`);
                    this.byId("frdBreadcrumb").setText(route.routeCode);
                    this.byId("frdRouteCode").setText(route.routeCode || "—");
                    this.byId("frdRouteName").setText(route.name || "—");
                    this.byId("frdState").setText(route.state || "—");
                    this.byId("frdCorridorMass").setText(route.corridorMaxMass ? route.corridorMaxMass + " t" : "—");
                    this.byId("frdCorridorHeight").setText(route.corridorMaxHeight ? route.corridorMaxHeight + " m" : "—");

                    const classState = route.routeClass === "PBS" ? "Success" : route.routeClass === "HML" ? "Warning" : "None";
                    this.byId("frdRouteClass").setText(route.routeClass || "—").setState(classState);

                    const statusState = route.status === "ACTIVE" ? "Success" : route.status === "SUSPENDED" ? "Error" : "None";
                    this.byId("frdStatus").setText(route.status || "—").setState(statusState);
                })
                .catch(err => {
                    Log.warning("[FreightRouteDetail] FreightRoutes load failed: " + err.message);
                    // A 404 here means the ID was syntactically valid but
                    // the row doesn't exist — surface a clean empty state.
                    this._showRouteNotFound(err.status === 404 ? "Route not found" : "Failed to load route info");
                });
        },

        _showRouteNotFound: function (message) {
            MessageToast.show(message || "Route not found");
            const title = this.byId("frdTitle");
            if (title) title.setText("Route Assessment — Not Found");
            const bc = this.byId("frdBreadcrumb");
            if (bc) bc.setText("Unknown");
            ["frdRouteCode","frdRouteName","frdState","frdCorridorMass","frdCorridorHeight","frdRouteClass","frdStatus","frdBridgeCount"].forEach(id => {
                const c = this.byId(id);
                if (c && c.setText) c.setText("—");
            });
            const assetCount = this.byId("assetCount");
            if (assetCount) assetCount.setText(message || "Route not found");
        },

        // ── Load bridge count from FreightRouteBridges ─────────────────
        _loadRouteBridges: function () {
            if (!this._routeId) return;
            if (!UUID_RE.test(this._routeId)) return;
            AuthFetch.getJson(`${BASE}/FreightRouteBridges?$filter=route_ID eq ${this._routeId}&$count=true&$top=0`)
                .then(j => {
                    const count = j && j["@odata.count"] != null ? j["@odata.count"] : "?";
                    this.byId("frdBridgeCount").setText(count + " bridges");
                    this.byId("assetCount").setText(count + " bridges on route (run assessment to evaluate)");
                })
                .catch(err => {
                    Log.warning("[FreightRouteDetail] FreightRouteBridges count failed: " + err.message);
                });
        },

        // ── Run Full Assessment ───────────────────────────────────────
        onRunAssessment: function () {
            const gvm    = parseFloat(this.byId("inGVM").getValue());
            const gcm    = parseFloat(this.byId("inGCM").getValue()) || 0;
            const height = parseFloat(this.byId("inHeight").getValue());
            const width  = parseFloat(this.byId("inWidth").getValue()) || 0;
            const length = parseFloat(this.byId("inLength").getValue()) || 0;
            const speed  = parseInt(this.byId("inSpeed").getValue()) || 80;
            const vClass = this.byId("selVehicleClass").getSelectedKey();

            if (!gvm || gvm <= 0) { MessageToast.show("Please enter a valid GVM (t)"); return; }
            if (!height || height <= 0) { MessageToast.show("Please enter a valid vehicle height (m)"); return; }
            if (!this._routeId) { MessageToast.show("No route selected"); return; }

            const busy = new BusyDialog({ title: "Assessing Route…", text: "Running AS 5100.7 checks on all bridge assets…" });
            busy.open();

            AuthFetch.post(`${BASE}/assessFreightRouteVehicle`, {
                    routeId: this._routeId,
                    vehicleGVM_t:    gvm,
                    vehicleGCM_t:    gcm,
                    vehicleHeight_m: height,
                    vehicleWidth_m:  width,
                    vehicleLength_m: length,
                    crossingSpeed:   speed,
                    vehicleClass:    vClass
                })
                .then(r => r.ok ? r.json() : r.json().then(e => Promise.reject(e)))
                .then(result => {
                    busy.close();
                    // The action returns a LargeString — parse it
                    const data = typeof result.value === "string" ? JSON.parse(result.value) : result;
                    this._lastResult = data;
                    this._renderAssessmentResult(data);
                })
                .catch(e => {
                    busy.close();
                    MessageBox.error((e && e.error && e.error.message) || "Assessment failed");
                });
        },

        // ── Render assessment result ──────────────────────────────────
        _renderAssessmentResult: function (data) {
            // Enrich bridge data with flat string fields for simple binding
            var bridges = (data.bridges || []).map(function (b) {
                return Object.assign({}, b, {
                    issuesText:   (b.issues   || []).join(" | ") || "",
                    warningsText: (b.warnings || []).join(" | ") || "",
                    hasIssues:    (b.issues   || []).length > 0,
                    hasWarnings:  (b.warnings || []).length > 0,
                    hasAnyFlag:   ((b.issues || []).length + (b.warnings || []).length) > 0,
                    hasRestrictions: (b.activeRestrictions || []).length > 0,
                    restrictionsSummary: (b.activeRestrictions || [])
                        .map(function (r) {
                            return (r.isTemporary ? "⏱ TEMP" : "⛔ PERM") + " " + r.type + ": " + r.value + " " + r.unit + (r.validTo ? " (until " + r.validTo + ")" : "");
                        }).join("  ·  ") || ""
                });
            });
            // Bridge list model
            this.getView().getModel("assessModel").setProperty("/bridges", bridges);
            this.byId("assetCount").setText(
                `${data.summary.total} bridges assessed — ${data.summary.passing} pass, ${data.summary.warned} conditions, ${data.summary.failing} fail`
            );

            // KPI tiles
            this.byId("kpiTotal").setText(data.summary.total);
            this.byId("kpiPass").setText(data.summary.passing);
            this.byId("kpiWarn").setText(data.summary.warned);
            this.byId("kpiFail").setText(data.summary.failing);
            this.byId("kpiMassMargin").setText(data.minMassMargin != null ? data.minMassMargin.toFixed(1) : "—");
            this.byId("kpiClearMargin").setText(data.minClearanceMargin != null
                ? Math.round(data.minClearanceMargin * 1000) + "" : "—");

            // Verdict
            const verdictMap = {
                APPROVED:                { label: "APPROVED",               cls: "nhvrFraVerdictAPPROVED",    icon: "✓" },
                APPROVED_WITH_CONDITIONS: { label: "APPROVED WITH CONDITIONS", cls: "nhvrFraVerdictCONDITIONS", icon: "⚠" },
                REFUSED:                  { label: "REFUSED",                cls: "nhvrFraVerdictREFUSED",     icon: "✗" },
            };
            const vm = verdictMap[data.routeVerdict] || { label: data.routeVerdict, cls: "", icon: "?" };
            this.byId("verdictIcon").setContent(`<span class="nhvrFraVerdictIconLg ${vm.cls}">${vm.icon}</span>`);
            this.byId("verdictText").setText(vm.label);
            if (data.limitingAsset) {
                this.byId("limitingInfo").setText(
                    `Limiting asset: ${data.limitingAsset} — ${data.limitingConstraint || ""}`
                );
            } else {
                this.byId("limitingInfo").setText("All bridges within vehicle parameters");
            }

            this.byId("resultBanner").setVisible(true);
            this.byId("btnExportResult").setVisible(true);

            // Show the map toggle button
            const mapBtn = this.byId("btnShowRouteMap");
            if (mapBtn) mapBtn.setVisible(true);

            // Re-plot map if it is already open
            if (this._rmap) { this._plotRouteOnMap(); }

            // Scroll to result
            const page = this.byId("frdPage");
            if (page && page.getDomRef()) {
                page.getDomRef().querySelector(".nhvrFraResultBanner")?.scrollIntoView({ behavior: "smooth" });
            }
        },

        // ── Find Alternative Routes ───────────────────────────────────
        onFindAlternatives: function () {
            const gvm    = parseFloat(this.byId("inGVM").getValue()) || 0;
            const height = parseFloat(this.byId("inHeight").getValue()) || 0;
            const width  = parseFloat(this.byId("inWidth").getValue()) || 0;
            const length = parseFloat(this.byId("inLength").getValue()) || 0;

            if (!this._routeId) { MessageToast.show("No route selected"); return; }

            const busy = new BusyDialog({ title: "Finding Alternatives…", text: "Searching internal network and external routing…" });
            busy.open();

            AuthFetch.post(`${BASE}/findAlternativeRoutes`, {
                    routeId:         this._routeId,
                    vehicleGVM_t:    gvm,
                    vehicleHeight_m: height,
                    vehicleWidth_m:  width,
                    vehicleLength_m: length
                })
                .then(r => r.ok ? r.json() : r.json().then(e => Promise.reject(e)))
                .then(result => {
                    busy.close();
                    const data = typeof result.value === "string" ? JSON.parse(result.value) : result;
                    const alts = data.alternatives || [];
                    this.getView().getModel("altModel").setProperty("/alternatives", alts);
                    this.byId("altCount").setText(`${alts.length} alternative(s) found`);
                    this.byId("altRoutesPanel").setVisible(true);

                    if (alts.length === 0) {
                        MessageToast.show("No alternative routes found for this vehicle configuration");
                    }

                    // Re-plot alternatives on map if it is already open
                    if (this._rmap) { this._plotAlternativesOnMap(); }
                })
                .catch(e => {
                    busy.close();
                    MessageBox.error((e && e.error && e.error.message) || "Failed to find alternatives");
                });
        },

        // ── Assess an alternative route ───────────────────────────────
        onAssessAlternative: function (oEvent) {
            const ctx = oEvent.getSource().getParent().getParent().getBindingContext("altModel");
            if (!ctx) return;
            const alt = ctx.getObject();
            if (!alt || !alt.routeId) { MessageToast.show("Cannot assess this route type"); return; }
            // Navigate to the same view for the alternative route
            this.getOwnerComponent().getRouter().navTo("FreightRouteDetail", { routeId: alt.routeId });
        },

        // ── Bridge row press — open bridge detail ─────────────────────
        onBridgeRowPress: function (oEvent) {
            const ctx = oEvent.getSource().getBindingContext("assessModel");
            if (!ctx) return;
            const bridge = ctx.getObject();
            if (bridge) {
                var bid = bridge.bridgeId || bridge.bridgeUUID;
                if (bid) this.getOwnerComponent().getRouter().navTo("BridgeDetail", { bridgeId: encodeURIComponent(bid) });
            }
        },

        // ── Export assessment result ──────────────────────────────────
        onExportAssessment: function () {
            if (!this._lastResult) { MessageToast.show("Run an assessment first"); return; }
            const data = this._lastResult;
            const rows = [
                ["Route", "Bridge ID", "Name", "State", "Verdict", "Mass Limit (t)", "Clearance (m)", "Carriageway (m)",
                 "Condition", "Structure Type", "Year Built", "Span (m)", "Load Rating RF",
                 "Posting Status", "Active Restrictions", "Issues", "Warnings"].join(",")
            ];
            (data.bridges || []).forEach(b => {
                const restr = (b.activeRestrictions || []).map(r => `${r.type}:${r.value}${r.unit}`).join("; ");
                rows.push([
                    data.routeCode,
                    b.bridgeId, `"${(b.name || "").replace(/"/g, '""')}"`,
                    b.state, b.verdict,
                    b.effectiveMassLimit_t || b.grossMassLimit_t || "",
                    b.effectiveClearance_m || b.minVerticalClearance_m || "",
                    b.effectiveWidth_m || b.trafficableWidth_m || "",
                    b.conditionRating || "",
                    `"${(b.structureType || "").replace(/"/g, '""')}"`,
                    b.yearBuilt || "", b.spanLengthM || "", b.loadRatingFactor || "",
                    b.postingStatus || "",
                    `"${restr.replace(/"/g, '""')}"`,
                    `"${(b.issues || []).join("; ").replace(/"/g, '""')}"`,
                    `"${(b.warnings || []).join("; ").replace(/"/g, '""')}"`
                ].join(","));
            });

            const csv  = rows.join("\n");
            const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
            const url  = URL.createObjectURL(blob);
            const a    = document.createElement("a");
            a.href     = url;
            a.download = `route-assessment-${data.routeCode}-${new Date().toISOString().slice(0, 10)}.csv`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            MessageToast.show("Assessment exported");
        },

        onToggleColumns: function () { /* future: toggle extra detail columns */ },

        // ══ ROUTE MAP ════════════════════════════════════════════════
        // Leaflet map embedded in FreightRouteDetail showing:
        //   • current route bridges (coloured by assessment verdict)
        //   • route polyline connecting bridges in sequence
        //   • alternative route geometries (OSRM or Valhalla)
        // Routing engines: OSRM (free, OpenStreetMap) + Valhalla (free, OSM)
        // ══════════════════════════════════════════════════════════════

        _rmap              : null,   // Leaflet map instance
        _rBaseLayer        : null,   // current tile layer
        _rRouteLayer       : null,   // L.layerGroup — current route polyline
        _rBridgeLayer      : null,   // L.layerGroup — assessed bridge markers
        _rAltLayer         : null,   // L.layerGroup — alternative route polylines
        _rAllBridgesLayer  : null,   // L.layerGroup — all area bridges (optional)
        _rEngine           : "osrm", // active routing engine key

        _rBaseLayers: {
            osm: {
                url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
                attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
                maxZoom: 19
            },
            satellite: {
                url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
                attribution: "Tiles © Esri — Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, GIS User Community",
                maxZoom: 18
            },
            topo: {
                url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
                attribution: '© <a href="https://opentopomap.org">OpenTopoMap</a>',
                maxZoom: 17
            }
        },

        onToggleRouteMap: function () {
            const panel = this.byId("frdMapPanel");
            if (!panel) return;
            const showing = panel.getVisible();
            panel.setVisible(!showing);
            if (!showing) {
                // Show — init map after DOM renders
                setTimeout(this._initRouteMap.bind(this), 80);
            }
        },

        onFrdMapHolderRendered: function () {
            // Called by core:HTML afterRendering — init only if panel is visible
            const panel = this.byId("frdMapPanel");
            if (panel && panel.getVisible()) {
                setTimeout(this._initRouteMap.bind(this), 80);
            }
        },

        _initRouteMap: function () {
            if (typeof L === "undefined") { return; }
            const mapDiv = document.getElementById("nhvr-route-detail-map");
            if (!mapDiv) { setTimeout(this._initRouteMap.bind(this), 100); return; }

            if (this._rmap) {
                setTimeout(function () { this._rmap.invalidateSize(); }.bind(this), 100);
                return;
            }

            this._rmap = L.map("nhvr-route-detail-map", {
                center: [-27.0, 133.0], zoom: 5, zoomControl: true
            });

            const osm = this._rBaseLayers.osm;
            this._rBaseLayer = L.tileLayer(osm.url, {
                attribution: osm.attribution, maxZoom: osm.maxZoom
            }).addTo(this._rmap);

            // Initialize layer groups
            this._rRouteLayer     = L.layerGroup().addTo(this._rmap);
            this._rBridgeLayer    = L.layerGroup().addTo(this._rmap);
            this._rAltLayer       = L.layerGroup().addTo(this._rmap);
            this._rAllBridgesLayer = L.layerGroup();  // off by default

            // Add a simple legend
            const legend = L.control({ position: "bottomright" });
            legend.onAdd = function () {
                const d = L.DomUtil.create("div", "nhvrMapRouteLegend");
                d.innerHTML = "<b>Assessment</b><br>"
                    + "<span style='color:#107E3E'>●</span> PASS &nbsp;"
                    + "<span style='color:#E9730C'>●</span> CONDITIONS &nbsp;"
                    + "<span style='color:#BB0000'>●</span> FAIL &nbsp;"
                    + "<span style='color:#888'>●</span> Not assessed";
                return d;
            };
            legend.addTo(this._rmap);

            // Plot whatever is already loaded
            this._plotRouteOnMap();
            this._plotAlternativesOnMap();

            setTimeout(function () { if (this._rmap) this._rmap.invalidateSize(); }.bind(this), 200);
        },

        _verdictColor: function (verdict) {
            if (verdict === "PASS")       return "#107E3E";
            if (verdict === "CONDITIONS") return "#E9730C";
            if (verdict === "FAIL")       return "#BB0000";
            return "#888888";
        },

        _plotRouteOnMap: function () {
            if (!this._rmap || !this._rRouteLayer || !this._rBridgeLayer) return;
            this._rRouteLayer.clearLayers();
            this._rBridgeLayer.clearLayers();

            const bridges = this.getView().getModel("assessModel").getProperty("/bridges") || [];
            if (bridges.length === 0) return;

            // Polyline of bridge coordinates in sequence
            const latlngs = bridges
                .filter(function (b) { return b.latitude && b.longitude; })
                .map(function (b) { return [parseFloat(b.latitude), parseFloat(b.longitude)]; });

            if (latlngs.length > 0) {
                L.polyline(latlngs, {
                    color: "#0064D9", weight: 4, opacity: 0.8, dashArray: "6 4"
                }).bindPopup("<b>Current Route</b><br>" + (this._routeData ? this._routeData.routeCode : "")).addTo(this._rRouteLayer);
            }

            // Bridge markers coloured by verdict
            const bounds = [];
            bridges.forEach(function (b) {
                if (!b.latitude || !b.longitude) return;
                const lat = parseFloat(b.latitude), lng = parseFloat(b.longitude);
                bounds.push([lat, lng]);
                const color = this._verdictColor(b.verdict);
                const marker = L.circleMarker([lat, lng], {
                    radius: 9, fillColor: color, color: "#fff",
                    weight: 2, opacity: 1, fillOpacity: 0.9
                }).bindPopup(
                    "<b>" + (b.bridgeId || "") + " — " + (b.name || "") + "</b><br>"
                    + "Seq: " + b.sequence + " &nbsp;|&nbsp; Verdict: <b>" + (b.verdict || "—") + "</b><br>"
                    + (b.effectiveMassLimit_t ? "Mass limit: " + b.effectiveMassLimit_t + "t<br>" : "")
                    + (b.effectiveClearance_m ? "Clearance: " + b.effectiveClearance_m + "m<br>" : "")
                    + (b.issuesText ? "<span style='color:#BB0000'>" + b.issuesText + "</span>" : "")
                    + (b.warningsText ? "<span style='color:#E9730C'>" + b.warningsText + "</span>" : ""),
                    { maxWidth: 280 }
                );
                marker.addTo(this._rBridgeLayer);
            }.bind(this));

            if (bounds.length > 0) {
                this._rmap.fitBounds(L.latLngBounds(bounds), { padding: [40, 40], maxZoom: 14 });
            }
        },

        _plotAlternativesOnMap: function () {
            if (!this._rmap || !this._rAltLayer) return;
            this._rAltLayer.clearLayers();

            const alts = this.getView().getModel("altModel").getProperty("/alternatives") || [];
            if (alts.length === 0) return;

            const altColors = ["#9B59B6", "#16A085", "#D35400", "#2980B9", "#C0392B"];

            alts.forEach(function (alt, idx) {
                const color = altColors[idx % altColors.length];
                const label = (alt.routeCode || "Alt " + (idx + 1)) + " (" + (alt.type || "") + ")";

                // OSRM/external: use osrmGeometry coordinates if available
                if (alt.osrmGeometry && alt.osrmGeometry.length > 0) {
                    // OSRM returns [lon, lat] — reverse to [lat, lon] for Leaflet
                    const lls = alt.osrmGeometry.map(function (c) { return [c[1], c[0]]; });
                    L.polyline(lls, { color: color, weight: 3, opacity: 0.75 })
                        .bindPopup("<b>" + label + "</b><br>" + (alt.reason || ""), { maxWidth: 260 })
                        .addTo(this._rAltLayer);
                    return;
                }

                // Internal/approved: use bridgeCoords
                if (alt.bridgeCoords && alt.bridgeCoords.length > 0) {
                    const lls = alt.bridgeCoords
                        .filter(function (c) { return c.lat && c.lon; })
                        .map(function (c) { return [parseFloat(c.lat), parseFloat(c.lon)]; });
                    if (lls.length > 1) {
                        L.polyline(lls, { color: color, weight: 3, opacity: 0.75, dashArray: "8 4" })
                            .bindPopup("<b>" + label + "</b><br>"
                                + (alt.assetSummary
                                    ? "Pass: " + alt.assetSummary.passing + " / " + alt.assetSummary.total + (alt.assetSummary.failing > 0 ? " | <span style='color:#BB0000'>Fail: " + alt.assetSummary.failing + "</span>" : "")
                                    : "")
                                + "<br>" + (alt.reason || ""), { maxWidth: 260 })
                            .addTo(this._rAltLayer);
                    }
                    // Also plot bridge points
                    alt.bridgeCoords.forEach(function (c) {
                        if (!c.lat || !c.lon) return;
                        L.circleMarker([parseFloat(c.lat), parseFloat(c.lon)], {
                            radius: 5, fillColor: this._verdictColor(c.verdict),
                            color: color, weight: 1.5, fillOpacity: 0.8
                        }).bindPopup("<b>" + (c.bridgeId || "") + "</b><br>"
                            + (c.name || "") + "<br>Verdict: " + (c.verdict || "—")
                            + (c.keyIssue ? "<br><small>" + c.keyIssue + "</small>" : ""))
                        .addTo(this._rAltLayer);
                    }.bind(this));
                }
            }.bind(this));
        },

        // ── Routing engine change (OSRM ↔ Valhalla) ──────────────
        onRoutingEngineChange: function (oEvent) {
            const key = oEvent.getSource().getSelectedKey();
            this._rEngine = key;
            // Re-request geometry for OSRM alternatives with the new engine
            const alts = this.getView().getModel("altModel").getProperty("/alternatives") || [];
            if (alts.length === 0) return;
            const osrmAlts = alts.filter(function (a) { return a.type === "OSRM"; });
            if (osrmAlts.length === 0) return;
            // Get start/end from OSRM alts
            const first = osrmAlts[0];
            if (!first.startCoord || !first.endCoord) return;
            const sc = first.startCoord.split(","); // "lat,lon"
            const ec = first.endCoord.split(",");
            const start = { lat: parseFloat(sc[0]), lon: parseFloat(sc[1]) };
            const end   = { lat: parseFloat(ec[0]), lon: parseFloat(ec[1]) };

            if (key === "valhalla") {
                this._fetchValhallaGeometry(start, end, osrmAlts, alts);
            } else {
                this._fetchOSRMGeometry(start, end, osrmAlts, alts);
            }
        },

        _fetchOSRMGeometry: function (start, end, osrmAlts, alts) {
            const url = "https://router.project-osrm.org/route/v1/driving/"
                + start.lon + "," + start.lat + ";"
                + end.lon   + "," + end.lat
                + "?alternatives=3&overview=simplified&geometries=geojson&steps=false";
            fetch(url, { signal: AbortSignal.timeout(8000) })
                .then(function (r) { return r.json(); })
                .then(function (data) {
                    (data.routes || []).forEach(function (r, i) {
                        if (osrmAlts[i]) {
                            osrmAlts[i].osrmGeometry = r.geometry ? r.geometry.coordinates : null;
                        }
                    });
                    this.getView().getModel("altModel").setProperty("/alternatives", alts);
                    this._plotAlternativesOnMap();
                }.bind(this))
                .catch(function (err) { Log.warning("[FreightRouteDetail] alternative route geometry fetch failed", err); });
        },

        _fetchValhallaGeometry: function (start, end, osrmAlts, alts) {
            // Valhalla open-source routing — free public API (OpenStreetMap data)
            // API: https://valhalla.openstreetmap.de/
            fetch("https://valhalla.openstreetmap.de/route", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    locations: [
                        { lon: start.lon, lat: start.lat },
                        { lon: end.lon,   lat: end.lat   }
                    ],
                    costing: "truck",
                    costing_options: { truck: { weight: 20, height: 4.3, width: 2.5, length: 19 } },
                    alternates: 3,
                    directions_options: { language: "en-US" }
                }),
                signal: AbortSignal.timeout(10000)
            })
                .then(function (r) { return r.json(); })
                .then(function (data) {
                    const legs = data.trip && data.trip.legs;
                    if (!legs) return;
                    const allTrips = [data.trip].concat(data.alternates || []);
                    allTrips.forEach(function (trip, i) {
                        if (osrmAlts[i] && trip.legs && trip.legs[0] && trip.legs[0].shape) {
                            osrmAlts[i].osrmGeometry = this._decodePolyline(trip.legs[0].shape, 6);
                        }
                    }.bind(this));
                    this.getView().getModel("altModel").setProperty("/alternatives", alts);
                    this._plotAlternativesOnMap();
                }.bind(this))
                .catch(function (e) {
                    sap.m.MessageToast.show("Valhalla routing unavailable: " + e.message);
                });
        },

        // Decode Google/Valhalla encoded polyline → [[lon,lat],...]
        _decodePolyline: function (encoded, precision) {
            precision = precision || 6;
            const factor = Math.pow(10, precision);
            const result = [];
            let index = 0, lat = 0, lng = 0;
            while (index < encoded.length) {
                let b, shift = 0, r = 0;
                do { b = encoded.charCodeAt(index++) - 63; r |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
                lat += (r & 1) ? ~(r >> 1) : (r >> 1);
                shift = 0; r = 0;
                do { b = encoded.charCodeAt(index++) - 63; r |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
                lng += (r & 1) ? ~(r >> 1) : (r >> 1);
                result.push([lng / factor, lat / factor]); // [lon, lat] to match GeoJSON convention
            }
            return result;
        },

        // ── Basemap switcher ──────────────────────────────────────
        onBaseMapChange: function (oEvent) {
            if (!this._rmap) return;
            const key = oEvent.getSource().getSelectedKey();
            const def = this._rBaseLayers[key] || this._rBaseLayers.osm;
            if (this._rBaseLayer) { this._rmap.removeLayer(this._rBaseLayer); }
            this._rBaseLayer = L.tileLayer(def.url, {
                attribution: def.attribution, maxZoom: def.maxZoom
            }).addTo(this._rmap);
            this._rBaseLayer.setZIndex(0);
        },

        // ── Layer toggles ─────────────────────────────────────────
        onLayerToggle: function (oEvent) {
            if (!this._rmap) return;
            const src = oEvent.getSource();
            const id  = src.getId().split("--").pop(); // handle view ID prefix
            const on  = src.getSelected();
            const layerMap = {
                "chkFrdLayerRoute"   : this._rRouteLayer,
                "chkFrdLayerBridges" : this._rBridgeLayer,
                "chkFrdLayerAlts"    : this._rAltLayer,
                "chkFrdLayerAll"     : this._rAllBridgesLayer
            };
            // find matching layer
            let layer = null;
            Object.keys(layerMap).forEach(function (k) {
                if (id.endsWith(k) || id === k) layer = layerMap[k];
            });
            if (!layer) return;
            if (on) { this._rmap.addLayer(layer); }
            else    { this._rmap.removeLayer(layer); }
        },

        // ── Fit map to route bounds ───────────────────────────────
        onFitRouteMap: function () {
            if (!this._rmap) return;
            const all = [];
            if (this._rRouteLayer)  { this._rRouteLayer.eachLayer(function (l) { if (l.getLatLngs) { l.getLatLngs().forEach(function (ll) { if (Array.isArray(ll)) ll.forEach(function (p) { all.push(p); }); else all.push(ll); }); } }); }
            if (this._rBridgeLayer) { this._rBridgeLayer.eachLayer(function (l) { if (l.getLatLng) all.push(l.getLatLng()); }); }
            if (all.length > 0) this._rmap.fitBounds(L.latLngBounds(all), { padding: [40, 40], maxZoom: 14 });
        },

        onNavBack: function () {
            this.getOwnerComponent().getRouter().navTo("FreightRoutes");
        },

        onNavHome: function () {
            this.getOwnerComponent().getRouter().navTo("Home");
        }
    });
});
