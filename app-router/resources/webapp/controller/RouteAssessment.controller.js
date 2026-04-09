// ============================================================
// NHVR Route Assessment Controller
// Assesses all bridge/structural assets on an approved route
// for a chosen vehicle — checks capacity, restrictions, clearance
//
// Phase 4.1: Uses server-side assessFreightRouteVehicle action
// instead of duplicate client-side logic.
// ============================================================
sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageToast",
    "sap/m/MessageBox",
    "sap/m/Dialog",
    "sap/m/Button",
    "sap/m/VBox",
    "sap/m/Label",
    "sap/m/Text",
    "sap/m/ObjectStatus",
    "nhvr/bridgemanagement/model/CapabilityManager",
    "nhvr/bridgemanagement/util/UserAnalytics"
], function (Controller, JSONModel, MessageToast, MessageBox,
             Dialog, Button, VBox, Label, UIText, ObjectStatus, CapabilityManager, UserAnalytics) {
    "use strict";

    const BASE = "/bridge-management";
    const H    = { Accept: "application/json" };

    return Controller.extend("nhvr.bridgemanagement.controller.RouteAssessment", {

        onInit: function () {
            UserAnalytics.trackView("RouteAssessment");
            this._model = new JSONModel(this._blankState());
            this.getView().setModel(this._model, "assess");

            var self = this;
            CapabilityManager.load().then(function () {
                if (!CapabilityManager.guardRoute("ROUTE_ASSESSMENT", self.getOwnerComponent().getRouter())) return;
                self._loadRoutes();
                self._loadVehicleTypes();
            });

            // Reset state every time the user navigates to this page
            this.getOwnerComponent().getRouter()
                .getRoute("RouteAssessment")
                .attachPatternMatched(this._onRouteMatched, this);
        },

        _blankState: function () {
            return {
                selectedRouteId      : "",
                selectedVehicleTypeId: "",
                vehicleGVM    : "",
                vehicleGCM    : "",
                vehicleHeight : "",
                vehicleWidth  : "",
                vehicleLength : "",
                crossingSpeed : "40",
                routeInfo     : {},
                results       : [],
                loading       : false,
                overallResultText: "",
                overallResultType: "Success",
                altRoutes     : [],
                altLoading    : false
            };
        },

        _onRouteMatched: function () {
            // Clear all previous results and selections on every visit
            this._model.setData(this._blankState());
            var rs = this.byId("routeSelect");
            if (rs) rs.setSelectedKey("");
            var vs = this.byId("vehicleTypeSelect");
            if (vs) vs.setSelectedKey("");
            // Destroy map so it reinitialises fresh for the next assessment
            if (this._amap) { this._amap.remove(); this._amap = null;
                this._amapRouteLayer = null; this._amapBridgeLayer = null; this._amapAltLayer = null; }
            var mp = this.byId("assessMapPanel");
            if (mp) mp.setVisible(false);
        },

        // ── Load approved routes into select ──────────────────
        _loadRoutes: function () {
            var self = this;
            // Load ApprovedRoutes for the dropdown display
            fetch(BASE + "/ApprovedRoutes?$select=ID,routeId,routeName,routeStatus,routeGrossLimit_t,routeHeightLimit_m,routeWidthLimit_m,totalDistanceKm,limitingBridgeId,limitingConstraint,geojsonRoute&$orderby=routeName&$top=200", { headers: H })
                .then(function (r) { return r.json(); })
                .then(function (j) {
                    var routes = j.value || [];
                    var select = self.byId("routeSelect");
                    if (!select) return;
                    while (select.getItems().length > 1) select.removeItem(1);
                    routes.forEach(function (r) {
                        // Store geojsonRoute on the route object for map plotting
                        if (r.geojsonRoute) { r._geojsonRoute = r.geojsonRoute; }
                        select.addItem(new sap.ui.core.Item({
                            key : r.ID,
                            text: r.routeId + " — " + r.routeName + (r.routeStatus === 'ACTIVE' ? '' : ' (' + r.routeStatus + ')')
                        }));
                    });
                    self._routeData = routes;
                })
                .catch(function (e) { console.error("ApprovedRoutes load failed", e); });

            // Also load FreightRoutes for server-side assessment mapping
            fetch(BASE + "/FreightRoutes?$select=ID,routeCode,name,state,routeClass,corridorMaxMass,corridorMaxHeight,status&$orderby=name&$top=500", { headers: H })
                .then(function (r) { return r.json(); })
                .then(function (j) {
                    self._freightRouteData = j.value || [];
                })
                .catch(function (e) { console.error("FreightRoutes load failed", e); });
        },

        // ── Load vehicle types into select ────────────────────
        _loadVehicleTypes: function () {
            var self = this;
            fetch(BASE + "/VehicleTypes?$select=ID,nhvrClass,displayName,maxGVM_t,maxGCM_t,maxHeight_m,maxWidth_m,maxLength_m&$orderby=displayName&$top=200", { headers: H })
                .then(function (r) { return r.json(); })
                .then(function (j) {
                    var types = j.value || [];
                    var select = self.byId("vehicleTypeSelect");
                    if (!select) return;
                    while (select.getItems().length > 1) select.removeItem(1);
                    types.forEach(function (t) {
                        select.addItem(new sap.ui.core.Item({
                            key : t.ID,
                            text: t.nhvrClass + " — " + t.displayName
                        }));
                    });
                    self._vehicleTypeData = types;
                })
                .catch(function (e) { console.error("VehicleTypes load failed", e); });
        },

        // ── Route selected → prefill route info ───────────────
        onRouteSelected: function (e) {
            var routeId = e.getParameter("selectedItem").getKey();
            this._model.setProperty("/selectedRouteId", routeId);
            if (!routeId) {
                this._model.setProperty("/routeInfo", {});
                return;
            }
            var route = (this._routeData || []).find(function (r) { return r.ID === routeId; });
            if (route) {
                this._model.setProperty("/routeInfo", {
                    routeName          : route.routeName,
                    routeStatus        : route.routeStatus,
                    routeGVMLimitText  : route.routeGrossLimit_t ? route.routeGrossLimit_t + " t" : "—",
                    routeHeightLimitText: route.routeHeightLimit_m ? route.routeHeightLimit_m + " m" : "—",
                    routeWidthLimitText : route.routeWidthLimit_m  ? route.routeWidthLimit_m  + " m" : "—",
                    distanceText       : route.totalDistanceKm ? route.totalDistanceKm + " km" : "—",
                    bridgeCount        : "Loading…",
                    limitingBridgeId   : route.limitingBridgeId || "—"
                });
                // Load bridge count for route (via navigation property)
                var self = this;
                fetch(BASE + "/ApprovedRoutes(" + routeId + ")/bridges?$count=true&$top=0", { headers: H })
                    .then(function (r) { return r.json(); })
                    .then(function (j) {
                        self._model.setProperty("/routeInfo/bridgeCount", String(j["@odata.count"] || 0));
                    })
                    .catch(function () { self._model.setProperty("/routeInfo/bridgeCount", "—"); });
            }
        },

        // ── Vehicle type selected → prefill vehicle specs ─────
        onVehicleTypeSelected: function (e) {
            var vId = e.getParameter("selectedItem").getKey();
            this._model.setProperty("/selectedVehicleTypeId", vId);
            if (!vId) return;
            var vt = (this._vehicleTypeData || []).find(function (t) { return t.ID === vId; });
            if (vt) {
                if (vt.maxGVM_t)    this._model.setProperty("/vehicleGVM",    String(vt.maxGVM_t));
                if (vt.maxGCM_t)    this._model.setProperty("/vehicleGCM",    String(vt.maxGCM_t));
                if (vt.maxHeight_m) this._model.setProperty("/vehicleHeight",  String(vt.maxHeight_m));
                if (vt.maxWidth_m)  this._model.setProperty("/vehicleWidth",   String(vt.maxWidth_m));
                if (vt.maxLength_m) this._model.setProperty("/vehicleLength",  String(vt.maxLength_m));
                MessageToast.show("Vehicle specs pre-filled from " + vt.displayName + ". Adjust if needed.");
            }
        },

        // ── Resolve ApprovedRoute ID to FreightRoute ID ───────
        // The server-side assessFreightRouteVehicle action operates on
        // FreightRoute entities. When the user selects an ApprovedRoute,
        // we try to find the matching FreightRoute by routeCode/routeId.
        // Falls back to using the ApprovedRoute ID directly if no match.
        _resolveFreightRouteId: function (approvedRouteId) {
            var approvedRoute = (this._routeData || []).find(function (r) { return r.ID === approvedRouteId; });
            if (!approvedRoute) return approvedRouteId;

            var routeCode = approvedRoute.routeId; // e.g. "RT-001"
            var routeName = approvedRoute.routeName;

            // Try matching by routeCode first, then by name
            var freightRoutes = this._freightRouteData || [];
            var match = freightRoutes.find(function (fr) { return fr.routeCode === routeCode; });
            if (!match && routeName) {
                match = freightRoutes.find(function (fr) { return fr.name === routeName; });
            }
            return match ? match.ID : approvedRouteId;
        },

        // ── Main: Assess Route (server-side) ──────────────────
        onAssessRoute: function () {
            UserAnalytics.trackAction("assess_route", "RouteAssessment");
            var approvedRouteId = this._model.getProperty("/selectedRouteId");
            if (!approvedRouteId) {
                MessageBox.warning("Please select an approved route to assess.");
                return;
            }

            var gvm    = parseFloat(this._model.getProperty("/vehicleGVM")    || 0);
            var gcm    = parseFloat(this._model.getProperty("/vehicleGCM")    || 0);
            var height = parseFloat(this._model.getProperty("/vehicleHeight")  || 0);
            var width  = parseFloat(this._model.getProperty("/vehicleWidth")   || 0);
            var length = parseFloat(this._model.getProperty("/vehicleLength")  || 0);
            var speed  = parseInt  (this._model.getProperty("/crossingSpeed")  || 40);

            if (gvm === 0 && height === 0) {
                MessageBox.warning("Please enter at least Gross Vehicle Mass or Height to perform an assessment.");
                return;
            }

            this._model.setProperty("/loading", true);
            this._model.setProperty("/results", []);
            this._model.setProperty("/overallResultText", "");

            var self = this;
            var freightRouteId = this._resolveFreightRouteId(approvedRouteId);

            // Determine vehicle class from selected vehicle type
            var vehicleClass = "";
            var vId = this._model.getProperty("/selectedVehicleTypeId");
            if (vId) {
                var vt = (this._vehicleTypeData || []).find(function (t) { return t.ID === vId; });
                if (vt) vehicleClass = vt.nhvrClass || "";
            }

            var payload = {
                routeId:         freightRouteId,
                vehicleGVM_t:    gvm,
                vehicleGCM_t:    gcm,
                vehicleHeight_m: height,
                vehicleWidth_m:  width,
                vehicleLength_m: length,
                crossingSpeed:   speed,
                vehicleClass:    vehicleClass
            };

            fetch(BASE + "/assessFreightRouteVehicle", {
                method: "POST",
                headers: { "Content-Type": "application/json", "Accept": "application/json" },
                credentials: "include",
                body: JSON.stringify(payload)
            })
            .then(function (r) {
                if (!r.ok) {
                    return r.json().then(function (err) {
                        throw new Error(err.error && err.error.message ? err.error.message : "Assessment failed (HTTP " + r.status + ")");
                    });
                }
                return r.json();
            })
            .then(function (j) {
                // Parse the LargeString response
                var result = typeof j.value === "string" ? JSON.parse(j.value) : j.value;

                // Map server response bridges to the UI model format
                var uiResults = self._mapServerResultsToUI(result);
                self._model.setProperty("/results", uiResults);

                // Set overall verdict from server response
                self._setOverallFromServer(result, gvm, height);

                self._model.setProperty("/loading", false);
                // Re-plot map if already open
                if (self._amap) { self._plotAssessRouteOnMap(); }
            })
            .catch(function (e) {
                self._model.setProperty("/loading", false);
                console.error("Route assessment failed", e);
                MessageBox.error("Assessment failed: " + (e.message || "Unknown error. Please try again."));
            });
        },

        // ── Map server bridge results to UI model format ──────
        _mapServerResultsToUI: function (serverResult) {
            var bridges = serverResult.bridges || [];
            return bridges.map(function (b) {
                var eligible = b.verdict !== "FAIL";
                var permitRequired = eligible && b.verdict === "CONDITIONS";

                // Compute margins from server data
                var massMargin = null;
                if (b.effectiveMassLimit_t && serverResult.vehicleConfig && serverResult.vehicleConfig.gvm > 0) {
                    massMargin = b.effectiveMassLimit_t - serverResult.vehicleConfig.gvm;
                }
                var heightMargin = null;
                if (b.effectiveClearance_m && serverResult.vehicleConfig && serverResult.vehicleConfig.height > 0) {
                    heightMargin = b.effectiveClearance_m - serverResult.vehicleConfig.height;
                }
                var widthMargin = null;
                if (b.effectiveWidth_m && serverResult.vehicleConfig && serverResult.vehicleConfig.width > 0) {
                    widthMargin = b.effectiveWidth_m - serverResult.vehicleConfig.width;
                }

                // Build keyNotes from server issues + warnings
                var notes = (b.issues || []).concat(b.warnings || []);
                var keyNotes = notes.length > 0 ? notes.slice(0, 2).join("; ") : "OK — within all limits";

                return {
                    sequence               : b.sequence || 0,
                    ID                     : b.bridgeUUID,
                    bridgeId               : b.bridgeId || "—",
                    bridgeName             : b.name || "Unknown",
                    latitude               : b.latitude || null,
                    longitude              : b.longitude || null,
                    eligible               : eligible,
                    permitRequired         : permitRequired,
                    capacityGVM_t          : b.effectiveMassLimit_t || b.grossMassLimit_t || null,
                    vehicleGVM_t           : serverResult.vehicleConfig ? serverResult.vehicleConfig.gvm : null,
                    massMargin_t           : massMargin,
                    heightMargin_m         : heightMargin,
                    widthMargin_m          : widthMargin,
                    activeRestrictionCount : (b.activeRestrictions || []).length,
                    conditionRating        : b.condition || "NOT_RATED",
                    postingStatus          : b.postingStatus || "NORMAL",
                    keyNotes               : keyNotes
                };
            });
        },

        // ── Set overall result from server response ───────────
        _setOverallFromServer: function (serverResult, gvm, height) {
            var summary  = serverResult.summary || {};
            var total    = summary.total   || 0;
            var pass     = summary.passing || 0;
            var permit   = summary.warned  || 0;
            var fail     = summary.failing || 0;

            // Aggregate restriction count from results
            var results = this._model.getProperty("/results") || [];
            var rests   = results.reduce(function (s, r) { return s + (r.activeRestrictionCount || 0); }, 0);

            // Find limiting asset
            var limiting = serverResult.limitingAsset || "—";
            var minCap   = null;
            var withCap  = results.filter(function (r) { return r.capacityGVM_t > 0; });
            if (withCap.length) {
                minCap = Math.min.apply(null, withCap.map(function (r) { return r.capacityGVM_t; }));
            }

            this._setResultKpi("resTotalAssets",   String(total));
            this._setResultKpi("resPass",          String(pass));
            this._setResultKpi("resPermit",        String(permit));
            this._setResultKpi("resFail",          String(fail));
            this._setResultKpi("resRestrictions",  String(rests));
            this._setResultKpi("resLimitingAsset", limiting);
            this._setResultKpi("resMinGVM",        minCap ? minCap + " t" : "—");

            var verdict = serverResult.routeVerdict;
            if (verdict === "REFUSED" || fail > 0) {
                this._model.setProperty("/overallResultText",
                    "Route BLOCKED — " + fail + " asset(s) FAIL for this vehicle (GVM: " + gvm + "t, H: " + height + "m). This vehicle CANNOT traverse the route as configured.");
                this._model.setProperty("/overallResultType", "Error");
            } else if (verdict === "APPROVED_WITH_CONDITIONS" || permit > 0) {
                this._model.setProperty("/overallResultText",
                    "Route REQUIRES CONDITIONS — " + permit + " asset(s) have conditions. " + pass + " asset(s) pass without restriction. Obtain appropriate NHVR permit before proceeding.");
                this._model.setProperty("/overallResultType", "Warning");
            } else {
                this._model.setProperty("/overallResultText",
                    "Route CLEAR — All " + total + " asset(s) pass for this vehicle (GVM: " + gvm + "t, H: " + height + "m). No restrictions or capacity issues detected.");
                this._model.setProperty("/overallResultType", "Success");
            }
        },

        _setResultKpi: function (id, val) {
            var ctrl = this.byId(id);
            if (ctrl) ctrl.setText(val);
        },

        // ── Clear assessment ───────────────────────────────────
        onClearAssessment: function () {
            this._onRouteMatched();
            MessageToast.show("Assessment cleared.");
        },

        // ── Asset link → BridgeDetail ──────────────────────────
        onAssetLinkPress: function (e) {
            var ctx = e.getSource().getBindingContext("assess");
            if (!ctx) return;
            var row = ctx.getObject();
            var bid = (row.bridgeId && row.bridgeId !== "—") ? row.bridgeId : row.ID;
            if (bid) {
                this.getOwnerComponent().getRouter().navTo("BridgeDetail", { bridgeId: encodeURIComponent(bid) });
            }
        },

        // ── Export results CSV ─────────────────────────────────
        onExportResults: function () {
            var results = this._model.getProperty("/results") || [];
            if (results.length === 0) { MessageToast.show("No results to export."); return; }

            var cols = ["sequence","bridgeId","bridgeName","eligible","permitRequired",
                          "capacityGVM_t","vehicleGVM_t","massMargin_t","heightMargin_m",
                          "widthMargin_m","activeRestrictionCount","conditionRating",
                          "postingStatus","keyNotes"];
            var header = cols.join(",");
            var lines  = results.map(function (r) {
                return cols.map(function (c) {
                    var v = r[c] !== undefined && r[c] !== null ? String(r[c]) : "";
                    return v.indexOf(",") >= 0 ? '"' + v + '"' : v;
                }).join(",");
            });
            var content = [header].concat(lines).join("\n");
            var blob = new Blob([content], { type: "text/csv" });
            var url  = URL.createObjectURL(blob);
            var a    = document.createElement("a");
            a.href = url; a.download = "route_assessment_results.csv";
            document.body.appendChild(a); a.click();
            document.body.removeChild(a); URL.revokeObjectURL(url);
            MessageToast.show("Exported " + results.length + " asset results.");
        },

        // ── Find Alternative Routes ────────────────────────────
        onFindAlternativeRoutes: function () {
            var routeId = this._model.getProperty("/selectedRouteId");
            if (!routeId) { MessageToast.show("Please select a route first"); return; }

            var gvm    = parseFloat(this._model.getProperty("/vehicleGVM")    || 0);
            var height = parseFloat(this._model.getProperty("/vehicleHeight") || 0);
            var width  = parseFloat(this._model.getProperty("/vehicleWidth")  || 0);

            this._model.setProperty("/altLoading", true);
            this._model.setProperty("/altRoutes", []);

            var self = this;
            // Fetch selected route with geometry fields for coordinate extraction
            fetch(BASE + "/ApprovedRoutes(" + routeId + ")?$select=ID,routeId,routeName,startPoint,endPoint,geojsonRoute,routeGrossLimit_t,routeHeightLimit_m,routeWidthLimit_m,totalDistanceKm,routeStatus", { headers: H })
                .then(function (r) { return r.json(); })
                .then(function (route) {
                    var coords = self._extractRouteCoords(route);
                    return Promise.all([
                        self._findInternalAlternatives(routeId, gvm, height, width),
                        coords ? self._findOSRMAlternatives(coords.start, coords.end) : Promise.resolve([])
                    ]);
                })
                .then(function (arr) {
                    var internal = arr[0], osrm = arr[1];
                    var all = internal.concat(osrm);
                    self._model.setProperty("/altRoutes", all);
                    self._model.setProperty("/altLoading", false);
                    var altCount = self.byId("altCount");
                    if (altCount) altCount.setText(all.length + " alternative(s) found");
                    if (all.length === 0) {
                        MessageToast.show("No alternative routes found for this vehicle configuration");
                    }
                    // Re-plot map if already open
                    if (self._amap) { self._plotAssessAltsOnMap(); }
                })
                .catch(function (e) {
                    self._model.setProperty("/altLoading", false);
                    MessageBox.error("Failed to find alternative routes: " + (e.message || "Unknown error"));
                });
        },

        // ── Extract start/end coords from route record ─────────
        _extractRouteCoords: function (route) {
            // Try geojsonRoute first (GeoJSON LineString: [[lon,lat], ...])
            if (route.geojsonRoute) {
                try {
                    var geo = typeof route.geojsonRoute === "string"
                        ? JSON.parse(route.geojsonRoute) : route.geojsonRoute;
                    var coords = (geo.type === "Feature")
                        ? (geo.geometry && geo.geometry.coordinates)
                        : geo.coordinates;
                    if (coords && coords.length >= 2) {
                        return {
                            start: { lon: coords[0][0],                  lat: coords[0][1] },
                            end:   { lon: coords[coords.length - 1][0],  lat: coords[coords.length - 1][1] }
                        };
                    }
                } catch (e) { /* fall through */ }
            }
            // Fallback: startPoint / endPoint as "lat,lon" strings
            if (route.startPoint && route.endPoint) {
                try {
                    var parse = function (s) {
                        var parts = s.trim().split(",");
                        return { lat: parseFloat(parts[0]), lon: parseFloat(parts[1]) };
                    };
                    var s = parse(route.startPoint);
                    var e2 = parse(route.endPoint);
                    if (!isNaN(s.lat) && !isNaN(s.lon) && !isNaN(e2.lat) && !isNaN(e2.lon)) {
                        return { start: s, end: e2 };
                    }
                } catch (ex) { /* fall through */ }
            }
            return null;
        },

        // ── Search internal ApprovedRoutes ─────────────────────
        _findInternalAlternatives: function (currentRouteId, gvm, height, width) {
            // Build OData filter: exclude current route, must be ACTIVE, limits must accommodate vehicle
            var filter = "ID ne " + currentRouteId + " and routeStatus eq 'ACTIVE'";
            if (gvm > 0)    filter += " and (routeGrossLimit_t eq null or routeGrossLimit_t ge " + gvm + ")";
            if (height > 0) filter += " and (routeHeightLimit_m eq null or routeHeightLimit_m ge " + height + ")";
            if (width > 0)  filter += " and (routeWidthLimit_m eq null or routeWidthLimit_m ge " + width + ")";

            return fetch(
                BASE + "/ApprovedRoutes?$filter=" + encodeURIComponent(filter) + "&$select=ID,routeId,routeName,routeStatus,routeGrossLimit_t,routeHeightLimit_m,routeWidthLimit_m,totalDistanceKm&$top=5&$orderby=routeName",
                { headers: H }
            )
                .then(function (r) { return r.json(); })
                .then(function (j) {
                    return (j.value || []).map(function (r) {
                        return {
                            source      : "INTERNAL",
                            sourceBadge : "Approved Route",
                            routeId     : r.ID,
                            routeCode   : r.routeId || "—",
                            name        : r.routeName || "Unnamed",
                            status      : r.routeStatus,
                            distanceKm  : r.totalDistanceKm ? r.totalDistanceKm.toFixed(1) + " km" : "—",
                            massLimit   : r.routeGrossLimit_t  ? r.routeGrossLimit_t  + " t" : "No limit",
                            heightLimit : r.routeHeightLimit_m ? r.routeHeightLimit_m + " m" : "No limit",
                            widthLimit  : r.routeWidthLimit_m  ? r.routeWidthLimit_m  + " m" : "No limit",
                            feasibility : "VIABLE",
                            notes       : "Approved route — meets vehicle mass, height, and width criteria"
                        };
                    });
                })
                .catch(function () { return []; });
        },

        // ── Search OSRM for road alternatives ─────────────────
        _findOSRMAlternatives: function (start, end) {
            // OSRM Demo Server — free, open-source, no API key required
            var url = "https://router.project-osrm.org/route/v1/driving/" +
                start.lon + "," + start.lat + ";" +
                end.lon   + "," + end.lat +
                "?alternatives=3&overview=false&steps=false";

            return fetch(url, { signal: AbortSignal.timeout(8000) })
                .then(function (r) { return r.json(); })
                .then(function (data) {
                    if (!data.routes || data.routes.length === 0) return [];
                    return data.routes.map(function (r, idx) {
                        return {
                            source      : "OSRM",
                            sourceBadge : "OSM Routing",
                            routeId     : null,
                            routeCode   : "OSM-" + (idx + 1),
                            name        : idx === 0
                                ? "Primary Road Route (OpenStreetMap)"
                                : "Alternative Road Route " + idx + " (OpenStreetMap)",
                            status      : "EXTERNAL",
                            distanceKm  : r.distance ? (r.distance / 1000).toFixed(1) + " km" : "—",
                            durationMin : r.duration ? Math.round(r.duration / 60) + " min est." : "—",
                            massLimit   : "Not assessed",
                            heightLimit : "Not assessed",
                            widthLimit  : "Not assessed",
                            feasibility : "UNASSESSED",
                            notes       : "Road route from OpenStreetMap. " +
                                (r.distance ? (r.distance / 1000).toFixed(1) + " km" : "") +
                                (r.duration ? ", approx " + Math.round(r.duration / 60) + " min. " : ". ") +
                                "Bridge compliance unverified — assess before use."
                        };
                    });
                })
                .catch(function () {
                    return [{
                        source      : "OSRM",
                        sourceBadge : "OSM Routing",
                        routeId     : null,
                        routeCode   : "N/A",
                        name        : "OSM routing unavailable",
                        status      : "ERROR",
                        distanceKm  : "—",
                        massLimit   : "—",
                        heightLimit : "—",
                        widthLimit  : "—",
                        feasibility : "UNASSESSED",
                        notes       : "Could not reach OpenStreetMap routing service. Check internet connectivity or try again."
                    }];
                });
        },

        // ── Dismiss alternative routes panel ───────────────────
        onCloseAltRoutes: function () {
            this._model.setProperty("/altRoutes", []);
        },

        // ── Assess an internal alternative route ───────────────
        onAssessAlternativeRoute: function (oEvent) {
            var ctx = oEvent.getSource().getBindingContext("assess");
            if (!ctx) return;
            var alt = ctx.getObject();
            if (!alt || !alt.routeId) { MessageToast.show("Cannot assess this route type"); return; }

            // Switch the route selector to the alternative and re-assess
            var routeKey = alt.routeId;
            this._model.setProperty("/selectedRouteId", routeKey);
            this._model.setProperty("/altRoutes", []);

            var rs = this.byId("routeSelect");
            if (rs) rs.setSelectedKey(routeKey);

            var route = (this._routeData || []).find(function (r) { return r.ID === routeKey; });
            if (route) {
                this._model.setProperty("/routeInfo", {
                    routeName           : route.routeName,
                    routeStatus         : route.routeStatus,
                    routeGVMLimitText   : route.routeGrossLimit_t  ? route.routeGrossLimit_t  + " t" : "—",
                    routeHeightLimitText: route.routeHeightLimit_m ? route.routeHeightLimit_m + " m" : "—",
                    routeWidthLimitText : route.routeWidthLimit_m  ? route.routeWidthLimit_m  + " m" : "—",
                    distanceText        : route.totalDistanceKm    ? route.totalDistanceKm    + " km" : "—",
                    bridgeCount         : "—",
                    limitingBridgeId    : route.limitingBridgeId || "—"
                });
            }
            MessageToast.show("Switched to: " + (alt.name || alt.routeCode) + ". Running assessment…");
            this.onAssessRoute();
        },

        // ── Formatters ─────────────────────────────────────────
        formatMargin: function (v) {
            if (v === null || v === undefined) return "—";
            var n = parseFloat(v);
            return (n >= 0 ? "+" : "") + n.toFixed(2) + " t";
        },
        formatMarginState: function (v) {
            if (v === null || v === undefined) return "None";
            var n = parseFloat(v);
            return n < 0 ? "Error" : n < 2 ? "Warning" : "Success";
        },
        formatClearance: function (v) {
            if (v === null || v === undefined) return "—";
            var n = parseFloat(v);
            return (n >= 0 ? "+" : "") + n.toFixed(2) + " m";
        },
        formatClearanceState: function (v) {
            if (v === null || v === undefined) return "None";
            var n = parseFloat(v);
            return n < 0 ? "Error" : n < 0.3 ? "Warning" : "Success";
        },

        // ══ ASSESSMENT MAP ════════════════════════════════════════════
        // Leaflet map for RouteAssessment — shows approved route geometry,
        // assessed bridge markers, and alternative route polylines.
        // ═════════════════════════════════════════════════════════════

        _amap            : null,
        _amapBaseLayer   : null,
        _amapRouteLayer  : null,
        _amapBridgeLayer : null,
        _amapAltLayer    : null,

        _amapBaseLayers: {
            osm:       { url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
                         attribution: "© OpenStreetMap", maxZoom: 19 },
            satellite: { url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
                         attribution: "Tiles © Esri", maxZoom: 18 },
            topo:      { url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
                         attribution: "© OpenTopoMap", maxZoom: 17 }
        },

        onToggleAssessMap: function () {
            var panel = this.byId("assessMapPanel");
            if (!panel) return;
            var showing = panel.getVisible();
            panel.setVisible(!showing);
            if (!showing) { setTimeout(this._initAssessMap.bind(this), 80); }
        },

        onAssessMapHolderRendered: function () {
            var panel = this.byId("assessMapPanel");
            if (panel && panel.getVisible()) { setTimeout(this._initAssessMap.bind(this), 80); }
        },

        _initAssessMap: function () {
            if (typeof L === "undefined") return;
            var mapDiv = document.getElementById("nhvr-assess-map");
            if (!mapDiv) { setTimeout(this._initAssessMap.bind(this), 100); return; }
            if (this._amap) { setTimeout(function () { this._amap.invalidateSize(); }.bind(this), 100); return; }

            this._amap = L.map("nhvr-assess-map", { center: [-27.0, 133.0], zoom: 5 });
            var def = this._amapBaseLayers.osm;
            this._amapBaseLayer  = L.tileLayer(def.url, { attribution: def.attribution, maxZoom: def.maxZoom }).addTo(this._amap);
            this._amapRouteLayer  = L.layerGroup().addTo(this._amap);
            this._amapBridgeLayer = L.layerGroup().addTo(this._amap);
            this._amapAltLayer    = L.layerGroup().addTo(this._amap);

            // Legend
            var legend = L.control({ position: "bottomright" });
            legend.onAdd = function () {
                var d = L.DomUtil.create("div", "nhvrMapRouteLegend");
                d.innerHTML = "<b>Assessment</b><br>"
                    + "<span style='color:#107E3E'>●</span> PASS &nbsp;"
                    + "<span style='color:#E9730C'>●</span> PERMIT &nbsp;"
                    + "<span style='color:#BB0000'>●</span> FAIL";
                return d;
            };
            legend.addTo(this._amap);

            this._plotAssessRouteOnMap();
            this._plotAssessAltsOnMap();
            setTimeout(function () { if (this._amap) this._amap.invalidateSize(); }.bind(this), 200);
        },

        _assessVerdictColor: function (eligible, permitRequired) {
            if (!eligible)    return "#BB0000";
            if (permitRequired) return "#E9730C";
            return "#107E3E";
        },

        _plotAssessRouteOnMap: function () {
            if (!this._amap || !this._amapRouteLayer || !this._amapBridgeLayer) return;
            this._amapRouteLayer.clearLayers();
            this._amapBridgeLayer.clearLayers();

            // Plot approved route GeoJSON geometry
            var routeId = this._model.getProperty("/selectedRouteId");
            var route   = (this._routeData || []).find(function (r) { return r.ID === routeId; });
            if (route && route._geojsonRoute) {
                try {
                    var geo = typeof route._geojsonRoute === "string"
                        ? JSON.parse(route._geojsonRoute) : route._geojsonRoute;
                    var coords = geo.coordinates || (geo.geometry && geo.geometry.coordinates);
                    if (coords && coords.length > 1) {
                        var lls = coords.map(function (c) { return [c[1], c[0]]; });
                        L.polyline(lls, { color: "#0064D9", weight: 4, opacity: 0.8, dashArray: "6 4" })
                            .bindPopup("<b>" + (route.routeId || "") + " — " + (route.routeName || "") + "</b>")
                            .addTo(this._amapRouteLayer);
                    }
                } catch (e) { /* ignore */ }
            }

            // Plot assessed bridges
            var results = this._model.getProperty("/results") || [];
            var bounds  = [];
            var self = this;
            results.forEach(function (r) {
                if (!r.latitude || !r.longitude) return;
                var lat = parseFloat(r.latitude), lng = parseFloat(r.longitude);
                bounds.push([lat, lng]);
                var color = self._assessVerdictColor(r.eligible, r.permitRequired);
                L.circleMarker([lat, lng], {
                    radius: 9, fillColor: color, color: "#fff", weight: 2, fillOpacity: 0.9
                }).bindPopup(
                    "<b>" + (r.bridgeId || "") + " — " + (r.bridgeName || "") + "</b><br>"
                    + (r.eligible === false ? "<span style='color:#BB0000'>FAIL</span>" : r.permitRequired ? "<span style='color:#E9730C'>PERMIT REQUIRED</span>" : "<span style='color:#107E3E'>PASS</span>")
                    + "<br>" + (r.keyNotes || ""), { maxWidth: 280 }
                ).addTo(self._amapBridgeLayer);
            });

            if (bounds.length > 0) {
                this._amap.fitBounds(L.latLngBounds(bounds), { padding: [40, 40], maxZoom: 14 });
            }
        },

        _plotAssessAltsOnMap: function () {
            if (!this._amap || !this._amapAltLayer) return;
            this._amapAltLayer.clearLayers();
            var alts = this._model.getProperty("/altRoutes") || [];
            var colors = ["#9B59B6", "#16A085", "#D35400", "#2980B9"];
            alts.forEach(function (alt, idx) {
                if (!alt.osrmGeometry) return;
                var color = colors[idx % colors.length];
                var lls = alt.osrmGeometry.map(function (c) { return [c[1], c[0]]; });
                L.polyline(lls, { color: color, weight: 3, opacity: 0.75 })
                    .bindPopup("<b>" + (alt.name || alt.routeCode || "Alt") + "</b><br>" + (alt.notes || ""))
                    .addTo(this._amapAltLayer);
            });
        },

        onAssessBaseMapChange: function (oEvent) {
            if (!this._amap) return;
            var key = oEvent.getSource().getSelectedKey();
            var def = this._amapBaseLayers[key] || this._amapBaseLayers.osm;
            if (this._amapBaseLayer) this._amap.removeLayer(this._amapBaseLayer);
            this._amapBaseLayer = L.tileLayer(def.url, { attribution: def.attribution, maxZoom: def.maxZoom }).addTo(this._amap);
        },

        onAssessLayerToggle: function (oEvent) {
            if (!this._amap) return;
            var id  = oEvent.getSource().getId().split("--").pop();
            var on  = oEvent.getSource().getSelected();
            var map = {
                "chkAssessRoute"     : this._amapRouteLayer,
                "chkAssessBridges"   : this._amapBridgeLayer,
                "chkAssessAltRoutes" : this._amapAltLayer
            };
            var layer = null;
            Object.keys(map).forEach(function (k) { if (id.endsWith(k) || id === k) layer = map[k]; });
            if (!layer) return;
            if (on) this._amap.addLayer(layer); else this._amap.removeLayer(layer);
        },

        onFitAssessMap: function () {
            if (!this._amap) return;
            var all = [];
            [this._amapRouteLayer, this._amapBridgeLayer].forEach(function (lg) {
                if (!lg) return;
                lg.eachLayer(function (l) {
                    if (l.getLatLngs) { l.getLatLngs().forEach(function (p) { if (Array.isArray(p)) p.forEach(function (x) { all.push(x); }); else all.push(p); }); }
                    if (l.getLatLng)  all.push(l.getLatLng());
                });
            });
            if (all.length > 0) this._amap.fitBounds(L.latLngBounds(all), { padding: [40, 40], maxZoom: 14 });
        },

        // ── Navigation ─────────────────────────────────────────
        onNavHome: function () {
            this.getOwnerComponent().getRouter().navTo("Home");
        }
    });
});
