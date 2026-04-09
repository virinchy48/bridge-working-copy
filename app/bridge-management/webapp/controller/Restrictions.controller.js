// ============================================================
// NHVR Restrictions Controller — Active & Scheduled Restrictions
// ============================================================
sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageToast",
    "sap/m/MessageBox",
    "sap/ui/core/Item",
    "nhvr/bridgemanagement/util/ExcelExport",
    "nhvr/bridgemanagement/config/RestrictionAttributes",
    "nhvr/bridgemanagement/util/CsvExport",
    "nhvr/bridgemanagement/util/AlvToolbarMixin",
    "nhvr/bridgemanagement/model/RoleManager",
    "nhvr/bridgemanagement/util/AuthFetch",
    "nhvr/bridgemanagement/util/UserAnalytics"
], function (Controller, JSONModel, MessageToast, MessageBox, Item, ExcelExport, RestrictionAttrs, CsvExport, AlvToolbarMixin, RoleManager, AuthFetch, UserAnalytics) {
    "use strict";

    const BASE = "/bridge-management";

    return Controller.extend("nhvr.bridgemanagement.controller.Restrictions", Object.assign({

        _allRestrictions  : [],
        _editRestrictionId: null,   // null = create mode, non-null = edit mode
        _selectedBridgeID : null,   // UUID of selected bridge (create mode)

        _sortField: null,
        _sortDesc: false,

        onInit: function () {
            UserAnalytics.trackView("Restrictions");
            this._model = new JSONModel({ items: [], vehicleClasses: [] });
            this.getView().setModel(this._model, "restrictions");
            this._loadRestrictions();
            this._loadRestrictionTypes();
            this._loadVehicleClasses();
            this._loadVariants();

            const router = this.getOwnerComponent().getRouter();
            router.getRoute("RestrictionsList").attachPatternMatched(this._onRouteMatched, this);

            // RBAC: set ui model for Add/Edit Restriction visibility
            var oUiModel = this.getView().getModel("ui");
            if (!oUiModel) {
                oUiModel = new JSONModel({ canAddRestriction: false, canEditRestriction: false });
                this.getView().setModel(oUiModel, "ui");
            }
            setTimeout(function () {
                var canEdit = false;
                try {
                    canEdit = RoleManager.isVisible("addRestriction") || RoleManager.isEditable("editBridge");
                } catch (e) { canEdit = false; }
                oUiModel.setProperty("/canAddRestriction", canEdit);
                oUiModel.setProperty("/canEditRestriction", canEdit);
            }.bind(this), 300);
        },

        onAfterRendering: function () {
            this._buildRestrictionColumns();
        },

        // ── Dynamic column builder (registry-driven, sap.ui.table) ──
        _buildRestrictionColumns: function () {
            if (this._restColumnsBuilt) { return; }
            var oTable = this.byId("restrictionTable");
            if (!oTable) { return; }

            // Determine visible column keys from localStorage or registry default
            var savedJson = localStorage.getItem("nhvr_restriction_columns");
            var savedKeys;
            try {
                savedKeys = savedJson ? JSON.parse(savedJson) : null;
            } catch (e) {
                savedKeys = null;
            }
            if (!savedKeys || !Array.isArray(savedKeys)) {
                savedKeys = RestrictionAttrs.getDefaultVisibleColumns().map(function (a) { return a.key; });
            }

            // Destroy existing columns and rebuild from registry
            oTable.destroyColumns();

            var oTemplate = new sap.m.HBox();
            var aCells = [];

            RestrictionAttrs.RESTRICTION_ATTRIBUTES.forEach(function (attr) {
                var bVisible = savedKeys.indexOf(attr.key) !== -1;
                var oCol = new sap.ui.table.Column({
                    visible: bVisible,
                    width: this._getRestColWidth(attr),
                    label: new sap.m.Label({ text: attr.shortLabel || attr.label }),
                    sortProperty: attr.key,
                    filterProperty: attr.key,
                    template: this._buildRestCell(attr)
                });
                oTable.addColumn(oCol);
            }.bind(this));

            // Actions column (always visible, always last)
            oTable.addColumn(new sap.ui.table.Column({
                visible: true,
                width: "130px",
                hAlign: "Center",
                label: new sap.m.Label({ text: "Actions" }),
                template: new sap.m.HBox({
                    items: [
                        new sap.m.Button({
                            icon: "sap-icon://edit",
                            tooltip: "Edit Restriction",
                            press: this.onEditRestriction.bind(this),
                            type: "Transparent"
                        }),
                        new sap.m.Button({
                            icon: "sap-icon://delete",
                            tooltip: "Delete Restriction",
                            press: this.onDeleteRestriction.bind(this),
                            type: "Transparent"
                        })
                    ]
                })
            }));

            oTable.bindRows("restrictions>/items");

            this._restColumnsBuilt = true;
        },

        _getRestColWidth: function (attr) {
            switch (attr.key) {
                case "nhvrRef":        return "180px";
                case "bridge_bridgeId":
                case "bridge_name":    return "150px";
                case "restrictionType": return "130px";
                case "value":          return "100px";
                case "unit":           return "70px";
                case "status":         return "100px";
                case "validFromDate":
                case "validToDate":    return "110px";
                case "gazetteRef":
                case "notes":          return "160px";
                default:
                    if (attr.type === "boolean") { return "90px"; }
                    return "120px";
            }
        },

        _buildRestCell: function (attr) {
            switch (attr.key) {
                case "status":
                    return new sap.m.ObjectStatus({
                        text: "{restrictions>" + attr.key + "}",
                        state: "{= ${restrictions>status} === 'ACTIVE' ? 'Success' : ${restrictions>status} === 'EXPIRED' ? 'Error' : ${restrictions>status} === 'SEASONAL' ? 'Warning' : 'None'}"
                    });
                case "isTemporary":
                    return new sap.m.ObjectStatus({
                        text: "{= ${restrictions>isTemporary} ? 'Temporary' : 'Permanent'}",
                        state: "{= ${restrictions>isTemporary} ? 'Warning' : 'None'}"
                    });
                case "permitRequired":
                    return new sap.m.ObjectStatus({
                        text: "{= ${restrictions>permitRequired} ? 'Permit Req.' : '\u2014'}",
                        state: "{= ${restrictions>permitRequired} ? 'Warning' : 'None'}"
                    });
                case "isDisabled":
                    return new sap.m.ObjectStatus({
                        text: "{= ${restrictions>isDisabled} ? 'Disabled' : ''}",
                        state: "{= ${restrictions>isDisabled} ? 'Error' : 'None'}"
                    });
                case "value":
                    return new sap.m.ObjectNumber({
                        number: "{restrictions>value}",
                        unit: "{restrictions>unit}"
                    });
                case "unit":
                    // Value column already shows unit via ObjectNumber — keep cell empty
                    return new sap.m.Text({ text: "" });
                case "validToDate":
                    return new sap.m.Text({ text: "{restrictions>validToDate}" });
                default:
                    if (attr.type === "boolean") {
                        return new sap.m.ObjectStatus({
                            text: "{= ${restrictions>" + attr.key + "} ? 'Yes' : 'No'}",
                            state: "None"
                        });
                    }
                    return new sap.m.Text({ text: "{restrictions>" + attr.key + "}" });
            }
        },

        // ── Quick-filter presets ───────────────────────────────
        _quickFilter: null,

        onQuickFilter: function (oEvent) {
            var oBtn = oEvent.getSource();
            var oCustomData = oBtn.getCustomData();
            var sKey = "";
            if (oCustomData && oCustomData.length) {
                for (var i = 0; i < oCustomData.length; i++) {
                    if (oCustomData[i].getKey() === "filterKey") {
                        sKey = oCustomData[i].getValue();
                        break;
                    }
                }
            }
            var oPreset = RestrictionAttrs.QUICK_FILTERS.filter(function (f) { return f.key === sKey; })[0];
            this._quickFilter = oPreset ? oPreset.filter : null;
            this._applyFiltersAndSort();
        },

        onClearQuickFilter: function () {
            this._quickFilter = null;
            this._applyFiltersAndSort();
        },

        _applyFiltersAndSort: function () {
            // Apply base filters first
            this._applyFilters();

            // Then apply quick filter on top of already-filtered set
            if (!this._quickFilter) { return; }

            var qf = this._quickFilter;
            var data = this._model.getProperty("/items") || [];

            if (qf.status) {
                data = data.filter(function (r) { return qf.status.indexOf(r.status) !== -1; });
            }
            if (qf.isTemporary === true) {
                data = data.filter(function (r) { return !!r.isTemporary; });
            }
            if (qf.permitRequired === true) {
                data = data.filter(function (r) { return !!r.permitRequired; });
            }
            if (qf.isDisabled === true) {
                data = data.filter(function (r) { return !!r.isDisabled; });
            }
            if (qf.gazetteRef_empty === true) {
                data = data.filter(function (r) { return !r.gazetteRef || r.gazetteRef === ""; });
            }
            if (typeof qf.validToDate_lte === "number") {
                var now = new Date();
                var cutoff = new Date(now.getTime() + qf.validToDate_lte * 24 * 60 * 60 * 1000);
                data = data.filter(function (r) {
                    if (!r.validToDate || r.validToDate === "Ongoing" || r.validToDate === "\u2014") { return false; }
                    var d = new Date(r.validToDate);
                    return !isNaN(d.getTime()) && d >= now && d <= cutoff;
                });
            }

            this._model.setProperty("/items", data);
            var tableTitle = this.byId("tableTitle");
            if (tableTitle) { tableTitle.setText("Restrictions (" + data.length + ") — Filtered"); }
            MessageToast.show(data.length + " restriction" + (data.length !== 1 ? "s" : "") + " matched");
        },

        // ── CSV Export (new) ───────────────────────────────────
        onExportRestrictionsCsv: function () {
            var items = this._model.getProperty("/items") || [];
            if (!items.length) { MessageToast.show("No data to export"); return; }
            CsvExport.exportRestrictions(items);
            MessageToast.show("CSV export started");
        },

        _onRouteMatched: function (e) {
            const query = (e.getParameter("arguments") || {})["?query"] || {};
            if (query.status && query.status !== "ALL") {
                const fs = this.byId("filterStatus");
                if (fs) fs.setSelectedKey(query.status);
            }
            if (query.permitRequired === "true") {
                const fp = this.byId("filterPermit");
                if (fp) fp.setSelectedKey("YES");
            }

            // v4.7.13: consume a pending NamedView handed off by the Home picker.
            // Overrides query params above if present — explicit user choice wins.
            this._applyPendingNamedView();

            // ── Map → Restrictions round-trip (v4.7.6) ─────────────
            // MapView writes a dedicated nhvr_map_restriction_selection key
            // (parallel to nhvr_map_selection used by Bridges) so both lists
            // can consume a map polygon independently. 5-min TTL, read+delete.
            try {
                const mapSel = localStorage.getItem("nhvr_map_restriction_selection");
                if (mapSel) {
                    const sel = JSON.parse(mapSel);
                    if (sel.bridgeIds && sel.bridgeIds.length > 0 && (Date.now() - sel.setAt) < 300000) {
                        this._mapFilterIds = new Set(sel.bridgeIds);
                        localStorage.removeItem("nhvr_map_restriction_selection");
                        const s = this.byId("mapFilterBanner");
                        if (s) {
                            s.setText("Map selection active: filtering restrictions for " + sel.bridgeIds.length + " bridge" + (sel.bridgeIds.length !== 1 ? "s" : "") + " from map polygon. Close to show all.");
                            s.setVisible(true);
                        }
                    } else {
                        this._mapFilterIds = null;
                    }
                }
            } catch (_) { /* ignore localStorage errors */ }

            // Restore saved filter state if no query params drove the navigation
            var hasQueryParams = (query.status && query.status !== "ALL") || query.permitRequired;
            if (!hasQueryParams && !this._mapFilterIds) {
                this._restoreFilterState();
            }

            this._loadRestrictions();
        },

        onClearMapFilter: function () {
            this._mapFilterIds = null;
            const s = this.byId("mapFilterBanner");
            if (s) s.setVisible(false);
            try { localStorage.removeItem("nhvr_map_restriction_selection"); } catch (_) { /* ignore */ }
            this._applyFilters();
        },

        // ── VehicleClasses loader ─────────────────────────────
        _loadVehicleClasses: function () {
            fetch(`${BASE}/VehicleClasses?$select=ID,code,name&$orderby=name`, {
                headers: { Accept: "application/json" }
            })
            .then(r => r.json())
            .then(j => {
                this._model.setProperty("/vehicleClasses", j.value || []);
            })
            .catch(() => {});
        },

        // ── Bridge autocomplete (suggestion input) ────────────
        onBridgeSuggest: function (oEvent) {
            var sQuery = (oEvent.getParameter("value") || "").trim();
            var oInput = oEvent.getSource();
            oInput.destroySuggestionItems();
            if (!sQuery || sQuery.length < 2) return;
            var q = encodeURIComponent(sQuery.toLowerCase());
            fetch(`${BASE}/Bridges?$select=ID,bridgeId,name&$filter=contains(tolower(name),'${q}') or contains(tolower(bridgeId),'${q}')&$top=20`, {
                headers: { Accept: "application/json" }
            })
            .then(r => r.json())
            .then(j => {
                (j.value || []).forEach(function (b) {
                    oInput.addSuggestionItem(new sap.ui.core.Item({
                        key  : b.ID,
                        text : b.bridgeId + " — " + b.name
                    }));
                });
            })
            .catch(() => {});
        },

        onBridgeSuggestionSelected: function (oEvent) {
            var oItem = oEvent.getParameter("selectedItem");
            if (oItem) {
                this._selectedBridgeID = oItem.getKey();
            }
        },

        _loadRestrictionTypes: function () {
            fetch(`${BASE}/RestrictionTypeConfigs?$filter=active eq true&$orderby=sortOrder&$select=code,displayLabel,defaultUnit`, {
                headers: { Accept: "application/json" }
            })
            .then(r => r.json())
            .then(j => {
                this._restrictionTypes = j.value || [];
                // Populate the type select in the dialog
                const typeSelect = this.byId("glEditRestType");
                if (typeSelect) {
                    typeSelect.destroyItems();
                    this._restrictionTypes.forEach(rt => {
                        typeSelect.addItem(new Item({ key: rt.code, text: rt.displayLabel }));
                    });
                }
            })
            .catch(() => {}); // graceful fallback — static items remain
        },

        _loadRestrictions: function () {
            const tbl = this.byId("restrictionsTable") || this.byId("restrictionTable");
            if (tbl) tbl.setBusy(true);
            const h = { Accept: "application/json" };
            fetch(`${BASE}/Restrictions?$select=*&$orderby=status,restrictionType`, { headers: h })
                .then(r => r.json())
                .then(j => {
                    const raw = j.value || [];
                    this._allRestrictions = raw.map(r => ({
                        // ── Registry keys (used by _buildRestCell column template) ──
                        ID                  : r.ID,
                        nhvrRef             : r.nhvrRef || "",
                        bridge_bridgeId     : r.bridge_bridgeId || r.bridgeId || "—",
                        bridge_name         : r.bridge_name || r.bridgeName || r.bridgeId || "—",
                        bridge_state        : r.bridge_state || r.bridgeState || "",
                        restrictionType     : r.restrictionType || "—",
                        value               : r.value,
                        unit                : r.unit || "",
                        vehicleClass_name   : r.vehicleClass_name || r.vehicleClassName || "All",
                        status              : r.status || "—",
                        isTemporary         : !!r.isTemporary,
                        permitRequired      : !!r.permitRequired,
                        validFromDate       : r.validFromDate || "",
                        validToDate         : r.validToDate || "",
                        gazetteRef          : r.gazetteRef || "",
                        approvedBy          : r.approvedBy || r.temporaryApprovedBy || "",
                        notes               : r.notes || "",
                        isDisabled          : !!r.isDisabled,
                        // ── FK UUIDs (needed for edit POST/PATCH) ──
                        vehicleClass_ID     : r.vehicleClass_ID || null,
                        bridge_ID           : r.bridge_ID       || null,
                        // ── Legacy keys kept for search, dialogs, navigation ──
                        bridgeId            : r.bridge_bridgeId || r.bridgeId || "—",
                        bridgeName          : r.bridge_name || r.bridgeName || r.bridgeId || "—",
                        routeCode           : r.routeCode || "—",
                        vehicleClass        : r.vehicleClass_name || r.vehicleClassName || "All",
                        validFrom           : r.validFromDate || "—",
                        validTo             : r.validToDate || "Ongoing",
                        directionApplied    : r.directionApplied || "BOTH",
                        temporaryReason     : r.temporaryReason || "",
                        temporaryApprovedBy : r.temporaryApprovedBy || "",
                        enforcementAuthority: r.enforcementAuthority || "",
                        gazetteStatus       : (r.gazetteValidation && r.gazetteValidation.validationStatus) || ""
                    }));
                    this._applyFilters();
                    if (tbl) tbl.setBusy(false);
                    this._updateKpis(this._allRestrictions);
                })
                .catch(e => { console.error("Restrictions load failed", e); if (tbl) tbl.setBusy(false); });
        },

        _updateKpis: function (restrictions) {
            const total     = restrictions.length;
            const active    = restrictions.filter(r => r.status === "ACTIVE").length;
            const scheduled = restrictions.filter(r => r.status === "SCHEDULED").length;
            const permit    = restrictions.filter(r => r.permitRequired).length;
            const shown     = (this._model.getProperty("/items") || []).length;

            this._setStatus("kpiTotal",     `${total} Total`);
            this._setStatus("kpiActive",    `${active} Active`);
            this._setStatus("kpiScheduled", `${scheduled} Scheduled`);
            this._setStatus("kpiPermit",    `${permit} Permit Req`);

            const tableTitle = this.byId("tableTitle");
            if (tableTitle) tableTitle.setText(`Restrictions (${shown})`);

            // ALV record count
            this._alvUpdateCount(total, shown);
        },

        // ── ALV Toolbar overrides ──────────────────────────────
        onAlvExportExcel: function () { this.onExportRestrictions(); },
        onAlvExportCsv:   function () { this.onExportRestrictionsCsv(); },
        onAlvRefresh:     function () { this.onRefresh && this.onRefresh() || this._loadRestrictions(); },
        // onAlvSort: inherited from AlvToolbarMixin — opens byId("sortDialog")
        onSortConfirm: function (oEvent) {
            var sortItem = oEvent.getParameter("sortItem");
            if (!sortItem) return;
            this._sortField = sortItem.getKey();
            this._sortDesc  = oEvent.getParameter("sortDescending");
            this._applyFiltersAndSort();
            MessageToast.show("Sorted by " + sortItem.getText() + (this._sortDesc ? " (desc)" : " (asc)"));
        },

        _setStatus: function (id, text) {
            const ctrl = this.byId(id);
            if (ctrl) ctrl.setText(text);
        },

        _applyFilters: function () { this._applyFiltersAndSort(); },

        _applyFiltersAndSort: function () {
            const search = (this.byId("searchField") ? this.byId("searchField").getValue() : "").toLowerCase();
            const status = this.byId("filterStatus") ? this.byId("filterStatus").getSelectedKey() : "ALL";
            const type   = this.byId("filterType")   ? this.byId("filterType").getSelectedKey()   : "ALL";
            const permit = this.byId("filterPermit")  ? this.byId("filterPermit").getSelectedKey()  : "ALL";

            let data = this._allRestrictions;

            // Map polygon filter (v4.7.6)
            if (this._mapFilterIds && this._mapFilterIds.size > 0) {
                data = data.filter(r => r.bridge_ID && this._mapFilterIds.has(r.bridge_ID));
            }

            if (search) {
                data = data.filter(r =>
                    (r.nhvrRef         || "").toLowerCase().includes(search) ||
                    (r.bridgeId        || "").toLowerCase().includes(search) ||
                    (r.bridgeName      || "").toLowerCase().includes(search) ||
                    (r.restrictionType || "").toLowerCase().includes(search) ||
                    (r.routeCode       || "").toLowerCase().includes(search) ||
                    (r.gazetteRef      || "").toLowerCase().includes(search) ||
                    (r.notes           || "").toLowerCase().includes(search) ||
                    String(r.value     || "").includes(search)
                );
            }
            if (status !== "ALL") data = data.filter(r => r.status === status);
            if (type   !== "ALL") data = data.filter(r => r.restrictionType === type);
            if (permit === "YES") data = data.filter(r =>  r.permitRequired);
            if (permit === "NO")  data = data.filter(r => !r.permitRequired);

            const temporary = this.byId("filterTemporary") ? this.byId("filterTemporary").getSelectedKey() : "ALL";
            if (temporary === "YES") data = data.filter(r =>  r.isTemporary);
            if (temporary === "NO")  data = data.filter(r => !r.isTemporary);

            // Apply persistent sort
            if (this._sortField) {
                const field = this._sortField;
                const desc  = this._sortDesc;
                data = data.slice().sort(function (a, b) {
                    var cmp = String(a[field] || "").localeCompare(String(b[field] || ""), undefined, { numeric: true });
                    return desc ? -cmp : cmp;
                });
            }

            this._model.setProperty("/items", data);

            const tableTitle = this.byId("tableTitle");
            if (tableTitle) tableTitle.setText("Restrictions (" + data.length + ")");

            // Persist filter state to sessionStorage
            this._saveFilterState();
        },

        // ── Event handlers ─────────────────────────────────────
        onSearch:       function () { this._applyFilters(); },
        onLiveSearch:   function () { this._applyFilters(); },
        onFilterChange: function () { this._applyFilters(); },

        onClearFilters: function () {
            this.byId("searchField")   && this.byId("searchField").setValue("");
            this.byId("filterStatus")  && this.byId("filterStatus").setSelectedKey("ALL");
            this.byId("filterType")    && this.byId("filterType").setSelectedKey("ALL");
            this.byId("filterPermit")  && this.byId("filterPermit").setSelectedKey("ALL");
            this.byId("filterTemporary") && this.byId("filterTemporary").setSelectedKey("ALL");
            this._applyFilters();
        },

        // v4.7.13: apply a saved view's criteria onto Restrictions filter UI.
        _applyRestrictionCriteria: function (criteria) {
            if (!criteria) { return; }
            if (this.byId("searchField")     && typeof criteria.search    === "string") { this.byId("searchField").setValue(criteria.search); }
            if (this.byId("filterStatus")    && criteria.status)                        { this.byId("filterStatus").setSelectedKey(criteria.status); }
            if (this.byId("filterType")      && criteria.type)                          { this.byId("filterType").setSelectedKey(criteria.type); }
            if (this.byId("filterPermit")    && criteria.permit)                        { this.byId("filterPermit").setSelectedKey(criteria.permit); }
            if (this.byId("filterTemporary") && criteria.temporary)                     { this.byId("filterTemporary").setSelectedKey(criteria.temporary); }
        },

        _applyPendingNamedView: function () {
            var self = this;
            sap.ui.require(["nhvr/bridgemanagement/util/NamedViews"], function (NamedViews) {
                var view = NamedViews.consumePending(NamedViews.MODULES.RESTRICTIONS);
                if (!view || !view.filters || !view.filters.criteria) { return; }
                self._applyRestrictionCriteria(view.filters.criteria);
                try { MessageToast.show("Applied saved view: " + view.name); } catch (_) { /* ignore */ }
            });
        },

        // v4.7.9: Save current filter state to the cross-module NamedViews store.
        // Restrictions has no per-module saved-views UI today, so this is the primary save path.
        onSaveNamedView: function () {
            var self = this;
            var current = {
                search:    self.byId("searchField")    ? self.byId("searchField").getValue()            : "",
                status:    self.byId("filterStatus")   ? self.byId("filterStatus").getSelectedKey()     : "",
                type:      self.byId("filterType")     ? self.byId("filterType").getSelectedKey()       : "",
                permit:    self.byId("filterPermit")   ? self.byId("filterPermit").getSelectedKey()     : "",
                temporary: self.byId("filterTemporary")? self.byId("filterTemporary").getSelectedKey()  : ""
            };
            var hasAny = current.search || (current.status && current.status !== "ALL") ||
                         (current.type && current.type !== "ALL") ||
                         (current.permit && current.permit !== "ALL") ||
                         (current.temporary && current.temporary !== "ALL");
            if (!hasAny) {
                MessageToast.show("Nothing to save — set at least one filter first.");
                return;
            }
            MessageBox.prompt("Name this view:", {
                title: "Save Restriction View",
                onClose: function (sAction, sValue) {
                    var value = (sValue || "").trim();
                    if (sAction !== MessageBox.Action.OK || !value) return;
                    sap.ui.require(["nhvr/bridgemanagement/util/NamedViews"], function (NamedViews) {
                        try {
                            NamedViews.save(NamedViews.MODULES.RESTRICTIONS, value, { criteria: current });
                            MessageToast.show("Saved view: " + value);
                        } catch (_) {
                            MessageToast.show("Failed to save view");
                        }
                    });
                }
            });
        },

        onRefresh: function () {
            this._loadRestrictions();
            MessageToast.show("Restriction data refreshed");
        },

        onRestrictionPress: function (e) {
            const ctx = e.getSource().getBindingContext("restrictions");
            const r   = ctx ? ctx.getObject() : null;
            if (r && r.bridgeId) {
                this.getOwnerComponent().getRouter().navTo("BridgeDetail", { bridgeId: encodeURIComponent(r.bridgeId) });
            }
        },

        // ── Add Restriction (create mode) ─────────────────────
        onAddRestriction: function () {
            UserAnalytics.trackAction("add_restriction", "Restrictions");
            this._editRestrictionId = null;
            this._selectedBridgeID  = null;

            // Update dialog title and save button
            const dlgTitle = this.byId("glRestDlgTitle");
            if (dlgTitle) dlgTitle.setText("Add Restriction");
            const saveBtn = this.byId("glRestSaveBtn");
            if (saveBtn) saveBtn.setText("Create");

            // Clear all fields
            this._clearDialogFields();

            // Show bridge ID input for create mode
            const bridgeBox = this.byId("glBridgeIdBox");
            if (bridgeBox) bridgeBox.setVisible(true);

            // Hide info strip
            const info = this.byId("editRestDlgInfo");
            if (info) { info.setText(""); info.setVisible(false); }

            // Reset to Permanent
            if (this.byId("glRestCategory")) this.byId("glRestCategory").setSelectedKey("PERMANENT");
            this._toggleTempFields(false);

            this.byId("editRestDialog").open();
            this._applyRestrictionFieldRBAC();
        },

        // v4.7.9: Field-level RBAC for the Restriction create/edit dialog.
        _applyRestrictionFieldRBAC: function () {
            try {
                RoleManager.applyFields(this.getView(), [
                    { id: "glRestCategory",         field: "restriction.category" },
                    { id: "glEditRestType",         field: "restriction.type" },
                    { id: "glEditRestValue",        field: "restriction.value" },
                    { id: "glEditRestUnit",         field: "restriction.unit" },
                    { id: "glEditRestStatus",       field: "restriction.status" },
                    { id: "glEditRestFrom",         field: "restriction.validFrom" },
                    { id: "glEditRestTo",           field: "restriction.validTo" },
                    { id: "glEditRestGazette",      field: "restriction.gazetteRef" },
                    { id: "glEditRestDirection",    field: "restriction.directionApplied" },
                    { id: "glEditRestAuthority",    field: "restriction.enforcementAuthority" },
                    { id: "glEditRestPermit",       field: "restriction.permitRequired" },
                    { id: "glEditRestNotes",        field: "restriction.notes" },
                    { id: "glEditRestVehicleClass", field: "restriction.vehicleClass" },
                    { id: "glEditRestApprovedBy",   field: "restriction.approvedBy" },
                    { id: "glTempReason",           field: "restriction.temporaryReason" },
                    { id: "glTempApprovedBy",       field: "restriction.temporaryApprovedBy" }
                ]);
            } catch (_) { /* RoleManager unavailable — leave defaults */ }
        },

        // ── Edit Restriction ──────────────────────────────────
        onEditRestriction: function (e) {
            const ctx = e.getSource().getBindingContext("restrictions");
            const row = ctx ? ctx.getObject() : null;
            if (!row || !row.ID) { MessageToast.show("Cannot identify restriction"); return; }
            this._editRestrictionId = row.ID;

            // Update dialog title and save button
            const dlgTitle = this.byId("glRestDlgTitle");
            if (dlgTitle) dlgTitle.setText("Edit Restriction");
            const saveBtn = this.byId("glRestSaveBtn");
            if (saveBtn) saveBtn.setText("Save Changes");

            // Hide bridge ID input for edit mode
            const bridgeBox = this.byId("glBridgeIdBox");
            if (bridgeBox) bridgeBox.setVisible(false);

            // Set category (Permanent/Temporary)
            const isTemp = !!row.isTemporary;
            if (this.byId("glRestCategory")) this.byId("glRestCategory").setSelectedKey(isTemp ? "TEMPORARY" : "PERMANENT");
            this._toggleTempFields(isTemp);

            // Set info strip
            const info = this.byId("editRestDlgInfo");
            if (info) {
                info.setText(`${row.restrictionType}: ${row.value} ${row.unit} — ${row.status}`);
                info.setVisible(true);
            }

            if (this.byId("glEditRestType"))     this.byId("glEditRestType").setSelectedKey(row.restrictionType || "");
            if (this.byId("glEditRestValue"))    this.byId("glEditRestValue").setValue(String(row.value || ""));
            if (this.byId("glEditRestUnit"))     this.byId("glEditRestUnit").setSelectedKey(row.unit || "");
            if (this.byId("glEditRestStatus"))   this.byId("glEditRestStatus").setSelectedKey(row.status || "ACTIVE");
            if (this.byId("glEditRestFrom"))     this.byId("glEditRestFrom").setValue(row.validFrom === "—" ? "" : row.validFrom);
            if (this.byId("glEditRestTo"))       this.byId("glEditRestTo").setValue(row.validTo === "Ongoing" ? "" : row.validTo);
            if (this.byId("glEditRestGazette"))  this.byId("glEditRestGazette").setValue(row.gazetteRef || "");
            if (this.byId("glEditRestDirection"))this.byId("glEditRestDirection").setSelectedKey(row.directionApplied || "BOTH");
            if (this.byId("glEditRestAuthority"))this.byId("glEditRestAuthority").setValue(row.enforcementAuthority || "");
            if (this.byId("glEditRestPermit"))   this.byId("glEditRestPermit").setSelected(!!row.permitRequired);
            if (this.byId("glEditRestNotes"))    this.byId("glEditRestNotes").setValue(row.notes || "");
            var vcField = this.byId("glEditRestVehicleClass");
            if (vcField) { vcField.setSelectedKey(row.vehicleClass_ID || ""); }
            var abField = this.byId("glEditRestApprovedBy");
            if (abField) { abField.setValue(row.approvedBy || ""); }
            // Store bridge UUID for potential re-submission
            this._selectedBridgeID = row.bridge_ID || null;

            // Temporary fields
            if (isTemp) {
                if (this.byId("glTempReason"))      this.byId("glTempReason").setValue(row.temporaryReason || "");
                if (this.byId("glTempApprovedBy"))  this.byId("glTempApprovedBy").setValue(row.temporaryApprovedBy || "");
            }

            this.byId("editRestDialog").open();
            this._applyRestrictionFieldRBAC();
        },

        // ── Delete Restriction ────────────────────────────────
        onDeleteRestriction: function (oEvent) {
            var oBtn = oEvent.getSource();
            var oCtx = oBtn.getBindingContext("restrictions");
            var oRow = oCtx ? oCtx.getObject() : null;
            // Fallback: try to locate row by custom data if no context
            if (!oRow) {
                var sId = oBtn.data ? oBtn.data("restrictionId") : null;
                if (sId) { oRow = (this._allRestrictions || []).find(function (r) { return r.ID === sId; }); }
            }
            var that = this;
            var label = (oRow && oRow.restrictionType ? oRow.restrictionType : "this restriction") +
                        (oRow && oRow.value ? " (" + oRow.value + " " + (oRow.unit || "") + ")" : "");
            sap.m.MessageBox.confirm(
                "Delete " + label + "?\n\nThis action is permanent and cannot be undone.",
                {
                    title: "Confirm Delete Restriction",
                    emphasizedAction: "Delete",
                    actions: ["Delete", sap.m.MessageBox.Action.CANCEL],
                    onClose: function (sAction) {
                        if (sAction !== "Delete") return;
                        var sDeleteId = oRow && oRow.ID;
                        if (!sDeleteId) { sap.m.MessageToast.show("Cannot delete: no ID found."); return; }
                        AuthFetch.del("/bridge-management/Restrictions(" + sDeleteId + ")")
                        .then(function (r) {
                            if (!r.ok) throw new Error("HTTP " + r.status);
                            sap.m.MessageToast.show("Restriction deleted.");
                            that._loadRestrictions();
                        })
                        .catch(function (err) {
                            sap.m.MessageBox.error("Delete failed: " + err.message);
                        });
                    }
                }
            );
        },

        // ── Toggle Permanent/Temporary fields ─────────────────
        onRestrictionTypeChange: function (e) {
            const key = e.getParameter("item").getKey();
            const isTemp = key === "TEMPORARY";
            this._toggleTempFields(isTemp);
        },

        _toggleTempFields: function (isTemp) {
            const tempFields = this.byId("glTempFields");
            const tempStrip  = this.byId("glTempStrip");
            if (tempFields) tempFields.setVisible(isTemp);
            if (tempStrip)  tempStrip.setVisible(isTemp);
        },

        _clearDialogFields: function () {
            const fields = [
                "glRestBridgeId","glEditRestValue","glEditRestGazette","glEditRestNotes",
                "glEditRestAuthority","glTempReason","glTempApprovedBy","glTempApprovalRef"
            ];
            fields.forEach(id => { const c = this.byId(id); if (c && c.setValue) c.setValue(""); });
            if (this.byId("glEditRestVehicleClass")) { this.byId("glEditRestVehicleClass").setSelectedKey(""); }
            if (this.byId("glEditRestApprovedBy"))   { this.byId("glEditRestApprovedBy").setValue(""); }
            this._selectedBridgeID = null;

            const selects = [
                { id: "glEditRestType",      key: "HEIGHT" },
                { id: "glEditRestUnit",      key: "t" },
                { id: "glEditRestStatus",    key: "ACTIVE" },
                { id: "glEditRestDirection", key: "BOTH" }
            ];
            selects.forEach(s => { const c = this.byId(s.id); if (c) c.setSelectedKey(s.key); });

            ["glEditRestFrom","glEditRestTo","glTempFromDate","glTempToDate"].forEach(id => {
                const c = this.byId(id); if (c && c.setValue) c.setValue("");
            });

            const permitChk = this.byId("glEditRestPermit");
            if (permitChk) permitChk.setSelected(false);
        },

        onSaveEditRestriction: function () {
            const type       = this.byId("glEditRestType")     ? this.byId("glEditRestType").getSelectedKey()      : "";
            const value      = this.byId("glEditRestValue")    ? this.byId("glEditRestValue").getValue().trim()    : "";
            const unit       = this.byId("glEditRestUnit")     ? this.byId("glEditRestUnit").getSelectedKey()      : "";
            const status     = this.byId("glEditRestStatus")   ? this.byId("glEditRestStatus").getSelectedKey()   : "ACTIVE";
            const fromDate   = this.byId("glEditRestFrom")     ? this.byId("glEditRestFrom").getValue()            : "";
            const toDate     = this.byId("glEditRestTo")       ? this.byId("glEditRestTo").getValue()              : "";
            const gazette    = this.byId("glEditRestGazette")  ? this.byId("glEditRestGazette").getValue().trim()  : "";
            const direction  = this.byId("glEditRestDirection") ? this.byId("glEditRestDirection").getSelectedKey() : "BOTH";
            const authority  = this.byId("glEditRestAuthority") ? this.byId("glEditRestAuthority").getValue().trim() : "";
            const permit     = this.byId("glEditRestPermit")   ? this.byId("glEditRestPermit").getSelected()      : false;
            const notes      = this.byId("glEditRestNotes")    ? this.byId("glEditRestNotes").getValue().trim()   : "";

            const category   = this.byId("glRestCategory")    ? this.byId("glRestCategory").getSelectedKey()     : "PERMANENT";
            const isTemp     = category === "TEMPORARY";

            if (!type) { MessageBox.error("Restriction type is required"); return; }
            if (!value && type !== "VEHICLE_TYPE") { MessageBox.error("Restriction value is required"); return; }
            if (!unit && type !== "VEHICLE_TYPE") { MessageBox.error("Unit is required"); return; }

            const body = {
                restrictionType    : type,
                value              : parseFloat(value),
                unit               : unit,
                status             : status,
                validFromDate      : fromDate || null,
                validToDate        : toDate   || null,
                gazetteRef         : gazette  || null,
                directionApplied   : direction,
                enforcementAuthority: authority || null,
                permitRequired     : permit,
                isTemporary        : isTemp,
                notes              : notes || null,
                vehicleClass_ID    : (this.byId("glEditRestVehicleClass") ? this.byId("glEditRestVehicleClass").getSelectedKey() : null) || null,
                approvedBy         : this.byId("glEditRestApprovedBy")   ? this.byId("glEditRestApprovedBy").getValue().trim()   : null
            };

            if (isTemp) {
                const tempFrom   = this.byId("glTempFromDate")  ? this.byId("glTempFromDate").getValue()           : "";
                const tempTo     = this.byId("glTempToDate")    ? this.byId("glTempToDate").getValue()             : "";
                const reason     = this.byId("glTempReason")    ? this.byId("glTempReason").getValue().trim()      : "";
                const approvedBy = this.byId("glTempApprovedBy")? this.byId("glTempApprovedBy").getValue().trim()  : "";
                const approvalRef= this.byId("glTempApprovalRef")? this.byId("glTempApprovalRef").getValue().trim(): "";

                if (!reason) { MessageToast.show("Temporary reason is required for temporary restrictions"); return; }

                body.temporaryFromDate   = tempFrom    || null;
                body.temporaryToDate     = tempTo      || null;
                body.temporaryReason     = reason      || null;
                body.temporaryApprovedBy = approvedBy  || null;
                body.temporaryApprovalRef= approvalRef || null;
            }

            if (this._editRestrictionId) {
                // EDIT: PATCH existing
                AuthFetch.patch(`${BASE}/Restrictions(${this._editRestrictionId})`, body)
                .then(async r => {
                    if (!r.ok) { const b = await r.json().catch(() => ({})); throw new Error(b.error?.message || `HTTP ${r.status}`); }
                    MessageToast.show("Restriction updated");
                    this.byId("editRestDialog").close();
                    this._editRestrictionId = null;
                    this._loadRestrictions();
                })
                .catch(err => MessageBox.error("Failed to update: " + err.message));
            } else {
                // CREATE: POST new — bridge_ID must be the entity UUID
                if (!this._selectedBridgeID) {
                    MessageToast.show("Please search for and select a bridge from the suggestions");
                    return;
                }
                body.bridge_ID = this._selectedBridgeID;

                AuthFetch.post(`${BASE}/Restrictions`, body)
                .then(async r => {
                    if (!r.ok) { const b = await r.json().catch(() => ({})); throw new Error(b.error?.message || `HTTP ${r.status}`); }
                    MessageToast.show("Restriction created");
                    this.byId("editRestDialog").close();
                    this._editRestrictionId = null;
                    this._loadRestrictions();
                })
                .catch(err => MessageBox.error("Failed to create: " + err.message));
            }
        },

        onCancelEditRestriction: function () {
            this.byId("editRestDialog").close();
            this._editRestrictionId = null;
        },

        // ── Column Chooser (dynamic, registry-driven) ─────────
        onColumnChooser: function () {
            this._buildColumnCheckboxes();
            this.byId("columnChooserDialog").open();
        },

        _buildColumnCheckboxes: function (searchTerm) {
            var container = this.byId("colCheckboxContainer");
            if (!container) return;
            container.destroyItems();

            var savedKeys = this._getVisibleColumnKeys();
            var term = (searchTerm || "").toLowerCase();
            var count = 0;

            RestrictionAttrs.RESTRICTION_ATTRIBUTES.forEach(function (attr) {
                if (term && attr.label.toLowerCase().indexOf(term) === -1) return;
                var cb = new sap.m.CheckBox({
                    text: attr.label + (attr.section ? " (" + attr.sectionLabel + ")" : ""),
                    selected: savedKeys.indexOf(attr.key) !== -1
                });
                cb.data("attrKey", attr.key);
                container.addItem(cb);
                if (cb.getSelected()) count++;
            });

            var countText = this.byId("colCountText");
            if (countText) countText.setText(count + " of " + RestrictionAttrs.RESTRICTION_ATTRIBUTES.length + " shown");
        },

        _getVisibleColumnKeys: function () {
            try {
                var saved = JSON.parse(localStorage.getItem("nhvr_restriction_columns"));
                if (Array.isArray(saved)) return saved;
            } catch (_) { /* ignore */ }
            return RestrictionAttrs.getDefaultVisibleColumns().map(function (a) { return a.key; });
        },

        onColumnSearch: function (oEvent) {
            this._buildColumnCheckboxes(oEvent.getParameter("newValue"));
        },

        onColPresetEssential: function () {
            this._applyColumnPreset(["bridge_bridgeId", "bridge_name", "restrictionType", "value", "unit", "status"]);
        },
        onColPresetCompliance: function () {
            this._applyColumnPreset(["bridge_bridgeId", "bridge_name", "restrictionType", "value", "unit", "status", "gazetteRef", "permitRequired", "validFromDate", "validToDate", "approvedBy"]);
        },
        onColPresetAll: function () {
            this._applyColumnPreset(RestrictionAttrs.RESTRICTION_ATTRIBUTES.map(function (a) { return a.key; }));
        },
        onColShowAll: function () { this.onColPresetAll(); },
        onColHideAll: function () { this._applyColumnPreset([]); },

        _applyColumnPreset: function (keys) {
            var container = this.byId("colCheckboxContainer");
            if (!container) return;
            var count = 0;
            container.getItems().forEach(function (cb) {
                var k = cb.data("attrKey");
                var sel = keys.indexOf(k) !== -1;
                cb.setSelected(sel);
                if (sel) count++;
            });
            var countText = this.byId("colCountText");
            if (countText) countText.setText(count + " of " + RestrictionAttrs.RESTRICTION_ATTRIBUTES.length + " shown");
        },

        onApplyColumns: function () {
            var container = this.byId("colCheckboxContainer");
            if (!container) { this.byId("columnChooserDialog").close(); return; }

            var selectedKeys = [];
            container.getItems().forEach(function (cb) {
                if (cb.getSelected()) selectedKeys.push(cb.data("attrKey"));
            });

            localStorage.setItem("nhvr_restriction_columns", JSON.stringify(selectedKeys));
            this._restColumnsBuilt = false;
            this._buildRestrictionColumns();
            this._applyFiltersAndSort();
            this.byId("columnChooserDialog").close();
            MessageToast.show(selectedKeys.length + " columns selected");
        },

        onCloseColumnChooser: function () {
            this.byId("columnChooserDialog").close();
        },

        // ── Export CSV (deprecated — kept for backward compat) ─
        onExportCSV: function () { this.onExportRestrictions(); },

        // ── Bridge hyperlink ───────────────────────────────────
        onBridgeIdPress: function (e) {
            const ctx = e.getSource().getBindingContext("restrictions");
            const obj = ctx ? ctx.getObject() : null;
            if (!obj) return;
            const bid = obj.bridgeId || obj.bridge_ID;
            if (bid) {
                this.getOwnerComponent().getRouter().navTo("BridgeDetail", { bridgeId: encodeURIComponent(bid) });
            }
        },

        // ── Navigation ─────────────────────────────────────────
        onNavHome:      function () { this._navTo("Home"); },
        onNavToMap:     function () { this._navTo("MapView"); },
        onNavToBridges: function () { this._navTo("BridgesList"); },

        _navTo: function (routeName, params) {
            this.getOwnerComponent().getRouter().navTo(routeName, params || {});
        },

        // ═══════════════════════════════════════════════════════════
        // ADVANCED FILTER
        // ═══════════════════════════════════════════════════════════
        _advRestCriteria: [],
        _restFilterFields: [
            { key: "restrictionType",    label: "Restriction Type",    type: "text" },
            { key: "status",             label: "Status",              type: "select", options: ["ACTIVE","SCHEDULED","EXPIRED"] },
            { key: "unit",               label: "Unit",                type: "select", options: ["m","t","km/h","kph"] },
            { key: "value",              label: "Value",               type: "number" },
            { key: "permitRequired",     label: "Permit Required",     type: "boolean" },
            { key: "isTemporary",        label: "Is Temporary",        type: "boolean" },
            { key: "directionApplied",   label: "Direction",           type: "select", options: ["BOTH","INCREASING","DECREASING"] },
            { key: "bridgeId",           label: "Bridge ID",           type: "text" },
            { key: "routeCode",          label: "Route Code",          type: "text" },
            { key: "vehicleClass",       label: "Vehicle Class",       type: "text" },
            { key: "gazetteRef",         label: "Gazette Reference",   type: "text" },
            { key: "enforcementAuthority", label: "Enforcement Authority", type: "text" }
        ],

        onAddRestFilterCriteria: function () {
            this._advRestCriteria.push({ field: "status", operator: "eq", value: "" });
            this._renderAdvRestCriteria();
        },

        _renderAdvRestCriteria: function () {
            const container = this.byId("advRestFilterCriteria");
            if (!container) return;
            container.destroyItems();

            this._advRestCriteria.forEach((crit, idx) => {
                const fieldSelect = new sap.m.Select({ width: "200px", selectedKey: crit.field,
                    change: (e) => { this._advRestCriteria[idx].field = e.getParameter("selectedItem").getKey(); this._advRestCriteria[idx].value = ""; this._renderAdvRestCriteria(); }
                });
                this._restFilterFields.forEach(f => fieldSelect.addItem(new sap.ui.core.Item({ key: f.key, text: f.label })));

                const fieldDef = this._restFilterFields.find(f => f.key === crit.field) || { type: "text" };
                const opSelect = new sap.m.Select({ width: "130px", selectedKey: crit.operator,
                    change: (e) => { this._advRestCriteria[idx].operator = e.getParameter("selectedItem").getKey(); }
                });
                const ops = fieldDef.type === "number"
                    ? [["eq","="],["gt",">"],["lt","<"],["gte","≥"],["lte","≤"]]
                    : [["eq","equals"],["ne","not equals"],["contains","contains"]];
                ops.forEach(([k,t]) => opSelect.addItem(new sap.ui.core.Item({ key: k, text: t })));

                let valueControl;
                if (fieldDef.type === "select") {
                    valueControl = new sap.m.Select({ width: "160px", selectedKey: crit.value,
                        change: (e) => { this._advRestCriteria[idx].value = e.getParameter("selectedItem").getKey(); }
                    });
                    valueControl.addItem(new sap.ui.core.Item({ key: "", text: "— Any —" }));
                    (fieldDef.options || []).forEach(o => valueControl.addItem(new sap.ui.core.Item({ key: o, text: o })));
                } else if (fieldDef.type === "boolean") {
                    valueControl = new sap.m.Select({ width: "100px",
                        change: (e) => { this._advRestCriteria[idx].value = e.getParameter("selectedItem").getKey() === "true"; }
                    });
                    valueControl.addItem(new sap.ui.core.Item({ key: "true", text: "Yes" }));
                    valueControl.addItem(new sap.ui.core.Item({ key: "false", text: "No" }));
                } else {
                    valueControl = new sap.m.Input({ width: "160px", value: crit.value,
                        liveChange: (e) => { this._advRestCriteria[idx].value = e.getParameter("value"); }
                    });
                }

                const removeBtn = new sap.m.Button({ icon: "sap-icon://decline", type: "Transparent",
                    press: () => { this._advRestCriteria.splice(idx,1); this._renderAdvRestCriteria(); }
                });
                container.addItem(new sap.m.HBox({ alignItems: "Center",
                    items: [fieldSelect, opSelect, valueControl, removeBtn]
                }).addStyleClass("sapUiTinyMarginBottom"));
            });
        },

        onApplyAdvRestFilter: function () {
            let data = this._allRestrictions || [];
            this._advRestCriteria.forEach(crit => {
                if (!crit.field || crit.value === "" || crit.value === null) return;
                data = data.filter(r => {
                    const rv = r[crit.field];
                    if (rv === null || rv === undefined) return false;
                    switch (crit.operator) {
                        case "eq":       return typeof rv === "boolean" ? rv === crit.value : String(rv).toLowerCase() === String(crit.value).toLowerCase();
                        case "ne":       return String(rv).toLowerCase() !== String(crit.value).toLowerCase();
                        case "contains": return String(rv).toLowerCase().includes(String(crit.value).toLowerCase());
                        case "gt": return parseFloat(rv) > parseFloat(crit.value);
                        case "lt": return parseFloat(rv) < parseFloat(crit.value);
                        case "gte": return parseFloat(rv) >= parseFloat(crit.value);
                        case "lte": return parseFloat(rv) <= parseFloat(crit.value);
                        default: return true;
                    }
                });
            });
            this._model.setProperty("/items", data);
            const t = this.byId("tableTitle");
            if (t) t.setText(`Restrictions (${data.length}) — Advanced Filter Active`);
            sap.m.MessageToast.show(`${data.length} restriction${data.length !== 1 ? "s" : ""} matched`);
        },

        onClearAdvRestFilter: function () {
            this._advRestCriteria = [];
            this._renderAdvRestCriteria();
            this._applyFilters();
        },

        onExportRestrictions: function () {
            const items = this._model.getProperty("/items") || [];
            if (!items.length) { MessageToast.show("No data to export"); return; }
            ExcelExport.export({
                fileName: "NHVR_Restrictions_" + new Date().toISOString().slice(0, 10),
                columns : ExcelExport.RestrictionColumns,
                data    : items
            });
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

        onInfoPressRestrictions: function (oEvent) {
            this._showInfoPopover(
                oEvent.getSource(),
                "Restrictions Registry — Guide",
                "This registry lists all load, clearance and speed restrictions across the bridge network.\n\n" +
                "Restriction Types:\n" +
                "• GROSS_MASS — maximum gross vehicle mass in tonnes\n" +
                "• AXLE_LOAD — maximum load per axle group in tonnes\n" +
                "• CLEARANCE_HEIGHT — maximum vehicle height in metres\n" +
                "• CLEARANCE_WIDTH — maximum vehicle width in metres\n" +
                "• SPEED — maximum vehicle speed in km/h\n" +
                "• VEHICLE_TYPE — specific vehicle class excluded from crossing\n\n" +
                "Restriction Statuses:\n" +
                "• ACTIVE — currently in force\n" +
                "• INACTIVE — exists but not currently enforced\n" +
                "• EXPIRED — temporary restriction whose end date has passed\n\n" +
                "Temporary Restrictions — have validFromDate and validToDate. The system automatically marks them EXPIRED when toDate is reached.\n\n" +
                "Gazette Validation — use the Validate button in the edit dialog to check the gazette reference format (STATE-YYYY/NNN)."
            );
        },

        // ── P08: Gazette Validation ───────────────────────────────
        onValidateGazette: function () {
            var that          = this;
            var restrictionId = this._editRestrictionId;
            if (!restrictionId) {
                sap.m.MessageToast.show("Save the restriction first, then validate gazette.");
                return;
            }
            var gazetteInput = this.byId("glEditRestGazette");
            var gazetteRef   = gazetteInput ? gazetteInput.getValue() : "";
            if (!gazetteRef) {
                sap.m.MessageToast.show("Enter a gazette reference to validate.");
                return;
            }
            AuthFetch.post("/bridge-management/validateGazette", { restrictionId: restrictionId, gazetteRef: gazetteRef })
            .then(function (r) {
                if (!r.ok) return r.json().then(function (e) {
                    throw new Error(e.error?.message || "HTTP " + r.status);
                });
                return r.json();
            })
            .then(function (result) {
                var res    = result.value || result;
                var status = res.status || "INVALID";
                var msg    = res.message || status;
                var statusCtrl = that.byId("gazetteValidationStatus");
                if (statusCtrl) {
                    var stateMap = { VALID: "Success", INVALID: "Error", PENDING: "Warning" };
                    statusCtrl.setText(msg);
                    statusCtrl.setState(stateMap[status] || "None");
                    statusCtrl.setVisible(true);
                }
                sap.m.MessageToast.show("Gazette: " + status + (res.expiryDate ? " — Expires: " + res.expiryDate : ""));
                // Refresh restriction list to show updated gazette status badge
                that._loadRestrictions();
            })
            .catch(function (err) {
                sap.m.MessageBox.error("Gazette validation failed: " + err.message);
            });
        },

        // ── Variant Management (localStorage-based) ──────────────
        _VARIANT_KEY: "nhvr_restriction_variants",
        _FILTER_KEY:  "nhvr_restriction_filters",

        _loadVariants: function () {
            var oVM = this.byId("restVariantMgmt");
            if (!oVM) return;
            try {
                var saved = JSON.parse(localStorage.getItem(this._VARIANT_KEY) || "[]");
                if (!Array.isArray(saved)) return;
                oVM.removeAllItems();
                saved.forEach(function (v) {
                    var oItem = new sap.m.VariantItem({
                        key   : v.key,
                        title : v.title,
                        def   : !!v.def
                    });
                    oVM.addItem(oItem);
                    if (v.def) oVM.setDefaultKey(v.key);
                });
                var defVariant = saved.find(function (v) { return v.def; });
                if (defVariant && defVariant.state) {
                    this._applyVariantState(defVariant.state);
                }
            } catch (_) { /* localStorage unavailable */ }
        },

        onVariantSave: function (oEvent) {
            var name  = oEvent.getParameter("name");
            var key   = oEvent.getParameter("key") || "var_" + Date.now();
            var state = this._captureVariantState();
            try {
                var variants = JSON.parse(localStorage.getItem(this._VARIANT_KEY) || "[]");
                var existing = variants.findIndex(function (v) { return v.key === key; });
                var entry = { key: key, title: name || key, def: !!oEvent.getParameter("def"), state: state };
                if (existing >= 0) { variants[existing] = entry; }
                else               { variants.push(entry); }
                localStorage.setItem(this._VARIANT_KEY, JSON.stringify(variants));
                MessageToast.show("View \"" + name + "\" saved");
            } catch (_) { /* localStorage unavailable */ }
        },

        onVariantSelect: function (oEvent) {
            var key = oEvent.getParameter("key");
            try {
                var variants = JSON.parse(localStorage.getItem(this._VARIANT_KEY) || "[]");
                var v = variants.find(function (v) { return v.key === key; });
                if (v && v.state) { this._applyVariantState(v.state); }
            } catch (_) { /* localStorage unavailable */ }
        },

        onVariantManage: function (oEvent) {
            var renamed = oEvent.getParameter("renamed") || [];
            var deleted = oEvent.getParameter("deleted") || [];
            try {
                var variants = JSON.parse(localStorage.getItem(this._VARIANT_KEY) || "[]");
                deleted.forEach(function (k) { variants = variants.filter(function (v) { return v.key !== k; }); });
                renamed.forEach(function (r) {
                    var v = variants.find(function (v) { return v.key === r.key; });
                    if (v) v.title = r.name;
                });
                localStorage.setItem(this._VARIANT_KEY, JSON.stringify(variants));
            } catch (_) { /* localStorage unavailable */ }
        },

        _captureVariantState: function () {
            return {
                search    : this.byId("searchField")      ? this.byId("searchField").getValue()          : "",
                status    : this.byId("filterStatus")      ? this.byId("filterStatus").getSelectedKey()   : "ALL",
                type      : this.byId("filterType")        ? this.byId("filterType").getSelectedKey()     : "ALL",
                permit    : this.byId("filterPermit")       ? this.byId("filterPermit").getSelectedKey()    : "ALL",
                temporary : this.byId("filterTemporary")   ? this.byId("filterTemporary").getSelectedKey(): "ALL",
                sortField : this._sortField,
                sortDesc  : this._sortDesc,
                columns   : this._getVisibleColumnKeys()
            };
        },

        _applyVariantState: function (state) {
            if (!state) return;
            if (state.search    !== undefined && this.byId("searchField"))      this.byId("searchField").setValue(state.search);
            if (state.status    !== undefined && this.byId("filterStatus"))     this.byId("filterStatus").setSelectedKey(state.status);
            if (state.type      !== undefined && this.byId("filterType"))       this.byId("filterType").setSelectedKey(state.type);
            if (state.permit    !== undefined && this.byId("filterPermit"))      this.byId("filterPermit").setSelectedKey(state.permit);
            if (state.temporary !== undefined && this.byId("filterTemporary"))  this.byId("filterTemporary").setSelectedKey(state.temporary);
            if (state.sortField) { this._sortField = state.sortField; this._sortDesc = !!state.sortDesc; }
            if (Array.isArray(state.columns)) {
                localStorage.setItem("nhvr_restriction_columns", JSON.stringify(state.columns));
                this._restColumnsBuilt = false;
                this._buildRestrictionColumns();
            }
            this._applyFiltersAndSort();
        },

        // ── Filter persistence (sessionStorage) ─────────────────
        _saveFilterState: function () {
            try {
                sessionStorage.setItem(this._FILTER_KEY, JSON.stringify(this._captureVariantState()));
            } catch (_) { /* sessionStorage unavailable */ }
        },

        _restoreFilterState: function () {
            try {
                var saved = JSON.parse(sessionStorage.getItem(this._FILTER_KEY));
                if (saved) this._applyVariantState(saved);
            } catch (_) { /* sessionStorage unavailable */ }
        }

    }, AlvToolbarMixin));
});
