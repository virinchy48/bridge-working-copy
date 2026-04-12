// ============================================================
// NHVR Route Planner Controller
// MapLibre GL JS map, ORS HGV routing, OSRM/Valhalla fallback,
// Waypoints, Vehicle Profile persistence, Export (GPX/CSV),
// Draw tool, Per-bridge structure assessment
// ============================================================
sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageToast",
    "sap/m/MessageBox",
    "sap/m/SuggestionItem",
    "nhvr/bridgemanagement/util/UserAnalytics",
    "nhvr/bridgemanagement/model/CapabilityManager",
    "nhvr/bridgemanagement/util/LookupService",
    "nhvr/bridgemanagement/util/AuthFetch"
], function (Controller, JSONModel, MessageToast, MessageBox, SuggestionItem, UserAnalytics, CapabilityManager, LookupService, AuthFetch) {
    "use strict";

    // ── Constants ──────────────────────────────────────────────
    const NOMINATIM           = "https://nominatim.openstreetmap.org";
    const OSRM_BASE           = "https://router.project-osrm.org/route/v1/driving";
    const VALHALLA            = "https://valhalla.openstreetmap.de/route";
    const ORS_BASE            = "https://api.openrouteservice.org/v2/directions";
    const ORS_PROFILE         = "driving-hgv";
    const BASE                = "/bridge-management";
    const PROXIMITY_M         = 500;
    const STORAGE_KEY_ORS     = "nhvr_ors_api_key";
    const STORAGE_KEY_HERE    = "nhvr_here_api_key";
    const STORAGE_KEY_PROFILE = "nhvr_vehicle_profile";

    const MAP_STYLES = {
        streets:   "https://tiles.openfreemap.org/styles/liberty",
        bright:    "https://tiles.openfreemap.org/styles/bright",
        satellite: null,   // ESRI raster tiles
        topo:      null    // OpenTopoMap raster tiles
    };

    const ROUTE_COLOURS = ["#0070F2", "#E9730C", "#8B00FF", "#00AA55"];

    return Controller.extend("nhvr.bridgemanagement.controller.RoutePlanner", {

        // ── Lifecycle ──────────────────────────────────────────
        onInit: function () {
            UserAnalytics.trackView("RoutePlanner");
            // Route options model
            this.getView().setModel(new JSONModel({ routes: [] }), "rpRoutes");
            // Bridge assessment results model
            this.getView().setModel(new JSONModel({ bridges: [] }), "rpBridges");

            // Vehicle Class dropdown sourced from Lookup table
            var self = this;
            LookupService.load().then(function () {
                LookupService.populateFormSelect(self.byId("rpVehicleClass"), "VEHICLE_CLASS");
            });

            // Internal state
            this._originCoord        = null;   // [lon, lat]
            this._destCoord          = null;   // [lon, lat]
            this._waypoints          = [];     // array of { id, coord, input }
            this._routes             = [];     // array of route objects
            this._selectedRoute      = null;   // chosen route
            this._assessResult       = null;   // last assessRouteGeometry result
            this._allBridges         = [];
            this._allBridgesGeoJSON  = null;

            // MapLibre references
            this._rpMap              = null;

            // Drawing state
            this._drawMode           = false;
            this._drawPoints         = [];

            // Debounce timers
            this._originTimer        = null;
            this._destTimer          = null;
            this._waypointTimers     = {};

            // Load saved vehicle profile
            this._loadVehicleProfile();

            // Register route lifecycle
            this.getOwnerComponent().getRouter()
                .getRoute("RoutePlanner")
                .attachPatternMatched(this._onRouteMatched, this);
        },

        _onRouteMatched: function () {
            // Capability guard — redirect Home if ROUTE_ASSESSMENT is disabled
            CapabilityManager.guardRoute("ROUTE_ASSESSMENT", this.getOwnerComponent().getRouter());

            // Reset all state on every page visit
            this._originCoord   = null;
            this._destCoord     = null;
            this._waypoints     = [];
            this._routes        = [];
            this._selectedRoute = null;
            this._assessResult  = null;
            this._allBridges    = [];
            this._drawMode      = false;
            this._drawPoints    = [];

            // Clear inputs
            this.byId("rpOriginInput").setValue("");
            this.byId("rpDestInput").setValue("");

            // Clear waypoint container
            this.byId("rpWaypointContainer").destroyItems
                ? this.byId("rpWaypointContainer").destroyItems()
                : null;
            try {
                var oWC = this.byId("rpWaypointContainer");
                oWC.removeAllItems ? oWC.removeAllItems() : null;
            } catch (_) { jQuery.sap.log.error("[NHVR] Waypoint container cleanup failed", _ && _.message || String(_)); }

            // Reset models
            this.getView().getModel("rpRoutes").setData({ routes: [] });
            this.getView().getModel("rpBridges").setData({ bridges: [] });

            // Hide panels
            this.byId("rpRoutesPanel").setVisible(false);
            this.byId("rpAssessBar").setVisible(false);
            this.byId("rpResultsPanel").setVisible(false);
            this.byId("rpBusy").setVisible(false);
            this.byId("rpFindRoutesBtn").setEnabled(false);

            // Check ORS key
            var orsKey = localStorage.getItem(STORAGE_KEY_ORS);
            this.byId("rpApiKeyWarning").setVisible(!orsKey);

            // Destroy existing map and reinit with MapLibre
            if (this._rpMap) {
                try { this._rpMap.remove(); } catch (_) { /* map already removed */ }
                this._rpMap = null;
            }

            setTimeout(function () { this._loadMapLibre(); }.bind(this), 100);
        },

        // ── Navigation ─────────────────────────────────────────
        onNavBack: function () {
            this.getOwnerComponent().getRouter().navTo("Home");
        },

        // ── Vehicle Profile Persistence ────────────────────────
        _loadVehicleProfile: function () {
            try {
                var raw = localStorage.getItem(STORAGE_KEY_PROFILE);
                if (!raw) return;
                var p = JSON.parse(raw);
                var self = this;
                // Use timeout to allow view to finish rendering before setting values
                setTimeout(function () {
                    try {
                        if (p.gvm)      self.byId("rpGVM").setValue(p.gvm);
                        if (p.height)   self.byId("rpHeight").setValue(p.height);
                        if (p.width)    self.byId("rpWidth").setValue(p.width);
                        if (p.length)   self.byId("rpLength").setValue(p.length);
                        if (p.axleLoad) self.byId("rpAxleLoad").setValue(p.axleLoad);
                        if (p.gcm)      self.byId("rpGCM").setValue(p.gcm);
                        if (p.speed)    self.byId("rpSpeed").setValue(p.speed);
                        if (p.vClass)   self.byId("rpVehicleClass").setSelectedKey(p.vClass);
                        if (p.engine)   self.byId("rpEngineSelect").setSelectedKey(p.engine);
                    } catch (e) {
                        // View not yet ready
                    }
                }, 200);
            } catch (e) {
                // Ignore corrupt profile
            }
        },

        onSaveVehicleProfile: function () {
            var p = {
                gvm:      this.byId("rpGVM").getValue(),
                height:   this.byId("rpHeight").getValue(),
                width:    this.byId("rpWidth").getValue(),
                length:   this.byId("rpLength").getValue(),
                axleLoad: this.byId("rpAxleLoad").getValue(),
                gcm:      this.byId("rpGCM").getValue(),
                speed:    this.byId("rpSpeed").getValue(),
                vClass:   this.byId("rpVehicleClass").getSelectedKey(),
                engine:   this.byId("rpEngineSelect").getSelectedKey()
            };
            localStorage.setItem(STORAGE_KEY_PROFILE, JSON.stringify(p));
            MessageToast.show("Vehicle profile saved");
        },

        onClearRoute: function () {
            this._originCoord   = null;
            this._destCoord     = null;
            this._routes        = [];
            this._selectedRoute = null;
            this._assessResult  = null;
            this._allBridges    = [];

            this.byId("rpOriginInput").setValue("");
            this.byId("rpDestInput").setValue("");

            this.getView().getModel("rpRoutes").setData({ routes: [] });
            this.getView().getModel("rpBridges").setData({ bridges: [] });

            this.byId("rpRoutesPanel").setVisible(false);
            this.byId("rpAssessBar").setVisible(false);
            this.byId("rpResultsPanel").setVisible(false);
            this.byId("rpBusy").setVisible(false);
            this._updateFindBtn();

            // Clear map layers
            if (this._rpMap) {
                try {
                    var routeSource = this._rpMap.getSource("routes");
                    if (routeSource) routeSource.setData({ type: "FeatureCollection", features: [] });
                    var odSource = this._rpMap.getSource("od-markers");
                    if (odSource) odSource.setData({ type: "FeatureCollection", features: [] });
                } catch (_) { jQuery.sap.log.error("[NHVR] Map layer cleanup failed", _ && _.message || String(_)); }
            }
        },

        // ── Waypoint Management ────────────────────────────────
        onAddWaypoint: function () {
            var idx = this._waypoints.length;
            var id  = "rpWaypoint_" + idx;
            var oContainer = this.byId("rpWaypointContainer");

            var oHBox = new sap.m.HBox({ alignItems: "Center" }).addStyleClass("sapUiTinyMarginBottom");
            var oInput = new sap.m.Input({
                id: this.createId(id),
                placeholder: "Waypoint " + (idx + 1) + " — e.g. Toowoomba QLD",
                width: "260px",
                showSuggestion: true,
                filterSuggests: false,
                liveChange: function (oE) {
                    var val = oE.getParameter("value") || "";
                    clearTimeout(this._waypointTimers[id]);
                    if (val.length >= 3) {
                        this._waypointTimers[id] = setTimeout(
                            function () { this._geocodeSuggest(val, id); }.bind(this), 400);
                    }
                }.bind(this),
                suggestionItemSelected: function (oE) {
                    var item = oE.getParameter("selectedItem");
                    if (item) {
                        var coord = item.data("coord");
                        var wp = this._waypoints.find(function (w) { return w.id === id; });
                        if (wp) {
                            wp.coord = coord;
                            this._updateFindBtn();
                        }
                    }
                }.bind(this)
            });
            oInput.addStyleClass("sapUiTinyMarginEnd");

            var oRemoveBtn = new sap.m.Button({
                icon: "sap-icon://decline",
                type: "Transparent",
                tooltip: "Remove waypoint",
                press: function () {
                    oContainer.removeItem(oHBox);
                    oHBox.destroy();
                    this._waypoints = this._waypoints.filter(function (w) { return w.id !== id; });
                    this._updateFindBtn();
                }.bind(this)
            });

            oHBox.addItem(oInput);
            oHBox.addItem(oRemoveBtn);
            oContainer.addItem(oHBox);

            this._waypoints.push({ id: id, coord: null, input: oInput });
        },

        // ── Origin/Destination Input Handlers ──────────────────
        onOriginLiveChange: function (oEvent) {
            var val = oEvent.getParameter("value") || "";
            this._originCoord = null;
            this._updateFindBtn();
            clearTimeout(this._originTimer);
            if (val.length >= 3) {
                this._originTimer = setTimeout(
                    function () { this._geocodeSuggest(val, "rpOriginInput"); }.bind(this), 400);
            }
        },

        onDestLiveChange: function (oEvent) {
            var val = oEvent.getParameter("value") || "";
            this._destCoord = null;
            this._updateFindBtn();
            clearTimeout(this._destTimer);
            if (val.length >= 3) {
                this._destTimer = setTimeout(
                    function () { this._geocodeSuggest(val, "rpDestInput"); }.bind(this), 400);
            }
        },

        onOriginSuggest: function (oEvent) {
            var val = oEvent.getParameter("suggestValue") || "";
            if (val.length >= 3) this._geocodeSuggest(val, "rpOriginInput");
        },

        onDestSuggest: function (oEvent) {
            var val = oEvent.getParameter("suggestValue") || "";
            if (val.length >= 3) this._geocodeSuggest(val, "rpDestInput");
        },

        onOriginSuggestionSelected: function (oEvent) {
            var item = oEvent.getParameter("selectedItem");
            if (!item) return;
            var data = item.data("coord");
            if (data) {
                this._originCoord = data;
                this._updateFindBtn();
            }
        },

        onDestSuggestionSelected: function (oEvent) {
            var item = oEvent.getParameter("selectedItem");
            if (!item) return;
            var data = item.data("coord");
            if (data) {
                this._destCoord = data;
                this._updateFindBtn();
            }
        },

        _geocodeSuggest: function (query, inputId) {
            var input = this.byId(inputId);
            if (!input) return;
            var url = NOMINATIM + "/search?q=" + encodeURIComponent(query) +
                      "&format=json&limit=6&countrycodes=au&addressdetails=0&dedupe=1";
            fetch(url, {
                headers: {
                    "Accept": "application/json",
                    "Accept-Language": "en-AU"
                }
            })
                .then(function (r) {
                    if (!r.ok) throw new Error("Nominatim " + r.status);
                    return r.json();
                })
                .then(function (results) {
                    input.removeAllSuggestionItems();
                    (results || []).slice(0, 6).forEach(function (r) {
                        var parts = (r.display_name || "").split(", ");
                        var short = parts.length > 2
                            ? parts.slice(0, 3).join(", ")
                            : r.display_name;
                        var item = new SuggestionItem({ key: String(r.place_id), text: short });
                        item.data("coord", [parseFloat(r.lon), parseFloat(r.lat)]);
                        input.addSuggestionItem(item);
                    });
                    if ((results || []).length > 0) {
                        if (input._openSuggestionPopup) {
                            input._openSuggestionPopup();
                        } else {
                            input.fireSuggest({ suggestValue: query });
                        }
                    }
                })
                .catch(function (err) {
                    console.warn("Geocode suggest failed:", err.message);
                });
        },

        _updateFindBtn: function () {
            var originOk = !!(this._originCoord) || (this.byId("rpOriginInput").getValue().length >= 3);
            var destOk   = !!(this._destCoord)   || (this.byId("rpDestInput").getValue().length >= 3);
            this.byId("rpFindRoutesBtn").setEnabled(originOk && destOk);
        },

        // ── Engine Change ──────────────────────────────────────
        onEngineChange: function () {
            if (this._originCoord && this._destCoord && this._routes.length > 0) {
                this.onFindRoutes();
            }
        },

        // ── Find Routes (dispatcher) ───────────────────────────
        onFindRoutes: function () {
            var self = this;
            var originText = this.byId("rpOriginInput").getValue();
            var destText   = this.byId("rpDestInput").getValue();

            if (!originText && !destText) {
                MessageToast.show("Please enter origin and destination");
                return;
            }

            // If coords are missing, geocode the text first then route
            if (!this._originCoord || !this._destCoord) {
                this.byId("rpBusy").setVisible(true);
                this.byId("rpBusy").setText("Geocoding locations…");
                var geocodePromises = [];
                if (!this._originCoord && originText) {
                    geocodePromises.push(
                        fetch("https://nominatim.openstreetmap.org/search?q=" + encodeURIComponent(originText) +
                              "&format=json&limit=1&countrycodes=au", { headers: { Accept: "application/json" } })
                        .then(function (r) { return r.json(); })
                        .then(function (res) {
                            if (res && res[0]) {
                                self._originCoord = [parseFloat(res[0].lon), parseFloat(res[0].lat)];
                                self.byId("rpOriginInput").setValue(res[0].display_name.split(", ").slice(0,3).join(", "));
                            }
                        })
                    );
                }
                if (!this._destCoord && destText) {
                    geocodePromises.push(
                        fetch("https://nominatim.openstreetmap.org/search?q=" + encodeURIComponent(destText) +
                              "&format=json&limit=1&countrycodes=au", { headers: { Accept: "application/json" } })
                        .then(function (r) { return r.json(); })
                        .then(function (res) {
                            if (res && res[0]) {
                                self._destCoord = [parseFloat(res[0].lon), parseFloat(res[0].lat)];
                                self.byId("rpDestInput").setValue(res[0].display_name.split(", ").slice(0,3).join(", "));
                            }
                        })
                    );
                }
                Promise.all(geocodePromises).then(function () {
                    self.byId("rpBusy").setText("Finding routes…");
                    if (!self._originCoord || !self._destCoord) {
                        self.byId("rpBusy").setVisible(false);
                        MessageToast.show("Could not locate one or both addresses. Please be more specific.");
                        return;
                    }
                    self._dispatchRouting();
                }).catch(function () {
                    self.byId("rpBusy").setVisible(false);
                    MessageToast.show("Geocoding failed. Please select from suggestions.");
                });
                return;
            }
            this._dispatchRouting();
        },

        _dispatchRouting: function () {
            var engine = this.byId("rpEngineSelect").getSelectedKey();
            this.byId("rpBusy").setVisible(true);
            this.byId("rpBusy").setText("Finding routes…");
            this.byId("rpRoutesPanel").setVisible(false);
            this.byId("rpAssessBar").setVisible(false);
            this.byId("rpResultsPanel").setVisible(false);

            if (engine === "ors") {
                this._fetchOrsRoutes();
            } else if (engine === "valhalla") {
                this._fetchValhallaRoutes();
            } else {
                this._fetchOsrmRoutes();
            }
        },

        // ── ORS HGV Routing ────────────────────────────────────
        _fetchOrsRoutes: function () {
            var orsKey = localStorage.getItem(STORAGE_KEY_ORS);
            if (!orsKey) {
                console.warn("No ORS API key — falling back to OSRM");
                MessageToast.show("No ORS API key. Using OSRM. Click ⚙ to add your key.");
                this._fetchOsrmRoutes();
                return;
            }

            var oLon = this._originCoord[0], oLat = this._originCoord[1];
            var dLon = this._destCoord[0],   dLat = this._destCoord[1];

            var gvm      = parseFloat(this.byId("rpGVM").getValue())      || 20;
            var height   = parseFloat(this.byId("rpHeight").getValue())   || 4.0;
            var width    = parseFloat(this.byId("rpWidth").getValue())    || 2.5;
            var length   = parseFloat(this.byId("rpLength").getValue())   || 19;
            var axleLoad = parseFloat(this.byId("rpAxleLoad").getValue()) || 11;

            // Build coordinates including waypoints
            var coords = [[oLon, oLat]];
            this._waypoints.forEach(function (wp) {
                if (wp.coord) coords.push(wp.coord);
            });
            coords.push([dLon, dLat]);

            var body = {
                coordinates: coords,
                alternative_routes: { target_count: 3, weight_factor: 1.4, share_factor: 0.6 },
                options: {
                    profile_params: {
                        restrictions: {
                            weight:   gvm,
                            height:   height,
                            width:    width,
                            length:   length,
                            axleload: axleLoad
                        }
                    }
                },
                format: "geojson",
                units: "km",
                language: "en-AU"
            };

            var self = this;
            fetch(ORS_BASE + "/" + ORS_PROFILE, {
                method: "POST",
                headers: {
                    "Authorization": orsKey,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(body)
            })
                .then(function (r) {
                    if (!r.ok) throw new Error("ORS " + r.status + ": " + r.statusText);
                    return r.json();
                })
                .then(function (data) {
                    var features = data.features || [];
                    if (features.length === 0) throw new Error("No routes returned by ORS");

                    self._routes = features.map(function (f, i) {
                        var props  = f.properties || {};
                        var summ   = props.summary || {};
                        var distKm = summ.distance != null ? Number(summ.distance).toFixed(1) : "?";
                        var durMin = summ.duration != null ? Math.round(summ.duration / 60) : 0;
                        // ORS GeoJSON coords are [lon, lat]
                        var featureCoords = (f.geometry && f.geometry.coordinates) ? f.geometry.coordinates : [];
                        return {
                            index:       i,
                            label:       i === 0 ? "HGV Recommended Route" : "Alternative " + i,
                            engine:      "ors",
                            distanceKm:  distKm,
                            durationMin: durMin,
                            coords:      featureCoords
                        };
                    });
                    self._displayRoutes();
                })
                .catch(function (e) {
                    self.byId("rpBusy").setVisible(false);
                    console.error("ORS failed:", e.message);
                    MessageToast.show("ORS routing failed: " + e.message + ". Falling back to OSRM.");
                    self._fetchOsrmRoutes();
                });
        },

        // ── OSRM Routing ───────────────────────────────────────
        _fetchOsrmRoutes: function () {
            var oLon = this._originCoord[0], oLat = this._originCoord[1];
            var dLon = this._destCoord[0],   dLat = this._destCoord[1];

            // Build coordinate string including waypoints
            var coordParts = [oLon + "," + oLat];
            this._waypoints.forEach(function (wp) {
                if (wp.coord) coordParts.push(wp.coord[0] + "," + wp.coord[1]);
            });
            coordParts.push(dLon + "," + dLat);

            var url = OSRM_BASE + "/" + coordParts.join(";") +
                "?alternatives=3&overview=full&geometries=geojson&steps=false";

            var self = this;
            fetch(url)
                .then(function (r) { return r.json(); })
                .then(function (data) {
                    if (data.code !== "Ok" || !data.routes || data.routes.length === 0) {
                        throw new Error("No routes returned by OSRM");
                    }
                    self._routes = data.routes.map(function (r, i) {
                        return {
                            index:       i,
                            label:       i === 0 ? "Fastest Route" : "Alternative " + i,
                            engine:      "osrm",
                            distanceKm:  (r.distance / 1000).toFixed(1),
                            durationMin: Math.round(r.duration / 60),
                            coords:      r.geometry.coordinates
                        };
                    });
                    self._displayRoutes();
                })
                .catch(function (e) {
                    self.byId("rpBusy").setVisible(false);
                    MessageBox.error("Could not fetch routes: " + e.message);
                });
        },

        // ── Valhalla Routing ───────────────────────────────────
        _fetchValhallaRoutes: function () {
            var oLon = this._originCoord[0], oLat = this._originCoord[1];
            var dLon = this._destCoord[0],   dLat = this._destCoord[1];

            var gvm    = parseFloat(this.byId("rpGVM").getValue())    || 0;
            var height = parseFloat(this.byId("rpHeight").getValue()) || 0;
            var width  = parseFloat(this.byId("rpWidth").getValue())  || 0;
            var length = parseFloat(this.byId("rpLength").getValue()) || 0;

            var locations = [{ lon: oLon, lat: oLat, type: "break" }];
            this._waypoints.forEach(function (wp) {
                if (wp.coord) locations.push({ lon: wp.coord[0], lat: wp.coord[1], type: "through" });
            });
            locations.push({ lon: dLon, lat: dLat, type: "break" });

            var body = {
                locations: locations,
                costing: "truck",
                costing_options: {
                    truck: {
                        weight: gvm > 0 ? gvm : 20,
                        height: height > 0 ? height : 4.0,
                        width:  width  > 0 ? width  : 2.5,
                        length: length > 0 ? length : 19
                    }
                },
                alternates: 2,
                directions_type: "none"
            };

            var self = this;
            fetch(VALHALLA, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body)
            })
                .then(function (r) { return r.json(); })
                .then(function (data) {
                    var allTrips = data.trip ? [data.trip] : [];
                    if (data.alternates) {
                        data.alternates.forEach(function (a) {
                            if (a.trip) allTrips.push(a.trip);
                        });
                    }
                    if (allTrips.length === 0) throw new Error("No routes returned by Valhalla");

                    self._routes = allTrips.map(function (trip, i) {
                        var shape  = (trip.legs && trip.legs[0] && trip.legs[0].shape) ? trip.legs[0].shape : "";
                        var coords = self._decodePolyline(shape, 6);
                        var distKm = (trip.summary && trip.summary.length != null)
                            ? Number(trip.summary.length).toFixed(1) : "?";
                        var durMin = (trip.summary && trip.summary.time != null)
                            ? Math.round(trip.summary.time / 60) : 0;
                        return {
                            index:       i,
                            label:       i === 0 ? "Recommended Truck Route" : "Alternative " + i,
                            engine:      "valhalla",
                            distanceKm:  distKm,
                            durationMin: durMin,
                            coords:      coords
                        };
                    });
                    self._displayRoutes();
                })
                .catch(function (e) {
                    self.byId("rpBusy").setVisible(false);
                    MessageBox.error("Could not fetch Valhalla routes: " + e.message);
                });
        },

        // ── Decode Valhalla/Polyline6 encoded polyline ─────────
        _decodePolyline: function (encoded, precision) {
            if (!encoded) return [];
            var factor = Math.pow(10, precision || 5);
            var result = [];
            var index  = 0, lat = 0, lng = 0;
            while (index < encoded.length) {
                var b, shift = 0, result2 = 0;
                do {
                    b = encoded.charCodeAt(index++) - 63;
                    result2 |= (b & 0x1f) << shift;
                    shift += 5;
                } while (b >= 0x20);
                lat += (result2 & 1) ? ~(result2 >> 1) : (result2 >> 1);
                shift = 0; result2 = 0;
                do {
                    b = encoded.charCodeAt(index++) - 63;
                    result2 |= (b & 0x1f) << shift;
                    shift += 5;
                } while (b >= 0x20);
                lng += (result2 & 1) ? ~(result2 >> 1) : (result2 >> 1);
                result.push([lng / factor, lat / factor]); // [lon, lat]
            }
            return result;
        },

        // ── Display Route Options ──────────────────────────────
        _displayRoutes: function () {
            this.byId("rpBusy").setVisible(false);
            if (this._routes.length === 0) {
                MessageToast.show("No routes found between the specified locations");
                return;
            }

            var list = this.byId("rpRouteList");
            list.destroyItems();

            var self = this;
            this._routes.forEach(function (route, i) {
                var item = new sap.m.CustomListItem({ type: "Active" });

                var hbox = new sap.m.HBox({
                    justifyContent: "SpaceBetween",
                    alignItems:     "Center"
                }).addStyleClass("sapUiSmallMarginBeginEnd sapUiTinyMarginTopBottom");

                var vbox = new sap.m.VBox();
                vbox.addItem(new sap.m.Title({ text: route.label, level: "H5" }));
                vbox.addItem(new sap.m.Text({
                    text: route.distanceKm + " km · ~" + route.durationMin + " min · " +
                          route.engine.toUpperCase() + " · " + route.coords.length + " waypoints"
                }));

                var engineBadge = new sap.m.ObjectStatus({
                    text:  route.engine.toUpperCase(),
                    state: route.engine === "ors" ? "Success"
                         : route.engine === "valhalla" ? "Warning"
                         : "None"
                });
                vbox.addItem(engineBadge);
                hbox.addItem(vbox);

                var selectBtn = new sap.m.Button({
                    text:  "Select",
                    type:  "Emphasized",
                    press: (function (idx, itm) {
                        return function () { self._onSelectRoute(idx, itm); };
                    }(i, item))
                });
                hbox.addItem(selectBtn);
                item.addContent(hbox);
                list.addItem(item);
            });

            this.byId("rpRoutesPanel").setVisible(true);
            this.byId("rpAssessBar").setVisible(true);

            // Plot all routes on map
            this._plotAllRoutes();
        },

        _onSelectRoute: function (index) {
            this._selectedRoute = this._routes[index];
            this._highlightRoute(index);
            MessageToast.show("Route " + (index + 1) + " selected — click '🏗 Assess Bridges' to run bridge checks");
        },

        onRouteSelected: function (oEvent) {
            var item  = oEvent.getParameter("listItem");
            var index = this.byId("rpRouteList").indexOfItem(item);
            if (index >= 0 && index < this._routes.length) {
                this._selectedRoute = this._routes[index];
                this._highlightRoute(index);
            }
        },

        // ── Assess Selected Route ──────────────────────────────
        onAssessSelectedRoute: function () {
            UserAnalytics.trackAction("assess_route", "RoutePlanner");
            if (!this._selectedRoute) {
                MessageToast.show("Please select a route first");
                return;
            }

            var gvm      = parseFloat(this.byId("rpGVM").getValue())      || 0;
            var gcm      = parseFloat(this.byId("rpGCM").getValue())      || 0;
            var height   = parseFloat(this.byId("rpHeight").getValue())   || 0;
            var width    = parseFloat(this.byId("rpWidth").getValue())    || 0;
            var length   = parseFloat(this.byId("rpLength").getValue())   || 0;
            var speed    = parseInt(this.byId("rpSpeed").getValue())      || 80;
            var vClass   = this.byId("rpVehicleClass").getSelectedKey()   || "GENERAL";

            if (gvm <= 0 && height <= 0 && width <= 0) {
                MessageToast.show("Please enter at least one vehicle dimension (GVM, Height, or Width)");
                return;
            }

            this.byId("rpBusy").setVisible(true);
            this.byId("rpResultsPanel").setVisible(false);

            var routeCoords = JSON.stringify(this._selectedRoute.coords);
            var oModel = this.getOwnerComponent().getModel();

            if (oModel && oModel.bindContext("/assessRouteGeometry(...)").execute) {
                this._callActionV4(routeCoords, gvm, gcm, height, width, length, speed, vClass);
            } else {
                this._callActionFetch(routeCoords, gvm, gcm, height, width, length, speed, vClass);
            }
        },

        _callActionV4: function (routeCoords, gvm, gcm, height, width, length, speed, vClass) {
            var oModel = this.getOwnerComponent().getModel();
            var oCtx = oModel.bindContext("/assessRouteGeometry(...)");
            oCtx.setParameter("routeCoords",     routeCoords);
            oCtx.setParameter("vehicleGVM_t",    gvm);
            oCtx.setParameter("vehicleGCM_t",    gcm);
            oCtx.setParameter("vehicleHeight_m", height);
            oCtx.setParameter("vehicleWidth_m",  width);
            oCtx.setParameter("vehicleLength_m", length);
            oCtx.setParameter("crossingSpeed",   speed);
            oCtx.setParameter("vehicleClass",    vClass);

            var self = this;
            oCtx.execute().then(function () {
                var raw = oCtx.getBoundContext().getObject().value;
                self._handleAssessResult(raw);
            }).catch(function (e) {
                self.byId("rpBusy").setVisible(false);
                MessageBox.error("Assessment failed: " + (e.message || JSON.stringify(e)));
            });
        },

        _callActionFetch: function (routeCoords, gvm, gcm, height, width, length, speed, vClass) {
            var url  = BASE + "/assessRouteGeometry";
            var body = {
                routeCoords:      routeCoords,
                vehicleGVM_t:     gvm,
                vehicleGCM_t:     gcm,
                vehicleHeight_m:  height,
                vehicleWidth_m:   width,
                vehicleLength_m:  length,
                crossingSpeed:    speed,
                vehicleClass:     vClass
            };
            var self = this;
            fetch(url, {
                method:  "POST",
                headers: { "Content-Type": "application/json" },
                body:    JSON.stringify(body)
            })
                .then(function (r) { return r.json(); })
                .then(function (data) {
                    var raw = data.value || data;
                    self._handleAssessResult(typeof raw === "string" ? raw : JSON.stringify(raw));
                })
                .catch(function (e) {
                    self.byId("rpBusy").setVisible(false);
                    MessageBox.error("Assessment request failed: " + e.message);
                });
        },

        _handleAssessResult: function (rawJson) {
            this.byId("rpBusy").setVisible(false);
            var result;
            try {
                result = typeof rawJson === "string" ? JSON.parse(rawJson) : rawJson;
            } catch (e) {
                MessageBox.error("Could not parse assessment result");
                return;
            }
            this._assessResult = result;
            this._allBridges   = result.bridges || [];

            this.getView().getModel("rpBridges").setData({
                bridges:              this._allBridges,
                roadCategorySummary:  result.roadCategorySummary || []
            });

            var verdict    = result.routeVerdict || "UNKNOWN";
            var limitAsset = result.limitingAsset || "";
            var verdictMap = {
                "APPROVED":                 { state: "Success", text: "Route Approved",                                strip: "Success"     },
                "APPROVED_WITH_CONDITIONS": { state: "Warning", text: "Approved with Conditions",                     strip: "Warning"     },
                "REFUSED":                  { state: "Error",   text: "Route Refused — Limiting Asset: " + limitAsset, strip: "Error"      },
                "UNKNOWN":                  { state: "None",    text: "Assessment Incomplete",                        strip: "Information" }
            };
            var vm = verdictMap[verdict] || verdictMap["UNKNOWN"];

            this.byId("rpVerdictStatus").setText(vm.text).setState(vm.state);
            this.byId("rpVerdictStrip").setType(vm.strip).setText(
                vm.text + (result.limitingConstraint ? " — " + result.limitingConstraint : "")
            );
            this.byId("rpResultsTitle").setText("Assessment Results — " + verdict.replace(/_/g, " "));

            var s = result.summary || {};
            this.byId("rpKpiTotalVal").setValue(s.total   || 0);
            this.byId("rpKpiPassVal").setValue(s.passing  || 0);
            this.byId("rpKpiWarnVal").setValue(s.warned   || 0);
            this.byId("rpKpiFailVal").setValue(s.failing  || 0);
            this.byId("rpKpiMassVal").setValue(
                result.minMassMargin != null ? String(result.minMassMargin) : "—");
            this.byId("rpKpiClearVal").setValue(
                result.minClearanceMargin != null ? String(result.minClearanceMargin) : "—");

            this.byId("rpProximityNote").setText(
                (result.bridgesInSearchRadius || 0) + " bridges within bounding box · " +
                (result.proximityThresholdM || PROXIMITY_M) + "m proximity threshold"
            );

            this.byId("rpResultsPanel").setVisible(true);
            this._plotAssessedBridges(result.bridges || []);
        },

        // ── Bridge Row Press ───────────────────────────────────
        onBridgeRowPress: function (oEvent) {
            var src = oEvent.getSource();
            var ctx = src.getBindingContext
                ? src.getBindingContext("rpBridges")
                : (src.getParent ? src.getParent().getBindingContext("rpBridges") : null);
            if (!ctx) return;
            var obj = ctx.getObject();
            var bid = obj.bridgeId || obj.bridgeUUID;
            if (bid) {
                this.getOwnerComponent().getRouter().navTo("BridgeDetail", { bridgeId: encodeURIComponent(bid) });
            }
        },

        // ── MapLibre Loading ───────────────────────────────────
        onRpMapHolderRendered: function () {
            if (this._rpMap) {
                try { this._rpMap.resize(); } catch (_) { jQuery.sap.log.error("[NHVR] Map resize failed", _ && _.message || String(_)); }
                return;
            }
            this._loadMapLibre();
        },

        _loadMapLibre: function () {
            if (typeof maplibregl !== "undefined") {
                this._initMapLibreMap();
                return;
            }

            // Inject CSS
            if (!document.getElementById("maplibre-css")) {
                var link = document.createElement("link");
                link.id   = "maplibre-css";
                link.rel  = "stylesheet";
                link.href = "https://unpkg.com/maplibre-gl@4/dist/maplibre-gl.css";
                document.head.appendChild(link);
            }

            // Inject JS
            var existingScript = document.getElementById("maplibre-js");
            if (existingScript) {
                // Script tag exists but may not have finished loading
                if (typeof maplibregl !== "undefined") {
                    this._initMapLibreMap();
                } else {
                    var self = this;
                    setTimeout(function () { self._loadMapLibre(); }, 250);
                }
                return;
            }

            var script = document.createElement("script");
            script.id  = "maplibre-js";
            script.src = "https://unpkg.com/maplibre-gl@4/dist/maplibre-gl.js";
            var self   = this;
            script.onload = function () { self._initMapLibreMap(); };
            script.onerror = function () {
                // External CDN unreachable (firewall, offline, etc.).
                // Show a graceful empty state instead of crashing the page.
                console.warn("[RoutePlanner] MapLibre CDN unreachable — showing fallback");
                self._showMapFallback(
                    "Map tiles unavailable",
                    "The MapLibre library could not be loaded from https://unpkg.com. " +
                    "This is usually a network / firewall issue. All other route " +
                    "assessment features still work — only the map preview is affected."
                );
            };
            document.head.appendChild(script);
        },

        _showMapFallback: function (title, body) {
            var mapDiv = document.getElementById("nhvr-rp-map");
            if (!mapDiv) return;
            // Minimal inline empty-state — no CSS deps, no external assets.
            mapDiv.innerHTML =
                '<div style="display:flex;flex-direction:column;align-items:center;' +
                'justify-content:center;height:100%;min-height:400px;padding:24px;' +
                'background:#f7f7f7;color:#32363a;font-family:inherit;text-align:center;">' +
                '<div style="font-size:48px;margin-bottom:16px;">&#128205;</div>' +
                '<div style="font-size:18px;font-weight:600;margin-bottom:8px;">' + title + '</div>' +
                '<div style="font-size:14px;max-width:500px;color:#6a6d70;">' + body + '</div>' +
                '</div>';
        },

        _initMapLibreMap: function () {
            var mapDiv = document.getElementById("nhvr-rp-map");
            if (!mapDiv) {
                var self = this;
                setTimeout(function () { self._initMapLibreMap(); }, 250);
                return;
            }
            if (typeof maplibregl === "undefined") {
                var self = this;
                setTimeout(function () { self._initMapLibreMap(); }, 250);
                return;
            }
            if (this._rpMap) {
                try { this._rpMap.resize(); } catch (_) { jQuery.sap.log.error("[NHVR] Map resize failed", _ && _.message || String(_)); }
                return;
            }

            var self = this;

            this._rpMap = new maplibregl.Map({
                container: "nhvr-rp-map",
                style:     MAP_STYLES.streets,
                center:    [134.0, -27.0],
                zoom:      4
            });

            this._rpMap.on("load", function () {
                var map = self._rpMap;

                // ── Raster sources ──
                map.addSource("esri-satellite", {
                    type:        "raster",
                    tiles:       ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
                    tileSize:    256,
                    attribution: "Tiles © Esri — Esri, DeLorme, NAVTEQ"
                });
                map.addLayer({
                    id:     "esri-satellite-layer",
                    type:   "raster",
                    source: "esri-satellite",
                    layout: { visibility: "none" }
                });

                map.addSource("topo-source", {
                    type:        "raster",
                    tiles:       ["https://{a}.tile.opentopomap.org/{z}/{x}/{y}.png"],
                    tileSize:    256,
                    attribution: "© OpenTopoMap contributors"
                });
                map.addLayer({
                    id:     "topo-layer",
                    type:   "raster",
                    source: "topo-source",
                    layout: { visibility: "none" }
                });

                // ── Bridge GeoJSON source ──
                map.addSource("bridges", {
                    type:          "geojson",
                    data:          { type: "FeatureCollection", features: [] },
                    cluster:       true,
                    clusterMaxZoom: 13,
                    clusterRadius: 50
                });

                // Bridge cluster circles
                map.addLayer({
                    id:     "bridge-clusters",
                    type:   "circle",
                    source: "bridges",
                    filter: ["has", "point_count"],
                    paint:  {
                        "circle-color":   ["step", ["get", "point_count"], "#51bbd6", 10, "#f1f075", 30, "#f28cb1"],
                        "circle-radius":  ["step", ["get", "point_count"], 16, 10, 20, 30, 26],
                        "circle-opacity": 0.85
                    }
                });
                map.addLayer({
                    id:     "bridge-cluster-count",
                    type:   "symbol",
                    source: "bridges",
                    filter: ["has", "point_count"],
                    layout: {
                        "text-field":  "{point_count_abbreviated}",
                        "text-size":   12,
                        "text-anchor": "center"
                    }
                });
                // Unclustered bridges
                map.addLayer({
                    id:     "unclustered-bridge",
                    type:   "circle",
                    source: "bridges",
                    filter: ["!", ["has", "point_count"]],
                    paint:  {
                        "circle-color":        "#0070F2",
                        "circle-radius":       6,
                        "circle-stroke-width": 1.5,
                        "circle-stroke-color": "#ffffff",
                        "circle-opacity":      0.85
                    }
                });

                // ── Route line source ──
                map.addSource("routes", {
                    type: "geojson",
                    data: { type: "FeatureCollection", features: [] }
                });
                map.addLayer({
                    id:     "route-lines",
                    type:   "line",
                    source: "routes",
                    layout: { "line-join": "round", "line-cap": "round" },
                    paint:  {
                        "line-color":   ["coalesce", ["get", "color"], "#0070F2"],
                        "line-width":   ["coalesce", ["get", "lineWidth"], 4],
                        "line-opacity": ["coalesce", ["get", "opacity"], 0.85]
                    }
                });

                // ── OD markers source ──
                map.addSource("od-markers", {
                    type: "geojson",
                    data: { type: "FeatureCollection", features: [] }
                });
                map.addLayer({
                    id:     "od-layer",
                    type:   "circle",
                    source: "od-markers",
                    paint:  {
                        "circle-color":        ["get", "color"],
                        "circle-radius":       10,
                        "circle-stroke-width": 2,
                        "circle-stroke-color": "#ffffff",
                        "circle-opacity":      1
                    }
                });

                // ── Bridge click popup ──
                map.on("click", "unclustered-bridge", function (e) {
                    var props = e.features[0].properties;
                    var coord = e.features[0].geometry.coordinates.slice();
                    var html  = "<b>" + (props.bridgeId || props.id || "") + "</b><br>" +
                                (props.name || "") + "<br>" +
                                "Condition: " + (props.condition || "—") + "<br>" +
                                "Posting: "   + (props.postingStatus || "—");
                    new maplibregl.Popup({ closeButton: true })
                        .setLngLat(coord)
                        .setHTML(html)
                        .addTo(map);
                });
                map.on("mouseenter", "unclustered-bridge", function () {
                    map.getCanvas().style.cursor = "pointer";
                });
                map.on("mouseleave", "unclustered-bridge", function () {
                    map.getCanvas().style.cursor = "";
                });

                // ── Draw tool click handler ──
                map.on("click", function (e) {
                    if (!self._drawMode) return;
                    self._drawPoints.push([e.lngLat.lng, e.lngLat.lat]);
                    if (self._drawPoints.length === 2) {
                        self._drawMode  = false;
                        self._rpMap.getCanvas().style.cursor = "";
                        MessageToast.show("Area selected: " +
                            self._drawPoints[0].map(function (v) { return v.toFixed(4); }).join(", ") +
                            " → " +
                            self._drawPoints[1].map(function (v) { return v.toFixed(4); }).join(", "));
                        self._drawPoints = [];
                        self.byId("rpDrawBtn").setPressed ? self.byId("rpDrawBtn").setPressed(false) : null;
                    }
                });

                // Load all bridges from CAP
                self._loadBridgeGeoJSON();

                // Re-plot if data already present
                if (self._routes.length > 0) self._plotAllRoutes();
            });
        },

        _loadBridgeGeoJSON: function () {
            var self = this;
            AuthFetch.getJson(BASE + "/Bridges?$select=ID,bridgeId,name,latitude,longitude,condition,conditionRating,postingStatus,state&$top=3000")
                .then(function (data) {
                    var rows = (data.value || []);
                    var geojson = {
                        type: "FeatureCollection",
                        features: rows.filter(function (b) { return b.latitude && b.longitude; })
                            .map(function (b) {
                                return {
                                    type: "Feature",
                                    geometry: {
                                        type:        "Point",
                                        coordinates: [b.longitude, b.latitude]
                                    },
                                    properties: {
                                        id:            b.ID,
                                        bridgeId:      b.bridgeId,
                                        name:          b.name,
                                        condition:     b.condition,
                                        postingStatus: b.postingStatus,
                                        state:         b.state
                                    }
                                };
                            })
                    };
                    self._allBridgesGeoJSON = geojson;
                    if (self._rpMap && self._rpMap.getSource("bridges")) {
                        self._rpMap.getSource("bridges").setData(geojson);
                    }
                })
                .catch(function (e) {
                    console.warn("[RoutePlanner] Could not load bridge GeoJSON:", e.message);
                });
        },

        // ── Map Plotting ───────────────────────────────────────
        _plotAllRoutes: function () {
            if (!this._rpMap) {
                this._initMapLibreMap();
                return;
            }
            if (!this._rpMap.isStyleLoaded()) {
                var self = this;
                this._rpMap.once("load", function () { self._plotAllRoutes(); });
                return;
            }

            try {
                var features = this._routes.map(function (route, i) {
                    return {
                        type: "Feature",
                        geometry: {
                            type:        "LineString",
                            coordinates: route.coords
                        },
                        properties: {
                            routeIndex: i,
                            color:      ROUTE_COLOURS[i % ROUTE_COLOURS.length],
                            lineWidth:  i === 0 ? 5 : 3,
                            opacity:    i === 0 ? 0.9 : 0.6,
                            label:      route.label
                        }
                    };
                });

                var routeSource = this._rpMap.getSource("routes");
                if (routeSource) {
                    routeSource.setData({ type: "FeatureCollection", features: features });
                }

                // OD markers
                var odFeatures = [];
                if (this._originCoord) {
                    odFeatures.push({
                        type: "Feature",
                        geometry: { type: "Point", coordinates: this._originCoord },
                        properties: { label: "Origin", color: "#107E3E" }
                    });
                }
                if (this._destCoord) {
                    odFeatures.push({
                        type: "Feature",
                        geometry: { type: "Point", coordinates: this._destCoord },
                        properties: { label: "Destination", color: "#BB0000" }
                    });
                }
                var odSource = this._rpMap.getSource("od-markers");
                if (odSource) {
                    odSource.setData({ type: "FeatureCollection", features: odFeatures });
                }

                // Fit bounds
                if (this._routes[0] && this._routes[0].coords && this._routes[0].coords.length > 1) {
                    var allCoords = this._routes[0].coords.slice();
                    if (this._originCoord) allCoords.push(this._originCoord);
                    if (this._destCoord)   allCoords.push(this._destCoord);

                    var minLon = allCoords[0][0], maxLon = allCoords[0][0];
                    var minLat = allCoords[0][1], maxLat = allCoords[0][1];
                    allCoords.forEach(function (c) {
                        if (c[0] < minLon) minLon = c[0];
                        if (c[0] > maxLon) maxLon = c[0];
                        if (c[1] < minLat) minLat = c[1];
                        if (c[1] > maxLat) maxLat = c[1];
                    });
                    this._rpMap.fitBounds([[minLon, minLat], [maxLon, maxLat]], { padding: 60 });
                }
            } catch (e) {
                console.warn("plotAllRoutes error:", e.message);
            }
        },

        _highlightRoute: function (selectedIndex) {
            if (!this._rpMap) return;
            try {
                var paint = this._rpMap.getPaintProperty("route-lines", "line-color");
                if (!paint) return;

                // Build a match expression: highlight selected, dim others
                var matchExpr = ["match", ["get", "routeIndex"]];
                this._routes.forEach(function (r, i) {
                    matchExpr.push(i);
                    matchExpr.push(i === selectedIndex ? "#BB0000" : ROUTE_COLOURS[i % ROUTE_COLOURS.length]);
                });
                matchExpr.push("#888888"); // fallback

                this._rpMap.setPaintProperty("route-lines", "line-color", matchExpr);

                var widthExpr = ["match", ["get", "routeIndex"]];
                this._routes.forEach(function (r, i) {
                    widthExpr.push(i);
                    widthExpr.push(i === selectedIndex ? 6 : (i === 0 ? 5 : 3));
                });
                widthExpr.push(3);
                this._rpMap.setPaintProperty("route-lines", "line-width", widthExpr);

                var opacityExpr = ["match", ["get", "routeIndex"]];
                this._routes.forEach(function (r, i) {
                    opacityExpr.push(i);
                    opacityExpr.push(i === selectedIndex ? 1.0 : 0.5);
                });
                opacityExpr.push(0.5);
                this._rpMap.setPaintProperty("route-lines", "line-opacity", opacityExpr);
            } catch (e) {
                console.warn("highlightRoute error:", e.message);
            }
        },

        _plotAssessedBridges: function (bridges) {
            if (!this._rpMap) return;
            if (!this._rpMap.isStyleLoaded()) {
                var self = this;
                setTimeout(function () { self._plotAssessedBridges(bridges); }, 300);
                return;
            }

            try {
                var self = this;
                var features = [];
                bridges.forEach(function (b) {
                    if (!b.latitude || !b.longitude) return;
                    var lat = parseFloat(b.latitude);
                    var lon = parseFloat(b.longitude);
                    if (isNaN(lat) || isNaN(lon)) return;
                    features.push({
                        type: "Feature",
                        geometry: { type: "Point", coordinates: [lon, lat] },
                        properties: {
                            id:            b.bridgeUUID || b.bridgeId || "",
                            bridgeId:      b.bridgeId   || "",
                            name:          b.name       || "",
                            verdict:       b.verdict    || "",
                            postingStatus: b.postingStatus || "",
                            state:         b.state || "",
                            condition:     b.condition || "",
                            assessColor:   self._verdictColour(b.verdict),
                            massLimit:     b.effectiveMassLimit_t != null ? b.effectiveMassLimit_t : "",
                            clearance:     b.effectiveClearance_m != null ? b.effectiveClearance_m : "",
                            proximity:     b.proximityM || ""
                        }
                    });
                });

                // Override bridge source with assessed data
                var source = this._rpMap.getSource("bridges");
                if (source) {
                    source.setData({ type: "FeatureCollection", features: features });
                }

                // Update the circle colour paint based on assessColor property
                this._rpMap.setPaintProperty("unclustered-bridge", "circle-color",
                    ["coalesce", ["get", "assessColor"], "#0070F2"]);
                this._rpMap.setPaintProperty("unclustered-bridge", "circle-radius", 8);
            } catch (e) {
                console.warn("plotAssessedBridges error:", e.message);
            }
        },

        _verdictColour: function (verdict) {
            switch (verdict) {
                case "PASS":       return "#107E3E";
                case "CONDITIONS": return "#E9730C";
                case "FAIL":       return "#BB0000";
                default:           return "#888888";
            }
        },

        // ── Map Controls ───────────────────────────────────────
        onRpBaseMapChange: function (oEvent) {
            var key = oEvent.getSource().getSelectedKey();
            if (!this._rpMap) return;

            try {
                if (key === "streets") {
                    // Show vector style, hide raster overlays
                    this._rpMap.setLayoutProperty("esri-satellite-layer", "visibility", "none");
                    this._rpMap.setLayoutProperty("topo-layer", "visibility", "none");
                } else if (key === "satellite") {
                    this._rpMap.setLayoutProperty("esri-satellite-layer", "visibility", "visible");
                    this._rpMap.setLayoutProperty("topo-layer", "visibility", "none");
                } else if (key === "topo") {
                    this._rpMap.setLayoutProperty("esri-satellite-layer", "visibility", "none");
                    this._rpMap.setLayoutProperty("topo-layer", "visibility", "visible");
                }
            } catch (e) {
                console.warn("onRpBaseMapChange error:", e.message);
            }
        },

        onRpLayerToggle: function (oEvent) {
            if (!this._rpMap) return;
            var srcId   = oEvent.getSource().getId();
            var pressed = oEvent.getParameter("pressed");
            var layerId;

            if (srcId.indexOf("rpBridgeLayerBtn") !== -1) {
                layerId = "unclustered-bridge";
            } else if (srcId.indexOf("rpRouteLayerBtn") !== -1) {
                layerId = "route-lines";
            } else {
                return; // Traffic layer is a placeholder
            }

            try {
                this._rpMap.setLayoutProperty(layerId, "visibility", pressed ? "visible" : "none");
            } catch (e) {
                console.warn("onRpLayerToggle error:", e.message);
            }
        },

        onFitRpMap: function () {
            if (!this._rpMap) return;

            var allCoords = [];
            if (this._routes[0] && this._routes[0].coords) {
                allCoords = allCoords.concat(this._routes[0].coords);
            }
            if (this._originCoord) allCoords.push(this._originCoord);
            if (this._destCoord)   allCoords.push(this._destCoord);

            if (allCoords.length === 0) return;

            var minLon = allCoords[0][0], maxLon = allCoords[0][0];
            var minLat = allCoords[0][1], maxLat = allCoords[0][1];
            allCoords.forEach(function (c) {
                if (c[0] < minLon) minLon = c[0];
                if (c[0] > maxLon) maxLon = c[0];
                if (c[1] < minLat) minLat = c[1];
                if (c[1] > maxLat) maxLat = c[1];
            });
            try {
                this._rpMap.fitBounds([[minLon, minLat], [maxLon, maxLat]], { padding: 60 });
            } catch (e) {
                console.warn("onFitRpMap error:", e.message);
            }
        },

        onDrawToggle: function (oEvent) {
            this._drawMode   = !this._drawMode;
            this._drawPoints = [];
            if (this._rpMap) {
                this._rpMap.getCanvas().style.cursor = this._drawMode ? "crosshair" : "";
            }
            if (this._drawMode) {
                MessageToast.show("Click two points on the map to select an area");
            }
        },

        // ── Export ─────────────────────────────────────────────
        onExportGPX: function () {
            if (!this._selectedRoute) {
                MessageToast.show("Select a route first");
                return;
            }
            var coords = this._selectedRoute.coords;
            var trkpts = coords.map(function (c) {
                return '<trkpt lat="' + c[1] + '" lon="' + c[0] + '"></trkpt>';
            }).join("\n    ");

            var gpx = '<?xml version="1.0" encoding="UTF-8"?>\n' +
                '<gpx version="1.1" creator="NHVR Route Planner" ' +
                'xmlns="http://www.topografix.com/GPX/1/1">\n' +
                '  <trk><name>NHVR Route — ' + (this._selectedRoute.label || "") + '</name><trkseg>\n' +
                '    ' + trkpts + '\n' +
                '  </trkseg></trk>\n</gpx>';

            var date = new Date().toISOString().slice(0, 10);
            this._downloadBlob(gpx, "nhvr_route_" + date + ".gpx", "application/gpx+xml");
        },

        onExportRouteCSV: function () {
            var bridges = this._allBridges;
            if (!bridges || bridges.length === 0) {
                MessageToast.show("No bridge assessment data to export. Run an assessment first.");
                return;
            }
            var rows = ["Bridge ID,Name,Verdict,Mass Limit (t),Clearance (m),Road,Proximity (m)"];
            bridges.forEach(function (b) {
                var cells = [
                    b.bridgeId      || "",
                    '"' + (b.name   || "").replace(/"/g, '""') + '"',
                    b.verdict       || "",
                    b.effectiveMassLimit_t != null ? b.effectiveMassLimit_t : "",
                    b.effectiveClearance_m != null ? b.effectiveClearance_m : "",
                    '"' + (b.roadRoute || "").replace(/"/g, '""') + '"',
                    b.proximityM    || ""
                ];
                rows.push(cells.join(","));
            });
            var csv  = rows.join("\n");
            var date = new Date().toISOString().slice(0, 10);
            this._downloadBlob(csv, "nhvr_route_bridges_" + date + ".csv", "text/csv;charset=utf-8;");
        },

        _downloadBlob: function (content, filename, mimeType) {
            var blob = new Blob([content], { type: mimeType });
            var url  = URL.createObjectURL(blob);
            var a    = document.createElement("a");
            a.href   = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            setTimeout(function () {
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            }, 100);
        },

        // ── Settings Dialog ────────────────────────────────────
        onOpenSettings: function () {
            var orsKey  = localStorage.getItem(STORAGE_KEY_ORS)  || "";
            var hereKey = localStorage.getItem(STORAGE_KEY_HERE) || "";
            this.byId("rpOrsApiKeyInput").setValue(orsKey);
            this.byId("rpHereApiKeyInput").setValue(hereKey);
            this.byId("rpSettingsDialog").open();
        },

        onSaveSettings: function () {
            var orsKey  = this.byId("rpOrsApiKeyInput").getValue().trim();
            var hereKey = this.byId("rpHereApiKeyInput").getValue().trim();

            if (orsKey) {
                localStorage.setItem(STORAGE_KEY_ORS, orsKey);
            } else {
                localStorage.removeItem(STORAGE_KEY_ORS);
            }
            if (hereKey) {
                localStorage.setItem(STORAGE_KEY_HERE, hereKey);
            } else {
                localStorage.removeItem(STORAGE_KEY_HERE);
            }

            this.byId("rpSettingsDialog").close();
            this.byId("rpApiKeyWarning").setVisible(!orsKey);

            // Switch engine to ORS if key was just added
            if (orsKey) {
                this.byId("rpEngineSelect").setSelectedKey("ors");
            }

            MessageToast.show("Settings saved");
        },

        onCloseSettings: function () {
            this.byId("rpSettingsDialog").close();
        },

        // ── Road Category Filter ───────────────────────────────
        onRoadCategoryFilter: function (oEvent) {
            var key      = oEvent.getSource().getSelectedKey();
            var filtered = key
                ? (this._allBridges || []).filter(function (b) { return b.roadCategory === key; })
                : (this._allBridges || []);
            this.getView().getModel("rpBridges").setProperty("/bridges", filtered);
            this._plotAssessedBridges(filtered);
        },

        // ── Formatters ─────────────────────────────────────────
        fmtRoadCategoryState: function (cat) {
            switch (cat) {
                case "National Highway": return "Success";
                case "State Highway":   return "Success";
                case "Regional Road":   return "Warning";
                case "Council Road":    return "Information";
                default:                return "None";
            }
        },

        fmtRoadCategoryIcon: function (cat) {
            switch (cat) {
                case "National Highway": return "sap-icon://map-2";
                case "State Highway":    return "sap-icon://map-2";
                case "Regional Road":    return "sap-icon://journey-arrive";
                case "Council Road":     return "sap-icon://building";
                default:                 return "sap-icon://question-mark";
            }
        },

        fmtFailState: function (val) {
            return (parseInt(val) || 0) > 0 ? "Error" : "None";
        },

        fmtVerdictState: function (verdict) {
            switch (verdict) {
                case "PASS":       return "Success";
                case "CONDITIONS": return "Warning";
                case "FAIL":       return "Error";
                default:           return "None";
            }
        },

        fmtOptNum: function (val) {
            return (val != null && val !== "") ? String(val) : "—";
        },

        fmtMetres: function (m) {
            return (m != null && m !== "") ? m + " m" : "—";
        },

        fmtIssuesWarnings: function (obj) {
            if (!obj) return "";
            var issues   = (obj.issues   || []).join("; ");
            var warnings = (obj.warnings || []).join("; ");
            return [issues, warnings].filter(Boolean).join(" | ");
        },

        onExit: function () {
            // Clear debounce timers
            if (this._waypointTimers) {
                Object.values(this._waypointTimers).forEach(function(t) { clearTimeout(t); });
                this._waypointTimers = {};
            }
            clearTimeout(this._originTimer);
            clearTimeout(this._destTimer);
            // Destroy map
            if (this._rpMap) {
                try { this._rpMap.remove(); } catch(e) { /* map already removed */ }
                this._rpMap = null;
            }
        }

    });
});
