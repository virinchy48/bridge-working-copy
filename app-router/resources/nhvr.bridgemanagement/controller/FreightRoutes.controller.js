sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageToast",
    "sap/m/MessageBox",
    "nhvr/bridgemanagement/model/CapabilityManager",
    "nhvr/bridgemanagement/util/AuthFetch",
    "nhvr/bridgemanagement/util/UserAnalytics",
    "nhvr/bridgemanagement/util/LookupService"
], function (Controller, JSONModel, MessageToast, MessageBox, CapabilityManager, AuthFetch, UserAnalytics, LookupService) {
    "use strict";

    var BASE = "/bridge-management";
    var H    = { Accept: "application/json" };

    return Controller.extend("nhvr.bridgemanagement.controller.FreightRoutes", {

        onInit: function () {
            UserAnalytics.trackView("FreightRoutes");
            var oRouter = this.getOwnerComponent().getRouter();
            oRouter.getRoute("FreightRoutes").attachPatternMatched(this._onRouteMatched, this);
            this._allRoutes = [];

            LookupService.load().then(function () {
                LookupService.populateSelect(this.byId("routeStateFilter"), "STATE", "All States");
                LookupService.populateFormSelect(this.byId("fRouteState"), "STATE");
            }.bind(this));
        },

        _onRouteMatched: function () {
            var self = this;
            CapabilityManager.load().then(function () {
                if (!CapabilityManager.guardRoute("FREIGHT_ROUTES", self.getOwnerComponent().getRouter())) return;
                self._loadFreightRoutes();
            });
        },

        _loadFreightRoutes: function () {
            fetch(`${BASE}/FreightRoutes?$orderby=routeCode`, { headers: H })
                .then(r => r.ok ? r.json() : { value: [] })
                .then(j => {
                    this._allRoutes = j.value || [];
                    this._applyFilters();
                })
                .catch(() => MessageToast.show("Failed to load freight routes"));
        },

        _applyFilters: function () {
            var searchVal = (this.byId("routeSearch")  && this.byId("routeSearch").getValue()  || "").toLowerCase();
            var classVal  = (this.byId("routeClassFilter") && this.byId("routeClassFilter").getSelectedKey())  || "";
            var stateVal  = (this.byId("routeStateFilter") && this.byId("routeStateFilter").getSelectedKey()) || "";

            var filtered = this._allRoutes.filter(function (r) {
                var matchSearch = !searchVal ||
                    (r.routeCode && r.routeCode.toLowerCase().includes(searchVal)) ||
                    (r.name      && r.name.toLowerCase().includes(searchVal))      ||
                    (r.state     && r.state.toLowerCase().includes(searchVal));
                var matchClass = !classVal || r.routeClass === classVal;
                var matchState = !stateVal || r.state      === stateVal;
                return matchSearch && matchClass && matchState;
            });

            var oModel = new JSONModel({ items: filtered });
            this.getView().setModel(oModel, "freightRoutes");
            var countCtrl = this.byId("routeCount");
            if (countCtrl) countCtrl.setText(filtered.length + " route(s)");
        },

        onSearch: function () { this._applyFilters(); },
        onClassFilter: function () { this._applyFilters(); },
        onStateFilter: function () { this._applyFilters(); },

        onRefresh: function () { this._loadFreightRoutes(); },

        onRowSelectionChange: function () {
            var table  = this.byId("freightRoutesTable");
            var hasRow = table && table.getSelectedIndex() >= 0;
            var btn    = this.byId("btnAssessCorridor");
            if (btn) btn.setEnabled(!!hasRow);
        },

        onAssessCorridor: function () {
            var table    = this.byId("freightRoutesTable");
            var idx      = table && table.getSelectedIndex();
            if (idx < 0) { MessageToast.show("Select a route first"); return; }
            var oModel   = this.getView().getModel("freightRoutes");
            var route    = oModel.getProperty("/items/" + idx);
            if (!route || !route.ID) { MessageToast.show("Could not determine route"); return; }

            var self = this;
            MessageBox.confirm(
                "Assess corridor for route: " + route.routeCode + " — " + (route.name || "") + "?",
                {
                    title: "Assess Corridor",
                    onClose: function (action) {
                        if (action !== MessageBox.Action.OK) return;
                        AuthFetch.post(`${BASE}/assessCorridor`, { routeId: route.ID })
                            .then(r => r.json())
                            .then(j => {
                                if (j.error) {
                                    MessageBox.error(j.error.message || "Assessment failed");
                                } else {
                                    MessageToast.show(
                                        "Corridor assessed: max mass " +
                                        (j.corridorMaxMass != null ? j.corridorMaxMass + " t" : "unknown") +
                                        " across " + j.bridgeCount + " bridge(s) — " +
                                        j.criticalBridges + " critical"
                                    );
                                    self._loadFreightRoutes();
                                }
                            })
                            .catch(() => MessageBox.error("Failed to assess corridor"));
                    }
                }
            );
        },

        onOpenRoute: function (oEvent) {
            var ctx = oEvent.getSource().getBindingContext("freightRoutes");
            if (!ctx) return;
            var route = ctx.getObject();
            if (!route || !route.ID) { MessageToast.show("Could not open route"); return; }
            this.getOwnerComponent().getRouter().navTo("FreightRouteDetail", { routeId: route.ID });
        },

        onAddRoute: function () {
            var dlg = this.byId("addRouteDialog");
            if (dlg) {
                this.byId("fRouteCode").setValue("");
                this.byId("fRouteName").setValue("");
                this.byId("fRouteState").setSelectedKey("NSW");
                this.byId("fRouteClass").setSelectedKey("GENERAL");
                this.byId("fCorridorMaxHeight").setValue("");
                this.byId("fRouteStatus").setSelectedKey("ACTIVE");
                dlg.open();
            }
        },

        onSaveRoute: function () {
            var code = this.byId("fRouteCode").getValue().trim();
            if (!code) { MessageToast.show("Route Code is required"); return; }

            var payload = {
                routeCode        : code,
                name             : this.byId("fRouteName").getValue().trim(),
                state            : this.byId("fRouteState").getSelectedKey(),
                routeClass       : this.byId("fRouteClass").getSelectedKey(),
                corridorMaxHeight: parseFloat(this.byId("fCorridorMaxHeight").getValue()) || null,
                status           : this.byId("fRouteStatus").getSelectedKey()
            };

            var self = this;
            AuthFetch.post(`${BASE}/FreightRoutes`, payload)
                .then(r => r.ok ? r.json() : r.json().then(e => Promise.reject(e)))
                .then(() => {
                    MessageToast.show("Freight route created");
                    self.byId("addRouteDialog").close();
                    self._loadFreightRoutes();
                })
                .catch(e => MessageBox.error((e && e.error && e.error.message) || "Failed to create route"));
        },

        onCloseRouteDialog: function () {
            var dlg = this.byId("addRouteDialog");
            if (dlg) dlg.close();
        },

        onNavHome: function () {
            this.getOwnerComponent().getRouter().navTo("Home");
        }
    });
});
