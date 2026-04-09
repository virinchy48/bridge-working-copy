// ============================================================
// NHVR Bridge Form Controller — Create / Edit Bridge
// ============================================================
sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/m/MessageToast",
    "sap/m/MessageBox",
    "nhvr/bridgemanagement/model/RoleManager"
], function (Controller, MessageToast, MessageBox, RoleManager) {
    "use strict";

    const BASE = "/bridge-management";

    var _IS_LOC = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
    var _AUTH_H = _IS_LOC ? { "Authorization": "Basic " + btoa("admin:admin") } : {};
    function _credOpts(extraHeaders) {
        var opts = { headers: Object.assign({ Accept: "application/json" }, _AUTH_H, extraHeaders || {}) };
        if (!_IS_LOC) opts.credentials = "include";
        return opts;
    }

    const REGIONS = {
        NSW: ["Central West","Far North Coast","Far West","Hunter","Illawarra","Mid North Coast",
              "New England","Northern Tablelands","Riverina Murray","South East","South West Slopes",
              "Southern Highlands","Southern Tablelands","Sydney Metro","Western NSW"],
        VIC: ["Barwon South West","Gippsland","Grampians","Hume","Inner Metropolitan",
              "Loddon Mallee","Outer Metropolitan"],
        QLD: ["Cape York","Central QLD","Darling Downs","Far North QLD","Fitzroy","Gold Coast",
              "Mackay","North QLD","South East QLD","South West QLD","Sunshine Coast","Wide Bay Burnett"],
        WA:  ["Gascoyne","Goldfields Esperance","Great Southern","Kimberley","Mid West",
              "Peel","Perth Metro","Pilbara","South West","Wheatbelt"],
        SA:  ["Adelaide Hills","Barossa","Clare Valley","Eyre Peninsula","Far North",
              "Fleurieu","Flinders Ranges","Kangaroo Island","Limestone Coast","Mid North",
              "Murray Mallee","Riverland","Yorke Peninsula"],
        TAS: ["East Coast","Far North West","Launceston","North West","Northern","Southern"],
        ACT: ["Australian Capital Territory"],
        NT:  ["Barkly","Big Rivers","Darwin","Katherine","MacDonnell","Top End","Victoria Daly"]
    };

    // Rating → condition label map (AS 5100 scale)
    const RATING_MAP = {
        10: { label: "Excellent",  state: "Success"  },
        9:  { label: "Very Good",  state: "Success"  },
        8:  { label: "Good",       state: "Success"  },
        7:  { label: "Good",       state: "Success"  },
        6:  { label: "Fair",       state: "Warning"  },
        5:  { label: "Fair",       state: "Warning"  },
        4:  { label: "Poor",       state: "Error"    },
        3:  { label: "Poor",       state: "Error"    },
        2:  { label: "Very Poor",  state: "Error"    },
        1:  { label: "Failed",     state: "Error"    }
    };

    return Controller.extend("nhvr.bridgemanagement.controller.BridgeForm", {

        _editMode : false,     // true = editing existing bridge
        _bridgeId : null,      // bridgeId string key (not UUID)
        _bridgeUUID: null,     // UUID for PATCH URL

        onInit: function () {
            const router = this.getOwnerComponent().getRouter();
            router.getRoute("BridgeNew").attachPatternMatched(this._onNew, this);
            router.getRoute("BridgeEdit").attachPatternMatched(this._onEdit, this);
        },

        // v4.7.9: Field-level RBAC for the Bridge create/edit form.
        // Each entry maps a control ID → feature/field key in RoleConfig.
        // Called after route match (_onNew / _onEdit) so all fields exist.
        _applyBridgeFieldRBAC: function () {
            try {
                RoleManager.applyFields(this.getView(), [
                    { id: "fBridgeId",           field: "bridge.bridgeId" },
                    { id: "fName",               field: "bridge.name" },
                    { id: "fAssetClass",         field: "bridge.assetClass" },
                    { id: "fState",              field: "bridge.state" },
                    { id: "fRegion",             field: "bridge.region" },
                    { id: "fLga",                field: "bridge.lga" },
                    { id: "fRoadRoute",          field: "bridge.roadRoute" },
                    { id: "fRouteNumber",        field: "bridge.routeNumber" },
                    { id: "fLatitude",           field: "bridge.latitude" },
                    { id: "fLongitude",          field: "bridge.longitude" },
                    { id: "fAssetOwner",         field: "bridge.assetOwner" },
                    { id: "fMaintAuth",          field: "bridge.maintAuth" },
                    { id: "fStructureType",      field: "bridge.structureType" },
                    { id: "fMaterial",           field: "bridge.material" },
                    { id: "fYearBuilt",          field: "bridge.yearBuilt" },
                    { id: "fDesignLoad",         field: "bridge.designLoad" },
                    { id: "fDesignStandard",     field: "bridge.designStandard" },
                    { id: "fClearance",          field: "bridge.clearance" },
                    { id: "fSpanLength",         field: "bridge.spanLength" },
                    { id: "fTotalLength",        field: "bridge.totalLength" },
                    { id: "fWidth",              field: "bridge.width" },
                    { id: "fSpans",              field: "bridge.spans" },
                    { id: "fLanes",              field: "bridge.lanes" },
                    { id: "fRatingSlider",       field: "bridge.conditionRating" },
                    { id: "fStructuralAdequacy", field: "bridge.structuralAdequacy" },
                    { id: "fPostingStatus",      field: "bridge.postingStatus" },
                    { id: "fScourRisk",          field: "bridge.scourRisk" },
                    { id: "fInspectionDate",     field: "bridge.inspectionDate" },
                    { id: "fNextInspDue",        field: "bridge.nextInspDue" },
                    { id: "fLoadRating",         field: "bridge.loadRating" },
                    { id: "fNhvrApprovalClass",  field: "bridge.nhvrApprovalClass" },
                    { id: "fImportanceLevel",    field: "bridge.importanceLevel" },
                    { id: "fAadt",               field: "bridge.aadt" },
                    { id: "fHeavyVehiclePct",    field: "bridge.heavyVehiclePct" },
                    { id: "fGazetteRef",         field: "bridge.gazetteRef" },
                    { id: "fNhvrRef",            field: "bridge.nhvrRef" },
                    { id: "fRemarks",            field: "bridge.remarks" }
                ]);
            } catch (_) { /* RoleManager unavailable — leave defaults */ }
        },

        _onNew: function () {
            this._editMode  = false;
            this._bridgeId  = null;
            this._bridgeUUID = null;
            this._dynAttrValues = {};
            this._dynAttrIds    = {};
            this._resetForm();
            this.byId("formTitle").setText("Add Bridge");
            this.byId("breadcrumbForm").setText("New Bridge");
            this.byId("fBridgeId").setEditable(true);
            this.byId("formErrorStrip").setVisible(false);
            this._loadAndRenderDynAttrs(null);
            this._applyBridgeFieldRBAC();
        },

        _onEdit: function (e) {
            const bid = decodeURIComponent(e.getParameter("arguments").bridgeId || "");
            this._editMode = true;
            this._bridgeId = bid;
            this._resetForm();
            this.byId("formTitle").setText("Edit Bridge");
            this.byId("breadcrumbForm").setText(bid);
            this.byId("fBridgeId").setEditable(false);
            this.byId("fBridgeId").setValue(bid);
            this.byId("formErrorStrip").setVisible(false);
            this._loadBridge(bid);
            this._applyBridgeFieldRBAC();
        },

        _loadBridge: function (bridgeId) {
            fetch(`${BASE}/Bridges?$filter=bridgeId eq '${bridgeId}'`, _credOpts())
                .then(r => r.json())
                .then(j => {
                    const b = (j.value || [])[0];
                    if (!b) { MessageToast.show("Bridge not found"); return; }
                    this._bridgeUUID = b.ID;
                    this._populateForm(b);
                    this._loadAndRenderDynAttrs(b.ID);
                    this._loadLoadRatings(b.ID);
                    this._loadBamsStatus(b.ID);
                    this._loadScourRisk(b.ID);
                    this._loadSensorDevices(b.ID);
                    var scourPanel    = this.byId("scourRiskPanel");
                    var forecastPanel = this.byId("forecastPanel");
                    var sensorsPanel  = this.byId("sensorsPanel");
                    if (scourPanel)    scourPanel.setVisible(true);
                    if (forecastPanel) forecastPanel.setVisible(true);
                    if (sensorsPanel)  sensorsPanel.setVisible(true);
                })
                .catch(() => MessageToast.show("Failed to load bridge data"));
        },

        _populateForm: function (b) {
            const set = (id, val) => { const c = this.byId(id); if (c && c.setValue) c.setValue(val || ""); };
            const setSk = (id, key) => { const c = this.byId(id); if (c && c.setSelectedKey) c.setSelectedKey(key || ""); };
            const setCb = (id, val) => { const c = this.byId(id); if (c && c.setSelected) c.setSelected(!!val); };

            set("fBridgeId",        b.bridgeId);
            set("fName",            b.name);
            setSk("fState",         b.state);
            this._populateRegions(b.state);
            setSk("fRegion",        b.region);
            set("fLga",             b.lga);
            set("fRoadRoute",       b.roadRoute);
            set("fRouteNumber",     b.routeNumber);
            set("fLatitude",        b.latitude);
            set("fLongitude",       b.longitude);
            set("fAssetOwner",      b.assetOwner);
            set("fMaintAuth",       b.maintenanceAuthority);
            setSk("fAssetClass",    b.assetClass || "BRIDGE");
            setSk("fStructureType", b.structureType);
            set("fMaterial",        b.material);
            set("fYearBuilt",       b.yearBuilt);
            setSk("fDesignLoad",    b.designLoad);
            set("fDesignStandard",  b.designStandard);
            set("fClearance",       b.clearanceHeightM);
            set("fSpanLength",      b.spanLengthM);
            set("fTotalLength",     b.totalLengthM);
            set("fWidth",           b.widthM);
            set("fSpans",           b.numberOfSpans);
            set("fLanes",           b.numberOfLanes);
            // Rating slider
            const rating = b.conditionRating || 7;
            const slider = this.byId("fRatingSlider");
            if (slider) slider.setValue(rating);
            this._updateRatingLabel(rating);
            // Status selects
            setSk("fPostingStatus", b.postingStatus);
            setSk("fScourRisk",     b.scourRisk);
            set("fInspectionDate",  b.inspectionDate);
            set("fNextInspDue",     b.nextInspectionDueDate);
            set("fConditionStandard", b.conditionStandard);
            set("fSeismicZone",     b.seismicZone);
            set("fRemarks",         b.remarks);
            setCb("fFloodImpacted", b.floodImpacted);
            setCb("fHighPriority",  b.highPriorityAsset);
            // Condition detail
            set("fStructuralAdequacy", b.structuralAdequacyRating);
            set("fAsBuiltRef",         b.asBuiltDrawingRef);
            set("fScourDepth",         b.scourDepthLastMeasuredM);
            set("fFloodImmunityARI",   b.floodImmunityARI);
            // NHVR
            set("fLoadRating",         b.loadRating);
            setSk("fNhvrApprovalClass", b.nhvrRouteApprovalClass);
            set("fImportanceLevel",    b.importanceLevel);
            set("fAadt",               b.aadtVehicles);
            set("fHeavyVehiclePct",    b.heavyVehiclePct);
            set("fGazetteRef",         b.gazetteRef);
            set("fNhvrRef",            b.nhvrRef);
            setCb("fNhvrAssessed",     b.nhvrRouteAssessed);
            setCb("fFreightRoute",     b.freightRoute);
            setCb("fOverMassRoute",    b.overMassRoute);
            setCb("fHmlApproved",      b.hmlApproved);
            setCb("fBdoubleApproved",  b.bdoubleApproved);
            // Financial
            set("fCurrentReplacementCost", b.currentReplacementCost);
            set("fRemainingUsefulLife",    b.remainingUsefulLifeYrs);
            set("fDesignLife",             b.designLife);
            // Provenance
            set("fDataSource",   b.dataSource);
            set("fSourceRefUrl", b.sourceRefURL);
            set("fOpenDataRef",  b.openDataRef);
            // External refs
            set("fBancId",  b.bancId);
            set("fBancUrl", b.bancURL);
            setSk("fExtSystem", b.primaryExternalSystem);
            set("fExtId",  b.primaryExternalId);
            set("fExtUrl", b.primaryExternalURL);
            set("fGeometry",        b.geometry);
        },

        _resetForm: function () {
            const clearIds = ["fBridgeId","fName","fLga","fRoadRoute","fRouteNumber",
                "fLatitude","fLongitude","fAssetOwner","fMaintAuth","fMaterial","fYearBuilt",
                "fClearance","fSpanLength","fTotalLength","fWidth","fSpans","fLanes",
                "fDesignStandard","fConditionStandard","fSeismicZone","fRemarks",
                "fStructuralAdequacy","fAsBuiltRef","fScourDepth","fFloodImmunityARI",
                "fLoadRating","fImportanceLevel","fAadt","fHeavyVehiclePct",
                "fGazetteRef","fNhvrRef","fDataSource","fSourceRefUrl","fOpenDataRef",
                "fCurrentReplacementCost","fRemainingUsefulLife","fDesignLife",
                "fBancId","fBancUrl","fExtId","fExtUrl","fInspectionDate","fNextInspDue","fGeometry"];
            clearIds.forEach(id => {
                const c = this.byId(id);
                if (c && c.setValue) c.setValue("");
            });
            ["fState","fRegion","fAssetClass","fStructureType","fDesignLoad","fScourRisk","fExtSystem","fPostingStatus","fNhvrApprovalClass"].forEach(id => {
                const c = this.byId(id); if (c) c.setSelectedKey("");
            });
            if (this.byId("fPostingStatus")) this.byId("fPostingStatus").setSelectedKey("UNRESTRICTED");
            ["fFloodImpacted","fHighPriority","fNhvrAssessed","fFreightRoute","fOverMassRoute","fHmlApproved","fBdoubleApproved"].forEach(id => {
                const c = this.byId(id); if (c) c.setSelected(false);
            });
            const slider = this.byId("fRatingSlider"); if (slider) slider.setValue(7);
            this._updateRatingLabel(7);
        },

        // ── Slider change ─────────────────────────────────────
        onRatingSliderChange: function (e) {
            this._updateRatingLabel(parseInt(e.getParameter("value")));
        },

        _updateRatingLabel: function (val) {
            const lbl = this.byId("fRatingLabel");
            if (!lbl) return;
            const info = RATING_MAP[val] || { label: "—", state: "None" };
            lbl.setText(`${val} / 10 — ${info.label}`);
            lbl.setState(info.state);
        },

        // ── State → Region cascade ─────────────────────────────
        onStateChanged: function (e) {
            const state = e.getParameter("selectedItem").getKey();
            this._populateRegions(state);
        },

        _populateRegions: function (state) {
            const sel = this.byId("fRegion");
            if (!sel) return;
            while (sel.getItems().length > 0) sel.removeItem(0);
            sel.addItem(new sap.ui.core.Item({ key: "", text: "— Select Region —" }));
            (REGIONS[state] || []).forEach(r =>
                sel.addItem(new sap.ui.core.Item({ key: r, text: r })));
            sel.setSelectedKey("");
        },

        onBridgeIdChange: function (e) {
            // Auto-uppercase
            const input = e.getSource();
            if (input) input.setValue((input.getValue() || "").toUpperCase());
        },

        // ── Save ──────────────────────────────────────────────
        onSave: function () {
            const errStrip = this.byId("formErrorStrip");
            errStrip.setVisible(false);

            // Collect values
            const get  = (id) => { const c = this.byId(id); return c && c.getValue ? c.getValue().trim() : ""; };
            const getSk = (id) => { const c = this.byId(id); return c && c.getSelectedKey ? c.getSelectedKey() : ""; };
            const getCb = (id) => { const c = this.byId(id); return c ? c.getSelected() : false; };
            const num  = (id) => { const v = get(id); return v === "" ? null : parseFloat(v); };
            const int_ = (id) => { const v = get(id); return v === "" ? null : parseInt(v); };

            // Validation
            const errs = [];
            const name  = get("fName");
            const state = getSk("fState");
            const lat   = num("fLatitude");
            const lon   = num("fLongitude");
            const owner = get("fAssetOwner");

            if (!name)  errs.push("Bridge Name is required");
            else if (name.length > 200) errs.push("Bridge Name must not exceed 200 characters");
            if (!state) errs.push("State is required");
            if (!owner) errs.push("Asset Owner is required");
            if (lat === null || lat === undefined) errs.push("Latitude is required");
            else if (lat < -90 || lat > 90) errs.push("Latitude must be between -90 and 90");
            if (lon === null || lon === undefined) errs.push("Longitude is required");
            else if (lon < -180 || lon > 180) errs.push("Longitude must be between -180 and 180");

            if (errs.length) {
                errStrip.setText(errs.join(" · "));
                errStrip.setVisible(true);
                return;
            }

            // Build bridgeId for new bridge
            let bridgeId = get("fBridgeId");
            if (!bridgeId && !this._editMode) {
                // Keep generated ID within String(20) DB constraint:
                // BRG- (4) + state (2-3) + routePart (max 3) + - (1) + ts (4) + rand (3) = max 18
                const routePart = (get("fRouteNumber") || "GEN").replace(/[^A-Z0-9]/gi, "").toUpperCase().slice(0, 3);
                const ts = Date.now().toString(36).toUpperCase().slice(-4);
                const rand = Math.random().toString(36).toUpperCase().slice(-3);
                bridgeId = `BRG-${state}${routePart}-${ts}${rand}`.slice(0, 20);
            }

            const ratingVal = this.byId("fRatingSlider") ? this.byId("fRatingSlider").getValue() : 7;
            const ratingMap = { 10:"EXCELLENT",9:"VERY_GOOD",8:"GOOD",7:"GOOD",
                                6:"FAIR",5:"FAIR",4:"POOR",3:"POOR",2:"VERY_POOR",1:"FAILED" };

            const payload = {
                bridgeId          : bridgeId || undefined,
                name              : name,
                state             : state,
                region            : getSk("fRegion") || null,
                lga               : get("fLga") || null,
                roadRoute         : get("fRoadRoute") || null,
                routeNumber       : get("fRouteNumber") || null,
                latitude          : lat,
                longitude         : lon,
                assetOwner        : owner,
                maintenanceAuthority: get("fMaintAuth") || null,
                assetClass        : getSk("fAssetClass") || "BRIDGE",
                structureType     : getSk("fStructureType") || null,
                material          : get("fMaterial") || null,
                yearBuilt         : int_("fYearBuilt"),
                designLoad        : getSk("fDesignLoad") || null,
                designStandard    : get("fDesignStandard") || null,
                clearanceHeightM  : num("fClearance"),
                spanLengthM       : num("fSpanLength"),
                totalLengthM      : num("fTotalLength"),
                widthM            : num("fWidth"),
                numberOfSpans     : int_("fSpans"),
                numberOfLanes     : int_("fLanes"),
                conditionRating          : ratingVal,
                condition                : ratingMap[ratingVal] || "FAIR",
                structuralAdequacyRating : int_("fStructuralAdequacy"),
                postingStatus            : getSk("fPostingStatus") || "UNRESTRICTED",
                scourRisk                : getSk("fScourRisk") || null,
                inspectionDate           : this.byId("fInspectionDate") ? (this.byId("fInspectionDate").getValue() || null) : null,
                nextInspectionDueDate    : this.byId("fNextInspDue") ? (this.byId("fNextInspDue").getValue() || null) : null,
                conditionStandard        : get("fConditionStandard") || null,
                seismicZone              : get("fSeismicZone") || null,
                remarks                  : get("fRemarks") || null,
                floodImpacted            : getCb("fFloodImpacted"),
                highPriorityAsset        : getCb("fHighPriority"),
                asBuiltDrawingRef        : get("fAsBuiltRef") || null,
                scourDepthLastMeasuredM  : num("fScourDepth"),
                floodImmunityARI         : int_("fFloodImmunityARI"),
                loadRating               : num("fLoadRating"),
                nhvrRouteApprovalClass   : getSk("fNhvrApprovalClass") || null,
                importanceLevel          : int_("fImportanceLevel"),
                aadtVehicles             : int_("fAadt"),
                heavyVehiclePct          : num("fHeavyVehiclePct"),
                gazetteRef               : get("fGazetteRef") || null,
                nhvrRef                  : get("fNhvrRef") || null,
                nhvrRouteAssessed        : getCb("fNhvrAssessed"),
                freightRoute             : getCb("fFreightRoute"),
                overMassRoute            : getCb("fOverMassRoute"),
                hmlApproved              : getCb("fHmlApproved"),
                bdoubleApproved          : getCb("fBdoubleApproved"),
                currentReplacementCost   : num("fCurrentReplacementCost"),
                remainingUsefulLifeYrs   : int_("fRemainingUsefulLife"),
                designLife               : int_("fDesignLife"),
                dataSource        : get("fDataSource") || null,
                sourceRefURL      : get("fSourceRefUrl") || null,
                openDataRef       : get("fOpenDataRef") || null,
                bancId            : get("fBancId") || null,
                bancURL           : get("fBancUrl") || null,
                primaryExternalSystem: getSk("fExtSystem") || null,
                primaryExternalId    : get("fExtId") || null,
                primaryExternalURL   : get("fExtUrl") || null,
                geometry             : get("fGeometry") || null,
                isActive          : true
            };

            // Clean up nulls for create (CAP doesn't like undefined keys)
            if (this._editMode) delete payload.bridgeId;
            Object.keys(payload).forEach(k => {
                if (payload[k] === null && !this._editMode) delete payload[k];
            });

            const h  = { Accept: "application/json", "Content-Type": "application/json" };
            const url = this._editMode
                ? `${BASE}/Bridges(${this._bridgeUUID})`
                : `${BASE}/Bridges`;
            const method = this._editMode ? "PATCH" : "POST";

            this.getView().setBusy(true);
            fetch(url, { method, headers: h, body: JSON.stringify(payload) })
                .then(async r => {
                    if (r.ok || r.status === 201 || r.status === 204) return r.status === 204 ? {} : r.json();
                    const body = await r.json().catch(() => ({}));
                    const msg = body.error?.message || `HTTP ${r.status}`;
                    throw new Error(msg);
                })
                .then(j => {
                    this.getView().setBusy(false);
                    const savedId   = j.bridgeId || bridgeId;
                    const savedUUID = j.ID       || this._bridgeUUID;
                    // Save dynamic attribute values
                    if (savedUUID) this._saveDynAttrs(savedUUID);
                    MessageToast.show(this._editMode ? "Bridge updated" : `Bridge ${savedId} created`);
                    if (savedId) {
                        this.getOwnerComponent().getRouter().navTo("BridgeDetail",
                            { bridgeId: encodeURIComponent(savedId) });
                    } else {
                        this.getOwnerComponent().getRouter().navTo("BridgesList");
                    }
                })
                .catch(err => {
                    this.getView().setBusy(false);
                    errStrip.setText("Save failed: " + err.message);
                    errStrip.setVisible(true);
                });
        },

        // ── Navigation ────────────────────────────────────────
        onNavBack: function () {
            // Check if form has been modified (dirty state)
            var bridgeId = this.byId("fBridgeId") ? this.byId("fBridgeId").getValue() : "";
            var name = this.byId("fName") ? this.byId("fName").getValue() : "";
            if (bridgeId || name) {
                MessageBox.confirm("You have unsaved changes. Discard and go back?", {
                    title: "Unsaved Changes",
                    onClose: function (action) {
                        if (action === MessageBox.Action.OK) {
                            window.history.go(-1);
                        }
                    }
                });
            } else {
                window.history.go(-1);
            }
        },

        onCancel: function () {
            if (this._editMode && this._bridgeId) {
                this.getOwnerComponent().getRouter().navTo("BridgeDetail",
                    { bridgeId: encodeURIComponent(this._bridgeId) });
            } else {
                this.getOwnerComponent().getRouter().navTo("BridgesList");
            }
        },

        onNavHome: function () {
            this.getOwnerComponent().getRouter().navTo("Home");
        },

        onNavToBridges: function () {
            this.getOwnerComponent().getRouter().navTo("BridgesList");
        },

        // ══════════════════════════════════════════════════════════
        // DYNAMIC ATTRIBUTES — Auto-render from AttributeDefinitions
        // ══════════════════════════════════════════════════════════

        _dynAttrDefs   : [],   // loaded AttributeDefinition records
        _dynAttrValues : {},   // { attrName: value } for current bridge
        _dynAttrIds    : {},   // { attrName: BridgeAttribute UUID } for PATCH

        /** Load active BRIDGE attribute definitions and render fields */
        _loadAndRenderDynAttrs: function (bridgeUUID) {
            fetch(`${BASE}/AttributeDefinitions?$filter=isActive eq true and entityTarget eq 'BRIDGE'&$expand=validValues&$orderby=displayOrder`, {
                headers: { Accept: "application/json" }
            })
            .then(r => r.ok ? r.json() : { value: [] })
            .then(j => {
                this._dynAttrDefs = j.value || [];
                if (this._dynAttrDefs.length === 0) return;

                const panel = this.byId("dynAttrPanel");
                if (panel) panel.setVisible(true);

                // If editing, load existing values
                if (bridgeUUID) {
                    return fetch(`${BASE}/BridgeAttributes?$filter=bridge_ID eq '${bridgeUUID}'&$expand=attribute($select=name)`, {
                        headers: { Accept: "application/json" }
                    })
                    .then(r => r.ok ? r.json() : { value: [] })
                    .then(j2 => {
                        (j2.value || []).forEach(ba => {
                            const attrName = ba.attribute && ba.attribute.name;
                            if (attrName) {
                                this._dynAttrValues[attrName] = ba.value;
                                this._dynAttrIds[attrName]    = ba.ID;
                            }
                        });
                        this._renderDynAttrs();
                    });
                } else {
                    this._renderDynAttrs();
                }
            })
            .catch(() => {});
        },

        /** Render dynamic attribute fields into #dynAttrContainer */
        _renderDynAttrs: function () {
            const container = this.byId("dynAttrContainer");
            if (!container) return;
            container.destroyItems();

            if (this._dynAttrDefs.length === 0) {
                const panel = this.byId("dynAttrPanel");
                if (panel) panel.setVisible(false);
                return;
            }

            const hbox = new sap.m.HBox({ wrap: "Wrap" });

            this._dynAttrDefs.forEach(attr => {
                const currentVal = this._dynAttrValues[attr.name];
                const vbox = new sap.m.VBox({
                    width: "280px"
                }).addStyleClass("sapUiSmallMarginEnd sapUiSmallMarginBottom");

                const label = new sap.m.Label({
                    text: (attr.isRequired ? "* " : "") + attr.label,
                    design: attr.isRequired ? "Bold" : "Standard"
                });
                vbox.addItem(label);

                let ctrl;
                if (attr.dataType === "BOOLEAN") {
                    ctrl = new sap.m.Switch({
                        state: currentVal === "true" || currentVal === true,
                        customTextOn: "Yes", customTextOff: "No"
                    });
                } else if (attr.dataType === "LOOKUP" && attr.validValues && attr.validValues.length > 0) {
                    ctrl = new sap.m.Select({ width: "100%" });
                    if (!attr.isRequired) ctrl.addItem(new sap.ui.core.Item({ key: "", text: "— Select —" }));
                    attr.validValues
                        .filter(v => v.isActive !== false)
                        .sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0))
                        .forEach(v => ctrl.addItem(new sap.ui.core.Item({ key: v.value, text: v.label || v.value })));
                    ctrl.setSelectedKey(currentVal || "");
                } else if (attr.dataType === "INTEGER" || attr.dataType === "DECIMAL") {
                    ctrl = new sap.m.Input({
                        type: "Number",
                        value: currentVal || "",
                        placeholder: attr.defaultValue || ""
                    });
                } else if (attr.dataType === "DATE") {
                    ctrl = new sap.m.DatePicker({
                        value: currentVal || "",
                        displayFormat: "dd/MM/yyyy",
                        valueFormat: "yyyy-MM-dd"
                    });
                } else {
                    ctrl = new sap.m.Input({
                        value: currentVal || "",
                        placeholder: attr.defaultValue || "",
                        maxLength: 2000
                    });
                }

                // Tag control with attrName for value retrieval on save
                ctrl.data("attrName", attr.name);
                ctrl.data("attrId",   attr.ID);
                ctrl.data("attrType", attr.dataType);

                vbox.addItem(ctrl);
                hbox.addItem(vbox);
            });

            container.addItem(hbox);
        },

        /** Collect dynamic attribute values for saving */
        _collectDynAttrValues: function () {
            const container = this.byId("dynAttrContainer");
            if (!container) return {};
            const vals = {};
            const hbox = container.getItems()[0];
            if (!hbox) return vals;

            hbox.getItems().forEach(vbox => {
                const controls = vbox.getItems();
                if (controls.length < 2) return;
                const ctrl     = controls[1];
                const attrName = ctrl.data("attrName");
                if (!attrName) return;

                let val;
                if (ctrl instanceof sap.m.Switch)        val = String(ctrl.getState());
                else if (ctrl instanceof sap.m.Select)   val = ctrl.getSelectedKey();
                else if (ctrl instanceof sap.m.DatePicker) val = ctrl.getValue();
                else                                      val = ctrl.getValue();

                vals[attrName] = { value: val, attrId: ctrl.data("attrId") };
            });
            return vals;
        },

        /** Save dynamic attribute values after bridge is saved/created */
        _saveDynAttrs: function (bridgeUUID) {
            const vals = this._collectDynAttrValues();
            const H    = { Accept: "application/json", "Content-Type": "application/json" };
            Object.entries(vals).forEach(([attrName, data]) => {
                const existingId = this._dynAttrIds[attrName];
                if (existingId) {
                    // PATCH existing BridgeAttribute
                    fetch(`${BASE}/BridgeAttributes(${existingId})`, {
                        method: "PATCH", headers: H,
                        body: JSON.stringify({ value: data.value })
                    }).catch(() => {});
                } else if (data.value) {
                    // POST new BridgeAttribute
                    fetch(`${BASE}/BridgeAttributes`, {
                        method: "POST", headers: H,
                        body: JSON.stringify({
                            bridge_ID   : bridgeUUID,
                            attribute_ID: data.attrId,
                            value       : data.value
                        })
                    }).catch(() => {});
                }
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

        // ── Load Ratings (AS 5100.7) ──────────────────────────────
        /**
         * Load all load ratings for the current bridge and bind to the table.
         * Called after bridge data is loaded in edit mode.
         */
        _loadLoadRatings: function (bridgeUUID) {
            if (!bridgeUUID) return;
            fetch(`${BASE}/LoadRatings?$filter=bridge_ID eq ${bridgeUUID}&$orderby=assessmentDate desc`, _credOpts())
                .then(r => r.ok ? r.json() : { value: [] })
                .then(j => {
                    const oModel = new sap.ui.model.json.JSONModel({ items: j.value || [] });
                    this.getView().setModel(oModel, "loadRatings");
                    const table = this.byId("loadRatingsTable");
                    if (table) {
                        table.setModel(oModel, "loadRatings");
                        table.bindRows("loadRatings>/items");
                    }
                    const panel = this.byId("loadRatingsPanel");
                    if (panel) panel.setVisible(true);
                    const addBtn = this.byId("addLoadRatingBtn");
                    if (addBtn) addBtn.setVisible(true);
                })
                .catch(err => {
                    console.warn("[NHVR] Failed to load load ratings:", err);
                });
        },

        // ── P02: BAMS Sync ────────────────────────────────────────────
        _loadBamsStatus: function (bridgeUUID) {
            if (!bridgeUUID) return;
            const statusCtrl = this.byId("bamsSyncStatus");
            if (!statusCtrl) return;
            fetch(`${BASE}/BamsSyncs?$filter=bridge_ID eq ${bridgeUUID}&$top=1`, _credOpts())
                .then(r => r.ok ? r.json() : { value: [] })
                .then(j => {
                    const rec = (j.value || [])[0];
                    if (!rec) {
                        statusCtrl.setText("BAMS: Never synced");
                        statusCtrl.setState("None");
                    } else {
                        const stateMap = { SYNCED: "Success", PENDING: "Warning", ERROR: "Error", NEVER: "None" };
                        const when = rec.lastSyncAt ? new Date(rec.lastSyncAt).toLocaleDateString("en-AU") : "";
                        statusCtrl.setText("BAMS: " + rec.syncStatus + (when ? " (" + when + ")" : ""));
                        statusCtrl.setState(stateMap[rec.syncStatus] || "None");
                    }
                })
                .catch(() => {
                    if (statusCtrl) { statusCtrl.setText("BAMS: Unknown"); statusCtrl.setState("None"); }
                });
        },

        onSyncBams: function () {
            const bridgeId = this._bridgeUUID;
            if (!bridgeId) { sap.m.MessageToast.show("Save the bridge before syncing BAMS"); return; }
            const btn = this.byId("btnSyncBams");
            if (btn) btn.setEnabled(false);
            fetch(`${BASE}/syncWithBams`, {
                method : "POST",
                headers: { "Content-Type": "application/json", Accept: "application/json" },
                body   : JSON.stringify({ bridgeId })
            })
                .then(r => r.json())
                .then(j => {
                    sap.m.MessageToast.show(j.message || "BAMS sync complete");
                    this._loadBamsStatus(bridgeId);
                })
                .catch(() => sap.m.MessageToast.show("BAMS sync failed — please try again"))
                .finally(() => { if (btn) btn.setEnabled(true); });
        },

        onAddLoadRating: function () {
            this._openLoadRatingDialog(null);
        },

        onEditLoadRating: function (oEvent) {
            const ctx  = oEvent.getSource().getBindingContext("loadRatings");
            const data = ctx ? ctx.getObject() : null;
            if (data) this._openLoadRatingDialog(data);
        },

        onDeleteLoadRating: function (oEvent) {
            const ctx  = oEvent.getSource().getBindingContext("loadRatings");
            const data = ctx ? ctx.getObject() : null;
            if (!data || !data.ID) return;

            sap.m.MessageBox.confirm(
                "Delete load rating for '" + (data.ratingStandard || '') + "'?\nThis cannot be undone.",
                {
                    title: "Delete Load Rating",
                    onClose: (action) => {
                        if (action !== sap.m.MessageBox.Action.OK) return;
                        fetch(BASE + "/LoadRatings(" + data.ID + ")", { method: "DELETE" })
                            .then(r => {
                                if (!r.ok) throw new Error("HTTP " + r.status);
                                sap.m.MessageToast.show("Load rating deleted.");
                                this._loadLoadRatings(this._bridgeUUID);
                            })
                            .catch(err => sap.m.MessageBox.error("Delete failed: " + err.message));
                    }
                }
            );
        },

        _openLoadRatingDialog: function (data) {
            const isEdit = !!data;
            const dialogData = data ? Object.assign({}, data) : {
                ratingStandard: "", vehicleTypeDesc: "", maxGrossMass_t: null,
                maxAxleLoad_t: null, ratingFactor: null, assessmentDate: null,
                assessedBy: "", assessedByFirm: "", reportRef: "",
                ratingMethod: "", nextReviewDue: null, status: "UNKNOWN", notes: ""
            };
            const oDialogModel = new sap.ui.model.json.JSONModel(dialogData);

            if (!this._oLoadRatingDialog) {
                this._oLoadRatingDialog = new sap.m.Dialog({
                    title: isEdit ? "Edit Load Rating" : "Add Load Rating",
                    contentWidth: "500px",
                    content: [
                        new sap.ui.layout.form.SimpleForm({
                            editable: true,
                            layout: "ResponsiveGridLayout",
                            content: [
                                new sap.m.Label({ text: "Rating Standard", required: true }),
                                new sap.m.Select({ selectedKey: "{lrd>/ratingStandard}", width: "100%",
                                    items: ["AS 5100.7:2017","AS 5100.7:2004","T44","SM1600","HML","Custom"].map(
                                        k => new sap.ui.core.Item({ key: k, text: k })
                                    )}),
                                new sap.m.Label({ text: "Vehicle Type / Description" }),
                                new sap.m.Input({ value: "{lrd>/vehicleTypeDesc}", placeholder: "e.g. B-double 68.5t", width: "100%" }),
                                new sap.m.Label({ text: "Max Gross Mass (t)", required: true }),
                                new sap.m.Input({ value: "{lrd>/maxGrossMass_t}", type: "Number", placeholder: "e.g. 42.5", width: "100%" }),
                                new sap.m.Label({ text: "Rating Factor (RF)" }),
                                new sap.m.Input({ value: "{lrd>/ratingFactor}", type: "Number", placeholder: "e.g. 1.05", width: "100%" }),
                                new sap.m.Label({ text: "Assessment Date", required: true }),
                                new sap.m.DatePicker({ dateValue: "{lrd>/assessmentDate}", width: "100%",
                                    valueFormat: "yyyy-MM-dd", displayFormat: "dd MMM yyyy" }),
                                new sap.m.Label({ text: "Assessed By", required: true }),
                                new sap.m.Input({ value: "{lrd>/assessedBy}", placeholder: "Engineer / RPEQ No.", width: "100%" }),
                                new sap.m.Label({ text: "Assessed By (Firm)" }),
                                new sap.m.Input({ value: "{lrd>/assessedByFirm}", placeholder: "Firm name", width: "100%" }),
                                new sap.m.Label({ text: "Rating Method" }),
                                new sap.m.Select({ selectedKey: "{lrd>/ratingMethod}", width: "100%",
                                    items: [
                                        new sap.ui.core.Item({ key: "",                   text: "— Select —" }),
                                        new sap.ui.core.Item({ key: "Deterministic",      text: "Deterministic" }),
                                        new sap.ui.core.Item({ key: "Reliability-based",  text: "Reliability-based" }),
                                        new sap.ui.core.Item({ key: "Load test",          text: "Load test" }),
                                        new sap.ui.core.Item({ key: "Desktop",            text: "Desktop (drawings)" })
                                    ]}),
                                new sap.m.Label({ text: "Status" }),
                                new sap.m.Select({ selectedKey: "{lrd>/status}", width: "100%",
                                    items: [
                                        new sap.ui.core.Item({ key: "UNKNOWN",     text: "Unknown" }),
                                        new sap.ui.core.Item({ key: "ADEQUATE",    text: "Adequate (RF ≥ 1.0)" }),
                                        new sap.ui.core.Item({ key: "CONDITIONAL", text: "Conditional" }),
                                        new sap.ui.core.Item({ key: "INADEQUATE",  text: "Inadequate" }),
                                        new sap.ui.core.Item({ key: "SUPERSEDED",  text: "Superseded" })
                                    ]}),
                                new sap.m.Label({ text: "Report Reference" }),
                                new sap.m.Input({ value: "{lrd>/reportRef}", placeholder: "e.g. RPT-2024-001", width: "100%" }),
                                new sap.m.Label({ text: "Next Review Due" }),
                                new sap.m.DatePicker({ dateValue: "{lrd>/nextReviewDue}", width: "100%",
                                    valueFormat: "yyyy-MM-dd", displayFormat: "dd MMM yyyy" }),
                                new sap.m.Label({ text: "Notes" }),
                                new sap.m.TextArea({ value: "{lrd>/notes}", rows: 3, width: "100%", placeholder: "Conditions or caveats" })
                            ]
                        }).addStyleClass("sapUiSmallMargin")
                    ],
                    beginButton: new sap.m.Button({
                        text: isEdit ? "Save Changes" : "Add Rating",
                        type: "Emphasized",
                        press: () => this._saveLoadRating(isEdit, data ? data.ID : null)
                    }),
                    endButton: new sap.m.Button({
                        text: "Cancel",
                        press: () => this._oLoadRatingDialog.close()
                    })
                });
                this.getView().addDependent(this._oLoadRatingDialog);
            } else {
                this._oLoadRatingDialog.setTitle(isEdit ? "Edit Load Rating" : "Add Load Rating");
            }

            this._oLoadRatingDialog.setModel(oDialogModel, "lrd");
            this._oLoadRatingDialog.open();
        },

        _saveLoadRating: function (isEdit, existingId) {
            const oModel  = this._oLoadRatingDialog.getModel("lrd");
            const data    = oModel.getData();

            if (!data.ratingStandard)                                { sap.m.MessageToast.show("Rating Standard is required."); return; }
            if (!data.maxGrossMass_t || Number(data.maxGrossMass_t) <= 0) { sap.m.MessageToast.show("Max Gross Mass must be > 0."); return; }
            if (!data.assessmentDate)                                { sap.m.MessageToast.show("Assessment Date is required."); return; }
            if (!data.assessedBy)                                    { sap.m.MessageToast.show("Assessed By is required."); return; }

            // Normalise date fields (DatePicker may return Date objects)
            const fmtDate = (d) => d ? (d instanceof Date ? d.toISOString().slice(0,10) : String(d).slice(0,10)) : null;

            const payload = {
                bridge_ID       : this._bridgeUUID,
                ratingStandard  : data.ratingStandard,
                vehicleTypeDesc : data.vehicleTypeDesc || null,
                maxGrossMass_t  : Number(data.maxGrossMass_t),
                maxAxleLoad_t   : data.maxAxleLoad_t   ? Number(data.maxAxleLoad_t)  : null,
                ratingFactor    : data.ratingFactor     ? Number(data.ratingFactor)   : null,
                assessmentDate  : fmtDate(data.assessmentDate),
                assessedBy      : data.assessedBy,
                assessedByFirm  : data.assessedByFirm  || null,
                reportRef       : data.reportRef        || null,
                ratingMethod    : data.ratingMethod     || null,
                nextReviewDue   : fmtDate(data.nextReviewDue),
                status          : data.status           || "UNKNOWN",
                notes           : data.notes            || null
            };

            const url    = isEdit ? BASE + "/LoadRatings(" + existingId + ")" : BASE + "/LoadRatings";
            const method = isEdit ? "PATCH" : "POST";

            fetch(url, {
                method,
                headers: { "Content-Type": "application/json", Accept: "application/json" },
                body: JSON.stringify(payload)
            })
            .then(r => {
                if (!r.ok) return r.json().then(e => { throw new Error(e.error?.message || "HTTP " + r.status); });
                return r.json();
            })
            .then(() => {
                this._oLoadRatingDialog.close();
                sap.m.MessageToast.show(isEdit ? "Load rating updated." : "Load rating added.");
                this._loadLoadRatings(this._bridgeUUID);
            })
            .catch(err => sap.m.MessageBox.error("Save failed: " + err.message));
        },

        onInfoPressBridgeForm: function (oEvent) {
            this._showInfoPopover(
                oEvent.getSource(),
                "Bridge Form — Field Guide",
                "Required Fields:\n" +
                "• Bridge ID — unique NHVR identifier (e.g. NSW-B-0001)\n" +
                "• Name — bridge common or official name\n" +
                "• State — Australian state or territory\n\n" +
                "Condition Rating — AS 5100 scale 1–10. Entering a rating auto-derives the condition label (GOOD/FAIR/POOR/CRITICAL).\n\n" +
                "Condition Score — 0–100 composite health index (optional; from element measurements).\n\n" +
                "Coordinates — decimal degrees (latitude: -90 to 90, longitude: -180 to 180).\n\n" +
                "Posting Status — set to POSTED when adding any active restriction; set to CLOSED when bridge is closed to all traffic.\n\n" +
                "NHVR Route Assessed — tick when this bridge has been formally reviewed under NHVR's permit assessment framework.\n\n" +
                "Section 9 (Custom Attributes) — dynamically rendered based on AdminConfig attribute definitions for this asset class.\n\n" +
                "Section 10 (Load Ratings) — record AS 5100.7 load rating assessments. Only available in edit mode for existing bridges.\n\n" +
                "Section 11 (Scour Risk) — AustRoads BIMM §7 scour risk scoring. Run assessment to compute risk score and level.\n\n" +
                "Section 12 (Condition Forecast) — 10-year deterioration model based on historical condition data."
            );
        },

        // ── P07: Scour Risk ───────────────────────────────────────
        _loadScourRisk: function (bridgeUUID) {
            var that = this;
            fetch(BASE + "/ScourAssessments?$filter=bridge_ID eq " + bridgeUUID +
                "&$orderby=createdAt desc&$top=1", { headers: { Accept: "application/json" } })
                .then(function (r) { return r.json(); })
                .then(function (j) {
                    var items = j.value || [];
                    var riskStatus = that.byId("scourRiskStatus");
                    var riskScore  = that.byId("scourRiskScore");
                    var mitStatus  = that.byId("scourMitigationStatus");
                    if (!items.length) {
                        if (riskStatus) { riskStatus.setText("Not assessed"); riskStatus.setState("None"); }
                        if (riskScore)  { riskScore.setText("—"); }
                        if (mitStatus)  { mitStatus.setText("—"); }
                        return;
                    }
                    var s = items[0];
                    var stateMap = { CRITICAL: "Error", HIGH: "Error", MEDIUM: "Warning", LOW: "Success" };
                    var mitStateMap = { NONE: "None", PLANNED: "Warning", INSTALLED: "Success", MONITORED: "Information" };
                    if (riskStatus) {
                        riskStatus.setText(s.scourRiskLevel || "—");
                        riskStatus.setState(stateMap[s.scourRiskLevel] || "None");
                    }
                    if (riskScore)  { riskScore.setText(String(s.scourRiskScore || "—")); }
                    if (mitStatus)  {
                        mitStatus.setText(s.mitigationStatus || "—");
                        mitStatus.setState(mitStateMap[s.mitigationStatus] || "None");
                    }
                })
                .catch(function (e) { console.warn("[NHVR] Scour load failed:", e.message); });
        },

        onOpenScourDialog: function () {
            var that = this;
            if (!this._oScourDialog) {
                this._oScourDialog = new sap.m.Dialog({
                    title       : "Scour Risk Assessment (AustRoads BIMM §7)",
                    contentWidth: "420px",
                    content: [
                        new sap.ui.layout.form.SimpleForm({
                            editable: true,
                            content: [
                                new sap.m.Label({ text: "Watercourse Name", required: false }),
                                new sap.m.Input({ id: "scourWatercourse", placeholder: "e.g. Murray River" }),
                                new sap.m.Label({ text: "Flood Frequency (years)", required: true }),
                                new sap.m.Select({ id: "scourFloodFreq", items: [
                                    new sap.ui.core.Item({ key: "10",  text: "1 in 10 year" }),
                                    new sap.ui.core.Item({ key: "20",  text: "1 in 20 year" }),
                                    new sap.ui.core.Item({ key: "50",  text: "1 in 50 year" }),
                                    new sap.ui.core.Item({ key: "100", text: "1 in 100 year" })
                                ]}),
                                new sap.m.Label({ text: "Scour Depth (m)" }),
                                new sap.m.Input({ id: "scourDepth", type: "Number", placeholder: "e.g. 1.5" }),
                                new sap.m.Label({ text: "Flow Velocity Rating", required: true }),
                                new sap.m.Select({ id: "scourVelocity", items: [
                                    new sap.ui.core.Item({ key: "LOW",      text: "Low" }),
                                    new sap.ui.core.Item({ key: "MODERATE", text: "Moderate" }),
                                    new sap.ui.core.Item({ key: "HIGH",     text: "High" }),
                                    new sap.ui.core.Item({ key: "EXTREME",  text: "Extreme" })
                                ]}),
                                new sap.m.Label({ text: "Sediment Rating", required: true }),
                                new sap.m.Select({ id: "scourSediment", items: [
                                    new sap.ui.core.Item({ key: "LOW",      text: "Low" }),
                                    new sap.ui.core.Item({ key: "MODERATE", text: "Moderate" }),
                                    new sap.ui.core.Item({ key: "HIGH",     text: "High" })
                                ]}),
                                new sap.m.Label({ text: "Foundation Type", required: true }),
                                new sap.m.Select({ id: "scourFoundation", items: [
                                    new sap.ui.core.Item({ key: "SHALLOW", text: "Shallow" }),
                                    new sap.ui.core.Item({ key: "DEEP",    text: "Deep" }),
                                    new sap.ui.core.Item({ key: "UNKNOWN", text: "Unknown" })
                                ]}),
                                new sap.m.Label({ text: "Assessed By" }),
                                new sap.m.Input({ id: "scourAssessedBy", placeholder: "Engineer name / reg. no." })
                            ]
                        })
                    ],
                    beginButton: new sap.m.Button({
                        text: "Calculate & Save", type: "Emphasized",
                        press: function () { that.onSaveScourAssessment(); }
                    }),
                    endButton: new sap.m.Button({
                        text: "Cancel",
                        press: function () { that._oScourDialog.close(); }
                    })
                });
                this.getView().addDependent(this._oScourDialog);
            }
            this._oScourDialog.open();
        },

        onSaveScourAssessment: function () {
            var that    = this;
            var uuid    = this._bridgeUUID;
            if (!uuid) { sap.m.MessageToast.show("Save the bridge first."); return; }
            var freq    = parseInt(sap.ui.getCore().byId("scourFloodFreq")?.getSelectedKey()    || "50", 10);
            var depth   = parseFloat(sap.ui.getCore().byId("scourDepth")?.getValue()            || "0");
            var vel     = sap.ui.getCore().byId("scourVelocity")?.getSelectedKey()  || "MODERATE";
            var sed     = sap.ui.getCore().byId("scourSediment")?.getSelectedKey()  || "MODERATE";
            var fnd     = sap.ui.getCore().byId("scourFoundation")?.getSelectedKey() || "UNKNOWN";
            var wname   = sap.ui.getCore().byId("scourWatercourse")?.getValue()      || "";
            var assessBy = sap.ui.getCore().byId("scourAssessedBy")?.getValue()      || "";
            var body = JSON.stringify({
                bridgeId: uuid, floodFrequency: freq, scourDepth_m: depth,
                velocityRating: vel, sedimentRating: sed, foundationType: fnd,
                watercourseName: wname, assessedBy: assessBy
            });
            fetch(BASE + "/assessScourRisk", {
                method: "POST",
                headers: { "Content-Type": "application/json", Accept: "application/json" },
                body: body
            })
            .then(function (r) {
                if (!r.ok) return r.json().then(function (e) { throw new Error(e.error?.message || "HTTP " + r.status); });
                return r.json();
            })
            .then(function (result) {
                that._oScourDialog.close();
                var lvl = result.scourRiskLevel || result.value?.scourRiskLevel || "—";
                var sc  = result.scourRiskScore !== undefined ? result.scourRiskScore
                        : (result.value?.scourRiskScore !== undefined ? result.value.scourRiskScore : "—");
                sap.m.MessageToast.show("Scour assessment saved. Risk Level: " + lvl + " (Score: " + sc + ")");
                that._loadScourRisk(uuid);
            })
            .catch(function (err) { sap.m.MessageBox.error("Scour assessment failed: " + err.message); });
        },

        // ── P13: IoT Sensor Devices ───────────────────────────────
        _loadSensorDevices: function (bridgeUUID) {
            var that = this;
            fetch(BASE + "/SensorDevices?$filter=bridge_ID eq " + bridgeUUID +
                "&$orderby=installedAt desc", { headers: { Accept: "application/json" } })
                .then(function (r) { return r.json(); })
                .then(function (j) {
                    var items = j.value || [];
                    var model = new sap.ui.model.json.JSONModel({ value: items });
                    that.getView().setModel(model, "sensors");
                })
                .catch(function (e) { console.warn("[NHVR] Sensor load failed:", e.message); });
        },

        // ── P09: Condition Forecast ───────────────────────────────
        onRunForecast: function () {
            var that  = this;
            var uuid  = this._bridgeUUID;
            if (!uuid) { sap.m.MessageToast.show("Save the bridge first."); return; }
            fetch(BASE + "/predictCondition(bridgeId=" + uuid + ",yearsAhead=10)", {
                headers: { Accept: "application/json" }
            })
            .then(function (r) {
                if (!r.ok) return r.json().then(function (e) { throw new Error(e.error?.message || "HTTP " + r.status); });
                return r.json();
            })
            .then(function (j) {
                var results = j.value || j || [];
                if (!results.length) {
                    sap.m.MessageToast.show("No forecast data returned.");
                    return;
                }
                var model = new sap.ui.model.json.JSONModel({ items: results });
                var list  = that.byId("forecastList");
                if (list) {
                    list.setModel(model, "forecast");
                    list.bindItems({
                        path      : "forecast>/items",
                        template  : new sap.m.StandardListItem({
                            title      : "{forecast>year}",
                            description: "Score: {forecast>predictedScore} | Rating: {forecast>predictedRating}/10 | Confidence: {forecast>confidence}",
                            icon       : "sap-icon://line-chart"
                        })
                    });
                }
                var confidence = results[0] ? results[0].confidence : "";
                var confText   = that.byId("forecastConfidence");
                if (confText) confText.setText("Model confidence: " + confidence +
                    " (" + results.length + " years projected)");
                sap.m.MessageToast.show("Forecast generated for " + results.length + " years.");
            })
            .catch(function (err) { sap.m.MessageBox.error("Forecast failed: " + err.message); });
        }
    });
});
