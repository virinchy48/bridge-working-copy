sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageToast",
    "sap/m/MessageBox",
    "nhvr/bridgemanagement/util/StandardsAdapter",
    "nhvr/bridgemanagement/model/CapabilityManager",
    "nhvr/bridgemanagement/util/AuthFetch",
    "nhvr/bridgemanagement/util/UserAnalytics",
    "nhvr/bridgemanagement/util/LookupService"
], function (Controller, JSONModel, MessageToast, MessageBox, StandardsAdapter, CapabilityManager, AuthFetch, UserAnalytics, LookupService) {
    "use strict";

    var Log = sap.base.Log;

    const BASE  = "/bridge-management";

    // Escape single quotes for OData v4 string literals ( ' → '' )
    const _odataStr = (v) => String(v == null ? "" : v).replace(/'/g, "''");
    const H     = { Accept: "application/json", "Content-Type": "application/json" };
    const CREDS = "include";  // send session cookies so CAP mocked auth (and XSUAA) doesn't return 403

    // Section-to-featureKey mapping for Home screen tile grouping
    var SECTION_TILE_MAP = [
        { name: "Operations",              keys: ["dashboard","bridges","restrictions","bridgeMap"] },
        { name: "BMS Business Admin",      keys: ["massupload","adminconfig","massedit"] },
        { name: "BMS Tech Admin",          keys: ["techAdmin","integrationHub"] },
        { name: "Inspection & Defects",    keys: ["inspections","defects"] },
        { name: "Operator Tools",          keys: ["permits","vehicleaccess","routeassessment","routePlanner"] },
        { name: "Road Capacity & Permits", keys: ["vehiclePermits","capacityReports"] }
    ];

    // Build a lookup: featureKey → section name
    var _featureToSection = {};
    SECTION_TILE_MAP.forEach(function (s) {
        s.keys.forEach(function (k) { _featureToSection[k] = s.name; });
    });

    function _errMsg(status, body) {
        if (status === 401) return "Not authorised — please log in again.";
        if (status === 403) return "Access denied — your account does not have permission to perform this action. Contact your NHVR system administrator.";
        if (status === 404) return "Record not found — it may have been deleted.";
        if (status === 409) return "Conflict — another user may have modified this record. Please refresh and try again.";
        return (body && body.error && body.error.message) ? body.error.message : `Unexpected error (HTTP ${status})`;
    }

    return Controller.extend("nhvr.bridgemanagement.controller.AdminConfig", {

        onInit: function () {
            UserAnalytics.trackView("AdminConfig");
            this.getView().setModel(new JSONModel({ items: [] }), "attrDefs");
            this.getView().setModel(new JSONModel({ items: [] }), "auditLog");
            this.getView().setModel(new JSONModel({ items: [] }), "lookups");
            this.getView().setModel(new JSONModel({ menu: [], tabs: [], actions: [] }), "roleConfig");
            this.getView().setModel(new JSONModel({ tiles: [] }), "sectionTileConfig");
            this.getView().setModel(new JSONModel({ items: [] }), "attrValidValues");
            this.getView().setModel(new JSONModel({ value: [] }), "jurisdictionAccess");
            // Map provider config model (MapProviderConfigs entity)
            this.getView().setModel(new JSONModel({
                mapProvider: "osm-leaflet", geocodeProvider: "nominatim", routingProvider: "osrm",
                defaultZoom: 4, clusterEnabled: true, clusterRadius: 50,
                trafficLayerEnabled: false, streetViewEnabled: false,
                googleKeyStatus: "Not configured", esriKeyStatus: "Not configured",
                _id: null
            }), "mapProviderConfig");
            // Map config model — flat fields + parsed JSON sub-models
            this.getView().setModel(new JSONModel({
                configKey: "DEFAULT", displayName: "NHVR National Bridge Map",
                isActive: true, defaultCenter_lat: -27.0, defaultCenter_lng: 133.0,
                defaultZoom: 5, projection: "EPSG:4326", projectionNote: "",
                defaultBaseMap: "osm", clusteringEnabled: true, clusterRadius: 60,
                maxZoomBeforeCluster: 15, notes: "",
                // ESRI flattened
                esriPortalUrl: "https://www.arcgis.com", esriFeatureServiceUrl: "", esriApiKey: "", esriQueryWhere: "1=1",
                // Draw flattened
                drawPolygonColor: "#0070F2", drawRectColor: "#E9730C", drawCircleColor: "#107E3E", drawFillOpacity: 0.12,
                // Parsed arrays for tables
                parsedBaseMaps: [], parsedRefLayers: []
            }), "mapConfig");
            this._mapConfigId   = null;
            this._editingId     = null;
            this._editingLookId = null;
            this._allAudit      = [];
            this._allLookups    = [];
            this._roleConfigAll = [];
            this._loadAttrDefs();
            this._loadAuditLog();
            this._loadLookups();
            this._initStandardsProfile();
            this._loadMapConfig();
            this._loadMapProviderConfig();

            LookupService.load().then(function () {
                LookupService.populateSelect(this.byId("jaJurisdiction"), "STATE", "All Jurisdictions");
            }.bind(this));

            var router = this.getOwnerComponent().getRouter();
            router.getRoute("AdminConfig").attachPatternMatched(this._onRouteMatched, this);
        },

        _onRouteMatched: function () {
            var self = this;
            CapabilityManager.load().then(function () {
                if (!CapabilityManager.guardRoute("ADMIN_CONFIG", self.getOwnerComponent().getRouter())) return;
                self._loadAttrDefs();
                self._loadAuditLog();
                self._loadLookups();
                self._loadJurisdictionAccess();
            });
        },

        // ── Navigation ────────────────────────────────────────────────
        onNavHome: function () {
            this.getOwnerComponent().getRouter().navTo("Home");
        },

        onTabSelect: function () {},

        // ── Attribute Definitions ─────────────────────────────────────
        _loadAttrDefs: function () {
            fetch(`${BASE}/AttributeDefinitions?$orderby=displayOrder asc,name asc`, { headers: H, credentials: CREDS })
                .then(async r => {
                    if (!r.ok) { const b = await r.json().catch(() => ({})); throw new Error(_errMsg(r.status, b)); }
                    return r.json();
                })
                .then(j => {
                    this.getView().getModel("attrDefs").setProperty("/items", j.value || []);
                })
                .catch(err => MessageBox.error("Could not load attribute definitions: " + err.message));
        },

        onAddAttribute: function () {
            this._editingId = null;
            this._clearAttrForm();
            this.byId("attrDialog").setTitle("Add Attribute Definition");
            this.byId("attrDialog").open();
        },

        onEditAttribute: function (e) {
            var ctx   = e.getSource().getBindingContext("attrDefs");
            var item  = ctx ? ctx.getObject() : null;
            if (!item) return;
            this._editingId = item.ID;
            this.byId("attrName").setValue(item.name);
            this.byId("attrLabel").setValue(item.label);
            this.byId("attrDataType").setSelectedKey(item.dataType);
            this.byId("attrEntity").setSelectedKey(item.entityTarget);
            this.byId("attrDefault").setValue(item.defaultValue || "");
            this.byId("attrOrder").setValue(item.displayOrder || "");
            this.byId("attrRequired").setSelected(!!item.isRequired);
            this.byId("attrFilterEnabled").setSelected(item.filterEnabled !== false);
            this.byId("attrReportEnabled").setSelected(item.reportEnabled !== false);
            this.byId("attrMassEditEnabled").setSelected(!!item.massEditEnabled);
            this.byId("attrActive").setSelected(item.isActive !== false);
            this._toggleValidValuesBox(item.dataType);
            // Load valid values for this attribute
            this._loadValidValues(item.ID);
            this.byId("attrDialog").setTitle("Edit Attribute Definition");
            this.byId("attrDialog").open();
        },

        onDeleteAttribute: function (e) {
            var ctx  = e.getSource().getBindingContext("attrDefs");
            var item = ctx ? ctx.getObject() : null;
            if (!item) return;
            var id   = item.ID;
            var name = item.label || id;
            MessageBox.confirm(`Delete attribute "${name}"? This cannot be undone.`, {
                onClose: (action) => {
                    if (action !== MessageBox.Action.OK) return;
                    AuthFetch.del(`${BASE}/AttributeDefinitions(${id})`)
                        .then(async r => {
                            if (r.ok || r.status === 204) {
                                MessageToast.show("Attribute deleted");
                                this._loadAttrDefs();
                            } else {
                                const b = await r.json().catch(() => ({}));
                                throw new Error(_errMsg(r.status, b));
                            }
                        })
                        .catch(err => MessageBox.error("Delete failed: " + err.message));
                }
            });
        },

        onSaveAttribute: function () {
            var name  = this.byId("attrName").getValue().trim();
            var label = this.byId("attrLabel").getValue().trim();
            if (!name || !label) {
                MessageToast.show("Internal Name and Display Label are required");
                return;
            }
            var payload = {
                name            : name,
                label           : label,
                dataType        : this.byId("attrDataType").getSelectedKey(),
                entityTarget    : this.byId("attrEntity").getSelectedKey(),
                defaultValue    : this.byId("attrDefault").getValue().trim() || null,
                displayOrder    : parseInt(this.byId("attrOrder").getValue()) || 99,
                isRequired      : this.byId("attrRequired").getSelected(),
                filterEnabled   : this.byId("attrFilterEnabled").getSelected(),
                reportEnabled   : this.byId("attrReportEnabled").getSelected(),
                massEditEnabled : this.byId("attrMassEditEnabled").getSelected(),
                isActive        : this.byId("attrActive").getSelected()
            };

            var url    = this._editingId ? `${BASE}/AttributeDefinitions(${this._editingId})` : `${BASE}/AttributeDefinitions`;

            (this._editingId ? AuthFetch.patch(url, payload) : AuthFetch.post(url, payload))
                .then(async r => {
                    if (r.ok || r.status === 201 || r.status === 204) {
                        // Also save valid values if dataType is LOOKUP
                        const dataType = this.byId("attrDataType").getSelectedKey();
                        if (dataType === "LOOKUP") this._saveValidValues(this._editingId);
                        MessageToast.show(this._editingId ? "Attribute updated" : "Attribute created");
                        this.byId("attrDialog").close();
                        this._loadAttrDefs();
                    } else {
                        const b = await r.json().catch(() => ({}));
                        throw new Error(_errMsg(r.status, b));
                    }
                })
                .catch(err => MessageBox.error("Save failed: " + err.message));
        },

        onCancelAttribute: function () {
            this.byId("attrDialog").close();
        },

        // Data type change — show/hide valid values builder
        onAttrDataTypeChange: function (e) {
            const oItem = e.getParameter("selectedItem");
            if (!oItem) return;
            this._toggleValidValuesBox(oItem.getKey());
        },

        _toggleValidValuesBox: function (dataType) {
            const box = this.byId("attrValidValuesBox");
            if (box) box.setVisible(dataType === "LOOKUP");
        },

        _loadValidValues: function (attrId) {
            if (!attrId) { this.getView().getModel("attrValidValues").setProperty("/items", []); return; }
            // OData v4 containment mode (see `.cdsrc.json` →
            // odata.containment=true) means AttributeValidValue is not
            // a top-level entity set; we have to navigate via the parent
            // AttributeDefinition. A previous version hit
            // /AttributeValidValues?$filter=... which 404'd.
            fetch(`${BASE}/AttributeDefinitions(${attrId})/validValues?$orderby=displayOrder`, { headers: H, credentials: CREDS })
                .then(r => r.ok ? r.json() : { value: [] })
                .then(j => this.getView().getModel("attrValidValues").setProperty("/items", j.value || []))
                .catch(function (err) { Log.warning("[AdminConfig] valid values load failed", err); });
        },

        onAddValidValue: function () {
            const items = this.getView().getModel("attrValidValues").getProperty("/items") || [];
            items.push({ value: "", label: "", displayOrder: items.length, isActive: true, _isNew: true });
            this.getView().getModel("attrValidValues").setProperty("/items", items);
        },

        onRemoveValidValue: function (e) {
            const ctx   = e.getSource().getBindingContext("attrValidValues");
            const idx   = parseInt(ctx.getPath().split("/").pop());
            const items = this.getView().getModel("attrValidValues").getProperty("/items") || [];
            items.splice(idx, 1);
            this.getView().getModel("attrValidValues").setProperty("/items", items);
        },

        _saveValidValues: function (attrId) {
            if (!attrId) return;
            const items = this.getView().getModel("attrValidValues").getProperty("/items") || [];
            items.forEach(v => {
                if (!v.value) return;
                if (v._isNew) {
                    // POST through the parent's navigation path — containment
                    // mode exposes validValues under AttributeDefinitions(id),
                    // not as a standalone AttributeValidValues collection.
                    // The parent key is implicit, so we omit attribute_ID from
                    // the body.
                    AuthFetch.post(`${BASE}/AttributeDefinitions(${attrId})/validValues`, { value: v.value, label: v.label || v.value, displayOrder: v.displayOrder || 0, isActive: true }).catch(function (err) { Log.warning("[AdminConfig] POST valid value failed", err); });
                }
            });
        },

        _clearAttrForm: function () {
            this.byId("attrName").setValue("");
            this.byId("attrLabel").setValue("");
            this.byId("attrDataType").setSelectedKey("STRING");
            this.byId("attrEntity").setSelectedKey("BRIDGE");
            this.byId("attrDefault").setValue("");
            this.byId("attrOrder").setValue("");
            this.byId("attrRequired").setSelected(false);
            this.byId("attrFilterEnabled").setSelected(true);
            this.byId("attrReportEnabled").setSelected(true);
            this.byId("attrMassEditEnabled").setSelected(false);
            this.byId("attrActive").setSelected(true);
            this._toggleValidValuesBox("STRING");
            this.getView().getModel("attrValidValues").setProperty("/items", []);
        },

        // ── Audit Log ─────────────────────────────────────────────────
        _loadAuditLog: function () {
            // Raised from $top=200 → $top=5000 (the CDS query-limit max declared
            // in .cdsrc.json). Include $count=true so the UI can show a
            // truncation warning if the live row count exceeds 5000.
            fetch(`${BASE}/AuditLogs?$orderby=timestamp desc&$top=5000&$count=true`, { headers: H, credentials: CREDS })
                .then(async r => {
                    if (!r.ok) { const b = await r.json().catch(() => ({})); throw new Error(_errMsg(r.status, b)); }
                    return r.json();
                })
                .then(j => {
                    this._allAudit = j.value || [];
                    this._auditTotal = j["@odata.count"] || this._allAudit.length;
                    this._applyAuditFilter();
                    this._updateAuditTruncationBanner();
                })
                .catch(err => MessageBox.error("Could not load audit log: " + err.message));
        },

        _updateAuditTruncationBanner: function () {
            const banner = this.byId("auditTruncationBanner");
            if (!banner) return;
            const loaded = this._allAudit.length;
            const total  = this._auditTotal || loaded;
            if (loaded < total) {
                banner.setText(`Showing the most recent ${loaded} of ${total} audit entries. Refine filters to see older events.`);
                banner.setVisible(true);
                banner.setType("Warning");
            } else {
                banner.setVisible(false);
            }
        },

        onRefreshAudit: function () {
            this._loadAuditLog();
        },

        onAuditSearch: function (e) {
            this._auditSearch = e.getParameter("query") || e.getParameter("newValue") || "";
            this._applyAuditFilter();
        },

        onAuditFilterChange: function () {
            this._applyAuditFilter();
        },

        // ── Role Configuration ────────────────────────────────────────
        onRoleConfigSelect: function () {
            var role = this.byId("roleConfigSelector").getSelectedKey();
            this._loadRoleConfigs(role);
        },

        _loadRoleConfigs: function (role) {
            if (!role) return;
            fetch(`${BASE}/RoleConfigs?$filter=role eq '${_odataStr(role)}'&$orderby=sortOrder asc`, { headers: H, credentials: CREDS })
                .then(async r => {
                    if (!r.ok) { const b = await r.json().catch(() => ({})); throw new Error(_errMsg(r.status, b)); }
                    return r.json();
                })
                .then(j => {
                    this._roleConfigAll = j.value || [];
                    const menu    = this._roleConfigAll.filter(c => c.featureType === "MENU");
                    const tabs    = this._roleConfigAll.filter(c => c.featureType === "TAB");
                    const actions = this._roleConfigAll.filter(c => c.featureType === "ACTION");
                    const model   = this.getView().getModel("roleConfig");
                    model.setProperty("/menu",    menu);
                    model.setProperty("/tabs",    tabs);
                    model.setProperty("/actions", actions);
                })
                .catch(err => MessageBox.error("Could not load role config: " + err.message));
        },

        onRoleFeatureChange: function () {
            // Changes are tracked in the bound model — collected on Save
        },

        onSaveRoleConfigs: function () {
            var role    = this.byId("roleConfigSelector").getSelectedKey();
            var model   = this.getView().getModel("roleConfig");
            var allRows = [
                ...(model.getProperty("/menu")    || []),
                ...(model.getProperty("/tabs")    || []),
                ...(model.getProperty("/actions") || [])
            ];
            if (allRows.length === 0) { MessageToast.show("No configuration loaded — select a role first"); return; }

            // PATCH each row individually (include featureEnabled)
            var patches = allRows.map(row => {
                return AuthFetch.patch(`${BASE}/RoleConfigs('${row.ID}')`, { visible: row.visible, editable: row.editable, featureEnabled: row.featureEnabled !== false });
            });

            Promise.all(patches)
                .then(responses => {
                    var failed = responses.filter(r => !r.ok).length;
                    if (failed > 0) {
                        MessageBox.warning(`${failed} of ${patches.length} updates failed. Please refresh and try again.`);
                    } else {
                        MessageToast.show(`Role config for ${role} saved successfully`);
                        // Force RoleManager to reload if same role is active
                        if (typeof sap !== "undefined") {
                            try {
                                sap.ui.require(["nhvr/bridgemanagement/model/RoleManager"], function(RM) {
                                    if (RM.getRole() === role) RM.loadConfig(role);
                                });
                            } catch(e) { jQuery.sap.log.error("[NHVR] RoleManager reload failed", e && e.message || String(e)); }
                        }
                    }
                })
                .catch(err => MessageBox.error("Save failed: " + err.message));
        },

        // ── Section Tile Configuration ────────────────────────────────

        onSectionTileRoleSelect: function () {
            var role = this.byId("sectionTileRoleSelector").getSelectedKey();
            this._loadSectionTileConfigs(role);
        },

        _loadSectionTileConfigs: function (role) {
            if (!role) return;
            var that = this;
            fetch(BASE + "/RoleConfigs?$filter=role eq '" + role + "' and featureType eq 'HOME_TILE'&$orderby=sortOrder asc", { headers: H, credentials: CREDS })
                .then(function (r) {
                    if (!r.ok) throw new Error("HTTP " + r.status);
                    return r.json();
                })
                .then(function (j) {
                    var rows = j.value || [];
                    // Enrich each row with its section name
                    rows.forEach(function (row) {
                        row.section = _featureToSection[row.featureKey] || "Other";
                    });
                    // Sort by section order (match SECTION_TILE_MAP order)
                    var sectionOrder = {};
                    SECTION_TILE_MAP.forEach(function (s, i) { sectionOrder[s.name] = i; });
                    rows.sort(function (a, b) {
                        var sa = sectionOrder[a.section] !== undefined ? sectionOrder[a.section] : 99;
                        var sb = sectionOrder[b.section] !== undefined ? sectionOrder[b.section] : 99;
                        return sa - sb || a.sortOrder - b.sortOrder;
                    });
                    that._sectionTileAll = rows;
                    that.getView().getModel("sectionTileConfig").setProperty("/tiles", rows);
                })
                .catch(function (err) { MessageBox.error("Could not load section tiles: " + err.message); });
        },

        onSaveSectionTileConfigs: function () {
            var role  = this.byId("sectionTileRoleSelector").getSelectedKey();
            var model = this.getView().getModel("sectionTileConfig");
            var tiles = model.getProperty("/tiles") || [];
            if (tiles.length === 0) { MessageToast.show("No configuration loaded — select a role first"); return; }

            var patches = tiles.map(function (row) {
                return AuthFetch.patch(BASE + "/RoleConfigs('" + row.ID + "')", {
                    visible: row.visible,
                    editable: row.editable,
                    featureEnabled: row.featureEnabled !== false
                });
            });

            Promise.all(patches)
                .then(function (responses) {
                    var failed = responses.filter(function (r) { return !r.ok; }).length;
                    if (failed > 0) {
                        MessageBox.warning(failed + " of " + patches.length + " updates failed. Please refresh and try again.");
                    } else {
                        MessageToast.show("Section tile config for " + role + " saved successfully");
                        // Force RoleManager to reload if same role is active
                        try {
                            sap.ui.require(["nhvr/bridgemanagement/model/RoleManager"], function (RM) {
                                if (RM.getRole() === role) RM.loadConfig(role);
                            });
                        } catch (e) { /* non-fatal */ }
                    }
                })
                .catch(function (err) { MessageBox.error("Save failed: " + err.message); });
        },

        // ── Lookup Management ─────────────────────────────────────────

        _loadLookups: function () {
            // Raised from implicit default to $top=5000 (CDS max) + $count=true
            // so the UI can show a truncation warning if the live catalogue
            // exceeds 5000 rows.
            fetch(`${BASE}/Lookups?$orderby=category asc,displayOrder asc,code asc&$top=5000&$count=true`, { headers: H, credentials: CREDS })
                .then(r => r.ok ? r.json() : { value: [], "@odata.count": 0 })
                .then(j => {
                    this._allLookups = j.value || [];
                    this._lookupTotal = j["@odata.count"] || this._allLookups.length;
                    // Populate category filter
                    const cats = [...new Set(this._allLookups.map(l => l.category))].sort();
                    const sel  = this.byId("lookupCategoryFilter");
                    if (sel) {
                        while (sel.getItems().length > 1) sel.removeItem(sel.getItems()[sel.getItems().length - 1]);
                        cats.forEach(c => sel.addItem(new sap.ui.core.Item({ key: c, text: c })));
                    }
                    this._applyLookupFilter();
                    this._updateLookupTruncationBanner();
                })
                .catch(function (err) { Log.warning("[AdminConfig] lookup data load failed", err); });
        },

        _updateLookupTruncationBanner: function () {
            const banner = this.byId("lookupTruncationBanner");
            if (!banner) return;
            const loaded = this._allLookups.length;
            const total  = this._lookupTotal || loaded;
            if (loaded < total) {
                banner.setText(`Showing ${loaded} of ${total} lookup rows. Use the category filter to narrow the list.`);
                banner.setVisible(true);
                banner.setType("Warning");
            } else {
                banner.setVisible(false);
            }
        },

        _applyLookupFilter: function () {
            const cat = this.byId("lookupCategoryFilter") ? this.byId("lookupCategoryFilter").getSelectedKey() : "ALL";
            const data = cat === "ALL" ? this._allLookups : this._allLookups.filter(l => l.category === cat);
            this.getView().getModel("lookups").setProperty("/items", data);
        },

        onLookupCategoryChange: function () { this._applyLookupFilter(); },

        onAddLookup: function () {
            this._editingLookId = null;
            this._clearLookupForm();
            this.byId("lookupDialog").setTitle("Add Lookup Value");
            this.byId("lookupDialog").open();
        },

        onEditLookup: function (e) {
            const ctx  = e.getSource().getBindingContext("lookups");
            const item = ctx ? ctx.getObject() : null;
            if (!item) return;
            this._editingLookId = item.ID;
            this.byId("lookupCategory").setValue(item.category);
            this.byId("lookupCode").setValue(item.code);
            this.byId("lookupDescription").setValue(item.description || "");
            this.byId("lookupOrder").setValue(item.displayOrder || "0");
            this.byId("lookupActive").setSelected(item.isActive !== false);
            this.byId("lookupDialog").setTitle("Edit Lookup Value");
            this.byId("lookupDialog").open();
        },

        onDeleteLookup: function (e) {
            const ctx  = e.getSource().getBindingContext("lookups");
            const item = ctx ? ctx.getObject() : null;
            if (!item) return;
            MessageBox.confirm(`Delete lookup "${item.category} / ${item.code}"?`, {
                onClose: (action) => {
                    if (action !== MessageBox.Action.OK) return;
                    AuthFetch.del(`${BASE}/Lookups(${item.ID})`)
                        .then(r => {
                            if (r.ok || r.status === 204) {
                                MessageToast.show("Lookup deleted");
                                this._loadLookups();
                            } else {
                                MessageBox.error(`Delete failed (HTTP ${r.status})`);
                            }
                        })
                        .catch(err => MessageBox.error("Delete failed: " + err.message));
                }
            });
        },

        onSaveLookup: function () {
            const cat  = this.byId("lookupCategory").getValue().trim();
            const code = this.byId("lookupCode").getValue().trim();
            if (!cat || !code) { MessageToast.show("Category and Code are required"); return; }
            const payload = {
                category    : cat.toUpperCase().replace(/\s+/g, "_"),
                code        : code.toUpperCase().replace(/\s+/g, "_"),
                description : this.byId("lookupDescription").getValue().trim() || null,
                displayOrder: parseInt(this.byId("lookupOrder").getValue()) || 0,
                isActive    : this.byId("lookupActive").getSelected()
            };
            const url    = this._editingLookId ? `${BASE}/Lookups(${this._editingLookId})` : `${BASE}/Lookups`;
            (this._editingLookId ? AuthFetch.patch(url, payload) : AuthFetch.post(url, payload))
                .then(async r => {
                    if (r.ok || r.status === 201 || r.status === 204) {
                        MessageToast.show(this._editingLookId ? "Lookup updated" : "Lookup created");
                        this.byId("lookupDialog").close();
                        this._loadLookups();
                    } else {
                        const b = await r.json().catch(() => ({}));
                        throw new Error(_errMsg(r.status, b));
                    }
                })
                .catch(err => MessageBox.error("Save failed: " + err.message));
        },

        onCancelLookup: function () { this.byId("lookupDialog").close(); },

        _clearLookupForm: function () {
            this.byId("lookupCategory").setValue("");
            this.byId("lookupCode").setValue("");
            this.byId("lookupDescription").setValue("");
            this.byId("lookupOrder").setValue("0");
            this.byId("lookupActive").setSelected(true);
        },

        // ── P11: Jurisdiction Access ──────────────────────────────────
        _loadJurisdictionAccess: function () {
            fetch(`${BASE}/JurisdictionAccesses?$orderby=createdAt desc`, { headers: H, credentials: CREDS })
                .then(async r => {
                    if (!r.ok) { const b = await r.json().catch(() => ({})); throw new Error(_errMsg(r.status, b)); }
                    return r.json();
                })
                .then(d => {
                    this.getView().getModel("jurisdictionAccess").setData(d);
                })
                .catch(e => {
                    // Jurisdiction Access may be Admin-only; silently ignore 403
                    if (!e.message.includes("403")) {
                        MessageToast.show("Could not load jurisdiction access: " + e.message);
                    }
                });
        },

        onOpenGrantAccessDialog: function () {
            this.byId("grantAccessDialog").open();
        },

        onCancelGrantAccess: function () {
            this.byId("grantAccessDialog").close();
        },

        onGrantJurisdictionAccess: function () {
            var userRef     = this.byId("jaUserRef").getValue().trim();
            var jurisdiction = this.byId("jaJurisdiction").getSelectedKey();
            var accessLevel  = this.byId("jaAccessLevel").getSelectedKey();
            var expiresAt    = this.byId("jaExpiresAt").getValue();

            if (!userRef) {
                MessageToast.show("User Ref is required.");
                return;
            }
            var body = { userRef, jurisdiction, accessLevel, grantedBy: "admin" };
            if (expiresAt) body.expiresAt = new Date(expiresAt).toISOString();

            AuthFetch.post(`${BASE}/JurisdictionAccesses`, body)
            .then(async r => {
                if (!r.ok) { const b = await r.json().catch(() => ({})); throw new Error(_errMsg(r.status, b)); }
                return r.json();
            })
            .then(() => {
                this.byId("grantAccessDialog").close();
                MessageToast.show(`Access granted: ${userRef} → ${jurisdiction} (${accessLevel})`);
                this.byId("jaUserRef").setValue("");
                this._loadJurisdictionAccess();
            })
            .catch(e => MessageBox.error("Grant failed: " + e.message));
        },

        onRevokeJurisdictionAccess: function (oEvent) {
            var ctx = oEvent.getSource().getBindingContext("jurisdictionAccess");
            var rec = ctx.getObject();
            MessageBox.confirm(`Revoke ${rec.accessLevel} access for ${rec.userRef} to ${rec.jurisdiction}?`, {
                title: "Revoke Access",
                onClose: (sAction) => {
                    if (sAction !== MessageBox.Action.OK) return;
                    AuthFetch.del(`${BASE}/JurisdictionAccesses(${rec.ID})`)
                    .then(async r => {
                        if (!r.ok) { const b = await r.json().catch(() => ({})); throw new Error(_errMsg(r.status, b)); }
                        MessageToast.show("Access revoked.");
                        this._loadJurisdictionAccess();
                    })
                    .catch(e => MessageBox.error("Revoke failed: " + e.message));
                }
            });
        },

        // ── P12: International Standards Profile ──────────────────────
        _initStandardsProfile: function () {
            var profiles = StandardsAdapter.getProfiles();
            var oSelect  = this.byId("standardsProfileSelect");
            if (!oSelect) return;
            var oItems = profiles.map(function (p) {
                return new sap.ui.core.Item({ key: p.key, text: p.text });
            });
            oSelect.removeAllItems();
            oItems.forEach(function (i) { oSelect.addItem(i); });
            oSelect.setSelectedKey(StandardsAdapter.getActive());
            this._updateStandardsInfo(StandardsAdapter.getActive());
        },

        _updateStandardsInfo: function (key) {
            var profile = StandardsAdapter.getProfile(key);
            var oInfo = this.byId("standardsProfileInfo");
            if (oInfo) oInfo.setText("Rating: " + profile.ratingStandard);
            var setTxt = function (id, val) {
                var el = this.byId(id);
                if (el) el.setText(val);
            }.bind(this);
            setTxt("stdMassUnit",       profile.massUnit   || "—");
            setTxt("stdRatingStandard", profile.ratingStandard || "—");
            setTxt("stdConditionScale", profile.conditionScale  || "—");
            setTxt("stdSpeedUnit",      profile.speedUnit  || "—");
        },

        onStandardsProfileChange: function (oEvent) {
            var key = oEvent.getSource().getSelectedKey();
            StandardsAdapter.setProfile(key);
            this._updateStandardsInfo(key);
            var profile = StandardsAdapter.getProfile(key);
            MessageToast.show("Standards profile updated to: " + profile.label);
        },

        _applyAuditFilter: function () {
            var actionFilter = this.byId("auditActionFilter").getSelectedKey();
            var entityFilter = this.byId("auditEntityFilter").getSelectedKey();
            var search       = (this._auditSearch || "").toLowerCase();

            var filtered = this._allAudit.filter(function (r) {
                if (actionFilter !== "ALL" && r.action !== actionFilter) return false;
                if (entityFilter !== "ALL" && r.entity !== entityFilter) return false;
                if (search) {
                    var text = [r.action, r.entity, r.entityName, r.userId, r.description].join(" ").toLowerCase();
                    if (!text.includes(search)) return false;
                }
                return true;
            });
            this.getView().getModel("auditLog").setProperty("/items", filtered);
        },

        // ══════════════════════════════════════════════════════════════
        // MAP CONFIGURATION
        // ══════════════════════════════════════════════════════════════
        _loadMapConfig: function () {
            fetch(`${BASE}/MapConfigs?$filter=configKey eq 'DEFAULT' and isActive eq true&$top=1`, { headers: H, credentials: CREDS })
                .then(r => r.json())
                .then(j => {
                    const cfg = (j.value || [])[0];
                    if (!cfg) return;
                    this._mapConfigId = cfg.ID;
                    const model = this.getView().getModel("mapConfig");
                    // Flat fields
                    model.setProperty("/configKey",           cfg.configKey || "DEFAULT");
                    model.setProperty("/displayName",         cfg.displayName || "");
                    model.setProperty("/isActive",            cfg.isActive !== false);
                    model.setProperty("/defaultCenter_lat",   cfg.defaultCenter_lat || -27.0);
                    model.setProperty("/defaultCenter_lng",   cfg.defaultCenter_lng || 133.0);
                    model.setProperty("/defaultZoom",         cfg.defaultZoom || 5);
                    model.setProperty("/projection",          cfg.projection || "EPSG:4326");
                    model.setProperty("/projectionNote",      cfg.projectionNote || "");
                    model.setProperty("/defaultBaseMap",      cfg.defaultBaseMap || "osm");
                    model.setProperty("/clusteringEnabled",   cfg.clusteringEnabled !== false);
                    model.setProperty("/clusterRadius",       cfg.clusterRadius || 60);
                    model.setProperty("/maxZoomBeforeCluster",cfg.maxZoomBeforeCluster || 15);
                    model.setProperty("/notes",               cfg.notes || "");
                    // Parse ESRI config
                    if (cfg.esriConfig) {
                        try {
                            const esri = JSON.parse(cfg.esriConfig);
                            model.setProperty("/esriPortalUrl",         esri.portalUrl         || "");
                            model.setProperty("/esriFeatureServiceUrl", esri.featureServiceUrl || "");
                            model.setProperty("/esriApiKey",            esri.apiKey            || "");
                            model.setProperty("/esriQueryWhere",        esri.queryWhere        || "1=1");
                        } catch (e) { /* ignore */ }
                    }
                    // Parse draw config
                    if (cfg.drawConfig) {
                        try {
                            const dc = JSON.parse(cfg.drawConfig);
                            model.setProperty("/drawPolygonColor", dc.polygonColor  || "#0070F2");
                            model.setProperty("/drawRectColor",    dc.rectangleColor || "#E9730C");
                            model.setProperty("/drawCircleColor",  dc.circleColor   || "#107E3E");
                            model.setProperty("/drawFillOpacity",  dc.fillOpacity   || 0.12);
                        } catch (e) { /* ignore */ }
                    }
                    // Parse custom base maps for table
                    if (cfg.customBaseMaps) {
                        try { model.setProperty("/parsedBaseMaps", JSON.parse(cfg.customBaseMaps)); } catch (e) { model.setProperty("/parsedBaseMaps", []); }
                    }
                    // Parse reference layers for table
                    if (cfg.referenceLayers) {
                        try { model.setProperty("/parsedRefLayers", JSON.parse(cfg.referenceLayers)); } catch (e) { model.setProperty("/parsedRefLayers", []); }
                    }
                })
                .catch(e => console.warn("MapConfig load error:", e));
        },

        onMapConfigChange: function () { /* auto-detected via model binding */ },

        onSaveMapConfig: function () {
            const model  = this.getView().getModel("mapConfig");
            const data   = model.getData();

            // Re-serialise sub-objects from flat fields
            const esriConfig  = JSON.stringify({
                portalUrl        : data.esriPortalUrl         || "https://www.arcgis.com",
                featureServiceUrl: data.esriFeatureServiceUrl || "",
                apiKey           : data.esriApiKey            || "",
                queryWhere       : data.esriQueryWhere        || "1=1"
            });
            const drawConfig  = JSON.stringify({
                polygonColor  : data.drawPolygonColor || "#0070F2",
                rectangleColor: data.drawRectColor    || "#E9730C",
                circleColor   : data.drawCircleColor  || "#107E3E",
                fillOpacity   : parseFloat(data.drawFillOpacity) || 0.12,
                weight        : 2,
                dashArray     : "6,4"
            });
            const customBaseMaps = JSON.stringify(data.parsedBaseMaps || []);
            const refLayers      = JSON.stringify(data.parsedRefLayers || []);

            const body = {
                configKey           : data.configKey           || "DEFAULT",
                displayName         : data.displayName,
                isActive            : data.isActive !== false,
                defaultCenter_lat   : parseFloat(data.defaultCenter_lat) || -27.0,
                defaultCenter_lng   : parseFloat(data.defaultCenter_lng) || 133.0,
                defaultZoom         : parseInt(data.defaultZoom)         || 5,
                projection          : data.projection          || "EPSG:4326",
                projectionNote      : data.projectionNote,
                defaultBaseMap      : data.defaultBaseMap       || "osm",
                clusteringEnabled   : data.clusteringEnabled !== false,
                clusterRadius       : parseInt(data.clusterRadius)         || 60,
                maxZoomBeforeCluster: parseInt(data.maxZoomBeforeCluster)  || 15,
                notes               : data.notes,
                esriConfig, drawConfig, customBaseMaps, referenceLayers: refLayers
            };

            const url    = this._mapConfigId
                ? `${BASE}/MapConfigs(${this._mapConfigId})`
                : `${BASE}/MapConfigs`;

            (this._mapConfigId ? AuthFetch.patch(url, body) : AuthFetch.post(url, body))
                .then(r => {
                    if (!r.ok) return r.json().then(b => { throw new Error(_errMsg(r.status, b)); });
                    return r.json();
                })
                .then(saved => {
                    if (saved.ID) this._mapConfigId = saved.ID;
                    MessageToast.show("Map configuration saved successfully");
                })
                .catch(e => MessageBox.error("Save failed: " + e.message));
        },

        onResetMapConfig: function () {
            MessageBox.confirm("Reset map config to system defaults? This will overwrite your current settings.", {
                onClose: (action) => {
                    if (action !== "OK") return;
                    // Clear ID so next save creates new record
                    this._mapConfigId = null;
                    const model = this.getView().getModel("mapConfig");
                    model.setData({
                        configKey: "DEFAULT", displayName: "NHVR National Bridge Map — Default",
                        isActive: true, defaultCenter_lat: -27.0, defaultCenter_lng: 133.0,
                        defaultZoom: 5, projection: "EPSG:4326", projectionNote: "",
                        defaultBaseMap: "osm", clusteringEnabled: true, clusterRadius: 60,
                        maxZoomBeforeCluster: 15, notes: "",
                        esriPortalUrl: "https://www.arcgis.com", esriFeatureServiceUrl: "", esriApiKey: "", esriQueryWhere: "1=1",
                        drawPolygonColor: "#0070F2", drawRectColor: "#E9730C", drawCircleColor: "#107E3E", drawFillOpacity: 0.12,
                        parsedBaseMaps: [], parsedRefLayers: []
                    });
                    MessageToast.show("Defaults restored — click Save Config to persist");
                }
            });
        },

        onAddCustomBaseMap: function () {
            const model = this.getView().getModel("mapConfig");
            const existing = model.getProperty("/parsedBaseMaps") || [];
            // Open a quick-add dialog
            const Dialog      = sap.m.Dialog;
            const Input       = sap.m.Input;
            const Button      = sap.m.Button;
            const VBox        = sap.m.VBox;
            const Label       = sap.m.Label;
            const CheckBox    = sap.m.CheckBox;
            const keyI   = new Input({ placeholder: "unique key e.g. 'custom1'", width: "100%" });
            const nameI  = new Input({ placeholder: "Display name e.g. 'My Aerial'", width: "100%" });
            const urlI   = new Input({ placeholder: "https://{s}.example.com/{z}/{x}/{y}.png", width: "100%" });
            const attrI  = new Input({ placeholder: "© Provider attribution", width: "100%" });
            const zoomI  = new Input({ placeholder: "19", value: "19", type: "Number", width: "100%" });
            const defChk = new CheckBox({ text: "Set as default base map", selected: false });
            const dialog = new Dialog({
                title: "Add Custom Base Map", contentWidth: "440px",
                content: [ new VBox({ items: [
                    new Label({ text: "Key (unique)", design: "Bold" }), keyI,
                    new Label({ text: "Display Name", design: "Bold" }), nameI,
                    new Label({ text: "Tile URL (XYZ template)", design: "Bold" }), urlI,
                    new Label({ text: "Attribution Text", design: "Bold" }), attrI,
                    new Label({ text: "Max Zoom" }), zoomI, defChk
                ]}).addStyleClass("sapUiSmallMargin")],
                buttons: [
                    new Button({ text: "Add", type: "Emphasized", press: () => {
                        const key = keyI.getValue().trim();
                        const url = urlI.getValue().trim();
                        if (!key || !url) { MessageToast.show("Key and URL are required"); return; }
                        const updated = [...existing, { key, name: nameI.getValue() || key, url, attribution: attrI.getValue(), maxZoom: parseInt(zoomI.getValue()) || 19, isDefault: defChk.getSelected() }];
                        model.setProperty("/parsedBaseMaps", updated);
                        if (defChk.getSelected()) model.setProperty("/defaultBaseMap", key);
                        dialog.close();
                    }}),
                    new Button({ text: "Cancel", press: () => dialog.close() })
                ],
                afterClose: () => dialog.destroy()
            });
            dialog.open();
        },

        onDeleteCustomBaseMap: function (e) {
            const ctx  = e.getSource().getBindingContext("mapConfig");
            const key  = ctx.getProperty("key");
            const model = this.getView().getModel("mapConfig");
            const list  = (model.getProperty("/parsedBaseMaps") || []).filter(b => b.key !== key);
            model.setProperty("/parsedBaseMaps", list);
        },

        onAddReferenceLayer: function () {
            const model = this.getView().getModel("mapConfig");
            const existing = model.getProperty("/parsedRefLayers") || [];
            const Input     = sap.m.Input;
            const Button    = sap.m.Button;
            const VBox      = sap.m.VBox;
            const Label     = sap.m.Label;
            const Select    = sap.m.Select;
            const Item      = sap.ui.core.Item;
            const CheckBox  = sap.m.CheckBox;
            const idI    = new Input({ placeholder: "unique_id_no_spaces", width: "100%" });
            const nameI  = new Input({ placeholder: "Friendly display name", width: "100%" });
            const typeS  = new Select({ width: "100%", items: [
                new Item({ key: "geojson", text: "GeoJSON URL" }),
                new Item({ key: "wms",     text: "WMS Service"   }),
                new Item({ key: "xyz",     text: "XYZ Tiles"     }),
                new Item({ key: "esri_feature", text: "ESRI Feature Service" })
            ]});
            const urlI   = new Input({ placeholder: "https://...", width: "100%" });
            const wmsI   = new Input({ placeholder: "WMS layer names (e.g. 0,1)", width: "100%" });
            const descI  = new Input({ placeholder: "Human-readable description", width: "100%" });
            const defChk = new CheckBox({ text: "Auto-load on map startup", selected: false });
            const dialog = new sap.m.Dialog({
                title: "Add Reference Layer", contentWidth: "460px",
                content: [ new VBox({ items: [
                    new Label({ text: "Layer ID (unique)", design: "Bold" }), idI,
                    new Label({ text: "Display Name", design: "Bold" }), nameI,
                    new Label({ text: "Type", design: "Bold" }), typeS,
                    new Label({ text: "URL", design: "Bold" }), urlI,
                    new Label({ text: "WMS Layer Names (if WMS)" }), wmsI,
                    new Label({ text: "Description" }), descI, defChk
                ]}).addStyleClass("sapUiSmallMargin")],
                buttons: [
                    new Button({ text: "Add", type: "Emphasized", press: () => {
                        const id  = idI.getValue().trim().replace(/\s+/g, "_");
                        const url = urlI.getValue().trim();
                        if (!id || !url) { MessageToast.show("ID and URL are required"); return; }
                        const entry = {
                            id, name: nameI.getValue() || id,
                            type: typeS.getSelectedKey(),
                            url, wmsLayers: wmsI.getValue() || "0",
                            description: descI.getValue(),
                            isDefault  : defChk.getSelected()
                        };
                        model.setProperty("/parsedRefLayers", [...existing, entry]);
                        dialog.close();
                    }}),
                    new Button({ text: "Cancel", press: () => dialog.close() })
                ],
                afterClose: () => dialog.destroy()
            });
            dialog.open();
        },

        onEditReferenceLayer: function (e) {
            MessageToast.show("To edit, delete and re-add the layer. This ensures clean JSON is saved.");
        },

        // ══════════════════════════════════════════════════════════════
        // MAP PROVIDER CONFIG (MapProviderConfigs entity)
        // ══════════════════════════════════════════════════════════════
        _loadMapProviderConfig: function () {
            var self = this;
            fetch(`${BASE}/MapProviderConfigs?$filter=isActive eq true&$top=1`, {
                headers: H, credentials: CREDS
            }).then(function (r) { return r.json(); })
            .then(function (j) {
                var config = (j.value && j.value[0]) || {
                    mapProvider: "osm-leaflet", geocodeProvider: "nominatim", routingProvider: "osrm",
                    defaultZoom: 4, clusterEnabled: true, clusterRadius: 50,
                    trafficLayerEnabled: false, streetViewEnabled: false
                };
                config._id = (j.value && j.value[0] && j.value[0].ID) || null;
                // Load API key status via getMapApiConfig action
                return fetch(`${BASE}/getMapApiConfig()`, { headers: H, credentials: CREDS })
                    .then(function (r2) {
                        if (!r2.ok) return {};
                        return r2.json();
                    })
                    .then(function (apiConfig) {
                        config.googleKeyStatus = (apiConfig && apiConfig.googleMapsApiKey) ? "Configured" : "Not configured";
                        config.esriKeyStatus   = (apiConfig && apiConfig.esriApiKey)       ? "Configured" : "Not configured";
                        self.getView().setModel(new JSONModel(config), "mapProviderConfig");
                    });
            })
            .catch(function (e) { console.warn("MapProviderConfig load error:", e); });
        },

        onMapProviderConfigChange: function () { /* auto-detected via model binding */ },

        onSaveMapProviderConfig: function () {
            var model = this.getView().getModel("mapProviderConfig");
            var data  = model.getData();
            var id    = data._id;
            var payload = {
                mapProvider:         data.mapProvider,
                geocodeProvider:     data.geocodeProvider,
                routingProvider:     data.routingProvider,
                defaultZoom:         parseInt(data.defaultZoom) || 4,
                clusterEnabled:      data.clusterEnabled,
                clusterRadius:       parseInt(data.clusterRadius) || 50,
                trafficLayerEnabled: data.trafficLayerEnabled,
                streetViewEnabled:   data.streetViewEnabled,
                isActive:            true
            };

            var url    = id ? `${BASE}/MapProviderConfigs(${id})` : `${BASE}/MapProviderConfigs`;

            (id ? AuthFetch.patch(url, payload) : AuthFetch.post(url, payload)).then(function (r) {
                if (!r.ok) return r.json().then(function (b) { throw new Error(_errMsg(r.status, b)); });
                return r.json();
            }).then(function (saved) {
                if (saved && saved.ID) model.setProperty("/_id", saved.ID);
                MessageToast.show("Map provider settings saved");
            }).catch(function (e) {
                MessageBox.error("Failed to save map provider settings: " + e.message);
            });
        },

        onTestMapConnection: function () {
            MessageToast.show("Testing map provider connection...");
            var provider = this.getView().getModel("mapProviderConfig").getProperty("/mapProvider");
            var testUrls = {
                "osm-leaflet":  "https://tile.openstreetmap.org/0/0/0.png",
                "osm-maplibre": "https://tiles.openfreemap.org/styles/liberty",
                "google":       "https://maps.googleapis.com/maps/api/js",
                "esri":         "https://js.arcgis.com/4.28/"
            };
            var url = testUrls[provider];
            if (url) {
                fetch(url, { mode: "no-cors" })
                    .then(function () { MessageToast.show("Connection OK: " + provider); })
                    .catch(function () { MessageBox.warning("Could not reach " + provider + " tile server"); });
            } else {
                MessageToast.show("No test URL configured for provider: " + provider);
            }
        }
    });
});
