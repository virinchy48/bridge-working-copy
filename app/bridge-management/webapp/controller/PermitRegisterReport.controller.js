// ============================================================
// NHVR Permit Register Report Controller
// Statutory register of all NHVR-issued heavy vehicle permits
// HVNL compliance — exportable for public disclosure
// ============================================================
sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageToast",
    "sap/m/MessageBox",
    "nhvr/bridgemanagement/util/AlvToolbarMixin",
    "nhvr/bridgemanagement/util/LookupService"
], function (Controller, JSONModel, MessageToast, MessageBox, AlvToolbarMixin, LookupService) {
    "use strict";

    const BASE = "/bridge-management";

    return Controller.extend("nhvr.bridgemanagement.controller.PermitRegisterReport", Object.assign({

        _allPermits : [],

        onInit: function () {
            this._model = new JSONModel({ items: [] });
            this.getView().setModel(this._model, "permitRegister");
            this._alvExportFileName = "nhvr-permit-register";

            const router = this.getOwnerComponent().getRouter();
            router.getRoute("PermitRegisterReport").attachPatternMatched(this._onRouteMatched, this);

            // Filter dropdowns sourced from Lookup table
            var self = this;
            LookupService.load().then(function () {
                LookupService.populateSelect(self.byId("filterStatus"), "PERMIT_STATUS", "All Statuses");
                LookupService.populateSelect(self.byId("filterType"),   "PERMIT_TYPE",   "All Types");
            });
        },

        _onRouteMatched: function () {
            this._loadPermits();
        },

        _loadPermits: function () {
            const page = this.byId("permitRegisterPage");
            if (page) page.setBusy(true);

            fetch(BASE + "/VehiclePermits?$orderby=issueDate desc&$top=2000", {
                headers: { Accept: "application/json" }
            })
            .then(function (r) {
                if (!r.ok) throw new Error("HTTP " + r.status);
                return r.json();
            })
            .then(function (j) {
                const raw = j.value || [];
                this._allPermits = raw.map(function (p) {
                    return {
                        ID                : p.ID,
                        permitNumber      : p.permitNumber      || p.ID || "—",
                        permitType        : p.permitType        || "—",
                        status            : p.status            || "—",
                        applicant         : p.applicant         || p.operatorName  || "—",
                        vehicleConfig     : p.vehicleConfig     || p.vehicleDescription || "—",
                        routeDescription  : p.routeDescription  || p.route         || "—",
                        issueDate         : p.issueDate         || p.approvalDate   || "—",
                        expiryDate        : p.expiryDate        || p.validToDate    || "—",
                        approvedBy        : p.approvedBy        || "—",
                        maxMass           : p.maxMass           || p.totalMass      || "—",
                        maxWidth          : p.maxWidth          || "—",
                        conditions        : p.conditions        || p.specialConditions || ""
                    };
                });
                this._applyFilters();
                this._updateKpis(this._allPermits);
                if (page) page.setBusy(false);
                this._buildTableColumns();
                MessageToast.show(this._allPermits.length + " permits loaded");
            }.bind(this))
            .catch(function (err) {
                if (page) page.setBusy(false);
                // Graceful fallback with sample data in dev
                console.warn("[NHVR:PermitRegister] Load failed, using empty set:", err.message);
                this._allPermits = [];
                this._applyFilters();
                this._updateKpis([]);
            }.bind(this));
        },

        _applyFilters: function () {
            const statusKey = this.byId("filterStatus")   ? this.byId("filterStatus").getSelectedKey()   : "";
            const typeKey   = this.byId("filterType")     ? this.byId("filterType").getSelectedKey()     : "";
            const dateFrom  = this.byId("filterDateFrom") ? this.byId("filterDateFrom").getValue()       : "";
            const dateTo    = this.byId("filterDateTo")   ? this.byId("filterDateTo").getValue()         : "";
            const search    = this.byId("searchField")    ? this.byId("searchField").getValue().toLowerCase() : "";

            let data = this._allPermits;

            if (statusKey !== "") data = data.filter(function (p) { return p.status === statusKey; });
            if (typeKey   !== "") data = data.filter(function (p) { return p.permitType === typeKey; });

            if (dateFrom) {
                const from = new Date(dateFrom.split("/").reverse().join("-"));
                if (!isNaN(from.getTime())) {
                    data = data.filter(function (p) {
                        if (!p.issueDate || p.issueDate === "—") return false;
                        return new Date(p.issueDate) >= from;
                    });
                }
            }
            if (dateTo) {
                const to = new Date(dateTo.split("/").reverse().join("-"));
                if (!isNaN(to.getTime())) {
                    data = data.filter(function (p) {
                        if (!p.issueDate || p.issueDate === "—") return false;
                        return new Date(p.issueDate) <= to;
                    });
                }
            }
            if (search) {
                data = data.filter(function (p) {
                    return (p.permitNumber     || "").toLowerCase().includes(search) ||
                           (p.applicant        || "").toLowerCase().includes(search) ||
                           (p.vehicleConfig    || "").toLowerCase().includes(search) ||
                           (p.routeDescription || "").toLowerCase().includes(search);
                });
            }

            this._model.setProperty("/items", data);
            this._alvData = data;
            this._alvUpdateCount(this._allPermits.length, data.length);

            const title = this.byId("tableTitle");
            if (title) title.setText("Permit Register (" + data.length + ")");
        },

        _updateKpis: function (permits) {
            const total    = permits.length;
            const approved = permits.filter(function (p) { return p.status === "APPROVED"; }).length;
            const pending  = permits.filter(function (p) { return p.status === "PENDING" || p.status === "UNDER_ASSESSMENT"; }).length;
            const expired  = permits.filter(function (p) { return p.status === "EXPIRED"; }).length;
            const rejected = permits.filter(function (p) { return p.status === "REJECTED" || p.status === "REVOKED"; }).length;

            const s = function (id) { return this.byId(id); }.bind(this);
            if (s("kpiTotal"))    s("kpiTotal").setText(total + " Total");
            if (s("kpiApproved")) s("kpiApproved").setText(approved + " Approved");
            if (s("kpiPending"))  s("kpiPending").setText(pending + " Pending");
            if (s("kpiExpired"))  s("kpiExpired").setText(expired + " Expired");
            if (s("kpiRejected")) s("kpiRejected").setText(rejected + " Rejected/Revoked");
        },

        _buildTableColumns: function () {
            const oTable = this.byId("permitRegisterTable");
            if (!oTable || this._tableBound) return;
            this._tableBound = true;

            const fields = [
                "permitNumber","permitType","status","applicant","vehicleConfig",
                "routeDescription","issueDate","expiryDate","approvedBy",
                "maxMass","maxWidth","conditions"
            ];
            const aCells = fields.map(function (f) {
                if (f === "status") {
                    return new sap.m.ObjectStatus({
                        text: "{permitRegister>" + f + "}",
                        state: "{= ${permitRegister>status} === 'APPROVED' ? 'Success' : " +
                               "${permitRegister>status} === 'PENDING' || ${permitRegister>status} === 'UNDER_ASSESSMENT' ? 'Warning' : " +
                               "${permitRegister>status} === 'EXPIRED' ? 'None' : 'Error' }"
                    });
                }
                if (f === "expiryDate") {
                    return new sap.m.ObjectStatus({
                        text: "{permitRegister>expiryDate}",
                        state: "{= ${permitRegister>expiryDate} && ${permitRegister>expiryDate} !== '—' && new Date(${permitRegister>expiryDate}) < new Date() ? 'Error' : 'None' }"
                    });
                }
                return new sap.m.Text({ text: "{permitRegister>" + f + "}" });
            });

            const cols = oTable.getColumns();
            if (cols.length > 0) {
                // XML columns already have label (header) set — wire up cell templates
                cols.forEach(function (col, i) {
                    if (aCells[i]) col.setTemplate(aCells[i]);
                });
            } else {
                // Fallback: dynamically add columns with headers + templates
                const headers = ["Permit No.", "Type", "Status", "Applicant", "Vehicle", "Route",
                                 "Issue Date", "Expiry Date", "Approved By", "Max Mass", "Max Width", "Conditions"];
                fields.forEach(function (f, i) {
                    oTable.addColumn(new sap.ui.table.Column({
                        label: new sap.m.Label({ text: headers[i] || f }),
                        template: aCells[i]
                    }));
                });
            }
        },

        // ── Event Handlers ────────────────────────────────────
        onFilterChange : function () { this._applyFilters(); },
        onSearch       : function () { this._applyFilters(); },
        onLiveSearch   : function () { this._applyFilters(); },

        onClearFilters: function () {
            const ids = ["filterStatus","filterType","filterDateFrom","filterDateTo","searchField"];
            ids.forEach(function (id) {
                const ctrl = this.byId(id);
                if (!ctrl) return;
                if (ctrl.setSelectedKey)  ctrl.setSelectedKey("");
                if (ctrl.setValue)        ctrl.setValue("");
            }.bind(this));
            this._applyFilters();
        },

        onInfoPress: function () {
            MessageBox.information(
                "Permit Register — Statutory Information\n\n" +
                "LEGAL BASIS:\nThis register fulfils the NHVR's obligations under the Heavy Vehicle National Law (HVNL) " +
                "to maintain a public register of issued mass and dimension permits.\n\n" +
                "PERMIT TYPES:\n" +
                "  OVERSIZE  — Vehicle exceeds standard dimension limits\n" +
                "  OVERMASS  — Vehicle exceeds standard mass limits\n" +
                "  PILOT     — Requires pilot/escort vehicle\n" +
                "  ROUTE     — Route-specific permit for ongoing movements\n\n" +
                "STATUS:\n" +
                "  APPROVED         — Permit is current and valid\n" +
                "  PENDING          — Application received, not yet assessed\n" +
                "  UNDER_ASSESSMENT — Being reviewed by NHVR assessor\n" +
                "  EXPIRED          — Valid period has passed\n" +
                "  REJECTED         — Application refused by NHVR\n" +
                "  REVOKED          — Approved permit cancelled\n\n" +
                "Export this register using the Excel or CSV buttons for submission to state authorities.",
                { title: "About the Permit Register" }
            );
        },

        // ── ALV Overrides ──────────────────────────────────────
        onAlvRefresh: function () { this._loadPermits(); },
        onAlvSort: function () {
            var that = this;
            var oSheet = new sap.m.ActionSheet({
                title: "Sort Permit Register by",
                buttons: [
                    new sap.m.Button({ text: "Permit Number",  press: function () { that._sortBy("permitNumber"); } }),
                    new sap.m.Button({ text: "Issue Date",     press: function () { that._sortBy("issueDate"); } }),
                    new sap.m.Button({ text: "Expiry Date",    press: function () { that._sortBy("expiryDate"); } }),
                    new sap.m.Button({ text: "Status",         press: function () { that._sortBy("status"); } }),
                    new sap.m.Button({ text: "Type",           press: function () { that._sortBy("permitType"); } }),
                    new sap.m.Button({ text: "Applicant",      press: function () { that._sortBy("applicant"); } })
                ],
                cancelButton: new sap.m.Button({ text: "Cancel", press: function () { oSheet.close(); } })
            });
            oSheet.openBy(this.getView());
        },
        _sortBy: function (field) {
            var items = (this._model.getProperty("/items") || []).slice().sort(function (a, b) {
                return String(a[field] || "").localeCompare(String(b[field] || ""), undefined, { numeric: true });
            });
            this._model.setProperty("/items", items);
            MessageToast.show("Sorted by " + field);
        },

        // ── Navigation ─────────────────────────────────────────
        onNavHome    : function () { this.getOwnerComponent().getRouter().navTo("Home"); },
        onNavToReports: function () { this.getOwnerComponent().getRouter().navTo("Reports"); },

        onExit: function () {
            // Clean up
        }

    }, AlvToolbarMixin));
});
