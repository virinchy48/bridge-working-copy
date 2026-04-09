sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/m/MessageBox",
  "sap/m/MessageToast",
  "sap/ui/model/Filter",
  "sap/ui/model/FilterOperator",
  "sap/ui/model/Sorter"
], function (Controller, MessageBox, MessageToast, Filter, FilterOperator, Sorter) {
  "use strict";

  // ─── NHVR Permit Logic ────────────────────────────────────────────────────
  var NHVRPermit = {
    // Standard Mass Limits (SML) and HML per NHVR regulations
    massLimits: {
      "Standard": { steer: 6.0, drive: 16.5, trailer: 20.0, gcm: 42.5 },
      "HML":      { steer: 6.0, drive: 17.0, trailer: 22.5, gcm: 68.5 },
      "PBS1":     { steer: 6.0, drive: 16.5, trailer: 20.0, gcm: 42.5 },
      "PBS2":     { steer: 6.0, drive: 17.0, trailer: 22.5, gcm: 62.5 },
      "PBS3":     { steer: 6.0, drive: 17.0, trailer: 22.5, gcm: 83.5 },
      "PBS4":     { steer: 6.0, drive: 17.0, trailer: 22.5, gcm: 100.0 },
      "Oversize": { steer: 6.0, drive: 16.5, trailer: 20.0, gcm: 42.5 },
      "Overmass": { steer: 8.0, drive: 22.0, trailer: 26.0, gcm: 160.0 }
    },
    // Minimum clearance requirements by permit class
    clearanceRequired: {
      "Standard": 4.25,
      "HML":      4.25,
      "PBS1":     4.25,
      "PBS2":     4.25,
      "PBS3":     4.6,
      "PBS4":     4.6,
      "Oversize": 4.6,
      "Overmass": 4.6
    },
    // Posting restrictions
    postingRestrictions: {
      "Unrestricted": { maxGVM: 9999, notes: "No restrictions" },
      "Posted":        { maxGVM: 8.0,  notes: "Posted bridge — assess per structure posting" },
      "Load Limited":  { maxGVM: 8.0,  notes: "Load limited — SML only, requires assessment" },
      "Closed":        { maxGVM: 0,    notes: "Bridge closed to heavy vehicles" }
    },

    assess: function (bridge, vehicle) {
      var permitClass = vehicle.permitClass;
      var limits = this.massLimits[permitClass] || this.massLimits["Standard"];
      var posting = this.postingRestrictions[bridge.posting_status] || this.postingRestrictions["Unrestricted"];

      // 1. Height check
      var heightCheck, heightState;
      if (vehicle.height <= bridge.clearance_height_m - 0.3) {
        heightCheck = "Pass"; heightState = "Success";
      } else if (vehicle.height <= bridge.clearance_height_m) {
        heightCheck = "Marginal"; heightState = "Warning";
      } else {
        heightCheck = "Fail"; heightState = "Error";
      }

      // 2. Mass check
      var massViolation = false;
      var massNotes = [];
      if (vehicle.steerAxle > limits.steer) {
        massViolation = true;
        massNotes.push("Steer axle " + vehicle.steerAxle + "t > " + limits.steer + "t limit");
      }
      if (vehicle.driveAxle > limits.drive) {
        massViolation = true;
        massNotes.push("Drive axle " + vehicle.driveAxle + "t > " + limits.drive + "t limit");
      }
      if (vehicle.trailerAxle > limits.trailer) {
        massViolation = true;
        massNotes.push("Trailer axle " + vehicle.trailerAxle + "t > " + limits.trailer + "t limit");
      }
      if (vehicle.gvm > limits.gcm) {
        massViolation = true;
        massNotes.push("GVM " + vehicle.gvm + "t > " + limits.gcm + "t GCM limit");
      }
      if (posting.maxGVM < vehicle.gvm && bridge.posting_status !== "Unrestricted") {
        massViolation = true;
        massNotes.push(posting.notes);
      }
      var massCheck = massViolation ? "Fail" : "Pass";
      var massState = massViolation ? "Error" : "Success";

      // 3. Route check
      var routeCheck, routeState;
      if (bridge.posting_status === "Closed") {
        routeCheck = "Blocked"; routeState = "Error";
      } else if (!bridge.nhvr_route_assessed && (permitClass === "PBS3" || permitClass === "PBS4" || permitClass === "Overmass")) {
        routeCheck = "Unassessed"; routeState = "Warning";
      } else if (bridge.nhvr_route_assessed && bridge.over_mass_route) {
        routeCheck = "Approved"; routeState = "Success";
      } else if (bridge.nhvr_route_assessed) {
        routeCheck = "SML Only"; routeState = "Warning";
      } else {
        routeCheck = "Check Required"; routeState = "Warning";
      }

      // 4. Overall result
      var overallResult, overallState;
      var heightFail = heightCheck === "Fail";
      var massFail   = massCheck === "Fail";
      var routeFail  = routeCheck === "Blocked";

      if (heightFail || massFail || routeFail) {
        overallResult = "Violation"; overallState = "Error";
      } else if (heightCheck === "Marginal" || routeCheck === "Unassessed" || routeCheck === "Check Required" || routeCheck === "SML Only") {
        overallResult = "Conditional"; overallState = "Warning";
      } else {
        overallResult = "Compliant"; overallState = "Success";
      }

      // Build notes
      var allNotes = massNotes.slice();
      if (bridge.flood_impacted) allNotes.push("Flood-impacted route — check current access");
      if (bridge.scour_risk === "High") allNotes.push("High scour risk — structural assessment recommended");
      if (bridge.data_confidence === "Estimated") allNotes.push("⚠ Data estimated — field verification recommended");

      return {
        bridge_id:          bridge.bridge_id,
        bridge_name:        bridge.bridge_name,
        region:             bridge.region,
        road_route:         bridge.road_route,
        clearance_height_m: bridge.clearance_height_m,
        posting_status:     bridge.posting_status,
        postingState:       bridge.posting_status === "Unrestricted" ? "Success" : bridge.posting_status === "Posted" ? "Warning" : "Error",
        clearanceState:     bridge.clearance_height_m >= 4.6 ? "Success" : bridge.clearance_height_m >= 4.25 ? "Warning" : "Error",
        heightCheck:        heightCheck,
        heightState:        heightState,
        massCheck:          massCheck,
        massState:          massState,
        routeCheck:         routeCheck,
        routeState:         routeState,
        overallResult:      overallResult,
        overallState:       overallState,
        notes:              allNotes.join("; ") || "—"
      };
    }
  };

  // ─── Map singleton ────────────────────────────────────────────────────────
  var _leafletMap = null;
  var _markers = {};
  var _onBridgeSelect = null;

  function getMarkerColor(bridge, permitResults) {
    if (bridge.posting_status === "Closed") return "#dc3545";
    if (permitResults && permitResults[bridge.bridge_id]) {
      var r = permitResults[bridge.bridge_id];
      if (r === "Violation")   return "#dc3545";
      if (r === "Conditional") return "#ffc107";
      if (r === "Compliant")   return "#28a745";
    }
    if (bridge.posting_status === "Load Limited") return "#dc3545";
    if (bridge.posting_status === "Posted") return "#ffc107";
    return "#6c757d";
  }

  function makeIcon(color, size) {
    size = size || 10;
    return window.L.divIcon({
      className: "",
      html: '<div style="width:' + size + 'px;height:' + size + 'px;border-radius:50%;background:' + color +
            ';border:2px solid white;box-shadow:0 0 4px rgba(0,0,0,0.4);cursor:pointer;"></div>',
      iconSize:  [size, size],
      iconAnchor:[size / 2, size / 2]
    });
  }

  function buildPopupHTML(b) {
    var nhvrBadge = b.nhvr_route_assessed ? '<span style="color:#28a745">✔ NHVR Assessed</span>' : '<span style="color:#999">Not Assessed</span>';
    var freightBadge = b.freight_route ? '<span style="color:#0a6ed1">✔ Freight Route</span>' : '';
    return '<div class="bridge-popup">' +
      '<h3>' + b.bridge_name + '</h3>' +
      '<table>' +
      '<tr><td>ID</td><td>' + b.bridge_id + '</td></tr>' +
      '<tr><td>Road</td><td>' + b.road_route + ' (' + b.route_number + ')</td></tr>' +
      '<tr><td>LGA</td><td>' + b.lga + '</td></tr>' +
      '<tr><td>Length</td><td>' + b.total_length_m + ' m</td></tr>' +
      '<tr><td>Clearance</td><td><strong>' + b.clearance_height_m + ' m</strong></td></tr>' +
      '<tr><td>Structure</td><td>' + b.structure_type + '</td></tr>' +
      '<tr><td>Condition</td><td>' + b.condition + ' (' + b.condition_rating + '/10)</td></tr>' +
      '<tr><td>Posting</td><td>' + b.posting_status + '</td></tr>' +
      '<tr><td>AADT</td><td>' + b.aadt + '</td></tr>' +
      '<tr><td>NHVR</td><td>' + nhvrBadge + ' ' + freightBadge + '</td></tr>' +
      '<tr><td>Source</td><td>' + b.data_source + '</td></tr>' +
      '</table></div>';
  }

  // ─── Controller ───────────────────────────────────────────────────────────
  return Controller.extend("nsw.bridge.demo.controller.App", {

    onInit: function () {
      this._permitResults = {};
    },

    // ── Tab navigation ──
    onTabSelect: function (oEvent) {
      var key = oEvent.getParameter("key");
      if (key === "map") {
        if (!_leafletMap) {
          setTimeout(this._initMap.bind(this), 300);
        } else {
          setTimeout(function () {
            _leafletMap.invalidateSize(true);
          }, 150);
        }
      }
    },

    // ── Map initialisation ──
    onMapAfterRendering: function () {
      if (!_leafletMap && typeof window.L !== "undefined") {
        this._initMap();
      } else if (!window.L) {
        this._loadLeaflet();
      }
    },

    _loadLeaflet: function () {
      var self = this;
      var script = document.createElement("script");
      script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
      script.onload = function () { self._initMap(); };
      document.head.appendChild(script);
    },

    _initMap: function () {
      if (_leafletMap || !document.getElementById("nsw-bridge-map")) return;
      var L = window.L;
      if (!L) { this._loadLeaflet(); return; }

      _leafletMap = L.map("nsw-bridge-map", {
        center: [-32.5, 147.5],
        zoom: 6,
        zoomControl: true
      });

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors | Data: Transport for NSW',
        maxZoom: 18
      }).addTo(_leafletMap);

      // NSW boundary approximate bounding box rectangle
      var nswBounds = [[(-37.5), (141.0)], [(-28.0), (153.6)]];
      L.rectangle(nswBounds, {
        color: "#0a6ed1", weight: 1.5, fillOpacity: 0.02, dashArray: "4 4"
      }).addTo(_leafletMap);

      _onBridgeSelect = this._onMapBridgeSelect.bind(this);
      this._renderMapMarkers();

      // Fit to NSW
      _leafletMap.fitBounds(nswBounds);
    },

    _renderMapMarkers: function (filterFn) {
      if (!_leafletMap) return;
      var L = window.L;
      var bridges = this.getView().getModel("bridges").getProperty("/bridges") || [];
      var self = this;

      // Remove existing markers
      Object.values(_markers).forEach(function (m) { m.remove(); });
      _markers = {};

      var count = 0;
      bridges.forEach(function (b) {
        if (filterFn && !filterFn(b)) return;
        if (!b.latitude || !b.longitude) return;

        var color = getMarkerColor(b, self._permitResults);
        var size = b.total_length_m > 200 ? 14 : b.total_length_m > 80 ? 12 : 10;

        var marker = L.marker([b.latitude, b.longitude], {
          icon: makeIcon(color, size),
          title: b.bridge_name
        }).addTo(_leafletMap);

        marker.bindPopup(buildPopupHTML(b), { maxWidth: 320 });
        marker.on("click", function () {
          if (_onBridgeSelect) _onBridgeSelect(b);
        });
        _markers[b.bridge_id] = marker;
        count++;
      });

      var countCtrl = this.byId("mapBridgeCount");
      if (countCtrl) countCtrl.setText(count + " bridges");
    },

    _onMapBridgeSelect: function (bridge) {
      var stateModel = this.getView().getModel("state");

      // Compute ObjectStatus states
      var postingState = bridge.posting_status === "Unrestricted" ? "Success" :
                         bridge.posting_status === "Posted" ? "Warning" : "Error";
      var conditionState = bridge.condition === "Good" ? "Success" :
                           bridge.condition === "Fair" ? "Warning" : "Error";

      var enriched = Object.assign({}, bridge, {
        _postingState: postingState,
        _conditionState: conditionState
      });

      stateModel.setProperty("/selectedBridge", enriched);

      this.byId("noSelectionPanel").setVisible(false);
      this.byId("bridgeDetailPanel").setVisible(true);

      var coordText = this.byId("coordText");
      if (coordText) {
        coordText.setText(bridge.latitude.toFixed(5) + ", " + bridge.longitude.toFixed(5));
      }
      var nhvrIcon = this.byId("nhvrIcon");
      if (nhvrIcon) {
        nhvrIcon.setSrc(bridge.nhvr_route_assessed ? "sap-icon://accept" : "sap-icon://decline");
        nhvrIcon.setColor(bridge.nhvr_route_assessed ? "#28a745" : "#dc3545");
      }
    },

    // ── Map Filters ──
    onMapFilterChange: function () {
      var region  = this.byId("regionFilter").getSelectedKey();
      var posting = this.byId("postingFilter").getSelectedKey();
      var freight = this.byId("freightRouteFilter").getSelected();

      this._renderMapMarkers(function (b) {
        if (region  !== "All" && b.region !== region) return false;
        if (posting !== "All" && b.posting_status !== posting) return false;
        if (freight && !b.freight_route) return false;
        return true;
      });
    },

    onMapReset: function () {
      this.byId("regionFilter").setSelectedKey("All");
      this.byId("postingFilter").setSelectedKey("All");
      this.byId("freightRouteFilter").setSelected(false);
      this._permitResults = {};
      this._renderMapMarkers();
      if (_leafletMap) {
        _leafletMap.invalidateSize(true);
        _leafletMap.fitBounds([[-37.5, 141.0], [-28.0, 153.6]]);
      }
    },

    // ── Table Filters ──
    onTableSearch: function (oEvent) {
      var query = oEvent.getParameter("query") || oEvent.getParameter("newValue") || "";
      this._applyTableFilters(query);
    },

    onTableFilter: function () {
      var search = this.byId("tableSearch").getValue();
      this._applyTableFilters(search);
    },

    _applyTableFilters: function (searchQuery) {
      var table    = this.byId("bridgeTable");
      var binding  = table.getBinding("items");
      var filters  = [];
      var region   = this.byId("tableRegionFilter").getSelectedKey();
      var cond     = this.byId("tableConditionFilter").getSelectedKey();
      var posting  = this.byId("tablePostingFilter").getSelectedKey();

      if (searchQuery) {
        filters.push(new Filter({
          filters: [
            new Filter("bridge_id",   FilterOperator.Contains, searchQuery),
            new Filter("bridge_name", FilterOperator.Contains, searchQuery),
            new Filter("lga",         FilterOperator.Contains, searchQuery),
            new Filter("road_route",  FilterOperator.Contains, searchQuery)
          ],
          and: false
        }));
      }
      if (region  !== "All") filters.push(new Filter("region",         FilterOperator.EQ, region));
      if (cond    !== "All") filters.push(new Filter("condition",      FilterOperator.EQ, cond));
      if (posting !== "All") filters.push(new Filter("posting_status", FilterOperator.EQ, posting));

      binding.filter(filters);
    },

    onTableRowSelect: function (oEvent) {
      var item   = oEvent.getSource().getBindingContext("bridges");
      var bridge = item ? item.getObject() : null;
      if (!bridge) return;
      this._onMapBridgeSelect(bridge);
      // Switch to map tab and zoom
      this.byId("mainTabBar").setSelectedKey("map");
      if (_leafletMap && bridge.latitude && bridge.longitude) {
        _leafletMap.setView([bridge.latitude, bridge.longitude], 14);
        var marker = _markers[bridge.bridge_id];
        if (marker) marker.openPopup();
      }
    },

    // ── Permit Checker ──
    onRunPermitCheck: function () {
      var gvm     = parseFloat(this.byId("gvmInput").getValue()) || 0;
      var height  = parseFloat(this.byId("heightInput").getValue()) || 0;
      var width   = parseFloat(this.byId("widthInput").getValue()) || 0;
      var length  = parseFloat(this.byId("lengthInput").getValue()) || 0;
      var steer   = parseFloat(this.byId("steerAxleInput").getValue()) || 0;
      var drive   = parseFloat(this.byId("driveAxleInput").getValue()) || 0;
      var trailer = parseFloat(this.byId("trailerAxleInput").getValue()) || 0;
      var permitClass = this.byId("permitClassSel").getSelectedKey();
      var regionF = this.byId("permitRegionFilter").getSelectedKey();
      var nhvrOnly = this.byId("nhvrOnlyCheck").getSelected();

      if (!gvm || !height) {
        MessageBox.warning("Please enter at least GVM and vehicle height.");
        return;
      }

      var vehicle = { gvm: gvm, height: height, width: width, length: length,
                      steerAxle: steer, driveAxle: drive, trailerAxle: trailer,
                      permitClass: permitClass };

      var bridges = this.getView().getModel("bridges").getProperty("/bridges") || [];
      var results = [];
      var summary = { Compliant: 0, Conditional: 0, Violation: 0, Unassessed: 0 };
      var permitResultMap = {};

      bridges.forEach(function (b) {
        if (regionF !== "All" && b.region !== regionF) return;
        if (nhvrOnly && !b.nhvr_route_assessed) return;

        var result = NHVRPermit.assess(b, vehicle);
        results.push(result);
        summary[result.overallResult] = (summary[result.overallResult] || 0) + 1;
        permitResultMap[b.bridge_id] = result.overallResult;
      });

      // Sort: violations first, then conditional, then compliant
      var order = { Violation: 0, Conditional: 1, Compliant: 2, Unassessed: 3 };
      results.sort(function (a, b) {
        return (order[a.overallResult] || 3) - (order[b.overallResult] || 3);
      });

      var stateModel = this.getView().getModel("state");
      stateModel.setProperty("/results", results);

      this.byId("permitNoResults").setVisible(false);
      this.byId("permitSummaryBar").setVisible(true);
      this.byId("permitResultsTable").setVisible(true);

      this.byId("compliantCount").setNumber(summary.Compliant || 0);
      this.byId("conditionalCount").setNumber(summary.Conditional || 0);
      this.byId("violationCount").setNumber(summary.Violation || 0);
      this.byId("unassessedCount").setNumber(summary.Unassessed || 0);

      // Update map marker colours
      this._permitResults = permitResultMap;
      this._renderMapMarkers(regionF !== "All" ? function(b){ return b.region === regionF; } : null);

      MessageToast.show("Assessed " + results.length + " bridges — " +
        (summary.Violation || 0) + " violations, " + (summary.Conditional || 0) + " conditional.");
    },

    onResetPermit: function () {
      var stateModel = this.getView().getModel("state");
      stateModel.setProperty("/results", []);
      this._permitResults = {};
      this.byId("permitNoResults").setVisible(true);
      this.byId("permitSummaryBar").setVisible(false);
      this.byId("permitResultsTable").setVisible(false);
      this._renderMapMarkers();
    },

    onRunPermitFromDetail: function () {
      this.byId("mainTabBar").setSelectedKey("permit");
      setTimeout(this.onRunPermitCheck.bind(this), 100);
    },

    // ── Export CSV ──
    onExportCSV: function () {
      var bridges = this.getView().getModel("bridges").getProperty("/bridges") || [];
      var headers = [
        "bridge_id","bridge_name","lga","region","state","road_route","route_number",
        "asset_owner","maintenance_authority","condition","condition_rating","posting_status",
        "structure_type","material","clearance_height_m","main_span_m","total_length_m",
        "width_m","no_of_spans","no_of_lanes","latitude","longitude",
        "nhvr_route_assessed","over_mass_route","gazette_reference","aadt","freight_route",
        "flood_impacted","scour_risk","seismic_zone","data_source","source_url",
        "last_updated","data_confidence","notes"
      ];
      var rows = bridges.map(function (b) {
        return headers.map(function (h) {
          var v = b[h];
          if (v === null || v === undefined) return "";
          if (typeof v === "string" && v.indexOf(",") > -1) return '"' + v.replace(/"/g, '""') + '"';
          return String(v);
        }).join(",");
      });
      var csv = headers.join(",") + "\n" + rows.join("\n");
      var blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url; a.download = "nsw_bridges.csv"; a.click();
      URL.revokeObjectURL(url);
      MessageToast.show("CSV exported.");
    },

    // ── About ──
    onAbout: function () {
      MessageBox.information(
        "NSW Bridge Asset & NHVR Permit Assessment\n\n" +
        "Version 1.0 | March 2026\n\n" +
        "Data Sources:\n" +
        "• Transport for NSW Open Data Portal\n" +
        "• NSW Spatial SEED / Digital Twin NSW\n" +
        "• NHVR Gazetted Routes\n" +
        "• OpenStreetMap (fallback)\n\n" +
        "⚠ This application is for demonstration purposes.\n" +
        "Permit decisions must be confirmed via official NHVR channels.\n\n" +
        "Built with SAP UI5 · Leaflet.js · OpenStreetMap",
        { title: "About This Application" }
      );
    }
  });
});
