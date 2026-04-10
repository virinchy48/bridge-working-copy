// ============================================================
// NHVR Mass Edit Controller — Multi-Entity Editable Grid
// Supports: Bridges, Restrictions, Defects, Inspection Orders, Permits
// Features: Column picker, Bulk Apply, Dynamic Custom Attributes
// ============================================================
sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageToast",
    "sap/m/MessageBox",
    "sap/m/Column",
    "sap/m/Text",
    "sap/m/Input",
    "sap/m/Select",
    "sap/m/DatePicker",
    "sap/m/CheckBox",
    "sap/m/Button",
    "sap/m/ColumnListItem",
    "sap/ui/core/Item",
    "nhvr/bridgemanagement/model/CapabilityManager",
    "nhvr/bridgemanagement/util/UserAnalytics",
    "nhvr/bridgemanagement/util/ReferenceData",
    "nhvr/bridgemanagement/util/LookupService"
], function (
    Controller, JSONModel, MessageToast, MessageBox,
    Column, Text, Input, Select, DatePicker, CheckBox, Button,
    ColumnListItem, CoreItem, CapabilityManager, UserAnalytics, ReferenceData, LookupService
) {
    "use strict";

    const BASE = "/bridge-management";

    var _IS_LOC = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
    var _AUTH_H = _IS_LOC ? { "Authorization": "Basic " + btoa("admin:admin") } : {};
    function _credOpts(extraHeaders) {
        var opts = { headers: Object.assign({ Accept: "application/json" }, _AUTH_H, extraHeaders || {}) };
        if (!_IS_LOC) opts.credentials = "include";
        return opts;
    }

    // ─────────────────────────────────────────────────────────────
    // DYNAMIC OPTIONS — populated from OData Lookups via LookupService
    // ─────────────────────────────────────────────────────────────
    // All option arrays below start empty and are patched in onInit after
    // LookupService.load() resolves. This ensures zero hardcoded business data.
    var CONDITION_OPTIONS   = [["", "—"]];
    var POSTING_OPTIONS     = [["", "—"]];
    var SCOUR_OPTIONS       = [["", "—"]];
    var SEVERITY_OPTIONS    = [["", "—"]];
    var DEFECT_STATUS_OPT   = [["", "—"]];
    var RESTR_STATUS_OPT    = [["", "—"]];
    var INSP_STATUS_OPT     = [["", "—"]];
    var DEFECT_PRIORITY_OPT = [["", "—"]];
    var RESTR_TYPE_OPTIONS  = [["", "—"]];
    var PERMIT_STATUS_OPT   = [["", "—"]];
    var PERMIT_TYPE_OPT     = [["", "—"]];

    // ─────────────────────────────────────────────────────────────
    // ENTITY CONFIGURATION
    // ─────────────────────────────────────────────────────────────
    const ENTITY_CONFIG = {

        BRIDGE: {
            entitySet: "Bridges",
            label: "Bridge",
            idField: "ID",
            displayId: "bridgeId",
            filterStateField: "state",
            searchFields: ["bridgeId", "name"],
            orderby: "bridgeId",
            selectFields: ["ID","bridgeId","name","state","region","condition","conditionRating","conditionScore","postingStatus","nhvrRouteAssessed","inspectionDate","freightRoute","overMassRoute","highPriorityAsset","scourRisk","assetOwner","lga","maintenanceAuthority","structureType","material","yearBuilt","spanLengthM","deckWidthM","clearanceHeightM","numberOfSpans","numberOfLanes","totalLengthM","widthM","latitude","longitude","floodImpacted","remarks","version"],
            defaultFields: ["bridgeId","name","state","condition","conditionRating","postingStatus","nhvrRouteAssessed","inspectionDate"],
            customAttrEntity: "BRIDGE",
            customAttrFetch: "bridge",
            fields: {
                bridgeId:             { label: "Bridge ID",           type: "text",    width: "130px", editable: "new" },
                name:                 { label: "Name",                type: "text",    width: "200px" },
                state:                { label: "State",               type: "select",  width: "80px",  options: [["","—"]] },
                region:               { label: "Region",              type: "text",    width: "130px" },
                condition:            { label: "Condition",           type: "select",  width: "100px", options: CONDITION_OPTIONS },
                conditionRating:      { label: "Rating (1-10)",       type: "number",  width: "80px" },
                conditionScore:       { label: "Score (0-100)",       type: "number",  width: "80px" },
                postingStatus:        { label: "Posting Status",      type: "select",  width: "120px", options: POSTING_OPTIONS },
                nhvrRouteAssessed:    { label: "NHVR Assessed",       type: "boolean", width: "90px" },
                inspectionDate:       { label: "Inspection Date",     type: "date",    width: "110px" },
                freightRoute:         { label: "Freight Route",       type: "boolean", width: "80px" },
                overMassRoute:        { label: "Over Mass Route",     type: "boolean", width: "90px" },
                highPriorityAsset:    { label: "High Priority",       type: "boolean", width: "80px" },
                scourRisk:            { label: "Scour Risk",          type: "select",  width: "100px", options: SCOUR_OPTIONS },
                floodImpacted:        { label: "Flood Impacted",      type: "boolean", width: "80px" },
                assetOwner:           { label: "Asset Owner",         type: "text",    width: "150px" },
                lga:                  { label: "LGA",                 type: "text",    width: "120px" },
                maintenanceAuthority: { label: "Maint. Authority",    type: "text",    width: "150px" },
                structureType:        { label: "Structure Type",      type: "text",    width: "130px" },
                material:             { label: "Material",            type: "text",    width: "100px" },
                yearBuilt:            { label: "Year Built",          type: "number",  width: "80px" },
                numberOfSpans:        { label: "# Spans",             type: "number",  width: "70px" },
                numberOfLanes:        { label: "# Lanes",             type: "number",  width: "70px" },
                spanLengthM:          { label: "Span Length (m)",     type: "decimal", width: "100px" },
                deckWidthM:           { label: "Deck Width (m)",      type: "decimal", width: "100px" },
                totalLengthM:         { label: "Total Length (m)",    type: "decimal", width: "100px" },
                widthM:               { label: "Width (m)",           type: "decimal", width: "90px" },
                clearanceHeightM:     { label: "Clearance (m)",       type: "decimal", width: "90px" },
                latitude:             { label: "Latitude",            type: "decimal", width: "100px" },
                longitude:            { label: "Longitude",           type: "decimal", width: "100px" },
                remarks:              { label: "Remarks",             type: "text",    width: "200px" }
            }
        },

        RESTRICTION: {
            entitySet: "Restrictions",
            label: "Restriction",
            idField: "ID",
            displayId: "restrictionType",
            filterStateField: null,
            searchFields: ["restrictionType", "notes"],
            orderby: "restrictionType",
            selectFields: ["ID","restrictionType","value","unit","notes","status","isActive","validFromDate","validToDate","isTemporary","temporaryApprovedBy","temporaryApprovalRef","bridgeId","bridgeName","directionApplied","vehicleClassLabel","version"],
            defaultFields: ["restrictionType","value","unit","status","isActive","validFromDate","validToDate"],
            customAttrEntity: "RESTRICTION",
            customAttrFetch: "entity",
            fields: {
                restrictionType:       { label: "Type",              type: "select",  width: "160px", options: RESTR_TYPE_OPTIONS },
                value:                 { label: "Value",             type: "decimal", width: "80px" },
                unit:                  { label: "Unit",              type: "text",    width: "60px" },
                notes:                 { label: "Notes",             type: "text",    width: "220px" },
                status:                { label: "Status",            type: "select",  width: "110px", options: RESTR_STATUS_OPT },
                isActive:              { label: "Active",            type: "boolean", width: "70px" },
                isTemporary:           { label: "Temporary",         type: "boolean", width: "80px" },
                validFromDate:         { label: "Valid From",        type: "date",    width: "110px" },
                validToDate:           { label: "Valid To",          type: "date",    width: "110px" },
                temporaryApprovedBy:   { label: "Approved By",       type: "text",    width: "130px" },
                temporaryApprovalRef:  { label: "Approval Ref",      type: "text",    width: "130px" },
                directionApplied:      { label: "Direction",         type: "text",    width: "110px" },
                vehicleClassLabel:     { label: "Vehicle Class",     type: "text",    width: "130px" },
                bridgeId:              { label: "Bridge ID",         type: "text",    width: "110px", editable: false },
                bridgeName:            { label: "Bridge Name",       type: "text",    width: "180px", editable: false }
            }
        },

        DEFECT: {
            entitySet: "BridgeDefects",
            label: "Defect",
            idField: "ID",
            displayId: "defectCategory",
            filterStateField: null,
            searchFields: ["defectCategory", "elementName"],
            orderby: "defectCategory",
            selectFields: ["ID","defectCategory","severity","status","detectedDate","closedDate","elementGroup","elementName","detectedBy","bridgeId","bridgeName","priority","structuralRisk","location"],
            defaultFields: ["defectCategory","severity","status","detectedDate","bridgeId"],
            customAttrEntity: "DEFECT",
            customAttrFetch: "entity",
            fields: {
                defectCategory:  { label: "Category",        type: "text",    width: "150px" },
                severity:        { label: "Severity",        type: "select",  width: "100px", options: SEVERITY_OPTIONS },
                status:          { label: "Status",          type: "select",  width: "110px", options: DEFECT_STATUS_OPT },
                priority:        { label: "Priority",        type: "select",  width: "100px", options: DEFECT_PRIORITY_OPT },
                detectedDate:    { label: "Detected Date",   type: "date",    width: "110px" },
                closedDate:      { label: "Closed Date",     type: "date",    width: "110px" },
                elementGroup:    { label: "Element Group",   type: "text",    width: "130px" },
                elementName:     { label: "Element",         type: "text",    width: "180px" },
                detectedBy:      { label: "Detected By",     type: "text",    width: "130px" },
                location:        { label: "Location",        type: "text",    width: "160px" },
                structuralRisk:  { label: "Structural Risk", type: "text",    width: "110px" },
                bridgeId:        { label: "Bridge ID",       type: "text",    width: "110px", editable: false },
                bridgeName:      { label: "Bridge Name",     type: "text",    width: "180px", editable: false }
            }
        },

        INSPECTION_ORDER: {
            entitySet: "InspectionOrders",
            label: "Inspection Order",
            idField: "ID",
            displayId: "orderNumber",
            filterStateField: null,
            searchFields: ["orderNumber", "inspector"],
            orderby: "orderNumber",
            selectFields: ["ID","orderNumber","inspectionType","status","plannedDate","completedAt","inspector","inspectorOrg","overallConditionRating","structuralAdequacy","maintenanceUrgency","bridgeId","bridgeName"],
            defaultFields: ["orderNumber","inspectionType","status","plannedDate","inspector"],
            customAttrEntity: "INSPECTION_ORDER",
            customAttrFetch: "entity",
            fields: {
                orderNumber:             { label: "Order No.",          type: "text",    width: "130px", editable: "new" },
                inspectionType:          { label: "Insp. Type",         type: "text",    width: "120px" },
                status:                  { label: "Status",             type: "select",  width: "120px", options: INSP_STATUS_OPT },
                plannedDate:             { label: "Planned Date",       type: "date",    width: "110px" },
                completedAt:             { label: "Completed At",       type: "text",    width: "130px" },
                inspector:               { label: "Inspector",          type: "text",    width: "150px" },
                inspectorOrg:            { label: "Inspector Org",      type: "text",    width: "150px" },
                overallConditionRating:  { label: "Condition Rating",   type: "number",  width: "100px" },
                structuralAdequacy:      { label: "Struct. Adequacy",   type: "text",    width: "120px" },
                maintenanceUrgency:      { label: "Maint. Urgency",     type: "text",    width: "120px" },
                bridgeId:                { label: "Bridge ID",          type: "text",    width: "110px", editable: false },
                bridgeName:              { label: "Bridge Name",        type: "text",    width: "180px", editable: false }
            }
        },

        PERMIT: {
            entitySet: "VehiclePermits",
            label: "Permit",
            idField: "ID",
            displayId: "permitId",
            filterStateField: null,
            searchFields: ["permitId", "nhvrPermitNumber", "applicantName"],
            orderby: "permitId",
            selectFields: ["ID","permitId","permitStatus","permitType","applicantName","applicantABN","nhvrPermitNumber","issueDate","expiryDate","effectiveFrom","assessedGVM_t","assessedHeight_m","assessedWidth_m","assessedLength_m","bridgeId","bridgeName"],
            defaultFields: ["permitId","permitStatus","permitType","applicantName","issueDate","expiryDate"],
            customAttrEntity: "PERMIT",
            customAttrFetch: "entity",
            fields: {
                permitId:          { label: "Permit ID",       type: "text",    width: "130px", editable: "new" },
                permitStatus:      { label: "Status",          type: "select",  width: "110px", options: PERMIT_STATUS_OPT },
                permitType:        { label: "Type",            type: "text",    width: "110px" },
                applicantName:     { label: "Applicant",       type: "text",    width: "160px" },
                applicantABN:      { label: "ABN",             type: "text",    width: "110px" },
                nhvrPermitNumber:  { label: "NHVR Permit No.", type: "text",    width: "140px" },
                issueDate:         { label: "Issue Date",      type: "date",    width: "110px" },
                expiryDate:        { label: "Expiry Date",     type: "date",    width: "110px" },
                effectiveFrom:     { label: "Effective From",  type: "date",    width: "110px" },
                assessedGVM_t:     { label: "GVM (t)",         type: "decimal", width: "80px" },
                assessedHeight_m:  { label: "Height (m)",      type: "decimal", width: "80px" },
                assessedWidth_m:   { label: "Width (m)",       type: "decimal", width: "80px" },
                assessedLength_m:  { label: "Length (m)",      type: "decimal", width: "80px" },
                bridgeId:          { label: "Bridge ID",       type: "text",    width: "110px", editable: false },
                bridgeName:        { label: "Bridge Name",     type: "text",    width: "180px", editable: false }
            }
        }
    };

    // ─────────────────────────────────────────────────────────────
    // CONTROLLER
    // ─────────────────────────────────────────────────────────────
    return Controller.extend("nhvr.bridgemanagement.controller.MassEdit", {
        _allRows: [],
        _currentEntity: "BRIDGE",
        _customAttrs: [],
        _visibleFieldKeys: [],

        // ── Init ──────────────────────────────────────────────
        onInit: function () {
            UserAnalytics.trackView("MassEdit");
            this._model = new JSONModel({
                items: [],
                showStateFilter: true,
                bulkInputType: "text",
                bulkFieldKey: "",
                selectedCount: 0,
                customAttrInfo: ""
            });
            this.getView().setModel(this._model, "massEdit");
            // Load all lookup options from OData — replaces all hardcoded option arrays
            LookupService.load().then(function () {
                CONDITION_OPTIONS.length   = 0; Array.prototype.push.apply(CONDITION_OPTIONS,   LookupService.getMassEditOptions("CONDITION"));
                POSTING_OPTIONS.length     = 0; Array.prototype.push.apply(POSTING_OPTIONS,     LookupService.getMassEditOptions("POSTING_STATUS"));
                SCOUR_OPTIONS.length       = 0; Array.prototype.push.apply(SCOUR_OPTIONS,       LookupService.getMassEditOptions("SCOUR_RISK"));
                SEVERITY_OPTIONS.length    = 0; Array.prototype.push.apply(SEVERITY_OPTIONS,    LookupService.getMassEditOptions("DEFECT_SEVERITY"));
                DEFECT_STATUS_OPT.length   = 0; Array.prototype.push.apply(DEFECT_STATUS_OPT,   LookupService.getMassEditOptions("DEFECT_STATUS"));
                RESTR_STATUS_OPT.length    = 0; Array.prototype.push.apply(RESTR_STATUS_OPT,    LookupService.getMassEditOptions("RESTRICTION_STATUS"));
                INSP_STATUS_OPT.length     = 0; Array.prototype.push.apply(INSP_STATUS_OPT,     LookupService.getMassEditOptions("INSPECTION_STATUS"));
                DEFECT_PRIORITY_OPT.length = 0; Array.prototype.push.apply(DEFECT_PRIORITY_OPT, LookupService.getMassEditOptions("DEFECT_PRIORITY"));
                RESTR_TYPE_OPTIONS.length  = 0; Array.prototype.push.apply(RESTR_TYPE_OPTIONS,  LookupService.getMassEditOptions("RESTRICTION_TYPE"));
                PERMIT_STATUS_OPT.length   = 0; Array.prototype.push.apply(PERMIT_STATUS_OPT,   LookupService.getMassEditOptions("PERMIT_STATUS"));
                PERMIT_TYPE_OPT.length     = 0; Array.prototype.push.apply(PERMIT_TYPE_OPT,     LookupService.getMassEditOptions("PERMIT_TYPE"));
            });
            // Load state options from OData and update the BRIDGE field config
            ReferenceData.load().then(function () {
                ENTITY_CONFIG.BRIDGE.fields.state.options = ReferenceData.getStateOptions();
            });

            var self = this;
            CapabilityManager.load().then(function () {
                if (!CapabilityManager.guardRoute("MASS_EDIT", self.getOwnerComponent().getRouter())) return;
            });

            this.getOwnerComponent().getRouter()
                .getRoute("MassEdit")
                .attachPatternMatched(this._onRouteMatched, this);
        },

        onExit: function () {
            // Detach route listener
            var oRouter = this.getOwnerComponent().getRouter();
            var oRoute  = oRouter.getRoute("MassEdit");
            if (oRoute) oRoute.detachPatternMatched(this._onRouteMatched, this);
            // Clear any timers
            if (this._refreshTimer)  { clearTimeout(this._refreshTimer);  this._refreshTimer  = null; }
            if (this._pollInterval)  { clearInterval(this._pollInterval); this._pollInterval  = null; }
            // Destroy locally owned models
            if (this._model) { this._model.destroy(); }
            // Destroy cached dialogs/popovers
            if (this._colPickerDialog) { this._colPickerDialog.destroy(); this._colPickerDialog = null; }
            if (this._previewDialog)   { this._previewDialog.destroy();   this._previewDialog   = null; }
        },

        _onRouteMatched: function () {
            this._currentEntity = this.byId("meEntitySelector")
                ? (this.byId("meEntitySelector").getSelectedKey() || "BRIDGE")
                : "BRIDGE";
            this._resetView();
            this._loadEntityData();
        },

        _resetView: function () {
            const cfg = ENTITY_CONFIG[this._currentEntity];
            this._allRows = [];
            this._customAttrs = [];
            this._visibleFieldKeys = [...cfg.defaultFields];
            this._model.setProperty("/items", []);
            this._model.setProperty("/customAttrInfo", "");
            this._model.setProperty("/showStateFilter", !!cfg.filterStateField);
            this._model.setProperty("/selectedCount", 0);
            this._model.setProperty("/bulkFieldKey", "");
            this._model.setProperty("/bulkInputType", "text");
            const strip = this.byId("meDirtyStrip");
            if (strip) strip.setVisible(false);
        },

        // ── Entity Type Changed ────────────────────────────────
        onEntityTypeChange: function (e) {
            this._currentEntity = e.getParameter("item").getKey();
            this._resetView();
            this._loadEntityData();
        },

        // ── Load Data ─────────────────────────────────────────
        _loadEntityData: function () {
            const busy = this.byId("meBusyStrip");
            if (busy) {
                busy.setText("Loading " + ENTITY_CONFIG[this._currentEntity].label + " data…");
                busy.setVisible(true);
            }

            Promise.all([
                this._fetchEntityRows(),
                this._fetchCustomAttrs()
            ]).then(([rows, attrs]) => {
                this._customAttrs = attrs;
                return this._loadCustomAttrValues(rows);
            }).then(rows => {
                if (busy) busy.setVisible(false);
                this._allRows = rows;
                this._buildTable();
                this._applyFilter();
                this._updateCustomAttrInfo();
            }).catch(e => {
                if (busy) busy.setVisible(false);
                console.error(e);
                MessageToast.show("Failed to load data: " + e.message);
            });
        },

        _fetchEntityRows: function () {
            const cfg = ENTITY_CONFIG[this._currentEntity];
            const sel = cfg.selectFields.join(",");
            const url = BASE + "/" + cfg.entitySet + "?$select=" + sel + "&$orderby=" + cfg.orderby + "&$top=500";
            return fetch(url, _credOpts())
                .then(r => { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
                .then(j => (j.value || []).map(r => ({ ...r, _dirty: false, _isNew: false })));
        },

        _fetchCustomAttrs: function () {
            const entity = this._currentEntity;
            const url = BASE + "/AttributeDefinitions?$filter=entityTarget eq '" + entity + "' and isActive eq true and massEditEnabled eq true&$expand=validValues&$orderby=displayOrder&$top=100";
            return fetch(url, _credOpts())
                .then(r => r.json())
                .then(j => j.value || [])
                .catch(() => []);
        },

        _loadCustomAttrValues: function (rows) {
            if (!rows.length || !this._customAttrs.length) return Promise.resolve(rows);
            const ids    = rows.map(r => "'" + r.ID + "'").join(",");
            const entity = this._currentEntity;
            let url;

            if (entity === "BRIDGE") {
                url = BASE + "/BridgeAttributes?$filter=bridge_ID in (" + ids + ")&$select=bridge_ID,attribute_ID,value&$top=5000";
            } else {
                url = BASE + "/EntityAttributes?$filter=entityType eq '" + entity + "' and entityId in (" + ids + ")&$select=entityType,entityId,attribute_ID,value&$top=5000";
            }

            return fetch(url, { headers: { Accept: "application/json" } })
                .then(r => r.json())
                .then(j => {
                    const attrMap = {};
                    (j.value || []).forEach(av => {
                        const key = entity === "BRIDGE" ? av.bridge_ID : av.entityId;
                        if (!attrMap[key]) attrMap[key] = {};
                        attrMap[key][av.attribute_ID] = av.value;
                    });
                    return rows.map(row => {
                        const vals     = attrMap[row.ID] || {};
                        const extended = Object.assign({}, row);
                        this._customAttrs.forEach(attr => {
                            extended["attr_" + attr.ID]         = vals[attr.ID] !== undefined ? vals[attr.ID] : (attr.defaultValue || "");
                            extended["_attrExists_" + attr.ID]  = !!vals[attr.ID];
                        });
                        return extended;
                    });
                })
                .catch(() => rows);  // gracefully skip if EntityAttributes not yet deployed
        },

        _updateCustomAttrInfo: function () {
            const cnt = this._customAttrs.length;
            if (cnt > 0) {
                this._model.setProperty("/customAttrInfo",
                    cnt + " custom attribute" + (cnt !== 1 ? "s" : "") + " available for " +
                    ENTITY_CONFIG[this._currentEntity].label + " — use 'Columns' to add them to the grid.");
            } else {
                this._model.setProperty("/customAttrInfo", "");
            }
        },

        // ── Build Table (programmatic) ─────────────────────────
        _buildTable: function () {
            const table = this.byId("massEditTable");
            if (!table) return;

            const cfg = ENTITY_CONFIG[this._currentEntity];

            // Clear existing
            table.destroyColumns();
            table.unbindItems();

            const cells = [];

            this._visibleFieldKeys.forEach(key => {
                if (key.startsWith("attr_")) {
                    const attrId = key.replace("attr_", "");
                    const attr   = this._customAttrs.find(a => a.ID === attrId);
                    if (!attr) return;
                    table.addColumn(new Column({
                        width: "160px",
                        header: new Text({ text: attr.label + " ✦" })
                    }));
                    cells.push(this._makeAttrCell(key, attr));
                } else {
                    const fld = cfg.fields[key];
                    if (!fld) return;
                    table.addColumn(new Column({
                        width: fld.width || "120px",
                        header: new Text({ text: fld.label })
                    }));
                    cells.push(this._makeFieldCell(key, fld));
                }
            });

            // Delete button column
            table.addColumn(new Column({ width: "50px", hAlign: "Center", header: new Text({ text: "" }) }));
            cells.push(new Button({
                icon: "sap-icon://delete",
                tooltip: "Remove new row",
                type: "Transparent",
                visible: "{massEdit>_isNew}",
                press: this.onMEDeleteRow.bind(this)
            }));

            const template = new ColumnListItem({
                type: "Inactive",
                vAlign: "Middle",
                highlight: "{= ${massEdit>_dirty} ? 'Warning' : ${massEdit>_isNew} ? 'Information' : 'None'}",
                cells: cells
            });

            table.bindItems({
                path: "massEdit>/items",
                template: template
            });
        },

        _makeFieldCell: function (key, fld) {
            const isNewOnly = fld.editable === "new";

            // Read-only computed/navigation fields — render as plain Text
            if (fld.editable === false) {
                return new Text({
                    text: "{massEdit>" + key + "}",
                    wrapping: false
                });
            }

            switch (fld.type) {
                case "select": {
                    const sel = new Select({
                        selectedKey: "{massEdit>" + key + "}",
                        change: this.onMECellChange.bind(this),
                        width: fld.width || "120px"
                    });
                    (fld.options || []).forEach(function (o) {
                        sel.addItem(new CoreItem({ key: o[0], text: o[1] }));
                    });
                    return sel;
                }
                case "boolean":
                    return new CheckBox({
                        selected: "{massEdit>" + key + "}",
                        select: this.onMECellChange.bind(this)
                    });
                case "date":
                    return new DatePicker({
                        value: "{massEdit>" + key + "}",
                        displayFormat: "dd/MM/yyyy",
                        valueFormat: "yyyy-MM-dd",
                        change: this.onMECellChange.bind(this),
                        width: fld.width || "110px"
                    });
                default:
                    return new Input({
                        value: "{massEdit>" + key + "}",
                        editable: isNewOnly ? "{massEdit>_isNew}" : true,
                        valueLiveUpdate: true,
                        change: this.onMECellChange.bind(this),
                        width: fld.width || "120px"
                    });
            }
        },

        _makeAttrCell: function (key, attr) {
            switch (attr.dataType) {
                case "BOOLEAN":
                    return new CheckBox({
                        selected: "{massEdit>" + key + "}",
                        select: this.onMECellChange.bind(this)
                    });
                case "DATE":
                    return new DatePicker({
                        value: "{massEdit>" + key + "}",
                        displayFormat: "dd/MM/yyyy",
                        valueFormat: "yyyy-MM-dd",
                        change: this.onMECellChange.bind(this),
                        width: "140px"
                    });
                case "LOOKUP": {
                    const sel = new Select({
                        selectedKey: "{massEdit>" + key + "}",
                        change: this.onMECellChange.bind(this),
                        width: "150px"
                    });
                    sel.addItem(new CoreItem({ key: "", text: "—" }));
                    const vv = attr.validValues || [];
                    vv.forEach(function (v) {
                        sel.addItem(new CoreItem({ key: v.value, text: v.label || v.value }));
                    });
                    return sel;
                }
                default:
                    return new Input({
                        value: "{massEdit>" + key + "}",
                        valueLiveUpdate: true,
                        change: this.onMECellChange.bind(this),
                        width: "150px"
                    });
            }
        },

        // ── Column Picker ──────────────────────────────────────
        onColumnPickerOpen: function () {
            const cfg = ENTITY_CONFIG[this._currentEntity];

            const stdFields = Object.entries(cfg.fields).map(function (entry) {
                return { key: entry[0], label: entry[1].label, selected: this._visibleFieldKeys.includes(entry[0]) };
            }.bind(this));

            const custFields = this._customAttrs.map(function (attr) {
                const k = "attr_" + attr.ID;
                return { key: k, label: attr.label + " (custom)", selected: this._visibleFieldKeys.includes(k) };
            });

            const pickerModel = new JSONModel({ standardFields: stdFields, customFields: custFields });

            if (!this._colPickerDialog) {
                this._colPickerDialog = sap.ui.xmlfragment(
                    "nhvr.bridgemanagement.view.MassEditColumnPicker", this
                );
                this.getView().addDependent(this._colPickerDialog);
            }
            this._colPickerDialog.setModel(pickerModel, "colPicker");
            this._colPickerDialog.open();
        },

        onColumnPickerConfirm: function () {
            const m    = this._colPickerDialog.getModel("colPicker");
            const std  = m.getProperty("/standardFields");
            const cust = m.getProperty("/customFields");
            this._visibleFieldKeys = [
                ...std.filter(function (f) { return f.selected; }).map(function (f) { return f.key; }),
                ...cust.filter(function (f) { return f.selected; }).map(function (f) { return f.key; })
            ];
            this._colPickerDialog.close();
            this._buildTable();
        },

        onColumnPickerCancel: function () {
            if (this._colPickerDialog) this._colPickerDialog.close();
        },

        // ── Bulk Apply ─────────────────────────────────────────
        onBulkApplyToggle: function () {
            const panel = this.byId("meBulkApplyPanel");
            if (!panel) return;
            const wasVisible = panel.getVisible();
            panel.setVisible(!wasVisible);
            if (!wasVisible) this._rebuildBulkFieldSelector();
        },

        _rebuildBulkFieldSelector: function () {
            const sel = this.byId("meBulkField");
            if (!sel) return;
            sel.destroyItems();
            sel.addItem(new CoreItem({ key: "", text: "— select field —" }));
            const cfg = ENTITY_CONFIG[this._currentEntity];

            this._visibleFieldKeys.forEach(function (key) {
                if (key.startsWith("attr_")) {
                    const attr = this._customAttrs.find(function (a) { return a.ID === key.replace("attr_", ""); });
                    if (attr) sel.addItem(new CoreItem({ key: key, text: attr.label + " (custom)" }));
                } else {
                    const fld = cfg.fields[key];
                    if (fld && fld.editable !== "new") {
                        sel.addItem(new CoreItem({ key: key, text: fld.label }));
                    }
                }
            }.bind(this));

            this._model.setProperty("/bulkFieldKey", "");
            this._model.setProperty("/bulkInputType", "text");
        },

        onBulkApplyFieldChange: function () {
            const sel = this.byId("meBulkField");
            if (!sel) return;
            const key = sel.getSelectedKey();
            this._model.setProperty("/bulkFieldKey", key);
            if (!key) { this._model.setProperty("/bulkInputType", "text"); return; }

            if (key.startsWith("attr_")) {
                const attr = this._customAttrs.find(function (a) { return a.ID === key.replace("attr_", ""); });
                if (attr) {
                    const typeMap = { BOOLEAN: "boolean", DATE: "date", LOOKUP: "select", INTEGER: "number", DECIMAL: "decimal" };
                    const t = typeMap[attr.dataType] || "text";
                    this._model.setProperty("/bulkInputType", t);
                    if (t === "select") this._rebuildBulkValueSelect(attr.validValues || []);
                }
            } else {
                const fld = ENTITY_CONFIG[this._currentEntity].fields[key];
                if (fld) {
                    this._model.setProperty("/bulkInputType", fld.type || "text");
                    if (fld.type === "select") this._rebuildBulkValueSelect(fld.options || []);
                }
            }
        },

        _rebuildBulkValueSelect: function (opts) {
            const sel = this.byId("meBulkValueSelect");
            if (!sel) return;
            sel.destroyItems();
            sel.addItem(new CoreItem({ key: "", text: "—" }));
            opts.forEach(function (o) {
                if (Array.isArray(o)) {
                    sel.addItem(new CoreItem({ key: o[0], text: o[1] }));
                } else {
                    sel.addItem(new CoreItem({ key: o.value, text: o.label || o.value }));
                }
            });
        },

        onBulkApplyExecute: function () {
            const fieldKey = this._model.getProperty("/bulkFieldKey");
            if (!fieldKey) { MessageToast.show("Select a field first"); return; }

            const inputType = this._model.getProperty("/bulkInputType");
            let value;
            switch (inputType) {
                case "boolean": {
                    const cb = this.byId("meBulkValueBool");
                    value = cb ? cb.getSelected() : false;
                    break;
                }
                case "select": {
                    const sv = this.byId("meBulkValueSelect");
                    value = sv ? sv.getSelectedKey() : "";
                    break;
                }
                case "date": {
                    const dp = this.byId("meBulkValueDate");
                    value = dp ? dp.getValue() : "";
                    break;
                }
                default: {
                    const inp = this.byId("meBulkValueInput");
                    value = inp ? inp.getValue() : "";
                    break;
                }
            }

            const table    = this.byId("massEditTable");
            const selCtxs  = table ? table.getSelectedContexts() : [];
            const selPaths = new Set(selCtxs.map(function (c) { return c.getPath(); }));
            const items    = this._model.getProperty("/items");

            let applied = 0;
            items.forEach(function (row, i) {
                if (selPaths.size === 0 || selPaths.has("massEdit>/items/" + i)) {
                    items[i][fieldKey] = value;
                    if (!items[i]._isNew) items[i]._dirty = true;
                    applied++;
                }
            });
            this._model.setProperty("/items", items);
            this._updateSaveBtn();
            MessageToast.show("Applied to " + applied + " row" + (applied !== 1 ? "s" : ""));
        },

        // ── Selection Tracking ─────────────────────────────────
        onTableSelectionChange: function () {
            const table = this.byId("massEditTable");
            const cnt   = table ? table.getSelectedContexts().length : 0;
            this._model.setProperty("/selectedCount", cnt);
        },

        // ── Filter ────────────────────────────────────────────
        _applyFilter: function () {
            const cfg    = ENTITY_CONFIG[this._currentEntity];
            const state  = this.byId("meFilterState") ? this.byId("meFilterState").getSelectedKey() : "ALL";
            const search = (this.byId("meSearch") ? this.byId("meSearch").getValue() : "").toLowerCase();

            let data = this._allRows;
            if (cfg.filterStateField && state !== "ALL") {
                data = data.filter(function (r) { return r[cfg.filterStateField] === state; });
            }
            if (search) {
                data = data.filter(function (r) {
                    return cfg.searchFields.some(function (f) {
                        return (r[f] || "").toLowerCase().includes(search);
                    });
                });
            }
            this._model.setProperty("/items", data.map(function (r) { return Object.assign({}, r); }));
            const t = this.byId("meTableTitle");
            if (t) t.setText(cfg.label + " (" + data.length + ")");
        },

        onMEFilterChange: function () { this._applyFilter(); },

        // ── Cell Change ────────────────────────────────────────
        onMECellChange: function (e) {
            const src = e.getSource();
            const ctx = src.getBindingContext("massEdit");
            if (!ctx) return;
            const path = ctx.getPath();
            const row  = this._model.getProperty(path);
            if (row && !row._isNew) {
                this._model.setProperty(path + "/_dirty", true);
            }
            this._updateSaveBtn();
        },

        _updateSaveBtn: function () {
            const items    = this._model.getProperty("/items");
            const hasDirty = items.some(function (r) { return r._dirty || r._isNew; });
            const btn      = this.byId("meSaveBtn");
            if (btn) btn.setEnabled(hasDirty);

            const strip = this.byId("meDirtyStrip");
            if (strip) {
                const dirty   = items.filter(function (r) { return r._dirty; }).length;
                const newRows = items.filter(function (r) { return r._isNew; }).length;
                if (hasDirty) {
                    strip.setText(dirty + " modified row(s), " + newRows + " new row(s) pending save.");
                    strip.setVisible(true);
                } else {
                    strip.setVisible(false);
                }
            }
        },

        // ── Add / Delete Row ───────────────────────────────────
        onMEAddRow: function () {
            const cfg   = ENTITY_CONFIG[this._currentEntity];
            const blank = { ID: null, _dirty: false, _isNew: true };
            Object.keys(cfg.fields).forEach(function (k) { blank[k] = ""; });
            this._customAttrs.forEach(function (a) { blank["attr_" + a.ID] = ""; blank["_attrExists_" + a.ID] = false; });
            const items = this._model.getProperty("/items");
            items.unshift(blank);
            this._model.setProperty("/items", items);
            this._updateSaveBtn();
        },

        onMEDeleteRow: function (e) {
            const ctx   = e.getSource().getBindingContext("massEdit");
            if (!ctx) return;
            const idx   = parseInt(ctx.getPath().split("/").pop(), 10);
            const items = this._model.getProperty("/items");
            items.splice(idx, 1);
            this._model.setProperty("/items", items);
            this._updateSaveBtn();
        },

        // ── Save ───────────────────────────────────────────────
        onMESaveAll: function () {
            const items  = this._model.getProperty("/items");
            const toSave = items.filter(function (r) { return r._dirty || r._isNew; });
            if (!toSave.length) { MessageToast.show("No changes to save"); return; }
            this._showPreviewDialog(toSave);
        },

        _showPreviewDialog: function (rows) {
            const cfg = ENTITY_CONFIG[this._currentEntity];
            const allFields = [
                ...Object.entries(cfg.fields).map(function (e) { return { key: e[0], label: e[1].label }; }),
                ...this._customAttrs.map(function (a) { return { key: "attr_" + a.ID, label: a.label + " (custom)" }; })
            ];

            const previewRows = rows.map(function (row) {
                const original = this._allRows.find(function (r) { return r.ID === row.ID; }) || {};
                const changes  = allFields.filter(function (f) {
                    return this._visibleFieldKeys.includes(f.key) &&
                           String(original[f.key] ?? "") !== String(row[f.key] ?? "");
                }.bind(this)).map(function (f) {
                    return {
                        field:    f.label,
                        oldValue: String(original[f.key] !== undefined ? original[f.key] : "—"),
                        newValue: String(row[f.key]      !== undefined ? row[f.key]      : "—")
                    };
                });
                return { rowLabel: row[cfg.displayId] || "(new)", isNew: !!row._isNew, changes };
            }.bind(this));

            const previewModel = new JSONModel({ rows: previewRows });
            this.getView().setModel(previewModel, "preview");

            if (!this._previewDialog) {
                this._previewDialog = sap.ui.xmlfragment(
                    "nhvr.bridgemanagement.view.MassEditPreview", this
                );
                this.getView().addDependent(this._previewDialog);
            }
            this._previewRows = rows;
            this._previewDialog.open();
        },

        onPreviewConfirm: function () {
            UserAnalytics.trackAction("mass_edit_save", "MassEdit");
            this._previewDialog.close();
            var that = this;
            var nRows = (this._previewRows || []).length;
            var nFields = (this._visibleFieldKeys || []).length;
            sap.m.MessageBox.confirm(
                "Apply changes to " + nRows + " bridge" + (nRows !== 1 ? "s" : "") + "?\n" +
                "Fields modified: " + nFields + "\n\n" +
                "This will overwrite existing values. This action cannot be undone.",
                {
                    title: "Confirm Bulk Update",
                    emphasizedAction: sap.m.MessageBox.Action.OK,
                    actions: [sap.m.MessageBox.Action.OK, sap.m.MessageBox.Action.CANCEL],
                    onClose: function (sAction) {
                        if (sAction !== sap.m.MessageBox.Action.OK) return;
                        that._doSave(that._previewRows);
                    }
                }
            );
        },

        onPreviewCancel: function () {
            this._previewDialog.close();
            MessageToast.show("Save cancelled");
        },

        _doSave: async function (rows) {
            const cfg = ENTITY_CONFIG[this._currentEntity];
            const h   = { Accept: "application/json", "Content-Type": "application/json" };
            let saved = 0, failed = 0;

            for (const row of rows) {
                // Build standard payload (exclude meta fields + attr_ fields + read-only computed fields)
                const stdBody = {};
                Object.keys(cfg.fields).forEach(function (k) {
                    if (k === "ID") return;
                    const fld = cfg.fields[k];
                    if (fld.editable === false) return; // skip computed/navigation fields
                    let val = row[k];
                    if (val === "" || val === undefined || val === null) {
                        val = null;
                    } else if (fld.type === "number") {
                        val = parseInt(val, 10);
                        if (isNaN(val)) val = null;
                    } else if (fld.type === "decimal") {
                        val = parseFloat(val);
                        if (isNaN(val)) val = null;
                    } else if (fld.type === "boolean") {
                        val = !!val;
                    }
                    stdBody[k] = val;
                });

                // Custom attr payloads
                const attrChanges = this._customAttrs
                    .filter(function (attr) { return this._visibleFieldKeys.includes("attr_" + attr.ID); }.bind(this))
                    .map(function (attr) {
                        return {
                            attr,
                            key:     "attr_" + attr.ID,
                            value:   String(row["attr_" + attr.ID] || ""),
                            existed: !!row["_attrExists_" + attr.ID]
                        };
                    });

                try {
                    let entityId = row.ID;

                    if (row._isNew) {
                        const r = await fetch(BASE + "/" + cfg.entitySet, {
                            method: "POST", headers: h, body: JSON.stringify(stdBody)
                        });
                        if (!r.ok) throw new Error("POST HTTP " + r.status);
                        const created = await r.json();
                        entityId = created.ID;
                    } else {
                        // Include version for optimistic locking
                        if (row.version !== undefined && row.version !== null) {
                            stdBody.version = row.version;
                        }
                        const r = await fetch(BASE + "/" + cfg.entitySet + "(" + row.ID + ")", {
                            method: "PATCH", headers: h, body: JSON.stringify(stdBody)
                        });
                        if (r.status === 409) {
                            sap.m.MessageBox.warning(
                                "This record was modified by another user. Please refresh the page and retry your changes.",
                                { title: "Conflict Detected" }
                            );
                            failed++;
                            continue;
                        }
                        if (!r.ok) throw new Error("PATCH HTTP " + r.status);
                    }

                    // Save custom attribute values
                    for (const ac of attrChanges) {
                        if (cfg.customAttrFetch === "bridge") {
                            // BridgeAttribute path
                            const existing = await fetch(
                                BASE + "/BridgeAttributes?$filter=bridge_ID eq " + entityId + " and attribute_ID eq " + ac.attr.ID,
                                { headers: { Accept: "application/json" } }
                            ).then(function (r) { return r.json(); }).then(function (j) { return (j.value || [])[0]; }).catch(function () { return null; });

                            if (existing) {
                                await fetch(BASE + "/BridgeAttributes(" + existing.ID + ")", {
                                    method: "PATCH", headers: h, body: JSON.stringify({ value: ac.value })
                                });
                            } else if (ac.value) {
                                await fetch(BASE + "/BridgeAttributes", {
                                    method: "POST", headers: h,
                                    body: JSON.stringify({ bridge_ID: entityId, attribute_ID: ac.attr.ID, value: ac.value })
                                });
                            }
                        } else {
                            // EntityAttribute path
                            const existing = await fetch(
                                BASE + "/EntityAttributes?$filter=entityType eq '" + cfg.customAttrEntity + "' and entityId eq " + entityId + " and attribute_ID eq " + ac.attr.ID,
                                { headers: { Accept: "application/json" } }
                            ).then(function (r) { return r.json(); }).then(function (j) { return (j.value || [])[0]; }).catch(function () { return null; });

                            if (existing) {
                                await fetch(BASE + "/EntityAttributes(" + existing.ID + ")", {
                                    method: "PATCH", headers: h, body: JSON.stringify({ value: ac.value })
                                });
                            } else if (ac.value) {
                                await fetch(BASE + "/EntityAttributes", {
                                    method: "POST", headers: h,
                                    body: JSON.stringify({ entityType: cfg.customAttrEntity, entityId: entityId, attribute_ID: ac.attr.ID, value: ac.value })
                                });
                            }
                        }
                    }

                    saved++;
                } catch (err) {
                    console.error("Save failed for row:", err);
                    failed++;
                }
            }

            MessageToast.show("Saved: " + saved + (failed > 0 ? " | Failed: " + failed : ""));
            this._loadEntityData();
            const btn = this.byId("meSaveBtn");
            if (btn) btn.setEnabled(false);
        },

        // ── Discard ────────────────────────────────────────────
        onMEDiscard: function () {
            MessageBox.confirm("Discard all unsaved changes?", {
                onClose: function (action) {
                    if (action === MessageBox.Action.OK) this._loadEntityData();
                }.bind(this)
            });
        },

        // ── Export CSV ─────────────────────────────────────────
        onMEExport: function () {
            const items = this._model.getProperty("/items");
            if (!items.length) { MessageToast.show("No data to export"); return; }
            const cfg = ENTITY_CONFIG[this._currentEntity];

            const headerLabels = this._visibleFieldKeys.map(function (k) {
                if (k.startsWith("attr_")) {
                    const attr = this._customAttrs.find(function (a) { return a.ID === k.replace("attr_", ""); });
                    return attr ? attr.label : k;
                }
                return cfg.fields[k] ? cfg.fields[k].label : k;
            }.bind(this));

            const rows = items.map(function (r) {
                return this._visibleFieldKeys.map(function (k) {
                    return '"' + String(r[k] !== undefined && r[k] !== null ? r[k] : "").replace(/"/g, '""') + '"';
                }).join(",");
            }.bind(this));

            const csv  = [headerLabels.join(","), ...rows].join("\n");
            const blob = new Blob([csv], { type: "text/csv" });
            const url  = URL.createObjectURL(blob);
            const a    = document.createElement("a");
            a.href     = url;
            a.download = cfg.entitySet.toLowerCase() + "_mass_edit_" + new Date().toISOString().split("T")[0] + ".csv";
            a.click();
            URL.revokeObjectURL(url);
        },

        // ── Navigation ─────────────────────────────────────────
        onNavHome: function () { this.getOwnerComponent().getRouter().navTo("Home"); }
    });
});
