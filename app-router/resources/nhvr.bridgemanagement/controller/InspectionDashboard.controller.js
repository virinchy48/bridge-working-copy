// ============================================================
// NHVR Inspection Dashboard Controller
// ============================================================
sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageToast",
    "sap/m/MessageBox",
    "nhvr/bridgemanagement/util/ExcelExport",
    "nhvr/bridgemanagement/model/CapabilityManager",
    "nhvr/bridgemanagement/util/AlvToolbarMixin",
    "nhvr/bridgemanagement/util/UserAnalytics"
], function (Controller, JSONModel, MessageToast, MessageBox, ExcelExport, CapabilityManager, AlvToolbarMixin, UserAnalytics) {
    "use strict";

    const BASE = "/bridge-management";

    var _IS_LOC = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
    var _AUTH_H = _IS_LOC ? { "Authorization": "Basic " + btoa("admin:admin") } : {};
    function _credOpts(extraHeaders) {
        var opts = { headers: Object.assign({ Accept: "application/json" }, _AUTH_H, extraHeaders || {}) };
        if (!_IS_LOC) opts.credentials = "include";
        return opts;
    }

    var oControllerDef = Object.assign({}, AlvToolbarMixin, {

        onInit: function () {
            UserAnalytics.trackView("Inspections");
            this._model = new JSONModel({ orders: [], due: [], pendingReviews: [], pendingReviewCount: 0 });
            this.getView().setModel(this._model, "insp");

            const router = this.getOwnerComponent().getRouter();
            router.getRoute("InspectionDashboard").attachPatternMatched(this._onRouteMatched, this);

            this._loadInspectionViews();
            this._rebuildInspectionViewsMenu();
        },

        _onRouteMatched: function () {
            var self = this;
            CapabilityManager.load().then(function () {
                if (!CapabilityManager.guardRoute("INSPECTIONS", self.getOwnerComponent().getRouter())) return;
                self._loadOrders();
                self._loadDue(90);
                self._loadPendingReviews();
            });
        },

        _loadOrders: function (statusFilter, typeFilter) {
            let filter = "";
            const parts = [];
            if (statusFilter) parts.push(`status eq '${statusFilter}'`);
            if (typeFilter)   parts.push(`inspectionType eq '${typeFilter}'`);
            if (parts.length) filter = "&$filter=" + encodeURIComponent(parts.join(" and "));

            // $top=9999 prevents OData truncation; $count=true gives accurate server total
            fetch(`${BASE}/InspectionOrders?$top=9999&$count=true&$orderby=plannedDate desc${filter}`, _credOpts())
                .then(r => r.json())
                .then(j => {
                    const orders     = j.value || [];
                    const serverTotal = j["@odata.count"] ?? orders.length;
                    this._model.setProperty("/orders", orders);
                    // Update ALV record count
                    this._alvUpdateCount(serverTotal, orders.length);
                    // KPIs: total from server $count; sub-counts from returned data
                    const planned       = orders.filter(o => o.status === "PLANNED").length;
                    const inProgress    = orders.filter(o => o.status === "IN_PROGRESS").length;
                    const pendingReview = orders.filter(o => o.status === "PENDING_REVIEW").length;
                    const completed     = orders.filter(o => o.status === "COMPLETED").length;
                    this._setKpi("kpiTotal", serverTotal, "None");
                    this._setKpi("kpiPlanned", planned, "None");
                    this._setKpi("kpiInProgress", inProgress, inProgress > 0 ? "Warning" : "None");
                    this._setKpi("kpiPendingReview", pendingReview, pendingReview > 0 ? "Warning" : "None");
                    this._setKpi("kpiCompleted", completed, "Success");
                })
                .catch(() => this._model.setProperty("/orders", []));
        },

        _loadInspectionOrders: function () {
            const status = this.byId("statusFilter") ? this.byId("statusFilter").getSelectedKey() : "";
            const type   = this.byId("typeFilter")   ? this.byId("typeFilter").getSelectedKey()   : "";
            this._loadOrders(status, type);
        },

        _loadDue: function (days) {
            fetch(`${BASE}/getInspectionsDue(daysAhead=${days || 90})`, _credOpts())
                .then(r => r.json())
                .then(j => {
                    const due = j.value || [];
                    this._model.setProperty("/due", due);
                    this._setKpi("kpiDue", due.length, due.length > 0 ? "Error" : "Success");
                })
                .catch(() => this._model.setProperty("/due", []));
        },

        _setKpi: function (id, text, state) {
            const ctrl = this.byId(id);
            if (ctrl) { ctrl.setText(String(text)); ctrl.setState(state || "None"); }
        },

        onStatusFilter: function (e) {
            const status = e.getParameter("selectedItem").getKey();
            const type = this.byId("typeFilter") ? this.byId("typeFilter").getSelectedKey() : "";
            this._loadOrders(status, type);
        },

        onTypeFilter: function (e) {
            const type = e.getParameter("selectedItem").getKey();
            const status = this.byId("statusFilter") ? this.byId("statusFilter").getSelectedKey() : "";
            this._loadOrders(status, type);
        },

        onDaysFilter: function (e) {
            const days = parseInt(e.getParameter("selectedItem").getKey()) || 90;
            this._loadDue(days);
        },

        onRefresh: function () {
            const status = this.byId("statusFilter") ? this.byId("statusFilter").getSelectedKey() : "";
            const type   = this.byId("typeFilter")   ? this.byId("typeFilter").getSelectedKey()   : "";
            const days   = this.byId("daysFilter")   ? parseInt(this.byId("daysFilter").getSelectedKey()) : 90;
            this._loadOrders(status, type);
            this._loadDue(days);
            this._loadPendingReviews();
        },

        onOrderPress: function (e) {
            const ctx = e.getSource().getBindingContext("insp");
            const order = ctx ? ctx.getObject() : null;
            if (!order || !order.bridgeId) return;
            this.getOwnerComponent().getRouter().navTo("BridgeDetail", {
                bridgeId: encodeURIComponent(order.bridgeId)
            });
        },

        // Deep-link click on the order number Link (same behaviour as row press)
        onOrderNumberPress: function (e) {
            this.onOrderPress(e);
        },

        // ── Saved filter views ────────────────────────────────────────────────
        _inspViewsKey: "nhvr_inspection_filter_views",
        _inspViews: [],

        _loadInspectionViews: function () {
            try {
                var raw = localStorage.getItem(this._inspViewsKey);
                var parsed = raw ? JSON.parse(raw) : [];
                this._inspViews = Array.isArray(parsed) ? parsed : [];
            } catch (_) { this._inspViews = []; }
        },

        _saveInspectionViews: function () {
            try { localStorage.setItem(this._inspViewsKey, JSON.stringify(this._inspViews)); } catch (_) { /* ignore */ }
        },

        _rebuildInspectionViewsMenu: function () {
            var oMenu = this.byId("inspViewsMenu");
            if (!oMenu) return;
            oMenu.destroyItems();
            if (this._inspViews.length === 0) {
                oMenu.addItem(new sap.m.MenuItem({ text: "(no saved views)", enabled: false }));
                return;
            }
            var self = this;
            this._inspViews.forEach(function (view) {
                var oItem = new sap.m.MenuItem({ text: view.name, icon: "sap-icon://filter" });
                oItem.attachPress(function () { self.onApplyInspectionView(view); });
                oMenu.addItem(oItem);
            });
            var oClear = new sap.m.MenuItem({ text: "Delete all saved views", icon: "sap-icon://delete", startsSection: true });
            oClear.attachPress(function () {
                MessageBox.confirm("Delete all " + self._inspViews.length + " saved view(s)?", {
                    title: "Delete saved views",
                    onClose: function (action) {
                        if (action !== MessageBox.Action.OK) return;
                        self._inspViews = [];
                        self._saveInspectionViews();
                        self._rebuildInspectionViewsMenu();
                        MessageToast.show("All saved views deleted");
                    }
                });
            });
            oMenu.addItem(oClear);
        },

        onSaveInspectionView: function () {
            var current = {
                status: this.byId("statusFilter") ? this.byId("statusFilter").getSelectedKey() : "",
                type:   this.byId("typeFilter")   ? this.byId("typeFilter").getSelectedKey()   : ""
            };
            if (!current.status && !current.type) {
                MessageToast.show("Nothing to save — set at least one filter first.");
                return;
            }
            var self = this;
            MessageBox.prompt("Name this view:", {
                title: "Save Inspection View",
                onClose: function (sAction, sValue) {
                    var value = (sValue || "").trim();
                    if (sAction !== MessageBox.Action.OK || !value) return;
                    self._inspViews = self._inspViews.filter(function (v) { return v.name !== value; });
                    self._inspViews.push({ name: value, criteria: current });
                    self._saveInspectionViews();
                    self._rebuildInspectionViewsMenu();
                    MessageToast.show("Saved view: " + value);
                }
            });
        },

        onApplyInspectionView: function (view) {
            if (!view || !view.criteria) return;
            var c = view.criteria;
            if (this.byId("statusFilter")) this.byId("statusFilter").setSelectedKey(c.status || "");
            if (this.byId("typeFilter"))   this.byId("typeFilter").setSelectedKey(c.type || "");
            this._loadOrders(c.status || "", c.type || "");
            MessageToast.show("Applied view: " + view.name);
        },

        onDueBridgePress: function (e) {
            const ctx = e.getSource().getBindingContext("insp");
            const row = ctx ? ctx.getObject() : null;
            if (!row || !row.bridgeId) return;
            this.getOwnerComponent().getRouter().navTo("BridgeDetail", {
                bridgeId: encodeURIComponent(row.bridgeId)
            });
        },

        onCreateOrder: function () {
            MessageToast.show("Navigate to a Bridge Detail page to create an inspection order");
        },

        onCreateInspectionOrder: function () {
            MessageToast.show("Navigate to a Bridge Detail page to create an inspection order");
        },

        // ── Pending Reviews (Phase 5.3) ─────────────────────────
        _loadPendingReviews: function () {
            var self = this;
            var h = { Accept: "application/json" };
            fetch(BASE + "/InspectionOrders?$filter=status eq 'PENDING_REVIEW'&$orderby=completedAt desc&$select=ID,orderNumber,bridge_ID,inspector,overallConditionRating,completedAt,notes,bridgeId,bridgeName", {
                headers: h
            }).then(function (r) { return r.json(); })
            .then(function (j) {
                var items = (j.value || []);
                self._model.setProperty("/pendingReviews", items);
                self._model.setProperty("/pendingReviewCount", items.length);
            })
            .catch(function () {
                self._model.setProperty("/pendingReviews", []);
                self._model.setProperty("/pendingReviewCount", 0);
            });
        },

        _reviewInspection: function (oRow, sDecision, sNotes) {
            UserAnalytics.trackAction("review_inspection", "Inspections", { decision: sDecision });
            var self = this;
            fetch(BASE + "/reviewInspection", {
                method: "POST",
                headers: { "Content-Type": "application/json", "Accept": "application/json" },
                body: JSON.stringify({
                    inspectionOrderId: oRow.ID,
                    decision: sDecision,
                    notes: sNotes || ""
                })
            })
            .then(function (r) {
                if (!r.ok) throw new Error("HTTP " + r.status);
                return r.json();
            })
            .then(function () {
                MessageToast.show("Inspection " + sDecision.toLowerCase().replace("_", " ") + ".");
                self._loadPendingReviews();
                self._loadInspectionOrders();
            })
            .catch(function (err) {
                jQuery.sap.log.error("[NHVR] Inspection review failed", err && err.message || String(err));
                MessageBox.error("Review failed. Please try again or contact support.");
            });
        },

        onApproveInspection: function (oEvent) {
            var oRow = this._getRowFromEvent(oEvent, "insp");
            if (!oRow || !oRow.ID) return;
            var self = this;
            MessageBox.confirm("Approve inspection " + (oRow.orderNumber || oRow.ID) + "? This will update the bridge condition rating.", {
                title: "Approve Inspection",
                onClose: function (sAction) {
                    if (sAction !== MessageBox.Action.OK) return;
                    self._reviewInspection(oRow, "APPROVED");
                }
            });
        },

        onRejectInspection: function (oEvent) {
            var oRow = this._getRowFromEvent(oEvent, "insp");
            if (!oRow || !oRow.ID) return;
            var self = this;
            MessageBox.confirm("Reject inspection " + (oRow.orderNumber || oRow.ID) + "? The order will return to IN_PROGRESS.", {
                title: "Reject Inspection",
                onClose: function (sAction) {
                    if (sAction !== MessageBox.Action.OK) return;
                    self._reviewInspection(oRow, "REJECTED");
                }
            });
        },

        onNeedsRevisionInspection: function (oEvent) {
            var oRow = this._getRowFromEvent(oEvent, "insp");
            if (!oRow || !oRow.ID) return;
            var self = this;
            MessageBox.confirm("Request revision for inspection " + (oRow.orderNumber || oRow.ID) + "? The order will return to IN_PROGRESS.", {
                title: "Needs Revision",
                onClose: function (sAction) {
                    if (sAction !== MessageBox.Action.OK) return;
                    self._reviewInspection(oRow, "NEEDS_REVISION");
                }
            });
        },

        // ── ALV Mixin overrides ───────────────────────────────
        onAlvRefresh: function () {
            this._loadInspectionOrders();
        },

        onColumnChooser: function () {
            this.byId("inspOrderColumnChooserDialog").open();
        },

        // ── Workflow Action Handlers ──────────────────────────
        onStartInspection: function (oEvent) {
            var oRow = this._getRowFromEvent(oEvent, "insp");
            if (!oRow || !oRow.ID) return;
            var that = this;
            sap.m.MessageBox.confirm("Start inspection order " + (oRow.orderNumber || oRow.ID) + "?", {
                title: "Start Inspection",
                onClose: function (sAction) {
                    if (sAction !== sap.m.MessageBox.Action.OK) return;
                    fetch("/bridge-management/InspectionOrders(" + oRow.ID + ")/nhvr.startInspection",
                        { method: "POST", headers: { "Content-Type": "application/json" } })
                    .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
                    .then(function () { sap.m.MessageToast.show("Inspection started."); that._loadInspectionOrders(); })
                    .catch(function (err) { jQuery.sap.log.error("[NHVR] Start inspection failed", err && err.message || String(err)); sap.m.MessageBox.error("Failed to start inspection. Please try again or contact support."); });
                }
            });
        },

        onCompleteInspection: function (oEvent) {
            var oRow = this._getRowFromEvent(oEvent, "insp");
            if (!oRow || !oRow.ID) return;
            var that = this;
            sap.m.MessageBox.confirm("Mark inspection order " + (oRow.orderNumber || oRow.ID) + " as COMPLETE?", {
                title: "Complete Inspection",
                onClose: function (sAction) {
                    if (sAction !== sap.m.MessageBox.Action.OK) return;
                    fetch("/bridge-management/InspectionOrders(" + oRow.ID + ")/nhvr.completeInspection",
                        { method: "POST", headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ completionNotes: "" }) })
                    .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
                    .then(function () { sap.m.MessageToast.show("Inspection completed."); that._loadInspectionOrders(); })
                    .catch(function (err) { jQuery.sap.log.error("[NHVR] Complete inspection failed", err && err.message || String(err)); sap.m.MessageBox.error("Failed to complete inspection. Please try again or contact support."); });
                }
            });
        },

        onCancelInspectionOrder: function (oEvent) {
            var oRow = this._getRowFromEvent(oEvent, "insp");
            if (!oRow || !oRow.ID) return;
            var that = this;
            sap.m.MessageBox.confirm("Cancel inspection order " + (oRow.orderNumber || oRow.ID) + "?", {
                title: "Cancel Inspection Order",
                emphasizedAction: "Cancel Order",
                actions: ["Cancel Order", "Keep"],
                onClose: function (sAction) {
                    if (sAction !== "Cancel Order") return;
                    fetch("/bridge-management/InspectionOrders(" + oRow.ID + ")", {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ status: "CANCELLED" })
                    })
                    .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); })
                    .then(function () { sap.m.MessageToast.show("Order cancelled."); that._loadInspectionOrders(); })
                    .catch(function (err) { jQuery.sap.log.error("[NHVR] Cancel inspection failed", err && err.message || String(err)); sap.m.MessageBox.error("Failed to cancel inspection order. Please try again or contact support."); });
                }
            });
        },

        onEditInspectionOrder: function (oEvent) {
            var oRow = this._getRowFromEvent(oEvent, "insp");
            if (!oRow || !oRow.bridgeId) return;
            this.getOwnerComponent().getRouter().navTo("BridgeDetail", {
                bridgeId: encodeURIComponent(oRow.bridgeId)
            });
        },

        _getRowFromEvent: function (oEvent, sModelName) {
            var oSrc = oEvent.getSource();
            var oCtx = oSrc.getBindingContext(sModelName);
            if (oCtx) return oCtx.getObject();
            // Fallback: walk up DOM to find list item with custom data
            var oParent = oSrc.getParent();
            while (oParent) {
                if (oParent.data && oParent.data("rowData")) return oParent.data("rowData");
                oParent = oParent.getParent ? oParent.getParent() : null;
            }
            return null;
        },

        // Clickable Bridge ID → navigate to BridgeDetail (used in both orders + due tables)
        onBridgeIdPress: function (oEvent) {
            oEvent.preventDefault();
            const ctx = oEvent.getSource().getBindingContext("insp");
            const row = ctx ? ctx.getObject() : null;
            if (!row || !row.bridgeId) return;
            this.getOwnerComponent().getRouter().navTo("BridgeDetail", {
                bridgeId: encodeURIComponent(row.bridgeId)
            });
        },

        onExportInspections: function () {
            const activeTab = this.byId("inspTabs") ? this.byId("inspTabs").getSelectedKey() : "orders";
            if (activeTab === "due") {
                const due = this._model.getProperty("/due") || [];
                ExcelExport.export({
                    fileName: "NHVR_InspectionsDue_" + new Date().toISOString().slice(0, 10),
                    columns : [
                        { label: "Bridge ID",      property: "bridgeId",      width: 14 },
                        { label: "Bridge Name",    property: "bridgeName",    width: 30 },
                        { label: "Region",         property: "region",        width: 20 },
                        { label: "Last Inspection",property: "lastInspection",width: 16 },
                        { label: "Next Due",       property: "nextDue",       width: 16 },
                        { label: "Days Overdue",   property: "daysOverdue",   width: 14, type: "Edm.Int32" },
                        { label: "Inspection Type",property: "inspectionType",width: 18 }
                    ],
                    data: due
                });
            } else {
                const orders = this._model.getProperty("/orders") || [];
                ExcelExport.export({
                    fileName: "NHVR_InspectionOrders_" + new Date().toISOString().slice(0, 10),
                    columns : ExcelExport.InspectionColumns,
                    data    : orders
                });
            }
        },

        // ── Column Chooser ────────────────────────────────────
        onOrderColumnChooser: function () {
            this.byId("inspOrderColumnChooserDialog").open();
        },

        onApplyOrderColumns: function () {
            const tbl = this.byId("ordersTable");
            if (!tbl) { this.byId("inspOrderColumnChooserDialog").close(); return; }
            // Column indices: 0=Order,1=Bridge,2=Type,3=Status,4=Planned,5=Inspector,6=Rating,7=Adequacy,8=NextDue
            const show = {
                4 : this.byId("iglColPlanned")   ? this.byId("iglColPlanned").getSelected()   : true,
                5 : this.byId("iglColInspector") ? this.byId("iglColInspector").getSelected() : true,
                6 : this.byId("iglColRating")    ? this.byId("iglColRating").getSelected()    : true,
                7 : this.byId("iglColAdequacy")  ? this.byId("iglColAdequacy").getSelected()  : true,
                8 : this.byId("iglColNextDue")   ? this.byId("iglColNextDue").getSelected()   : true
            };
            const cols = tbl.getColumns();
            Object.keys(show).forEach(idx => { if (cols[idx]) cols[idx].setVisible(show[idx]); });
            this.byId("inspOrderColumnChooserDialog").close();
        },

        onCloseOrderColumnChooser: function () {
            this.byId("inspOrderColumnChooserDialog").close();
        },

        onNavHome: function () {
            this.getOwnerComponent().getRouter().navTo("Home");
        },

        // ── Info Popover ──────────────────────────────────────────
        _showInfoPopover: function (oButton, sTitle, sContent) {
            if (!this._oInfoPopover) {
                this._oInfoPopover = new sap.m.Popover({
                    placement: sap.m.PlacementType.Auto,
                    showHeader: true,
                    contentWidth: "380px"
                });
                this.getView().addDependent(this._oInfoPopover);
            }
            this._oInfoPopover.setTitle(sTitle);
            this._oInfoPopover.destroyContent();
            this._oInfoPopover.addContent(new sap.m.Text({ text: sContent }).addStyleClass("sapUiSmallMargin"));
            this._oInfoPopover.openBy(oButton);
        },

        onInfoPressInspDash: function (oEvent) {
            this._showInfoPopover(
                oEvent.getSource(),
                "Inspection Dashboard — Guide",
                "This dashboard tracks all inspection work orders across the bridge network.\n\n" +
                "KPI Strip:\n" +
                "• Total Orders — all inspection orders in the system\n" +
                "• Planned — orders not yet started\n" +
                "• In Progress — orders currently being executed\n" +
                "• Completed — successfully completed orders\n" +
                "• Overdue — orders whose planned date has passed without completion\n\n" +
                "Inspection Schedule Calculation:\n" +
                "Next inspection due = last principal inspection date + inspection frequency (years). " +
                "Default frequency is 5 years for principal inspections and 1 year for routine inspections.\n\n" +
                "Overdue threshold: due date < today's date."
            );
        }
    });

    return Controller.extend("nhvr.bridgemanagement.controller.InspectionDashboard", oControllerDef);
}); // end sap.ui.define
