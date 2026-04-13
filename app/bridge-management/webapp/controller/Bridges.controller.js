// ============================================================
// NHVR Bridges Controller — Bridge Asset Registry List
// ============================================================
sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageToast",
    "nhvr/bridgemanagement/util/ExcelExport",
    "nhvr/bridgemanagement/config/BridgeAttributes",
    "nhvr/bridgemanagement/util/CsvExport",
    "nhvr/bridgemanagement/util/CsvTemplate",
    "nhvr/bridgemanagement/model/RoleManager",
    "nhvr/bridgemanagement/util/TablePersonalisation",
    "nhvr/bridgemanagement/util/HelpAssistantMixin",
    "nhvr/bridgemanagement/util/AlvToolbarMixin",
    "nhvr/bridgemanagement/util/AuthFetch",
    "nhvr/bridgemanagement/util/UserAnalytics",
    "nhvr/bridgemanagement/util/LookupService",
    "sap/base/Log"
], function (Controller, JSONModel, MessageToast, ExcelExport, BridgeAttrs, CsvExport, CsvTemplate, RoleManager, TablePersonalisation, HelpAssistantMixin, AlvToolbarMixin, AuthFetch, UserAnalytics, LookupService, Log) {
    "use strict";

    const BASE = "/bridge-management";

    var _IS_LOC = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
    var _AUTH_H = _IS_LOC ? { "Authorization": "Basic " + btoa("admin:admin") } : {};
    function _credOpts(extraHeaders) {
        var opts = { headers: Object.assign({ Accept: "application/json" }, _AUTH_H, extraHeaders || {}) };
        if (!_IS_LOC) opts.credentials = "include";
        return opts;
    }

    return Controller.extend("nhvr.bridgemanagement.controller.Bridges", Object.assign({

        _allBridges    : [],
        _highlightId   : null,
        _sortField     : null,
        _sortDesc      : false,
        _pageSize      : 100,
        _currentSkip   : 0,
        _totalCount    : 0,

        onInit: function () {
            UserAnalytics.trackView("Bridges");
            this._model = new JSONModel({ items: [] });
            this.getView().setModel(this._model, "bridges");
            this._initHelpAssistant("bridges");

            // Role-based UI flags (upload buttons + add bridge button)
            var oUiModel = new JSONModel({ canUpload: false, canTemplate: false });
            this.getView().setModel(oUiModel, "ui");
            setTimeout(function () {
                var canUpload = false;
                var canAddBridge = false;
                try {
                    var role = RoleManager.getRole ? RoleManager.getRole() : "READ_ONLY";
                    canUpload    = (role === "ADMIN" || role === "BRIDGE_MANAGER") ||
                                   RoleManager.isVisible("massupload") ||
                                   RoleManager.isEditable("addBridge");
                    canAddBridge = RoleManager.isVisible("addBridge");
                } catch (e) { canUpload = false; canAddBridge = false; } // Fail closed for security
                oUiModel.setProperty("/canUpload", canUpload);
                oUiModel.setProperty("/canTemplate", canUpload);
                // Show/hide Add Bridge button based on role
                var oAddBtn = this.byId("btnAddBridge");
                if (oAddBtn) oAddBtn.setVisible(canAddBridge);
            }.bind(this), 500);

            this._loadBridges();
            this._loadDynamicAttrFields();

            // Restore saved filter presets from localStorage
            try {
                const saved = JSON.parse(localStorage.getItem("nhvr_bridge_filter_presets") || "[]");
                if (Array.isArray(saved)) this._filterPresets = saved;
            } catch(_) { /* localStorage unavailable */ }

            // Attach route matched to handle navigation params from Map
            const router = this.getOwnerComponent().getRouter();
            router.getRoute("BridgesList").attachPatternMatched(this._onRouteMatched, this);

            LookupService.load().then(function () {
                LookupService.populateSelect(this.byId("filterState"),     "STATE",          "All States");
                LookupService.populateSelect(this.byId("filterCondition"), "CONDITION",      "All");
                LookupService.populateSelect(this.byId("filterPosting"),   "POSTING_STATUS", "All Statuses");
                LookupService.populateSelect(this.byId("filterScour"),     "SCOUR_RISK",     "All");
                LookupService.populateSelect(this.byId("filterRiskBand"),  "RISK_BAND",      "All");
            }.bind(this));
        },

        onAfterRendering: function () {
            this._loadVariants();
            this._buildBridgeColumns();
        },

        onExit: function () {
            // Destroy programmatically created dialogs
            ["columnPickerDialog", "saveVariantDialog", "bridgePickerDialog"].forEach(function (id) {
                var dlg = this.byId(id);
                if (dlg) { dlg.destroy(); }
            }.bind(this));
        },

        // ── Custom Column Picker (replaces p13n Engine) ────────────────
        onOpenTableSettings: function () {
            var oDialog = this.byId("columnPickerDialog");
            if (!oDialog) { return; }
            var savedKeys   = this._getSavedColumnKeys();
            var defaultKeys = BridgeAttrs.getDefaultVisibleColumns().map(function (a) { return a.key; });
            var variants    = TablePersonalisation.loadVariants(this._VARIANT_KEY);

            // Build grouped, scrollable column list
            var oList = this.byId("columnPickerList");
            var oSearch = this.byId("colPickerSearch");
            if (oSearch) oSearch.setValue("");
            this._colSectionFilter = null;
            // Reset section group dropdown to "All Groups"
            var oSectionSel = this.byId("colSectionSelect");
            if (oSectionSel) oSectionSel.setSelectedKey("");
            TablePersonalisation.buildGroupedList(oList, BridgeAttrs.BRIDGE_ATTRIBUTES, savedKeys);

            // Populate variant select
            var oVarSelect = this.byId("colVariantSelect");
            TablePersonalisation.populateVariantSelect(oVarSelect, variants, savedKeys, defaultKeys);

            // Update stats
            TablePersonalisation.updateStats(this.byId("colPickerStats"), oList);

            // Mark Bridge ID as locked — always shown, cannot be deselected
            oList.getItems().forEach(function (item) {
                if (!item.isA("sap.m.GroupHeaderListItem") && item.data("attrKey") === "bridgeId") {
                    item.setSelected(true);
                    item.setEnabled(false);
                    item.setInfo("Always shown");
                    item.setInfoState("Information");
                }
            });

            oDialog.open();
        },

        onApplyColumnPicker: function () {
            var oList = this.byId("columnPickerList");
            var selectedKeys = TablePersonalisation.getSelectedKeys(oList);
            if (selectedKeys.indexOf("bridgeId") === -1) { selectedKeys.unshift("bridgeId"); }
            this._saveColumnVisibility(selectedKeys);
            var oTable = this.byId("bridgeTable");
            if (oTable) {
                oTable.getColumns().forEach(function (col) {
                    var key = col.getId().replace(/.*dynCol_/, "");
                    col.setVisible(selectedKeys.indexOf(key) >= 0);
                });
            }
            this.byId("columnPickerDialog").close();
            sap.m.MessageToast.show(selectedKeys.length + " columns shown");
        },

        onResetColumnPicker: function () {
            var defaultKeys = BridgeAttrs.getDefaultVisibleColumns().map(function (a) { return a.key; });
            this._saveColumnVisibility(defaultKeys);
            var oTable = this.byId("bridgeTable");
            if (oTable) {
                oTable.getColumns().forEach(function (col) {
                    var key = col.getId().replace(/.*dynCol_/, "");
                    col.setVisible(defaultKeys.indexOf(key) >= 0);
                });
            }
            this.byId("columnPickerDialog").close();
            sap.m.MessageToast.show("Columns reset to defaults");
        },

        onCloseColumnPicker: function () {
            this.byId("columnPickerDialog").close();
        },

        // ── Quick Column Presets ──────────────────────────────────

        /**
         * Helper: apply a preset by updating the column picker list selection
         * and immediately writing to table + localStorage.
         * @param {string[]} keys  column keys to show; bridgeId is always prepended
         */
        _applyPreset: function (keys) {
            // bridgeId is mandatory
            if (keys.indexOf("bridgeId") === -1) { keys = ["bridgeId"].concat(keys); }
            this._saveColumnVisibility(keys);
            var oTable = this.byId("bridgeTable");
            if (oTable) {
                oTable.getColumns().forEach(function (col) {
                    var key = col.getId().replace(/.*dynCol_/, "");
                    col.setVisible(keys.indexOf(key) >= 0);
                });
            }
            // Refresh the picker list to reflect the new selection
            var oList = this.byId("columnPickerList");
            if (oList) {
                oList.getItems().forEach(function (item) {
                    if (item.isA("sap.m.GroupHeaderListItem")) { return; }
                    var k = item.data("attrKey");
                    if (k) { item.setSelected(keys.indexOf(k) >= 0); }
                });
                TablePersonalisation.updateGroupHeaders(oList);
                TablePersonalisation.updateStats(this.byId("colPickerStats"), oList);
            }
            sap.m.MessageToast.show(keys.length + " columns shown");
        },

        onPresetEssential: function () {
            this._applyPreset([
                "bridgeId", "name", "state", "region",
                "condition", "conditionRating", "postingStatus"
            ]);
        },

        onPresetInspection: function () {
            this._applyPreset([
                "bridgeId", "name", "state",
                "condition", "conditionRating",
                "inspectionDate", "nextInspectionDueDate",
                "scourRisk", "highPriorityAsset",
                "structuralAdequacyRating"
            ]);
        },

        onPresetRestrictions: function () {
            this._applyPreset([
                "bridgeId", "name", "state", "postingStatus",
                "loadRating", "clearanceHeightM",
                "nhvrRouteAssessed", "nhvrRouteApprovalClass",
                "hmlApproved", "bdoubleApproved", "freightRoute"
            ]);
        },

        onPresetFullDetail: function () {
            var allKeys = BridgeAttrs.BRIDGE_ATTRIBUTES.map(function (a) { return a.key; });
            this._applyPreset(allKeys);
        },

        onColPickerSearch: function (oEvent) {
            var sQuery    = (oEvent.getParameter("newValue") || "");
            var oList     = this.byId("columnPickerList");
            var savedKeys = TablePersonalisation.getSelectedKeys(oList);
            TablePersonalisation.buildGroupedList(oList, BridgeAttrs.BRIDGE_ATTRIBUTES, savedKeys, sQuery, this._colSectionFilter || null);
            TablePersonalisation.updateGroupHeaders(oList);
            TablePersonalisation.updateStats(this.byId("colPickerStats"), oList);
        },

        onColPickerSelectionChange: function () {
            var oList = this.byId("columnPickerList");
            TablePersonalisation.updateGroupHeaders(oList);
            TablePersonalisation.updateStats(this.byId("colPickerStats"), oList);
        },

        onColPickerSelectAll: function () {
            var oList = this.byId("columnPickerList");
            TablePersonalisation.setAllSelected(oList, true);
            TablePersonalisation.updateGroupHeaders(oList);
            TablePersonalisation.updateStats(this.byId("colPickerStats"), oList);
        },

        onColPickerDeselectAll: function () {
            var oList = this.byId("columnPickerList");
            TablePersonalisation.setAllSelected(oList, false);
            TablePersonalisation.updateGroupHeaders(oList);
            TablePersonalisation.updateStats(this.byId("colPickerStats"), oList);
        },

        onColSectionFilter: function (oEvent) {
            // Select change — selectedItem key is the sectionLabel (empty = All)
            var oItem = oEvent.getParameter("selectedItem");
            if (!oItem) return;
            var sSection = oItem.getKey() || null;
            this._colSectionFilter = sSection;

            // Rebuild list with section filter (preserve current selections)
            var oList     = this.byId("columnPickerList");
            var savedKeys = TablePersonalisation.getSelectedKeys(oList);
            var sSearch   = this.byId("colPickerSearch") ? this.byId("colPickerSearch").getValue() : "";
            TablePersonalisation.buildGroupedList(oList, BridgeAttrs.BRIDGE_ATTRIBUTES, savedKeys, sSearch, sSection);
            TablePersonalisation.updateGroupHeaders(oList);
            TablePersonalisation.updateStats(this.byId("colPickerStats"), oList);
        },

        onVariantSelected: function (oEvent) {
            var oItem = oEvent.getParameter("selectedItem");
            if (!oItem) return;
            var key = oItem.getKey();
            if (key === TablePersonalisation.STANDARD_VARIANT) {
                // Load defaults
                var defaultKeys = BridgeAttrs.getDefaultVisibleColumns().map(function (a) { return a.key; });
                var oList = this.byId("columnPickerList");
                TablePersonalisation.buildGroupedList(oList, BridgeAttrs.BRIDGE_ATTRIBUTES, defaultKeys);
                TablePersonalisation.updateGroupHeaders(oList);
                TablePersonalisation.updateStats(this.byId("colPickerStats"), oList);
            } else {
                var variants = TablePersonalisation.loadVariants(this._VARIANT_KEY);
                var found = variants.filter(function (v) { return v.name === key; })[0];
                if (found) {
                    var oList2 = this.byId("columnPickerList");
                    TablePersonalisation.buildGroupedList(oList2, BridgeAttrs.BRIDGE_ATTRIBUTES, found.keys);
                    TablePersonalisation.updateGroupHeaders(oList2);
                    TablePersonalisation.updateStats(this.byId("colPickerStats"), oList2);
                }
            }
        },

        // ── Save Variant: open the name dialog (sap.m.MessageBox.prompt doesn't exist in UI5)
        onSaveVariant: function () {
            var oInput = this.byId("variantNameInput");
            var oBtn   = this.byId("btnConfirmSaveVariant");
            if (oInput) { oInput.setValue(""); oInput.setValueState("None"); }
            if (oBtn)   { oBtn.setEnabled(false); }

            // Pre-fill with selected variant name for easy overwrite
            var oVarSelect  = this.byId("colVariantSelect");
            var selectedKey = oVarSelect ? oVarSelect.getSelectedKey() : "";
            if (selectedKey && selectedKey !== TablePersonalisation.STANDARD_VARIANT) {
                if (oInput) { oInput.setValue(selectedKey); }
                if (oBtn)   { oBtn.setEnabled(true); }
            }

            var oDlg = this.byId("saveVariantDialog");
            if (oDlg) { oDlg.open(); }
        },

        // Enable/disable the Save button as the user types
        onVariantNameLiveChange: function (oEvent) {
            var val  = oEvent.getParameter("value") || "";
            var oBtn = this.byId("btnConfirmSaveVariant");
            if (oBtn) { oBtn.setEnabled(val.trim().length > 0); }
        },

        onConfirmSaveVariant: function () {
            var oInput = this.byId("variantNameInput");
            var name   = oInput ? oInput.getValue().trim() : "";
            if (!name) {
                if (oInput) { oInput.setValueState("Error"); oInput.setValueStateText("Please enter a name."); }
                return;
            }

            var oList       = this.byId("columnPickerList");
            var keys        = TablePersonalisation.getSelectedKeys(oList);
            var defaultKeys = BridgeAttrs.getDefaultVisibleColumns().map(function (a) { return a.key; });

            TablePersonalisation.saveVariant(this._VARIANT_KEY, name, keys);

            // Refresh the variant dropdown and select the newly saved variant
            var variants = TablePersonalisation.loadVariants(this._VARIANT_KEY);
            TablePersonalisation.populateVariantSelect(this.byId("colVariantSelect"), variants, keys, defaultKeys);
            this.byId("colVariantSelect").setSelectedKey(name);

            this.byId("saveVariantDialog").close();
            MessageToast.show("Variant \"" + name + "\" saved.");
        },

        onCancelSaveVariant: function () {
            this.byId("saveVariantDialog").close();
        },

        onDeleteVariant: function () {
            var that = this;
            var oSelect = this.byId("colVariantSelect");
            var selectedKey = oSelect ? oSelect.getSelectedKey() : null;
            if (!selectedKey || selectedKey === TablePersonalisation.STANDARD_VARIANT) {
                sap.m.MessageToast.show("Cannot delete the Standard variant.");
                return;
            }
            sap.m.MessageBox.confirm("Delete variant \"" + selectedKey + "\"?", {
                onClose: function (sAction) {
                    if (sAction !== sap.m.MessageBox.Action.OK) return;
                    TablePersonalisation.deleteVariant(that._VARIANT_KEY, selectedKey);
                    var variants    = TablePersonalisation.loadVariants(that._VARIANT_KEY);
                    var savedKeys   = that._getSavedColumnKeys();
                    var defaultKeys = BridgeAttrs.getDefaultVisibleColumns().map(function (a) { return a.key; });
                    TablePersonalisation.populateVariantSelect(that.byId("colVariantSelect"), variants, savedKeys, defaultKeys);
                    sap.m.MessageToast.show("Variant deleted.");
                }
            });
        },

        // ── VariantManagement (localStorage-based) ─────────────────────
        _VARIANT_KEY: "nhvr_bridge_variants",

        _loadVariants: function () {
            const oVM = this.byId("bridgeVariantMgmt");
            if (!oVM) return;
            try {
                const saved = JSON.parse(localStorage.getItem(this._VARIANT_KEY) || "[]");
                if (!Array.isArray(saved)) return;
                oVM.removeAllItems();
                saved.forEach(v => {
                    const oItem = new sap.m.VariantItem({
                        key    : v.key,
                        title  : v.title,
                        def    : !!v.def
                    });
                    oVM.addItem(oItem);
                    if (v.def) oVM.setDefaultKey(v.key);
                });
                // Apply default variant if present
                const defVariant = saved.find(v => v.def);
                if (defVariant && defVariant.state) {
                    this._applyVariantState(defVariant.state);
                }
            } catch (_) { /* localStorage unavailable */ }
        },

        onVariantSave: function (oEvent) {
            const name    = oEvent.getParameter("name");
            const key     = oEvent.getParameter("key") || "var_" + Date.now();
            const state   = this._captureVariantState();

            try {
                let variants = JSON.parse(localStorage.getItem(this._VARIANT_KEY) || "[]");
                const existing = variants.findIndex(v => v.key === key);
                const entry = { key, title: name || key, def: !!oEvent.getParameter("def"), state };
                if (existing >= 0) { variants[existing] = entry; }
                else               { variants.push(entry); }
                localStorage.setItem(this._VARIANT_KEY, JSON.stringify(variants));
                MessageToast.show(`View "${name}" saved`);
            } catch (_) { /* localStorage unavailable */ }
        },

        onVariantSelect: function (oEvent) {
            const key = oEvent.getParameter("key");
            try {
                const variants = JSON.parse(localStorage.getItem(this._VARIANT_KEY) || "[]");
                const v = variants.find(v => v.key === key);
                if (v && v.state) { this._applyVariantState(v.state); }
            } catch (_) { /* localStorage unavailable */ }
        },

        onVariantManage: function (oEvent) {
            // Handle renames/deletions from the Manage Variants dialog
            const renamed = oEvent.getParameter("renamed") || [];
            const deleted = oEvent.getParameter("deleted") || [];
            try {
                let variants = JSON.parse(localStorage.getItem(this._VARIANT_KEY) || "[]");
                deleted.forEach(k => { variants = variants.filter(v => v.key !== k); });
                renamed.forEach(r => {
                    const v = variants.find(v => v.key === r.key);
                    if (v) v.title = r.name;
                });
                localStorage.setItem(this._VARIANT_KEY, JSON.stringify(variants));
            } catch (_) { /* localStorage unavailable */ }
        },

        _captureVariantState: function () {
            // Fallbacks harmonised to "" for lookup-populated dropdowns
            // (filterState / Condition / Posting / Scour / RiskBand) so saved
            // Variant state round-trips correctly. filterNhvr + filterFreight
            // still use the "ALL" sentinel because their view items are
            // hardcoded with key="ALL" (tri-state ALL/YES/NO).
            return {
                search   : this.byId("searchField")    ? this.byId("searchField").getValue()        : "",
                state    : this.byId("filterState")    ? this.byId("filterState").getSelectedKey()  : "",
                cond     : this.byId("filterCondition")? this.byId("filterCondition").getSelectedKey():"",
                posting  : this.byId("filterPosting")  ? this.byId("filterPosting").getSelectedKey(): "",
                scour    : this.byId("filterScour")    ? this.byId("filterScour").getSelectedKey()  : "",
                nhvr     : this.byId("filterNhvr")     ? this.byId("filterNhvr").getSelectedKey()   : "ALL",
                freight  : this.byId("filterFreight")  ? this.byId("filterFreight").getSelectedKey(): "ALL",
                riskBand : this.byId("filterRiskBand") ? this.byId("filterRiskBand").getSelectedKey():"",
                sortField: this._sortField,
                sortDesc : this._sortDesc,
                advCriteria: JSON.parse(JSON.stringify(this._advCriteria || []))
            };
        },

        _applyVariantState: function (state) {
            if (!state) return;
            if (state.search  !== undefined) this.byId("searchField")    && this.byId("searchField").setValue(state.search);
            if (state.state   !== undefined) this.byId("filterState")    && this.byId("filterState").setSelectedKey(state.state);
            if (state.cond    !== undefined) this.byId("filterCondition")&& this.byId("filterCondition").setSelectedKey(state.cond);
            if (state.posting !== undefined) this.byId("filterPosting")  && this.byId("filterPosting").setSelectedKey(state.posting);
            if (state.scour   !== undefined) this.byId("filterScour")    && this.byId("filterScour").setSelectedKey(state.scour);
            if (state.nhvr    !== undefined) this.byId("filterNhvr")     && this.byId("filterNhvr").setSelectedKey(state.nhvr);
            if (state.freight !== undefined) this.byId("filterFreight")  && this.byId("filterFreight").setSelectedKey(state.freight);
            if (state.riskBand!== undefined) this.byId("filterRiskBand") && this.byId("filterRiskBand").setSelectedKey(state.riskBand);
            if (state.sortField)             { this._sortField = state.sortField; this._sortDesc = !!state.sortDesc; }
            if (Array.isArray(state.advCriteria)) { this._advCriteria = state.advCriteria; this._renderAdvCriteria(); }
            this._applyFiltersAndSort();
        },

        _onRouteMatched: function (e) {
            // ── Step 1: Clear previous filters ─────────────────────
            this._dashboardFilter = null;
            this._serverFilter    = null;   // OData $filter for server-side dashboard drill-downs
            this._hideDashFilterStrip();

            // ── Step 2: Check for map polygon selection ─────────────
            try {
                const mapSel = localStorage.getItem("nhvr_map_selection");
                if (mapSel) {
                    const sel = JSON.parse(mapSel);
                    if (sel.bridgeIds && sel.bridgeIds.length > 0 && (Date.now() - sel.setAt) < 300000) {
                        this._mapFilterIds = new Set(sel.bridgeIds);
                        localStorage.removeItem("nhvr_map_selection");
                        this._showMapFilterBanner(sel.bridgeIds.length);
                    }
                }
            } catch (_) { /* ignore localStorage errors */ }

            // ── Step 3: Parse query params BEFORE loading data ──────
            // This ensures _serverFilter is set before _loadBridges() fires,
            // so the OData request includes the correct $filter parameter
            // and counts match the dashboard KPI that also queries the server.
            const query = (e.getParameter("arguments") || {})["?query"] || {};

            if (query.bridgeId) {
                // Deep-link to a specific bridge — no server filter needed
                this._highlightId = query.bridgeId;
                const sf = this.byId("searchField");
                if (sf) sf.setValue(query.bridgeId);

            } else if (Object.keys(query).length > 0) {

                // ── Multi-value sentinel drill-downs: use server-side OData filter ──
                // IMPORTANT: Client-side _dashboardFilter on loaded subset caused
                // count mismatch (e.g., dashboard shows 13 via $count but list showed
                // only 7 because only 100 bridges were loaded).
                // Fix: send $filter to the server so ALL matching records are returned.

                if (query.postingStatus === "RESTRICTED") {
                    // All non-unrestricted posting statuses
                    this._serverFilter = "(postingStatus eq 'POSTED' or postingStatus eq 'CLOSED' or postingStatus eq 'RESTRICTED' or postingStatus eq 'WEIGHT_RESTRICTED' or postingStatus eq 'HEIGHT_RESTRICTED')";
                    this._showDashFilterStrip("Dashboard filter active: Restricted bridges (Posted or Closed). Clear to see all bridges.");

                } else if (query.condition === "HIGH_RISK") {
                    this._serverFilter = "(condition eq 'CRITICAL' or condition eq 'POOR')";
                    this._showDashFilterStrip("Dashboard filter active: High Risk bridges (Critical or Poor condition). Clear to see all bridges.");

                } else {
                    // Single-value filter params from dashboard — apply as server filter
                    // so count is always accurate, AND set dropdown for UI consistency.
                    const filterParts = [];

                    if (query.postingStatus) {
                        filterParts.push(`postingStatus eq '${query.postingStatus}'`);
                        const fp = this.byId("filterPosting");
                        if (fp) fp.setSelectedKey(query.postingStatus);
                    }
                    if (query.condition) {
                        filterParts.push(`condition eq '${query.condition}'`);
                        const fc = this.byId("filterCondition");
                        if (fc) fc.setSelectedKey(query.condition);
                    }
                    if (query.scourRisk) {
                        filterParts.push(`scourRisk eq '${query.scourRisk}'`);
                        const fs = this.byId("filterScour");
                        if (fs) fs.setSelectedKey(query.scourRisk);
                    }
                    if (query.nhvrAssessed === "true") {
                        filterParts.push("nhvrRouteAssessed eq true");
                        const fn = this.byId("filterNhvr");
                        if (fn) fn.setSelectedKey("YES");
                    }
                    if (query.freightRoute === "true") {
                        filterParts.push("freightRoute eq true");
                        const ff = this.byId("filterFreight");
                        if (ff) ff.setSelectedKey("YES");
                    }
                    if (query.overdueInspection === "true") {
                        // Filter by bridges needing inspection (inspectionDate older than 2 years)
                        const cutoff = new Date();
                        cutoff.setFullYear(cutoff.getFullYear() - 2);
                        filterParts.push(`inspectionDate le ${cutoff.toISOString().substring(0, 10)}`);
                        this._showDashFilterStrip("Dashboard filter active: Overdue inspections (> 2 years). Clear to see all bridges.");
                    }

                    if (filterParts.length > 0) {
                        this._serverFilter = filterParts.join(" and ");
                    }
                }

            } else {
                // No query params — restore saved filters from sessionStorage
                this._restoreFilters();
            }

            // ── Step 4: Reset pagination and load data with server filter ──
            this._currentSkip = 0;
            this._allBridges  = [];
            this._totalCount  = 0;
            this._loadBridges();

            // Show toast for bridge deep-link after data loads
            if (query.bridgeId) {
                setTimeout(() => MessageToast.show(`Showing bridge: ${query.bridgeId}`), 500);
            }
        },

        _showDashFilterStrip: function (text) {
            const s = this.byId("dashFilterStrip");
            if (s) { s.setText(text); s.setVisible(true); }
        },

        _hideDashFilterStrip: function () {
            const s = this.byId("dashFilterStrip");
            if (s) s.setVisible(false);
        },

        onDashFilterDismiss: function () {
            this._dashboardFilter = null;
            this._serverFilter    = null;   // also clear server filter so full dataset reloads
            this._hideDashFilterStrip();
            // Reload from server without any filter so counts are correct
            this._currentSkip = 0;
            this._allBridges  = [];
            this._totalCount  = 0;
            this._loadBridges();
        },

        _showMapFilterBanner: function (count) {
            const s = this.byId("mapFilterBanner");
            if (s) {
                s.setText("Map selection active: showing " + count + " bridge" + (count !== 1 ? "s" : "") + " from map polygon. Close to show all bridges.");
                s.setVisible(true);
            }
        },

        _hideMapFilterBanner: function () {
            const s = this.byId("mapFilterBanner");
            if (s) s.setVisible(false);
        },

        onClearMapFilter: function () {
            this._mapFilterIds = null;
            this._hideMapFilterBanner();
            this._applyFiltersAndSort();
        },

        _loadBridges: function () {
            const tbl = this.byId("bridgeTable");
            if (tbl) tbl.setBusy(true);

            const allKeys   = BridgeAttrs.BRIDGE_ATTRIBUTES.map(function(a) { return a.key; }).concat(["ID","routeCode","currentRiskBand","roadRoute"]);
            const selectStr = [...new Set(allKeys)].join(",");

            // Server-side filter (set by dashboard drill-down via _onRouteMatched)
            // This ensures both the count and the data use the same filter criteria,
            // fixing the mismatch where dashboard KPI showed 13 but list showed 7.
            const sfParam = this._serverFilter ? `&$filter=${encodeURIComponent(this._serverFilter)}` : "";

            // Fetch total count first (lightweight $top=0 with $count=true)
            const countUrl = `${BASE}/Bridges?$count=true&$top=0${sfParam}`;
            fetch(countUrl, _credOpts())
                .then(r => r.json())
                .then(j => {
                    this._totalCount = j["@odata.count"] || 0;
                    this._updateLoadMoreBar();
                })
                .catch(function (err) { Log.warning("[Bridges] count fetch failed", err); });

            // Fetch first page (with optional server filter)
            const firstUrl = `${BASE}/Bridges?$top=${this._pageSize}&$skip=0&$select=${selectStr}&$orderby=bridgeId${sfParam}`;
            fetch(firstUrl, _credOpts())
                .then(r => r.json())
                .then(j => {
                    this._allBridges  = j.value || [];
                    this._currentSkip = this._allBridges.length;
                    this._mergeDynAttrValues(this._allBridges);
                    this._applyFiltersAndSort();
                    this._updateKpis(this._allBridges);
                    this._updateLoadMoreBar();
                    if (tbl) tbl.setBusy(false);
                })
                .catch(e => {
                    Log.error("[Bridges] Bridge load failed", e);
                    if (tbl) tbl.setBusy(false);
                });
        },

        /** Fetch BridgeAttribute values for loaded bridges and merge as attr_{name} properties */
        _mergeDynAttrValues: function (bridges) {
            if (!bridges || bridges.length === 0 || !this._dynAttrDefs || this._dynAttrDefs.length === 0) return;
            var ids = bridges.map(b => b.ID).filter(Boolean);
            if (ids.length === 0) return;
            var filterParts = ids.map(id => "bridge_ID eq '" + id + "'");
            // Batch in groups of 20 to avoid URL length limits
            var batchSize = 20;
            var that = this;
            for (var i = 0; i < filterParts.length; i += batchSize) {
                var batch = filterParts.slice(i, i + batchSize);
                var url = BASE + "/BridgeAttributes?$filter=(" + batch.join(" or ") + ")&$expand=attribute($select=name)&$select=bridge_ID,value";
                fetch(url, _credOpts())
                    .then(function (r) { return r.ok ? r.json() : { value: [] }; })
                    .then(function (j) {
                        // Build lookup: bridge_ID → { attrName: value }
                        var lookup = {};
                        (j.value || []).forEach(function (ba) {
                            var bId = ba.bridge_ID;
                            var name = ba.attribute && ba.attribute.name;
                            if (bId && name) {
                                if (!lookup[bId]) lookup[bId] = {};
                                lookup[bId][name] = ba.value;
                            }
                        });
                        // Merge into bridge objects
                        that._allBridges.forEach(function (b) {
                            var attrs = lookup[b.ID] || {};
                            Object.keys(attrs).forEach(function (name) {
                                b["attr_" + name] = attrs[name];
                            });
                        });
                        // Refresh model to show merged values
                        that._applyFiltersAndSort();
                    })
                    .catch(function (err) { Log.warning("[Bridges] dynamic attribute merge failed", err); });
            }
        },

        _loadMoreBridges: function () {
            if (this._currentSkip >= this._totalCount && this._totalCount > 0) { return; }
            const tbl = this.byId("bridgeTable");
            if (tbl) tbl.setBusy(true);
            const btn = this.byId("btnLoadMore");
            if (btn) btn.setEnabled(false);

            const allKeys   = BridgeAttrs.BRIDGE_ATTRIBUTES.map(function(a) { return a.key; }).concat(["ID","routeCode","currentRiskBand","roadRoute"]);
            const selectStr = [...new Set(allKeys)].join(",");
            const sfParam   = this._serverFilter ? `&$filter=${encodeURIComponent(this._serverFilter)}` : "";
            const url = `${BASE}/Bridges?$top=${this._pageSize}&$skip=${this._currentSkip}&$select=${selectStr}&$orderby=bridgeId${sfParam}`;

            fetch(url, _credOpts())
                .then(r => r.json())
                .then(j => {
                    const page = j.value || [];
                    this._allBridges = this._allBridges.concat(page);
                    this._currentSkip = this._allBridges.length;
                    this._applyFiltersAndSort();
                    this._updateKpis(this._allBridges);
                    this._updateLoadMoreBar();
                    if (tbl) tbl.setBusy(false);
                    if (btn) btn.setEnabled(true);
                    MessageToast.show(`Loaded ${this._allBridges.length} of ${this._totalCount} bridges`);
                })
                .catch(e => {
                    Log.error("[Bridges] Load more failed", e);
                    if (tbl) tbl.setBusy(false);
                    if (btn) btn.setEnabled(true);
                });
        },

        onLoadMoreBridges: function () {
            this._loadMoreBridges();
        },

        _updateLoadMoreBar: function () {
            const infoCtrl = this.byId("loadMoreInfo");
            const btnCtrl  = this.byId("btnLoadMore");
            const barCtrl  = this.byId("loadMoreBar");
            const loaded   = this._allBridges.length;
            const total    = this._totalCount;

            if (infoCtrl) {
                infoCtrl.setText(total > 0 ? `Showing ${loaded} of ${total}` : `Showing ${loaded}`);
            }
            const hasMore = total > 0 && loaded < total;
            if (btnCtrl) btnCtrl.setVisible(hasMore);
            if (barCtrl) barCtrl.setVisible(true);
        },

        _updateKpis: function (bridges) {
            const loaded   = bridges.length;
            const total    = this._totalCount > 0 ? this._totalCount : loaded;
            const closed   = bridges.filter(b => b.postingStatus === "CLOSED").length;
            const posted   = bridges.filter(b => b.postingStatus === "POSTED").length;
            const critical = bridges.filter(b => b.condition === "CRITICAL").length;
            const scour    = bridges.filter(b => b.scourRisk === "CRITICAL" || b.scourRisk === "HIGH").length;
            const nhvr     = bridges.filter(b => b.nhvrRouteAssessed).length;

            const totalLabel = this._totalCount > 0 && loaded < this._totalCount
                ? `${loaded} of ${total} Loaded`
                : `${loaded} Total`;
            this._setStatus("kpiTotal",    totalLabel);
            this._setStatus("kpiClosed",   `${closed} Closed`);
            this._setStatus("kpiPosted",   `${posted} Posted`);
            this._setStatus("kpiCritical", `${critical} Critical`);
            this._setStatus("kpiScour",    `${scour} High Scour Risk`);
            this._setStatus("kpiNhvr",     `${nhvr} NHVR Assessed`);
        },

        _setStatus: function (id, text) {
            const ctrl = this.byId(id);
            if (ctrl) ctrl.setText(text);
        },

        // ── ALV Toolbar overrides ──────────────────────────────
        // Delegate to existing specialist export methods so behaviour stays identical;
        // the toolbar buttons just call the standard ALV handler names.
        onAlvExportExcel: function () { this.onExportBridges(); },
        onAlvExportCsv:   function () { this.onExportCsvOpen(); },
        onAlvRefresh:     function () { this.onRefresh(); },

        _applyFiltersAndSort: function () {
            let data = this._allBridges || [];
            const search  = this.byId("searchField")    ? this.byId("searchField").getValue().toLowerCase() : "";
            const state   = this.byId("filterState")    ? this.byId("filterState").getSelectedKey()         : "";
            const cond    = this.byId("filterCondition") ? this.byId("filterCondition").getSelectedKey()    : "";
            const posting = this.byId("filterPosting")  ? this.byId("filterPosting").getSelectedKey()       : "";
            const scour   = this.byId("filterScour")    ? this.byId("filterScour").getSelectedKey()         : "";
            const nhvr     = this.byId("filterNhvr")      ? this.byId("filterNhvr").getSelectedKey()      : "ALL";
            const freight  = this.byId("filterFreight")  ? this.byId("filterFreight").getSelectedKey()   : "ALL";
            const riskBand = this.byId("filterRiskBand") ? this.byId("filterRiskBand").getSelectedKey()  : "";

            if (search) data = data.filter(b =>
                (b.bridgeId  || "").toLowerCase().includes(search) ||
                (b.name      || "").toLowerCase().includes(search) ||
                (b.routeCode || "").toLowerCase().includes(search) ||
                (b.lga       || "").toLowerCase().includes(search)
            );
            if (state)   data = data.filter(b => b.state === state);
            if (cond)    data = data.filter(b => (b.condition || "").toUpperCase() === cond);
            if (posting) data = data.filter(b => b.postingStatus === posting);
            if (scour)   data = data.filter(b => b.scourRisk === scour);
            if (nhvr    === "YES") data = data.filter(b => b.nhvrRouteAssessed);
            if (nhvr    === "NO")  data = data.filter(b => !b.nhvrRouteAssessed);
            if (freight === "YES") data = data.filter(b => b.freightRoute);
            if (freight === "NO")  data = data.filter(b => !b.freightRoute);
            if (riskBand) data = data.filter(b => (b.currentRiskBand || "") === riskBand);

            // Apply multi-value dashboard filter (RESTRICTED, HIGH_RISK sentinels)
            if (this._dashboardFilter) data = data.filter(this._dashboardFilter);

            // Apply map polygon selection filter
            if (this._mapFilterIds && this._mapFilterIds.size > 0) {
                data = data.filter(b => this._mapFilterIds.has(b.ID));
            }

            // Apply registry-based advanced filters
            if (this._registryFilters) {
                Object.entries(this._registryFilters).forEach(([key, val]) => {
                    if (!val) return;
                    var attr = BridgeAttrs.BRIDGE_ATTRIBUTES.find(function(a) { return a.key === key; });
                    if (!attr) return;
                    if (attr.filterType === "multi-select" && Array.isArray(val) && val.length) {
                        data = data.filter(b => val.includes(b[key]));
                    } else if (attr.filterType === "range") {
                        if (val.min !== undefined) data = data.filter(b => (b[key] || 0) >= val.min);
                        if (val.max !== undefined) data = data.filter(b => (b[key] || 0) <= val.max);
                    } else if (attr.filterType === "boolean-toggle" && val !== "ANY") {
                        data = data.filter(b => !!b[key] === (val === "YES"));
                    } else if (attr.filterType === "contains-search" && val.length >= 1) {
                        data = data.filter(b => (b[key] || "").toLowerCase().includes(val.toLowerCase()));
                    } else if (attr.filterType === "fulltext-search" && val.length >= 3) {
                        data = data.filter(b => (b[key] || "").toLowerCase().includes(val.toLowerCase()));
                    }
                });
            }

            // Sort
            if (this._sortField) {
                const field = this._sortField;
                const desc  = this._sortDesc;
                data = [...data].sort((a, b) => {
                    const av = a[field] || "";
                    const bv = b[field] || "";
                    const cmp = String(av).localeCompare(String(bv), undefined, { numeric: true });
                    return desc ? -cmp : cmp;
                });
            }

            this._model.setProperty("/items", data);
            const title = this.byId("tableTitle");
            if (title) title.setText(`Bridges (${data.length})`);
            // ALV record count (shows filtered vs. total loaded)
            this._alvUpdateCount(this._allBridges.length, data.length);

            this._updateFilterChips();

            // Save to sessionStorage for persistence
            try {
                sessionStorage.setItem("nhvr_bridge_filters", JSON.stringify({
                    search, state, cond, posting, scour, nhvr, freight, riskBand,
                    sortField: this._sortField, sortDesc: this._sortDesc
                }));
            } catch(e) { /* sessionStorage unavailable */ }
        },

        // ── Event handlers ─────────────────────────────────────
        onSearch:       function () { this._applyFiltersAndSort(); },
        onLiveSearch:   function () { this._applyFiltersAndSort(); },
        onFilterChange: function () { this._applyFiltersAndSort(); },

        onClearFilters: function () {
            this.byId("searchField")    && this.byId("searchField").setValue("");
            this.byId("filterState")    && this.byId("filterState").setSelectedKey("ALL");
            this.byId("filterCondition") && this.byId("filterCondition").setSelectedKey("ALL");
            this.byId("filterPosting")  && this.byId("filterPosting").setSelectedKey("ALL");
            this.byId("filterScour")    && this.byId("filterScour").setSelectedKey("ALL");
            this.byId("filterNhvr")      && this.byId("filterNhvr").setSelectedKey("ALL");
            this.byId("filterFreight")   && this.byId("filterFreight").setSelectedKey("ALL");
            this.byId("filterRiskBand")  && this.byId("filterRiskBand").setSelectedKey("ALL");
            this._highlightId = null;
            this._sortField   = null;
            this._sortDesc    = false;
            this._dashboardFilter = null;
            this._registryFilters = null;
            this._mapFilterIds = null;
            this._hideDashFilterStrip();
            this._hideMapFilterBanner();
            try { sessionStorage.removeItem("nhvr_bridge_filters"); } catch(e) { /* sessionStorage unavailable */ }
            this._applyFiltersAndSort();
        },

        _restoreFilters: function () {
            try {
                const saved = JSON.parse(sessionStorage.getItem("nhvr_bridge_filters") || "{}");
                if (saved.search)  { this.byId("searchField")    && this.byId("searchField").setValue(saved.search); }
                if (saved.state)   { this.byId("filterState")    && this.byId("filterState").setSelectedKey(saved.state); }
                if (saved.cond)    { this.byId("filterCondition") && this.byId("filterCondition").setSelectedKey(saved.cond); }
                if (saved.posting) { this.byId("filterPosting")  && this.byId("filterPosting").setSelectedKey(saved.posting); }
                if (saved.scour)   { this.byId("filterScour")    && this.byId("filterScour").setSelectedKey(saved.scour); }
                if (saved.nhvr)     { this.byId("filterNhvr")     && this.byId("filterNhvr").setSelectedKey(saved.nhvr); }
                if (saved.freight)  { this.byId("filterFreight")  && this.byId("filterFreight").setSelectedKey(saved.freight); }
                if (saved.riskBand) { this.byId("filterRiskBand") && this.byId("filterRiskBand").setSelectedKey(saved.riskBand); }
                if (saved.sortField) { this._sortField = saved.sortField; this._sortDesc = saved.sortDesc; }
                this._applyFiltersAndSort();
            } catch(e) { jQuery.sap.log.error("[NHVR] Filter restore failed", e && e.message || String(e)); }
        },

        onSortBridges: function () {
            this.byId("sortDialog").open();
        },

        onSortConfirm: function (e) {
            const params = e.getParameters();
            this._sortField = params.sortItem ? params.sortItem.getKey() : null;
            this._sortDesc  = params.sortDescending || false;
            this._applyFiltersAndSort();
        },

        onRefresh: function () {
            this._currentSkip = 0;
            this._allBridges  = [];
            this._totalCount  = 0;
            this._loadBridges();
            MessageToast.show("Bridge data refreshed");
        },

        onBridgePress: function (e) {
            const ctx    = e.getSource().getBindingContext("bridges");
            const bridge = ctx.getObject();
            this.getOwnerComponent().getRouter().navTo("BridgeDetail", {
                bridgeId: encodeURIComponent(bridge.bridgeId)
            });
        },

        // Deep-link handler: clicking Bridge ID link navigates and updates URL hash
        onBridgeIdPress: function (e) {
            e.preventDefault();
            const ctx    = e.getSource().getBindingContext("bridges");
            const bridge = ctx.getObject();
            this.getOwnerComponent().getRouter().navTo("BridgeDetail", {
                bridgeId: encodeURIComponent(bridge.bridgeId)
            });
        },

        // sap.ui.table.Table cellClick — navigate to bridge detail on row click
        // (Link press in bridgeId column is handled by onBridgeIdPress directly)
        // Use rowIndex + table binding to resolve correct bridge (avoids stale rowBindingContext)
        onBridgeCellClick: function (oEvent) {
            var iRowIndex = oEvent.getParameter("rowIndex");
            var oTable    = this.byId("bridgeTable");
            if (iRowIndex < 0 || !oTable) { return; }
            var oBinding  = oTable.getBinding("rows");
            if (!oBinding) { return; }
            var aContexts = oBinding.getContexts(iRowIndex, 1);
            var oCtx      = aContexts && aContexts[0];
            if (!oCtx) { return; }
            var oData = oCtx.getObject();
            if (oData && oData.bridgeId) {
                this.getOwnerComponent().getRouter().navTo("BridgeDetail", {
                    bridgeId: encodeURIComponent(oData.bridgeId)
                });
            }
        },

        // sap.ui.table.Table column header sort handler
        onBridgeColumnSort: function () {
            // Built-in column sort behaviour handled by sap.ui.table.Table
        },

        // AND/OR logic mode change
        onAdvLogicChange: function () {
            // No immediate action — mode is read on Apply
        },

        // ── Multi-select → View on Map ──────────────────────────
        // sap.ui.table.Table rowSelectionChange handler
        onSelectionChange: function () {
            const table    = this.byId("bridgeTable");
            const indices  = table.getSelectedIndices();
            const btn      = this.byId("btnViewOnMap");
            if (btn) {
                btn.setVisible(indices.length > 0);
                if (indices.length > 0) {
                    btn.setText("View on Map (" + indices.length + ")");
                }
            }
        },

        onViewOnMap: function () {
            const table   = this.byId("bridgeTable");
            const indices = table.getSelectedIndices();
            if (indices.length === 0) {
                MessageToast.show("Select one or more bridges first");
                return;
            }
            const binding = table.getBinding("rows");
            const ids = indices.map(function(idx) {
                var ctx = binding.getContexts(idx, 1)[0];
                return ctx ? ctx.getObject().bridgeId : null;
            }).filter(Boolean).join(",");

            this.getOwnerComponent().getRouter().navTo("MapView", {
                "?query": { bridgeIds: ids }
            });
        },

        onAddBridge: function () {
            this.getOwnerComponent().getRouter().navTo("BridgeNew");
        },

        // Column personalisation is handled by onOpenTableSettings (custom column picker dialog)

        // ── Navigation ─────────────────────────────────────────
        onNavHome:      function () { this._navTo("Home"); },
        onNavToMap:     function () { this._navTo("MapView"); },
        onNavToReports: function () { this._navTo("Reports"); },

        _navTo: function (routeName, params) {
            this.getOwnerComponent().getRouter().navTo(routeName, params || {});
        },

        // ═══════════════════════════════════════════════════════════
        // ADVANCED FILTER
        // ═══════════════════════════════════════════════════════════
        _advCriteria: [],
        _filterPresets: [],

        // Available filterable fields
        _filterFields: [
            { key: "state",            label: "State",                type: "select",  options: ["NSW","VIC","QLD","WA","SA","TAS","ACT","NT"] },
            { key: "condition",        label: "Condition",            type: "select",  options: ["GOOD","FAIR","POOR","CRITICAL"] },
            { key: "postingStatus",    label: "Posting Status",       type: "select",  options: ["UNRESTRICTED","POSTED","CLOSED"] },
            { key: "scourRisk",        label: "Scour Risk",           type: "select",  options: ["LOW","MEDIUM","HIGH","CRITICAL"] },
            { key: "structureType",    label: "Structure Type",       type: "text" },
            { key: "assetOwner",       label: "Asset Owner",          type: "text" },
            { key: "lga",              label: "LGA",                  type: "text" },
            { key: "region",           label: "Region",               type: "text" },
            { key: "yearBuilt",        label: "Year Built",           type: "number" },
            { key: "conditionRating",  label: "Condition Rating",     type: "number" },
            { key: "clearanceHeightM", label: "Clearance Height (m)", type: "number" },
            { key: "spanLengthM",      label: "Span Length (m)",      type: "number" },
            { key: "widthM",           label: "Width (m)",            type: "number" },
            { key: "aadtVehicles",     label: "AADT Vehicles",        type: "number" },
            { key: "nhvrRouteAssessed",label: "NHVR Assessed",        type: "boolean" },
            { key: "freightRoute",     label: "Freight Route",        type: "boolean" },
            { key: "overMassRoute",    label: "Over Mass Route",      type: "boolean" },
            { key: "floodImpacted",    label: "Flood Impacted",       type: "boolean" },
            { key: "highPriorityAsset",label: "High Priority",        type: "boolean" },
            { key: "material",         label: "Material",             type: "text" },
            { key: "designLoad",       label: "Design Load",          type: "text" },
            { key: "maintenanceAuthority", label: "Maintenance Authority", type: "text" }
        ],

        onAddFilterCriteria: function () {
            this._advCriteria.push({ field: "condition", operator: "eq", value: "" });
            this._renderAdvCriteria();
        },

        _renderAdvCriteria: function () {
            const container = this.byId("advFilterCriteria");
            if (!container) return;
            container.destroyItems();

            this._advCriteria.forEach((crit, idx) => {
                const fieldSelect = new sap.m.Select({
                    width: "200px",
                    selectedKey: crit.field,
                    change: (e) => {
                        const oSel = e.getParameter("selectedItem");
                        if (!oSel) return;
                        this._advCriteria[idx].field = oSel.getKey();
                        this._advCriteria[idx].value = "";
                        this._renderAdvCriteria();
                    }
                });
                this._filterFields.forEach(f => {
                    fieldSelect.addItem(new sap.ui.core.Item({ key: f.key, text: f.label }));
                });

                const fieldDef = this._filterFields.find(f => f.key === crit.field) || { type: "text" };

                const opSelect = new sap.m.Select({
                    width: "130px",
                    selectedKey: crit.operator,
                    change: (e) => { const oSel = e.getParameter("selectedItem"); if (!oSel) return; this._advCriteria[idx].operator = oSel.getKey(); }
                });
                const ops = fieldDef.type === "number"
                    ? [["eq","="],["gt",">"],["lt","<"],["gte","≥"],["lte","≤"],["ne","≠"]]
                    : [["eq","equals"],["ne","not equals"],["contains","contains"],["startswith","starts with"]];
                ops.forEach(([k,t]) => opSelect.addItem(new sap.ui.core.Item({ key: k, text: t })));

                let valueControl;
                if (fieldDef.type === "select") {
                    valueControl = new sap.m.Select({ width: "180px", selectedKey: crit.value,
                        change: (e) => { const oSel = e.getParameter("selectedItem"); if (!oSel) return; this._advCriteria[idx].value = oSel.getKey(); }
                    });
                    valueControl.addItem(new sap.ui.core.Item({ key: "", text: "— Any —" }));
                    (fieldDef.options || []).forEach(o => valueControl.addItem(new sap.ui.core.Item({ key: o, text: o })));
                    valueControl.setSelectedKey(crit.value || "");
                } else if (fieldDef.type === "boolean") {
                    valueControl = new sap.m.Select({ width: "120px", selectedKey: String(crit.value),
                        change: (e) => { const oSel = e.getParameter("selectedItem"); if (!oSel) return; this._advCriteria[idx].value = oSel.getKey() === "true"; }
                    });
                    valueControl.addItem(new sap.ui.core.Item({ key: "true",  text: "Yes" }));
                    valueControl.addItem(new sap.ui.core.Item({ key: "false", text: "No"  }));
                } else if (fieldDef.key === "bridgeId") {
                    // Bridge ID field — show search help popup to browse/select a bridge
                    valueControl = new sap.m.Input({
                        width: "200px",
                        value: crit.value,
                        placeholder: "e.g. BRG-NSW001-001",
                        showSuggestion: true,
                        showValueHelp: true,
                        valueHelpIconSrc: "sap-icon://search",
                        liveChange: (e) => {
                            this._advCriteria[idx].value = e.getParameter("value");
                            // Live suggestions from loaded bridge data
                            var query = (e.getParameter("value") || "").toLowerCase();
                            var vc = e.getSource();
                            vc.destroySuggestionItems();
                            if (query.length >= 1) {
                                (this._allBridges || [])
                                    .filter(b => b.bridgeId && b.bridgeId.toLowerCase().indexOf(query) >= 0)
                                    .slice(0, 10)
                                    .forEach(b => {
                                        vc.addSuggestionItem(new sap.ui.core.Item({
                                            key: b.bridgeId,
                                            text: b.bridgeId + (b.name ? "  ·  " + b.name : "")
                                        }));
                                    });
                            }
                        },
                        suggestionItemSelected: (e) => {
                            var item = e.getParameter("selectedItem");
                            if (item) { this._advCriteria[idx].value = item.getKey(); }
                        },
                        valueHelpRequest: () => {
                            this._openBridgePicker(idx, "bridgeId");
                        }
                    });
                } else if (fieldDef.key === "name") {
                    // Bridge Name field — suggestions from loaded data
                    valueControl = new sap.m.Input({
                        width: "200px",
                        value: crit.value,
                        placeholder: "Type bridge name…",
                        showSuggestion: true,
                        liveChange: (e) => {
                            this._advCriteria[idx].value = e.getParameter("value");
                            var query = (e.getParameter("value") || "").toLowerCase();
                            var vc = e.getSource();
                            vc.destroySuggestionItems();
                            if (query.length >= 2) {
                                (this._allBridges || [])
                                    .filter(b => b.name && b.name.toLowerCase().indexOf(query) >= 0)
                                    .slice(0, 10)
                                    .forEach(b => {
                                        vc.addSuggestionItem(new sap.ui.core.Item({
                                            key: b.name,
                                            text: b.name + (b.bridgeId ? "  ·  " + b.bridgeId : "")
                                        }));
                                    });
                            }
                        },
                        suggestionItemSelected: (e) => {
                            var item = e.getParameter("selectedItem");
                            if (item) { this._advCriteria[idx].value = item.getKey(); }
                        }
                    });
                } else {
                    valueControl = new sap.m.Input({ width: "180px", value: crit.value,
                        liveChange: (e) => { this._advCriteria[idx].value = e.getParameter("value"); }
                    });
                }

                const removeBtn = new sap.m.Button({
                    icon: "sap-icon://decline", type: "Transparent",
                    tooltip: "Remove this criteria",
                    press: () => { this._advCriteria.splice(idx, 1); this._renderAdvCriteria(); }
                });

                container.addItem(new sap.m.HBox({
                    alignItems: "Center",
                    items: [fieldSelect, new sap.m.Text({ text: " ", width: "8px" }), opSelect,
                            new sap.m.Text({ text: " ", width: "8px" }), valueControl,
                            new sap.m.Text({ text: " ", width: "8px" }), removeBtn]
                }).addStyleClass("sapUiTinyMarginBottom"));
            });
        },

        onApplyAdvancedFilter: function () {
            const activeCriteria = this._advCriteria.filter(c =>
                c.field && (c.value !== "" && c.value !== null && c.value !== undefined));
            if (activeCriteria.length === 0) {
                this._applyFiltersAndSort();
                return;
            }

            // Read AND/OR mode from SegmentedButton
            const logicBtn = this.byId("advLogicMode");
            const logicMode = logicBtn ? (logicBtn.getSelectedItem() ?
                logicBtn.getSelectedItem().getKey() : "AND") : "AND";

            const _matchCriterion = (b, crit) => {
                const bv = b[crit.field];
                const val = crit.value;
                const op  = crit.operator || "eq";
                if (bv === null || bv === undefined) return false;
                switch (op) {
                    case "eq":         return typeof bv === "boolean"
                                            ? bv === val
                                            : String(bv).toLowerCase() === String(val).toLowerCase();
                    case "ne":         return String(bv).toLowerCase() !== String(val).toLowerCase();
                    case "contains":   return String(bv).toLowerCase().includes(String(val).toLowerCase());
                    case "startswith": return String(bv).toLowerCase().startsWith(String(val).toLowerCase());
                    case "gt":         return parseFloat(bv)  > parseFloat(val);
                    case "lt":         return parseFloat(bv)  < parseFloat(val);
                    case "gte":        return parseFloat(bv) >= parseFloat(val);
                    case "lte":        return parseFloat(bv) <= parseFloat(val);
                    default:           return true;
                }
            };

            let data = this._allBridges || [];
            if (logicMode === "AND") {
                // All criteria must match
                data = data.filter(b => activeCriteria.every(c => _matchCriterion(b, c)));
            } else {
                // Any criterion must match
                data = data.filter(b => activeCriteria.some(c => _matchCriterion(b, c)));
            }

            this._model.setProperty("/items", data);
            const title = this.byId("tableTitle");
            if (title) title.setText(`Bridges (${data.length}) — ${logicMode} Filter Active`);
            MessageToast.show(`${logicMode} filter: ${data.length} bridge${data.length !== 1 ? "s" : ""} matched`);
        },

        onClearAdvancedFilter: function () {
            this._advCriteria = [];
            this._renderAdvCriteria();
            this._applyFiltersAndSort();
        },

        // ── Bridge Picker (Value Help Dialog for Advanced Filter) ─

        /**
         * Open the bridge picker dialog.
         * @param {number} criteriaIdx  index into this._advCriteria to set after selection
         * @param {string} fieldKey     "bridgeId" or "name" — determines what value is stored
         */
        _openBridgePicker: function (criteriaIdx, fieldKey) {
            this._bridgePickerCriteriaIdx = criteriaIdx;
            this._bridgePickerFieldKey    = fieldKey || "bridgeId";

            var oDialog = this.byId("bridgePickerDialog");
            var oList   = this.byId("bridgePickerList");
            var oSearch = this.byId("bridgePickerSearch");
            if (!oDialog || !oList) { return; }

            // Reset search
            if (oSearch) { oSearch.setValue(""); }
            this._populateBridgePicker("");
            oDialog.open();
        },

        _populateBridgePicker: function (query) {
            var oList = this.byId("bridgePickerList");
            if (!oList) { return; }
            oList.destroyItems();
            var q = (query || "").toLowerCase();
            var data = (this._allBridges || []).filter(function (b) {
                if (!q) { return true; }
                return (b.bridgeId && b.bridgeId.toLowerCase().indexOf(q) >= 0) ||
                       (b.name    && b.name.toLowerCase().indexOf(q) >= 0);
            }).slice(0, 50);

            data.forEach(function (b) {
                oList.addItem(new sap.m.StandardListItem({
                    title      : b.bridgeId || "",
                    description: b.name || "",
                    icon       : "sap-icon://bridge"
                }));
            });

            if (data.length === 0) {
                oList.addItem(new sap.m.StandardListItem({
                    title      : "No bridges found",
                    description: "Try a different search term",
                    icon       : "sap-icon://search"
                }));
            }
        },

        onBridgePickerSearch: function (oEvent) {
            var query = oEvent.getParameter("query") || oEvent.getParameter("newValue") || "";
            this._populateBridgePicker(query);
        },

        onBridgePickerSelect: function (oEvent) {
            // Allow single-click confirm without pressing Select button
            var item = oEvent.getParameter("listItem");
            if (item) { this._selectedBridgePickerItem = item; }
        },

        onBridgePickerConfirm: function () {
            var oList = this.byId("bridgePickerList");
            var item  = oList ? oList.getSelectedItem() : null;
            if (!item) {
                sap.m.MessageToast.show("Please select a bridge first.");
                return;
            }
            var idx      = this._bridgePickerCriteriaIdx;
            var fieldKey = this._bridgePickerFieldKey;
            var value    = fieldKey === "name" ? item.getDescription() : item.getTitle();

            if (idx !== undefined && idx >= 0 && this._advCriteria[idx]) {
                this._advCriteria[idx].value = value;
                this._renderAdvCriteria();
            }
            this.byId("bridgePickerDialog").close();
        },

        onBridgePickerCancel: function () {
            this.byId("bridgePickerDialog").close();
        },

        onSaveFilterPreset: function () {
            if (this._advCriteria.length === 0) { sap.m.MessageToast.show("Add criteria before saving"); return; }
            sap.m.MessageBox.prompt("Enter a name for this filter preset:", {
                title: "Save Filter Preset",
                onClose: (action, value) => {
                    if (action !== sap.m.MessageBox.Action.OK || !value) return;
                    const criteria = JSON.parse(JSON.stringify(this._advCriteria));
                    this._filterPresets.push({ name: value, criteria: criteria });
                    try { localStorage.setItem("nhvr_bridge_filter_presets", JSON.stringify(this._filterPresets)); } catch(_) { /* localStorage unavailable */ }
                    // v4.7.6: dual-write into shared NamedViews store for cross-module visibility
                    try {
                        sap.ui.require(["nhvr/bridgemanagement/util/NamedViews"], function (NamedViews) {
                            NamedViews.save(NamedViews.MODULES.BRIDGES, value, { criteria: criteria });
                        });
                    } catch (_) { /* ignore */ }
                    this._renderPresets();
                    sap.m.MessageToast.show("Preset saved: " + value);
                }
            });
        },

        _renderPresets: function () {
            const box = this.byId("filterPresetsBox");
            if (!box) return;
            // Remove old preset buttons (keep Label at index 0)
            while (box.getItems().length > 1) box.removeItem(box.getItems()[box.getItems().length - 1]);
            box.setVisible(this._filterPresets.length > 0);
            this._filterPresets.forEach((preset, idx) => {
                box.addItem(new sap.m.Button({
                    text: preset.name, type: "Ghost",
                    press: () => {
                        this._advCriteria = JSON.parse(JSON.stringify(preset.criteria));
                        this._renderAdvCriteria();
                        this.onApplyAdvancedFilter();
                    }
                }).addStyleClass("sapUiTinyMarginEnd"));
            });
        },

        // Load filterEnabled dynamic attribute definitions and append to _filterFields
        _loadDynamicAttrFields: function () {
            fetch(`${BASE}/AttributeDefinitions?$filter=isActive eq true and filterEnabled eq true and entityTarget eq 'BRIDGE'&$select=name,label,dataType&$orderby=displayOrder`, {
                headers: { Accept: "application/json" }
            })
            .then(r => r.ok ? r.json() : { value: [] })
            .then(j => {
                (j.value || []).forEach(attr => {
                    // Avoid duplicates
                    if (this._filterFields.some(f => f.key === `attr_${attr.name}`)) return;
                    const type = attr.dataType === "INTEGER" || attr.dataType === "DECIMAL" ? "number"
                               : attr.dataType === "BOOLEAN" ? "boolean" : "text";
                    this._filterFields.push({
                        key   : `attr_${attr.name}`,   // prefix to distinguish from native fields
                        label : `[Custom] ${attr.label}`,
                        type  : type,
                        isDynamic: true,
                        attrName : attr.name
                    });
                });
            })
            .catch(function (err) { Log.warning("[Bridges] dynamic filter field load failed", err); });
        },

        onExportBridges: function () {
            UserAnalytics.trackAction("export_bridges", "Bridges");
            const items = this._model.getProperty("/items") || [];
            ExcelExport.export({
                fileName: "NHVR_Bridges_" + new Date().toISOString().slice(0, 10),
                columns : ExcelExport.BridgeColumns,
                data    : items
            });
        },

        // ── CSV Export Dialog ─────────────────────────────────────
        onExportCsvOpen: function (oEvent) {
            var oDialog = this.byId("csvExportDialog");
            if (oDialog) {
                oDialog.open();
            }
        },

        onCloseCsvExportDialog: function () {
            var oDialog = this.byId("csvExportDialog");
            if (oDialog) {
                oDialog.close();
            }
        },

        onExportCsvDownload: function () {
            var items = this._model.getProperty("/items") || [];
            var oScopeGroup = this.byId("csvExportScope");
            var useAllCols = oScopeGroup ? oScopeGroup.getSelectedIndex() === 1 : false;
            var oHelpRow = this.byId("cbIncludeHelpRow");
            var includeHelpRow = oHelpRow ? oHelpRow.getSelected() : false;
            var visibleKeys = useAllCols
                ? BridgeAttrs.BRIDGE_ATTRIBUTES.map(function(a) { return a.key; })
                : (this._visibleColumnKeys || BridgeAttrs.getDefaultVisibleColumns().map(function(a) { return a.key; }));
            CsvExport.exportBridges(items, { visibleKeys: visibleKeys, includeHelpRow: includeHelpRow });
            this.onCloseCsvExportDialog();
        },

        // ── Template Download ─────────────────────────────────────
        onDownloadBridgeTemplate: function () {
            CsvTemplate.downloadBridgeTemplate({ requiredOnly: false });
        },

        onDownloadRequiredTemplate: function () {
            CsvTemplate.downloadBridgeTemplate({ requiredOnly: true });
        },

        // ── Bulk Upload Wizard ────────────────────────────────────
        onOpenBulkUpload: function () {
            // Defense-in-depth role check
            var oUiModel = this.getView().getModel("ui");
            if (oUiModel && !oUiModel.getProperty("/canUpload")) {
                sap.m.MessageToast.show("You need BridgeManager or Admin role to upload bridges.");
                return;
            }
            var oDialog = this.byId("bulkUploadDialog");
            if (!oDialog) {
                return;
            }
            // Reset wizard to step 1
            var oWizard = this.byId("bulkUploadWizard");
            if (oWizard) {
                oWizard.discardProgress(this.byId("wStepTemplate"));
            }
            // Reset bulk model
            if (!this._bulkModel) {
                this._bulkModel = new JSONModel({ rows: [], errors: [], created: 0, updated: 0, failed: 0 });
                this.getView().setModel(this._bulkModel, "bulk");
            }
            this._bulkModel.setData({ rows: [], errors: [], created: 0, updated: 0, failed: 0 });
            var oInfo = this.byId("uploadFileInfo");
            if (oInfo) { oInfo.setVisible(false); oInfo.setText(""); }
            var oImportMsg = this.byId("importResultMsg");
            if (oImportMsg) { oImportMsg.setText("Ready to import. Click Import to proceed."); oImportMsg.setType("Information"); }
            var oResultDetail = this.byId("importResultDetail");
            if (oResultDetail) { oResultDetail.setVisible(false); }
            oDialog.open();
        },

        onBulkUploadClose: function () {
            var oDialog = this.byId("bulkUploadDialog");
            if (oDialog) { oDialog.close(); }
        },

        onBulkUploadCancel: function () {
            this.onBulkUploadClose();
        },

        onBulkFileChange: function (oEvent) {
            var oFile = oEvent.getParameter("files") && oEvent.getParameter("files")[0];
            if (!oFile) {
                // FileUploader passes file in files array (sap.ui.unified.FileUploader)
                oFile = oEvent.getParameter("file");
            }
            if (!oFile) { return; }
            var oInfo = this.byId("uploadFileInfo");
            var reader = new FileReader();
            reader.onload = function(e) {
                var csvText = e.target.result;
                var parseResult;
                try {
                    parseResult = CsvTemplate.parseCsvWithHeaders(csvText);
                } catch (err) {
                    if (oInfo) { oInfo.setText("Error parsing CSV: " + err.message); oInfo.setType("Error"); oInfo.setVisible(true); }
                    return;
                }
                this._bulkParsedRows = parseResult.rows || [];
                this._bulkParseErrors = parseResult.errors || [];
                if (oInfo) {
                    oInfo.setText((this._bulkParsedRows.length) + " rows detected, " + this._bulkParseErrors.length + " parse warnings.");
                    oInfo.setType(this._bulkParseErrors.length > 0 ? "Warning" : "Information");
                    oInfo.setVisible(true);
                }
                this._showBulkValidation(parseResult);
            }.bind(this);
            reader.readAsText(oFile);
        },

        _showBulkValidation: function (parseResult) {
            var oSummary = this.byId("validationSummary");
            var oTable = this.byId("validationErrorTable");
            var errors = parseResult.errors || [];
            if (!this._bulkModel) {
                this._bulkModel = new JSONModel({ rows: [], errors: [], created: 0, updated: 0, failed: 0 });
                this.getView().setModel(this._bulkModel, "bulk");
            }
            this._bulkModel.setProperty("/errors", errors);
            if (oSummary) {
                if (errors.length === 0) {
                    oSummary.setText((parseResult.rows || []).length + " rows ready to import. No validation errors found.");
                    oSummary.setType("Success");
                } else {
                    oSummary.setText(errors.length + " validation error(s) found in " + (parseResult.rows || []).length + " rows. Fix errors before importing.");
                    oSummary.setType("Error");
                }
            }
            if (oTable) {
                oTable.setVisible(errors.length > 0);
                oTable.bindAggregation("items", {
                    path: "bulk>/errors",
                    template: new sap.m.ColumnListItem({
                        type: "Inactive",
                        cells: [
                            new sap.m.Text({ text: "{bulk>row}" }),
                            new sap.m.Text({ text: "{bulk>field}" }),
                            new sap.m.Text({ text: "{bulk>message}", wrapping: true })
                        ]
                    })
                });
            }
        },

        onBulkImportConfirm: function () {
            var rows = this._bulkParsedRows || [];
            if (rows.length === 0) {
                MessageToast.show("No rows to import. Please upload a valid CSV file.");
                return;
            }
            var oBusy = this.byId("importBusy");
            var oMsg = this.byId("importResultMsg");
            var oBtn = this.byId("btnConfirmImport");
            var oDetail = this.byId("importResultDetail");
            if (oBusy) { oBusy.setVisible(true); }
            if (oBtn) { oBtn.setEnabled(false); }
            if (oMsg) { oMsg.setText("Importing " + rows.length + " records..."); oMsg.setType("Information"); }

            AuthFetch.post(BASE + "/importBridgesBatch", { records: rows })
            .then(function(r) { return r.json(); })
            .then(function(result) {
                if (oBusy) { oBusy.setVisible(false); }
                if (oBtn) { oBtn.setEnabled(true); }
                var created = result.created || 0;
                var updated = result.updated || 0;
                var failed  = result.failed  || 0;
                if (this._bulkModel) {
                    this._bulkModel.setProperty("/created", created);
                    this._bulkModel.setProperty("/updated", updated);
                    this._bulkModel.setProperty("/failed",  failed);
                }
                if (oMsg) {
                    oMsg.setText("Import complete: " + created + " created, " + updated + " updated, " + failed + " failed.");
                    oMsg.setType(failed > 0 ? "Warning" : "Success");
                }
                if (oDetail) { oDetail.setVisible(true); }
                if (failed === 0) { this._loadBridges(); }
            }.bind(this))
            .catch(function(err) {
                if (oBusy) { oBusy.setVisible(false); }
                if (oBtn) { oBtn.setEnabled(true); }
                if (oMsg) { oMsg.setText("Import failed: " + err.message); oMsg.setType("Error"); }
            });
        },

        // ── Dynamic Column Build (47 registry fields) ────────────
        _buildBridgeColumns: function () {
            if (this._columnsBuilt) { return; }
            var oTable = this.byId("bridgeTable");
            if (!oTable) { return; }
            if (!BridgeAttrs || !BridgeAttrs.BRIDGE_ATTRIBUTES) { return; }

            var savedKeys = this._getSavedColumnKeys();
            this._visibleColumnKeys = savedKeys;

            // Destroy existing columns and rebuild for sap.ui.table.Table
            oTable.destroyColumns();

            var attrs = BridgeAttrs.BRIDGE_ATTRIBUTES;
            attrs.forEach(function(attr) {
                var bVisible = savedKeys.indexOf(attr.key) >= 0;
                var oCol = new sap.ui.table.Column({
                    id: this.createId("dynCol_" + attr.key),
                    visible: bVisible,
                    width: this._getColWidth(attr),
                    label: new sap.m.Label({ text: attr.shortLabel || attr.label }),
                    template: this._buildCell(attr),
                    sortProperty: attr.key,
                    filterProperty: attr.key,
                    resizable: true,
                    autoResizable: true,
                    tooltip: attr.label + (attr.sectionLabel ? " (" + attr.sectionLabel + ")" : "")
                });
                oTable.addColumn(oCol);
            }.bind(this));

            // Note: rows are already bound via rows="{bridges>/items}" in the XML view.
            // Do NOT call bindAggregation("rows",...) again here — it would overwrite
            // the existing binding and cause a blank first render of cells.

            this._columnsBuilt = true;

            // Append dynamic attribute columns from AttributeDefinitions
            this._appendDynamicAttrColumns(oTable, savedKeys);
        },

        /** Fetch active BRIDGE attribute definitions and add as table columns */
        _appendDynamicAttrColumns: function (oTable, savedKeys) {
            fetch(`${BASE}/AttributeDefinitions?$filter=isActive eq true and entityTarget eq 'BRIDGE'&$select=name,label,dataType,displayOrder&$orderby=displayOrder`, _credOpts())
                .then(r => r.ok ? r.json() : { value: [] })
                .then(j => {
                    this._dynAttrDefs = j.value || [];
                    this._dynAttrDefs.forEach(attr => {
                        var colId = this.createId("dynCol_attr_" + attr.name);
                        // Skip if column already exists
                        if (sap.ui.getCore().byId(colId)) return;
                        var bVisible = savedKeys.indexOf("attr_" + attr.name) >= 0;
                        var oCol = new sap.ui.table.Column({
                            id: colId,
                            visible: bVisible,
                            width: "150px",
                            label: new sap.m.Label({ text: "[Custom] " + attr.label }),
                            template: new sap.m.Text({ text: "{bridges>attr_" + attr.name + "}" }),
                            sortProperty: "attr_" + attr.name,
                            filterProperty: "attr_" + attr.name,
                            resizable: true,
                            tooltip: attr.label + " (Custom Attribute)"
                        });
                        oTable.addColumn(oCol);
                    });
                })
                .catch(function (err) { Log.warning("[Bridges] dynamic column load failed", err); });
        },

        _getColWidth: function (attr) {
            if (attr.key === "bridgeId")   { return "130px"; }
            if (attr.key === "name")       { return "200px"; }
            if (attr.key === "remarks")    { return "200px"; }
            if (attr.type === "boolean")   { return "90px";  }
            if (attr.type === "integer")   { return "100px"; }
            if (attr.type === "decimal")   { return "110px"; }
            if (attr.type === "date")      { return "120px"; }
            if (attr.key === "postingStatus" || attr.key === "condition" || attr.key === "scourRisk") {
                return "130px";
            }
            return "160px";
        },

        _buildCell: function (attr) {
            var key = attr.key;
            var path = "{bridges>" + key + "}";
            if (key === "bridgeId") {
                return new sap.m.Link({
                    text: path,
                    press: this.onBridgeIdPress.bind(this),
                    tooltip: "Open bridge detail"
                });
            }
            if (attr.type === "boolean") {
                return new sap.m.ObjectStatus({
                    text : "{= ${bridges>" + key + "} ? 'Yes' : 'No'}",
                    state: "{= ${bridges>" + key + "} ? 'Success' : 'None'}"
                });
            }
            if (key === "postingStatus") {
                return new sap.m.ObjectStatus({
                    text : path,
                    state: "{= ${bridges>postingStatus} === 'UNRESTRICTED' ? 'Success' : ${bridges>postingStatus} === 'POSTED' ? 'Warning' : 'Error'}"
                });
            }
            if (key === "condition") {
                return new sap.m.ObjectStatus({
                    text : path,
                    state: "{= ${bridges>condition} === 'GOOD' ? 'Success' : ${bridges>condition} === 'FAIR' ? 'Warning' : 'Error'}"
                });
            }
            if (key === "scourRisk") {
                return new sap.m.ObjectStatus({
                    text : path,
                    state: "{= ${bridges>scourRisk} === 'CRITICAL' ? 'Error' : ${bridges>scourRisk} === 'HIGH' ? 'Warning' : 'None'}"
                });
            }
            if (key === "conditionRating") {
                return new sap.m.ObjectStatus({
                    text : path,
                    state: "{= ${bridges>conditionRating} >= 7 ? 'Success' : ${bridges>conditionRating} >= 5 ? 'Warning' : 'Error'}"
                });
            }
            if (attr.type === "decimal" && attr.unit) {
                return new sap.m.ObjectNumber({
                    number: path,
                    unit  : attr.unit
                });
            }
            return new sap.m.Text({ text: path });
        },

        _getSavedColumnKeys: function () {
            try {
                var saved = JSON.parse(localStorage.getItem("nhvr_bridge_columns") || "null");
                if (Array.isArray(saved) && saved.length > 0) { return saved; }
            } catch (_) { /* localStorage unavailable */ }
            if (BridgeAttrs && BridgeAttrs.getDefaultVisibleColumns) {
                return BridgeAttrs.getDefaultVisibleColumns().map(function(a) { return a.key; });
            }
            return BridgeAttrs.BRIDGE_ATTRIBUTES.map(function(a) { return a.key; });
        },

        _saveColumnVisibility: function (keys) {
            this._visibleColumnKeys = keys;
            try { localStorage.setItem("nhvr_bridge_columns", JSON.stringify(keys)); } catch (_) { /* localStorage unavailable */ }
        },

        onColumnVisChange: function (oEvent) {
            var oTable = this.byId("bridgeTable");
            if (!oTable) { return; }
            var visibleKeys = [];
            var cols = oTable.getColumns();
            cols.forEach(function(col) {
                if (col.getVisible()) {
                    var id = col.getId();
                    var key = id.replace(/.*dynCol_/, "");
                    visibleKeys.push(key);
                }
            });
            this._saveColumnVisibility(visibleKeys);
            this._updateFilterChips();
        },

        // ── OData Filter Builder ─────────────────────────────────
        _buildODataFilter: function (filterState) {
            var parts = [];
            Object.entries(filterState).forEach(function([key, val]) {
                if (!val) { return; }
                var attr = BridgeAttrs.BRIDGE_ATTRIBUTES.find(function(a) { return a.key === key; });
                if (!attr) { return; }
                if (attr.filterType === "multi-select" && Array.isArray(val) && val.length) {
                    parts.push("(" + val.map(function(v) { return key + " eq '" + v + "'"; }).join(" or ") + ")");
                } else if (attr.filterType === "range") {
                    if (val.min !== undefined) { parts.push(key + " ge " + val.min); }
                    if (val.max !== undefined) { parts.push(key + " le " + val.max); }
                } else if (attr.filterType === "boolean-toggle" && val !== "ANY") {
                    parts.push(key + " eq " + (val === "YES"));
                } else if (attr.filterType === "contains-search") {
                    parts.push("contains(" + key + ",'" + val.replace(/'/g, "''") + "')");
                } else if (attr.filterType === "fulltext-search") {
                    parts.push("contains(remarks,'" + val.replace(/'/g, "''") + "')");
                }
            });
            return parts.join(" and ");
        },

        // ── Active Filter Chips ──────────────────────────────────
        _updateFilterChips: function () {
            var oBox = this.byId("activeFilterBox");
            if (!oBox) { return; }
            oBox.destroyTokens();
            var rf = this._registryFilters || {};
            var count = 0;
            Object.entries(rf).forEach(function([key, val]) {
                if (!val) { return; }
                var attr = BridgeAttrs.BRIDGE_ATTRIBUTES.find(function(a) { return a.key === key; });
                if (!attr) { return; }
                var label = attr.shortLabel || attr.label;
                var summary = Array.isArray(val) ? val.join(", ") : (typeof val === "object" ? JSON.stringify(val) : String(val));
                var oToken = new sap.m.Token({
                    text: label + ": " + summary
                });
                oToken.attachDelete(this._onFilterChipDelete.bind(this, key));
                oBox.addToken(oToken);
                count++;
            }.bind(this));
            var oCountText = this.byId("activeFilterCount");
            if (oCountText) { oCountText.setText(count > 0 ? count + " active" : ""); }
            var oChipBar = this.byId("activeFilterChipBar");
            if (oChipBar) { oChipBar.setVisible(count > 0); }
        },

        _onFilterChipDelete: function (key) {
            if (this._registryFilters) {
                delete this._registryFilters[key];
            }
            this._applyFiltersAndSort();
            this._updateFilterChips();
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

        onInfoPressBridges: function (oEvent) {
            this._showInfoPopover(
                oEvent.getSource(),
                "Bridge Asset Registry — Column Guide",
                "Bridge ID — unique NHVR identifier for the bridge asset\n\n" +
                "Condition — overall structural condition: GOOD, FAIR, POOR, CRITICAL\n\n" +
                "Condition Rating — AS 5100 scale 1–10 (1 = failed, 10 = new/excellent). Bridges rated ≤4 are flagged for urgent attention.\n\n" +
                "Posting Status:\n" +
                "• UNRESTRICTED — no load or clearance restrictions apply\n" +
                "• POSTED — a weight, height, width or speed restriction is in force\n" +
                "• CLOSED — bridge is closed to all traffic\n\n" +
                "Structure Type — bridge, culvert, tunnel, ford, causeway, retaining wall, overhead structure, etc.\n\n" +
                "Clearance Height — maximum vertical clearance in metres (relevant for high-profile vehicles)\n\n" +
                "Next Insp. Due — next scheduled AS 5100 formal inspection date"
            );
        }

    }, HelpAssistantMixin, AlvToolbarMixin));
});
