sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageToast",
    "nhvr/bridgemanagement/model/CapabilityManager"
], function (Controller, JSONModel, MessageToast, CapabilityManager) {
    "use strict";

    var BASE = "/bridge-management";
    var H    = { Accept: "application/json" };

    return Controller.extend("nhvr.bridgemanagement.controller.WorkOrders", {

        onInit: function () {
            var oRouter = this.getOwnerComponent().getRouter();
            oRouter.getRoute("WorkOrders").attachPatternMatched(this._onRouteMatched, this);
            this._allWorkOrders = [];
        },

        _onRouteMatched: function () {
            var self = this;
            CapabilityManager.load().then(function () {
                if (!CapabilityManager.guardRoute("WORK_ORDERS", self.getOwnerComponent().getRouter())) return;
                self._loadWorkOrders();
            });
        },

        _loadWorkOrders: function () {
            fetch(`${BASE}/WorkOrders?$orderby=createdAt desc`, { headers: H })
                .then(r => r.ok ? r.json() : { value: [] })
                .then(j => {
                    this._allWorkOrders = j.value || [];
                    this._applyFilters();
                })
                .catch(() => MessageToast.show("Failed to load work orders"));
        },

        _applyFilters: function () {
            var searchVal   = (this.byId("woSearch") && this.byId("woSearch").getValue() || "").toLowerCase();
            var statusVal   = (this.byId("woStatusFilter") && this.byId("woStatusFilter").getSelectedKey()) || "";
            var priorityVal = (this.byId("woPriorityFilter") && this.byId("woPriorityFilter").getSelectedKey()) || "";

            var filtered = this._allWorkOrders.filter(function (w) {
                var matchSearch   = !searchVal ||
                    (w.woNumber    && w.woNumber.toLowerCase().includes(searchVal)) ||
                    (w.assignedTo  && w.assignedTo.toLowerCase().includes(searchVal));
                var matchStatus   = !statusVal   || w.status   === statusVal;
                var matchPriority = !priorityVal || w.priority === priorityVal;
                return matchSearch && matchStatus && matchPriority;
            });

            var oModel = new JSONModel({ items: filtered });
            this.getView().setModel(oModel, "workOrders");
            var countCtrl = this.byId("woCount");
            if (countCtrl) countCtrl.setText(filtered.length + " work order(s)");
        },

        onSearch: function () { this._applyFilters(); },
        onStatusFilter: function () { this._applyFilters(); },
        onPriorityFilter: function () { this._applyFilters(); },
        onRefresh: function () { this._loadWorkOrders(); },

        onNavHome: function () {
            this.getOwnerComponent().getRouter().navTo("Home");
        }
    });
});
