// ============================================================
// NHVR Bridge Defect Register Controller
// ============================================================
sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageToast",
    "sap/m/MessageBox",
    "nhvr/bridgemanagement/util/ExcelExport",
    "nhvr/bridgemanagement/model/CapabilityManager",
    "nhvr/bridgemanagement/util/AlvToolbarMixin",
    "nhvr/bridgemanagement/util/UserAnalytics",
    "nhvr/bridgemanagement/util/LookupService",
    "nhvr/bridgemanagement/util/AuthFetch"
], function (Controller, JSONModel, MessageToast, MessageBox, ExcelExport, CapabilityManager, AlvToolbarMixin, UserAnalytics, LookupService, AuthFetch) {
    "use strict";

    const BASE = "/bridge-management";

    // Escape single quotes for OData v4 string literals ( ' → '' )
    const _odataStr = (v) => String(v == null ? "" : v).replace(/'/g, "''");

    return Controller.extend("nhvr.bridgemanagement.controller.Defects", Object.assign({

        onInit: function () {
            UserAnalytics.trackView("Defects");
            this._model = new JSONModel({ defects: [] });
            this.getView().setModel(this._model, "defects");

            const router = this.getOwnerComponent().getRouter();
            router.getRoute("DefectRegister").attachPatternMatched(this._onRouteMatched, this);

            this._loadDefectViews();
            this._rebuildDefectViewsMenu();

            LookupService.load().then(function () {
                LookupService.populateSelect(this.byId("statusFilter"),   "DEFECT_STATUS",   "All Statuses");
                LookupService.populateSelect(this.byId("severityFilter"), "DEFECT_SEVERITY", "All Severities");
                LookupService.populateSelect(this.byId("categoryFilter"), "DEFECT_CATEGORY", "All Categories");
                LookupService.populateSelect(this.byId("priorityFilter"), "DEFECT_PRIORITY", "All Priorities");
            }.bind(this));
        },

        _onRouteMatched: function () {
            var self = this;
            CapabilityManager.load().then(function () {
                if (!CapabilityManager.guardRoute("DEFECTS", self.getOwnerComponent().getRouter())) return;
                // v4.7.13: consume a pending NamedView from the Home picker before load.
                // onApplyDefectView() already calls _loadDefects(), so skip the trailing
                // _loadDefects() when a pending view fires.
                sap.ui.require(["nhvr/bridgemanagement/util/NamedViews"], function (NamedViews) {
                    var pending = NamedViews.consumePending(NamedViews.MODULES.DEFECTS);
                    if (pending && pending.filters && pending.filters.criteria) {
                        self.onApplyDefectView({ name: pending.name, criteria: pending.filters.criteria });
                        return;
                    }
                    self._loadDefects();
                });
            });
        },

        _loadDefects: function () {
            const filters = this._buildFilters();
            const q = filters.length ? `&$filter=${encodeURIComponent(filters.join(" and "))}` : "";
            AuthFetch.getJson(`${BASE}/BridgeDefects?$orderby=detectedDate desc${q}`)
                .then(j => {
                    const defects = j.value || [];
                    this._model.setProperty("/defects", defects);
                    this._updateKpis(defects);
                    if (typeof this._alvUpdateCount === "function") {
                        this._alvUpdateCount(defects.length, defects.length);
                    }
                })
                .catch(err => {
                    console.warn("[Defects] BridgeDefects load failed:", err.message);
                    this._model.setProperty("/defects", []);
                });
        },

        _buildFilters: function () {
            const parts = [];
            const statusVal   = this.byId("statusFilter")   ? this.byId("statusFilter").getSelectedKey()   : "";
            const severityVal = this.byId("severityFilter") ? this.byId("severityFilter").getSelectedKey() : "";
            const categoryVal = this.byId("categoryFilter") ? this.byId("categoryFilter").getSelectedKey() : "";
            const priorityVal = this.byId("priorityFilter") ? this.byId("priorityFilter").getSelectedKey() : "";
            if (statusVal)   parts.push(`status eq '${_odataStr(statusVal)}'`);
            if (severityVal) parts.push(`severity eq '${_odataStr(severityVal)}'`);
            if (categoryVal) parts.push(`defectCategory eq '${_odataStr(categoryVal)}'`);
            if (priorityVal) parts.push(`priority eq '${_odataStr(priorityVal)}'`);
            return parts;
        },

        _updateKpis: function (defects) {
            const open     = defects.filter(d => d.status !== "CLOSED").length;
            const critical = defects.filter(d => d.severity === "CRITICAL").length;
            const high     = defects.filter(d => d.severity === "HIGH").length;
            const totalCost = defects.reduce((sum, d) => sum + (parseFloat(d.repairEstimateAUD) || 0), 0);

            this._setKpi("kpiTotal",    defects.length, "None");
            this._setKpi("kpiOpen",     open,     open > 0     ? "Error"   : "Success");
            this._setKpi("kpiCritical", critical, critical > 0 ? "Error"   : "None");
            this._setKpi("kpiHigh",     high,     high > 0     ? "Warning" : "None");
            this._setKpi("kpiCost",     `$${totalCost.toLocaleString("en-AU")}`, "None");
        },

        _setKpi: function (id, text, state) {
            const ctrl = this.byId(id);
            if (ctrl) { ctrl.setText(String(text)); ctrl.setState(state || "None"); }
        },

        onFilter: function () {
            this._loadDefects();
        },

        onRefresh: function () {
            this._loadDefects();
        },

        onExportCsv: function () {
            const defects = this._model.getProperty("/defects") || [];
            ExcelExport.export({
                fileName: "NHVR_Defects_" + new Date().toISOString().slice(0, 10),
                columns : ExcelExport.DefectColumns,
                data    : defects
            });
        },

        // Clickable Defect Number — opens the defect (reuses row-press handler)
        onDefectNumberPress: function (oEvent) {
            // Link press does not carry a binding context from the row automatically;
            // walk up to the parent ColumnListItem to get it.
            var src = oEvent.getSource();
            var ctx = src.getBindingContext("defects");
            if (!ctx) return;
            var d = ctx.getObject();
            if (d && d.ID) { this._selectedDefect = d; }
            var btnWo = this.byId("btnCreateWo");
            if (btnWo) btnWo.setEnabled(!!(d && d.ID && d.status !== "CLOSED" && d.status !== "WORK_ORDER_RAISED"));
            var btnAi = this.byId("btnAiClassify");
            if (btnAi) btnAi.setEnabled(!!(d && d.ID));
            if (d && d.bridgeId) {
                this.getOwnerComponent().getRouter().navTo("BridgeDetail", {
                    bridgeId: encodeURIComponent(d.bridgeId)
                });
            }
        },

        // ── Saved filter views ────────────────────────────────────────────────
        _defectViewsKey: "nhvr_defect_filter_views",
        _defectViews: [],

        _loadDefectViews: function () {
            try {
                var raw = localStorage.getItem(this._defectViewsKey);
                var parsed = raw ? JSON.parse(raw) : [];
                this._defectViews = Array.isArray(parsed) ? parsed : [];
            } catch (_) { this._defectViews = []; }
        },

        _saveDefectViews: function () {
            try { localStorage.setItem(this._defectViewsKey, JSON.stringify(this._defectViews)); } catch (_) { /* ignore */ }
        },

        _rebuildDefectViewsMenu: function () {
            var oMenu = this.byId("defectViewsMenu");
            if (!oMenu) return;
            oMenu.destroyItems();
            if (this._defectViews.length === 0) {
                oMenu.addItem(new sap.m.MenuItem({ text: "(no saved views)", enabled: false }));
                return;
            }
            var self = this;
            this._defectViews.forEach(function (view) {
                var oItem = new sap.m.MenuItem({ text: view.name, icon: "sap-icon://filter" });
                oItem.attachPress(function () { self.onApplyDefectView(view); });
                oMenu.addItem(oItem);
            });
            var oClear = new sap.m.MenuItem({ text: "Delete all saved views", icon: "sap-icon://delete", startsSection: true });
            oClear.attachPress(function () {
                MessageBox.confirm("Delete all " + self._defectViews.length + " saved view(s)?", {
                    title: "Delete saved views",
                    onClose: function (action) {
                        if (action !== MessageBox.Action.OK) return;
                        self._defectViews = [];
                        self._saveDefectViews();
                        self._rebuildDefectViewsMenu();
                        MessageToast.show("All saved views deleted");
                    }
                });
            });
            oMenu.addItem(oClear);
        },

        onSaveDefectView: function () {
            var current = {
                status:   this.byId("statusFilter")   ? this.byId("statusFilter").getSelectedKey()   : "",
                severity: this.byId("severityFilter") ? this.byId("severityFilter").getSelectedKey() : "",
                category: this.byId("categoryFilter") ? this.byId("categoryFilter").getSelectedKey() : "",
                priority: this.byId("priorityFilter") ? this.byId("priorityFilter").getSelectedKey() : ""
            };
            if (!current.status && !current.severity && !current.category && !current.priority) {
                MessageToast.show("Nothing to save — set at least one filter first.");
                return;
            }
            var self = this;
            MessageBox.prompt("Name this view:", {
                title: "Save Defect View",
                onClose: function (sAction, sValue) {
                    var value = (sValue || "").trim();
                    if (sAction !== MessageBox.Action.OK || !value) return;
                    self._defectViews = self._defectViews.filter(function (v) { return v.name !== value; });
                    self._defectViews.push({ name: value, criteria: current });
                    self._saveDefectViews();
                    self._rebuildDefectViewsMenu();
                    // v4.7.9: dual-write to cross-module NamedViews store
                    sap.ui.require(["nhvr/bridgemanagement/util/NamedViews"], function (NamedViews) {
                        try { NamedViews.save(NamedViews.MODULES.DEFECTS, value, { criteria: current }); } catch (_) { /* noop */ }
                    });
                    MessageToast.show("Saved view: " + value);
                }
            });
        },

        onApplyDefectView: function (view) {
            if (!view || !view.criteria) return;
            var c = view.criteria;
            if (this.byId("statusFilter"))   this.byId("statusFilter").setSelectedKey(c.status || "");
            if (this.byId("severityFilter")) this.byId("severityFilter").setSelectedKey(c.severity || "");
            if (this.byId("categoryFilter")) this.byId("categoryFilter").setSelectedKey(c.category || "");
            if (this.byId("priorityFilter")) this.byId("priorityFilter").setSelectedKey(c.priority || "");
            this._loadDefects();
            MessageToast.show("Applied view: " + view.name);
        },

        // Clickable Bridge ID in defects table → navigate to BridgeDetail
        onBridgeIdPress: function (oEvent) {
            oEvent.preventDefault();
            const ctx = oEvent.getSource().getBindingContext("defects");
            const d   = ctx ? ctx.getObject() : null;
            if (!d || !d.bridgeId) return;
            this.getOwnerComponent().getRouter().navTo("BridgeDetail", {
                bridgeId: encodeURIComponent(d.bridgeId)
            });
        },

        onDefectPress: function (e) {
            const ctx = e.getSource().getBindingContext("defects");
            const d = ctx ? ctx.getObject() : null;
            if (d && d.ID) { this._selectedDefect = d; }
            const btnWo = this.byId("btnCreateWo");
            if (btnWo) btnWo.setEnabled(!!(d && d.ID && d.status !== "CLOSED" && d.status !== "WORK_ORDER_RAISED"));
            const btnAi = this.byId("btnAiClassify");
            if (btnAi) btnAi.setEnabled(!!(d && d.ID));
            if (!d || !d.bridgeId) return;
            this.getOwnerComponent().getRouter().navTo("BridgeDetail", {
                bridgeId: encodeURIComponent(d.bridgeId)
            });
        },

        // ── Column Chooser ────────────────────────────────────
        onDefectColumnChooser: function () {
            this.byId("defectColumnChooserDialog").open();
        },

        onApplyDefectColumns: function () {
            const tbl = this.byId("defectsTable");
            if (!tbl) { this.byId("defectColumnChooserDialog").close(); return; }
            // Column indices: 0=Number,1=Bridge,2=Category,3=Severity,4=Element,5=Priority,6=Status,7=Detected,8=Cost
            const show = {
                2 : this.byId("dglColCategory") ? this.byId("dglColCategory").getSelected() : true,
                4 : this.byId("dglColElement")  ? this.byId("dglColElement").getSelected()  : true,
                5 : this.byId("dglColPriority") ? this.byId("dglColPriority").getSelected() : true,
                7 : this.byId("dglColDetected") ? this.byId("dglColDetected").getSelected() : true,
                8 : this.byId("dglColCost")     ? this.byId("dglColCost").getSelected()     : true
            };
            const cols = tbl.getColumns();
            Object.keys(show).forEach(idx => { if (cols[idx]) cols[idx].setVisible(show[idx]); });
            this.byId("defectColumnChooserDialog").close();
        },

        onCloseDefectColumnChooser: function () {
            this.byId("defectColumnChooserDialog").close();
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

        onInfoPressDefectRegister: function (oEvent) {
            this._showInfoPopover(
                oEvent.getSource(),
                "Defect Register — Guide",
                "This register lists structural defects across all bridges, recorded per AustRoads BIMM.\n\n" +
                "Severity Levels:\n" +
                "• CRITICAL — immediate structural safety risk; may require bridge closure\n" +
                "• HIGH — significant deterioration; repair target within 3 months\n" +
                "• MEDIUM — moderate defect; repair target within 12 months\n" +
                "• LOW — minor defect; monitor and repair opportunistically\n\n" +
                "Defect Categories: STRUCTURAL, SURFACE, DRAINAGE, SAFETY, SCOUR, OTHER\n\n" +
                "Statuses:\n" +
                "• OPEN — identified, not yet resolved\n" +
                "• IN_PROGRESS — repair works underway\n" +
                "• CLOSED — resolved and verified\n\n" +
                "Est. Repair Cost — indicative cost estimate entered at time of defect recording."
            );
        },

        // ── P14: AI Defect Classification ─────────────────────────
        onAiClassifyDefect: function () {
            var defect = this._selectedDefect;
            if (!defect || !defect.ID) {
                sap.m.MessageToast.show("Select a defect first.");
                return;
            }
            var that = this;
            var btn  = this.byId("btnAiClassify");
            if (btn) btn.setBusy(true);

            fetch(BASE + "/classifyDefect", {
                method : "POST",
                headers: { "Content-Type": "application/json", Accept: "application/json" },
                body   : JSON.stringify({ defectId: defect.ID, photoUrl: "", notes: "" })
            })
            .then(function (r) {
                if (!r.ok) return r.json().then(function (e) { throw new Error(e.error?.message || "HTTP " + r.status); });
                return r.json();
            })
            .then(function (j) {
                if (btn) btn.setBusy(false);
                var result = j.value || j;
                var sevStateMap = { CRITICAL: "Error", HIGH: "Warning", MEDIUM: "Warning", LOW: "Success" };

                var catEl   = that.byId("aiResultCategory");
                var sevEl   = that.byId("aiResultSeverity");
                var confEl  = that.byId("aiResultConfidence");
                var notesEl = that.byId("aiResultNotes");

                if (catEl)  { catEl.setText(result.aiCategory || "—");  catEl.setState("Information"); }
                if (sevEl)  { sevEl.setText(result.aiSeverity || "—");  sevEl.setState(sevStateMap[result.aiSeverity] || "None"); }
                if (confEl) { confEl.setText((result.aiConfidence || "—") + "%"); }
                if (notesEl){ notesEl.setText(result.aiNotes || "No notes."); }

                var dlg = that.byId("aiClassifyDialog");
                if (dlg) dlg.open();
            })
            .catch(function (err) {
                if (btn) btn.setBusy(false);
                sap.m.MessageBox.error("AI classification failed: " + err.message);
            });
        },

        onCloseAiDialog: function () {
            var dlg = this.byId("aiClassifyDialog");
            if (dlg) dlg.close();
        },

        // ── ALV Toolbar overrides ─────────────────────────────────
        onAlvRefresh: function () {
            this._loadDefects();
        },

        onAlvExportExcel: function () {
            this.onExportCsv();
        },

        onAlvExportCsv: function () {
            const defects = this._model.getProperty("/defects") || [];
            ExcelExport.export({
                fileName: "NHVR_Defects_" + new Date().toISOString().slice(0, 10),
                columns : ExcelExport.DefectColumns,
                data    : defects,
                format  : "csv"
            });
        },

        onAlvExportPdf: function () {
            sap.m.MessageToast.show("Print / PDF export — use browser print (Ctrl+P).");
        },

        onAlvSort: function () {
            sap.m.MessageToast.show("Sort — use column headers to sort the table.");
        },

        // ── Raise Defect (stub — opens Create Work Order as proxy) ─
        onRaiseDefect: function () {
            sap.m.MessageBox.information(
                "To raise a defect, open the Bridge Detail for the relevant bridge and use the Defects tab.",
                { title: "Raise Defect" }
            );
        },

        // ── Close Defect ──────────────────────────────────────────
        onCloseDefect: function (oEvent) {
            var oSrc = oEvent.getSource();
            var oCtx = oSrc.getBindingContext("defects");
            var oRow = oCtx ? oCtx.getObject() : null;
            if (!oRow || !oRow.ID) { sap.m.MessageToast.show("Cannot close: no defect selected."); return; }
            var that = this;
            sap.m.MessageBox.confirm(
                "Close defect on " + (oRow.bridge_bridgeId || oRow.bridgeId || "bridge") + "?\n\n" +
                "Category: " + (oRow.defectCategory || "—") + "\n" +
                "Severity: " + (oRow.severity || "—"),
                {
                    title: "Close Defect",
                    emphasizedAction: sap.m.MessageBox.Action.OK,
                    actions: [sap.m.MessageBox.Action.OK, sap.m.MessageBox.Action.CANCEL],
                    onClose: function (sAction) {
                        if (sAction !== sap.m.MessageBox.Action.OK) return;
                        fetch("/bridge-management/BridgeDefects(" + oRow.ID + ")/nhvr.closeDefect",
                            {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ closureNotes: "Closed from Defect Register" })
                            })
                        .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
                        .then(function () { sap.m.MessageToast.show("Defect closed."); that._loadDefects(); })
                        .catch(function (err) { sap.m.MessageBox.error("Close failed: " + err.message); });
                    }
                }
            );
        },

        onInfoPressDefects: function () {
            sap.m.MessageBox.information(
                "Defect Register — Field Guide\n\n" +
                "SEVERITY:\n  CRITICAL = Structural failure risk, close bridge immediately\n" +
                "  HIGH = Significant deterioration, urgent repair needed\n" +
                "  MEDIUM = Moderate deterioration, schedule repair\n" +
                "  LOW = Minor defect, monitor\n\n" +
                "STATUS WORKFLOW:\n  OPEN → UNDER_REPAIR → REPAIRED → CLOSED\n  (or OPEN → MONITORING for watch items)\n\n" +
                "CATEGORIES:\n  AustRoads BIMM defect classification codes apply.\n" +
                "  Defects linked to AS 5100 inspection records.",
                { title: "Defect Register Guide" }
            );
        }

    }, AlvToolbarMixin));
});
