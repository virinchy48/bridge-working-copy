// ============================================================
// NHVR Vehicle Combinations & Route Query Controller
// ============================================================
sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageToast",
    "sap/m/MessageBox",
    "nhvr/bridgemanagement/model/CapabilityManager",
    "nhvr/bridgemanagement/util/LookupService"
], function (Controller, JSONModel, MessageToast, MessageBox, CapabilityManager, LookupService) {
    "use strict";

    const BASE = "/bridge-management";

    // Escape single quotes for OData v4 string literals ( ' → '' )
    const _odataStr = (v) => String(v == null ? "" : v).replace(/'/g, "''");

    var _IS_LOC = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
    var _AUTH_H = _IS_LOC ? { "Authorization": "Basic " + btoa("admin:admin") } : {};
    function _credOpts(extraHeaders) {
        var opts = { headers: Object.assign({ Accept: "application/json" }, _AUTH_H, extraHeaders || {}) };
        if (!_IS_LOC) opts.credentials = "include";
        return opts;
    }

    return Controller.extend("nhvr.bridgemanagement.controller.VehicleCombinations", {

        _allBridges        : [],
        _filteredBridges   : [],
        _currentBridgeId   : null,

        onInit: function () {
            this._model = new JSONModel({
                combinations  : [],
                searchResults : []
            });
            this.getView().setModel(this._model, "vehicle");

            LookupService.load().then(function () {
                LookupService.populateSelect(this.byId("vehState"), "STATE", "All States");
            }.bind(this));

            const router = this.getOwnerComponent().getRouter();
            router.getRoute("VehicleCombinations").attachPatternMatched(this._onRouteMatched, this);
        },

        _onRouteMatched: function () {
            var self = this;
            CapabilityManager.load().then(function () {
                if (!CapabilityManager.guardRoute("VEHICLE_COMBINATIONS", self.getOwnerComponent().getRouter())) return;
                self._loadAllBridges();
            });
        },

        // ── Load all bridges for the search/select ─────────────
        _loadAllBridges: function () {
            fetch(`${BASE}/Bridges?$select=bridgeId,name,region,state,postingStatus,clearanceHeightM,conditionRating,condition&$orderby=name`, _credOpts())
                .then(r => r.json())
                .then(j => {
                    this._allBridges = j.value || [];
                    this._filteredBridges = this._allBridges;
                    this._populateBridgeSelect(this._allBridges);
                })
                .catch(() => {});
        },

        _populateBridgeSelect: function (bridges) {
            const sel = this.byId("bridgeSelect");
            if (!sel) return;
            while (sel.getItems().length > 1) sel.removeItem(1);
            bridges.forEach(b => {
                sel.addItem(new sap.ui.core.Item({
                    key : b.bridgeId,
                    text: `${b.bridgeId} — ${b.name}`
                }));
            });
        },

        // ── Bridge search ─────────────────────────────────────
        onBridgeSearch: function (e) {
            const q = (e.getParameter ? e.getParameter("query") : "") || "";
            this._filterBridgeSelect(q);
        },

        onBridgeLiveSearch: function (e) {
            const q = (e.getParameter ? e.getParameter("newValue") : "") || "";
            this._filterBridgeSelect(q);
        },

        _filterBridgeSelect: function (q) {
            const lower = (q || "").toLowerCase();
            const filtered = lower
                ? this._allBridges.filter(b =>
                    (b.bridgeId || "").toLowerCase().includes(lower) ||
                    (b.name     || "").toLowerCase().includes(lower)
                )
                : this._allBridges;
            this._filteredBridges = filtered;
            this._populateBridgeSelect(filtered);
        },

        // ── Bridge select → load restrictions ─────────────────
        onBridgeSelect: function (e) {
            const key = e.getParameter("selectedItem") ? e.getParameter("selectedItem").getKey() : "";
            if (!key) {
                this._model.setProperty("/combinations", []);
                this.byId("bridgeSummaryPanel").setVisible(false);
                return;
            }
            this._currentBridgeId = key;
            const bridge = this._allBridges.find(b => b.bridgeId === key) || {};
            this._showBridgeSummary(bridge);
            this._loadBridgeRestrictions(key);
        },

        _showBridgeSummary: function (bridge) {
            const panel = this.byId("bridgeSummaryPanel");
            if (panel) {
                panel.setVisible(true);
                const nameEl   = this.byId("bridgeSummaryName");
                const statusEl = this.byId("bridgeSummaryStatus");
                const condEl   = this.byId("bridgeSummaryCond");
                if (nameEl)   nameEl.setText(`${bridge.bridgeId} — ${bridge.name}`);
                if (statusEl) {
                    statusEl.setText(bridge.postingStatus || "—");
                    statusEl.setState(
                        bridge.postingStatus === "UNRESTRICTED" ? "Success" :
                        bridge.postingStatus === "POSTED"       ? "Warning" : "Error"
                    );
                }
                if (condEl) {
                    condEl.setText(`Condition: ${bridge.condition || "—"}`);
                    condEl.setState(
                        bridge.condition === "GOOD"     ? "Success" :
                        bridge.condition === "FAIR"     ? "Warning" : "Error"
                    );
                }
            }
        },

        _loadBridgeRestrictions: function (bridgeId) {
            fetch(`${BASE}/Restrictions?$filter=bridgeId eq '${_odataStr(bridgeId)}' and status eq 'ACTIVE'`, _credOpts())
                .then(r => r.json())
                .then(j => {
                    const restrictions = j.value || [];
                    const combinations = this._computeAllowedCombinations(restrictions);
                    this._model.setProperty("/combinations", combinations);

                    const title = this.byId("combinationsTitle");
                    if (title) title.setText(`Allowed Vehicle Combinations — ${combinations.length} restrictions`);
                })
                .catch(() => {
                    this._model.setProperty("/combinations", []);
                });
        },

        // ── Compute allowed vehicle combinations from restrictions ──
        _computeAllowedCombinations: function (restrictions) {
            return restrictions.map(r => {
                const type = (r.restrictionType || "").toUpperCase();
                const val  = parseFloat(r.value) || null;
                const unit = r.unit || "";

                return {
                    restrictionType : r.restrictionType || "—",
                    maxMass         : (type === "WEIGHT" || type === "GROSS_MASS" || type === "TOTAL_MASS" || type === "MASS") ? val : null,
                    maxHeight       : type === "HEIGHT" ? val : null,
                    maxWidth        : type === "WIDTH"  ? val : null,
                    maxLength       : type === "LENGTH" ? val : null,
                    permitRequired  : !!r.permitRequired,
                    status          : r.status || "—",
                    notes           : r.notes || "",
                    unit            : unit
                };
            });
        },

        // ── Vehicle search → find allowed bridges ─────────────
        onVehicleSearch: function () {
            const mass   = parseFloat(this.byId("vehMass")  ? this.byId("vehMass").getValue()   : "") || null;
            const height = parseFloat(this.byId("vehHeight")? this.byId("vehHeight").getValue() : "") || null;
            const width  = parseFloat(this.byId("vehWidth") ? this.byId("vehWidth").getValue()  : "") || null;
            const length = parseFloat(this.byId("vehLength")? this.byId("vehLength").getValue() : "") || null;
            const state  = this.byId("vehState")  ? this.byId("vehState").getSelectedKey()  : "";
            const region = this.byId("vehRegion") ? this.byId("vehRegion").getValue().trim() : "";

            if (!mass && !height && !width && !length) {
                MessageToast.show("Enter at least one vehicle parameter to search");
                return;
            }

            // Load all bridges and their restrictions, then filter
            let bridgesUrl = `${BASE}/Bridges?$select=bridgeId,name,region,state,postingStatus,clearanceHeightM,conditionRating`;
            const filterParts = [];
            if (state)  filterParts.push(`state eq '${_odataStr(state)}'`);
            if (region) filterParts.push(`contains(tolower(region),'${_odataStr(region.toLowerCase())}')`);
            if (filterParts.length) bridgesUrl += `&$filter=${encodeURIComponent(filterParts.join(" and "))}`;

            fetch(bridgesUrl, _credOpts())
                .then(r => r.json())
                .then(j => {
                    const bridges = j.value || [];
                    // For each bridge, check against restrictions
                    return fetch(`${BASE}/Restrictions?$filter=status eq 'ACTIVE'&$select=bridgeId,restrictionType,value,unit,permitRequired`, _credOpts())
                        .then(r2 => r2.json())
                        .then(j2 => ({ bridges, restrictions: j2.value || [] }));
                })
                .then(({ bridges, restrictions }) => {
                    // Group restrictions by bridgeId
                    const restrByBridge = {};
                    restrictions.forEach(r => {
                        if (!restrByBridge[r.bridgeId]) restrByBridge[r.bridgeId] = [];
                        restrByBridge[r.bridgeId].push(r);
                    });

                    // Filter bridges where vehicle params are within all restrictions
                    const results = bridges.filter(b => {
                        const bRestr = restrByBridge[b.bridgeId] || [];
                        for (const r of bRestr) {
                            const type = (r.restrictionType || "").toUpperCase();
                            const val  = parseFloat(r.value);
                            if (isNaN(val)) continue;

                            if (mass && (type === "WEIGHT" || type === "GROSS_MASS" || type === "TOTAL_MASS" || type === "MASS") && mass > val) return false;
                            if (mass && type === "AXLE_LOAD" && mass > val * 10) return false; // approx axle
                            if (height && type === "HEIGHT" && height > val) return false;
                            if (width  && type === "WIDTH"  && width  > val) return false;
                            if (length && type === "LENGTH" && length > val) return false;
                        }
                        return true;
                    }).map(b => {
                        const bRestr = restrByBridge[b.bridgeId] || [];
                        const massRestr = bRestr.find(r => ["WEIGHT","GROSS_MASS","TOTAL_MASS","MASS"].includes((r.restrictionType||"").toUpperCase()));
                        return {
                            bridgeId       : b.bridgeId,
                            name           : b.name,
                            region         : b.region,
                            state          : b.state,
                            postingStatus  : b.postingStatus,
                            clearanceHeightM: b.clearanceHeightM,
                            maxAllowedMass : massRestr ? parseFloat(massRestr.value) : null,
                            restrictionCount: bRestr.length
                        };
                    });

                    this._model.setProperty("/searchResults", results);

                    // Update KPIs
                    const total    = results.length;
                    const unrest   = results.filter(r => r.postingStatus === "UNRESTRICTED").length;
                    const posted   = results.filter(r => r.postingStatus === "POSTED").length;
                    this._setKpi("vehicleKpiTotal",  `${total} Bridges found`);
                    this._setKpi("vehicleKpiOpen",   `${unrest} Unrestricted`);
                    this._setKpi("vehicleKpiPosted", `${posted} Posted`);

                    const title = this.byId("vehicleSearchTitle");
                    if (title) title.setText(`Matching Bridges (${total})`);

                    MessageToast.show(`Found ${total} bridge(s) accessible for this vehicle`);
                })
                .catch(err => {
                    console.error("Vehicle search failed", err);
                    MessageToast.show("Search failed — check console");
                });
        },

        // ── Navigate to Bridge Detail ─────────────────────────
        onNavToBridge: function (e) {
            const ctx = e.getSource().getBindingContext("vehicle");
            const row = ctx ? ctx.getObject() : null;
            if (!row || !row.bridgeId) return;
            this.getOwnerComponent().getRouter().navTo("BridgeDetail", {
                bridgeId: encodeURIComponent(row.bridgeId)
            });
        },

        onRefresh: function () {
            this._loadAllBridges();
            if (this._currentBridgeId) {
                this._loadBridgeRestrictions(this._currentBridgeId);
            }
            MessageToast.show("Data refreshed");
        },

        _setKpi: function (id, text) {
            const ctrl = this.byId(id);
            if (ctrl) ctrl.setText(text);
        },

        onNavHome: function () {
            this.getOwnerComponent().getRouter().navTo("Home");
        }
    });
});
