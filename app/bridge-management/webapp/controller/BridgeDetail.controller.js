// ============================================================
// NHVR Bridge Detail Controller — Full Object Page
// ============================================================
sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageToast",
    "sap/m/MessageBox",
    "sap/m/StandardListItem",
    "nhvr/bridgemanagement/model/RoleManager",
    "nhvr/bridgemanagement/model/AppConfig",
    "nhvr/bridgemanagement/util/GeoLocation",
    "nhvr/bridgemanagement/util/AuthFetch",
    "nhvr/bridgemanagement/util/UserAnalytics",
    "nhvr/bridgemanagement/model/CapabilityManager",
    "nhvr/bridgemanagement/util/LookupService"
], function (Controller, JSONModel, MessageToast, MessageBox, StandardListItem, RoleManager, AppConfig, GeoLocation, AuthFetch, UserAnalytics, CapabilityManager, LookupService) {
    "use strict";

    function escapeHtml(str) {
        if (str == null) return "";
        return String(str).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;");
    }

    const BASE = "/bridge-management";

    return Controller.extend("nhvr.bridgemanagement.controller.BridgeDetail", {

        _bridgeId  : null,
        _bridge    : null,
        _miniMap   : null,

        _selectedDefectId        : null,
        _selectedRestrictionId   : null,
        _allEventLog             : [],

        onInit: function () {
            this._model = new JSONModel({
                restrictions     : [],
                attributes       : [],
                history          : [],
                inspections      : [],
                defects          : [],
                externalRefs     : [],
                attachments      : [],
                attachmentCount  : 0
            });
            this.getView().setModel(this._model, "detail");

            // v3 Risk and Investment models
            this.getView().setModel(new JSONModel({ items: [] }), "riskAssessments");
            this.getView().setModel(new JSONModel({ items: [] }), "investmentPlans");

            const router = this.getOwnerComponent().getRouter();
            router.getRoute("BridgeDetail").attachPatternMatched(this._onRouteMatched, this);

            LookupService.load().then(function () {
                // Filter dropdowns
                LookupService.populateSelect(this.byId("restrictionFilter"),   "RESTRICTION_STATUS", "All Statuses");
                LookupService.populateSelect(this.byId("defectStatusFilter"),  "DEFECT_STATUS",      "All Statuses");
                // Inline edit form Selects
                LookupService.populateFormSelect(this.byId("scourRiskManualSelect"), "SCOUR_RISK");
                LookupService.populateFormSelect(this.byId("ceCapStatus"),     "CAPACITY_STATUS");
                LookupService.populateFormSelect(this.byId("ioType"),          "INSPECTION_TYPE");
                LookupService.populateFormSelect(this.byId("ioAccessMethod"),  "ACCESS_METHOD");
                LookupService.populateFormSelect(this.byId("ioRatingMethod"),  "RATING_METHOD");
                LookupService.populateFormSelect(this.byId("ciAdequacy"),      "STRUCTURAL_ADEQUACY");
                LookupService.populateFormSelect(this.byId("ciUrgency"),       "MAINTENANCE_URGENCY");
                LookupService.populateFormSelect(this.byId("rdCategory"),      "DEFECT_CATEGORY");
                LookupService.populateFormSelect(this.byId("rdSeverity"),      "DEFECT_SEVERITY");
                LookupService.populateFormSelect(this.byId("rdExtent"),        "DEFECT_EXTENT");
                LookupService.populateFormSelect(this.byId("rdStructuralRisk"),"STRUCTURAL_RISK");
                LookupService.populateFormSelect(this.byId("rdPriority"),      "DEFECT_PRIORITY");
                LookupService.populateFormSelect(this.byId("rdElementGroup"),  "ELEMENT_GROUP");
                LookupService.populateFormSelect(this.byId("erSystemType"),    "EXTERNAL_SYSTEM_TYPE");
                LookupService.populateFormSelect(this.byId("bdRestType"),        "RESTRICTION_TYPE");
                LookupService.populateFormSelect(this.byId("bdRestStatus"),      "RESTRICTION_STATUS");
                LookupService.populateFormSelect(this.byId("bdRestUnit"),        "MEASUREMENT_UNIT");
                LookupService.populateFormSelect(this.byId("bdRestDirection"),   "RESTRICTION_DIRECTION");
                LookupService.populateFormSelect(this.byId("editRestType"),      "RESTRICTION_TYPE");
                LookupService.populateFormSelect(this.byId("editRestStatus"),    "RESTRICTION_STATUS");
                LookupService.populateFormSelect(this.byId("editRestUnit"),      "MEASUREMENT_UNIT");
                LookupService.populateFormSelect(this.byId("editRestDirection"), "RESTRICTION_DIRECTION");
                LookupService.populateFormSelect(this.byId("rcCondition"),       "CONDITION");
                LookupService.populateFormSelect(this.byId("rcAdequacy"),        "STRUCTURAL_ADEQUACY");
                LookupService.populateFormSelect(this.byId("invType"),           "INTERVENTION_TYPE");
                LookupService.populateFormSelect(this.byId("invStatus"),         "PROGRAMME_STATUS");
                LookupService.populateFormSelect(this.byId("nhvrEditApprovalClass"), "VEHICLE_CLASS", "— Not Set —");
                LookupService.populateFormSelect(this.byId("inspDlgType"),       "INSPECTION_TYPE");
                LookupService.populateFormSelect(this.byId("inspDlgAdequacy"),   "STRUCTURAL_ADEQUACY");
            }.bind(this));
        },

        _onRouteMatched: function (e) {
            this._bridgeId = decodeURIComponent(e.getParameter("arguments").bridgeId || "");
            UserAnalytics.trackView("BridgeDetail", { bridgeId: this._bridgeId });
            // Always reset to Overview tab when navigating to any bridge detail
            const tabBar = this.byId("detailTabs");
            if (tabBar) tabBar.setSelectedKey("overview");
            // Reset mini-map so it re-initialises for new bridge
            if (this._miniMap) { try { this._miniMap.remove(); } catch(_) { /* map already removed */ } this._miniMap = null; }
            this._model.setProperty("/restrictions", []);
            this._model.setProperty("/attributes", []);
            // Apply role-based tab visibility
            RoleManager.applyToView(this.getView());
            // Apply lite-mode tab visibility (hides Inspections/Defects/Orders tabs)
            this._applyLiteModeToDetail();
            // Apply capability-based tab visibility (A6 — cross-group tab isolation)
            this._applyCapabilityToTabs();
            // Apply role to page-level action buttons
            const actEdit    = this.byId("btnEditBridge");
            if (actEdit)    actEdit.setVisible(RoleManager.isVisible("editBridge"));
            // Apply role to quick-action toolbar buttons (Overview tab)
            const actAddRest = this.byId("btnAddRestInHeader");
            if (actAddRest) actAddRest.setVisible(RoleManager.isVisible("addRestriction"));
            const actDefect  = this.byId("btnRaiseDefect");
            if (actDefect)  actDefect.setVisible(RoleManager.isVisible("raiseDefect"));
            const actCond    = this.byId("btnReportCondition");
            if (actCond)    actCond.setVisible(RoleManager.isVisible("changeCondition"));
            // Permanent Closure / Lift Closure — only BridgeManager and Admin roles
            const canClose   = RoleManager.isVisible("closeBridge") || RoleManager.isEditable("editBridge");
            const actPermCls = this.byId("btnPermClose");
            if (actPermCls) actPermCls.setVisible(canClose);
            const actLift    = this.byId("btnLiftClosure");
            if (actLift)    actLift.setVisible(canClose);
            this._loadBridge();
        },

        // ── Lite mode: hide tabs not available in lite edition ───
        // Tabs remain in DOM — hidden only; no routes or controllers removed.
        _applyLiteModeToDetail: function () {
            if (!AppConfig.isLite()) return;
            var oView = this.getView();
            // Tab IDs — match the key/id set on <IconTabFilter> in BridgeDetail.view.xml
            var aLiteHiddenTabs = ['tabInspections', 'tabDefects'];
            aLiteHiddenTabs.forEach(function (sId) {
                var oTab = oView.byId(sId);
                if (oTab) oTab.setVisible(false);
            });
            // Hide quick-action buttons that relate to lite-hidden features
            AppConfig.applyToControls({
                'defects'          : [oView.byId('btnRaiseDefect')]
            });
        },

        // ── A6: Capability-based tab visibility ──────────────────
        // Hides IconTabFilter items and skips related data loads for disabled groups.
        _applyCapabilityToTabs: function () {
            var oTabBar = this.byId("detailTabs");
            if (!oTabBar) return;
            var aItems = oTabBar.getItems();
            // Mapping: tab key → capability code
            var mTabCapability = {
                "inspections"      : "INSPECTIONS",
                "defects"          : "DEFECTS",
                "risk"             : "CAPACITY_RATINGS",
                "investment"       : "CAPACITY_RATINGS",
                "documents"        : null  // visible if INSPECTIONS or BRIDGE_REGISTRY enabled
            };
            aItems.forEach(function (oItem) {
                var sKey = oItem.getKey ? oItem.getKey() : "";
                if (mTabCapability.hasOwnProperty(sKey)) {
                    var sCap = mTabCapability[sKey];
                    if (sKey === "documents") {
                        // Documents tab: visible if INSPECTIONS or BRIDGE_REGISTRY is enabled
                        oItem.setVisible(
                            CapabilityManager.canView("INSPECTIONS") || CapabilityManager.canView("BRIDGE_REGISTRY")
                        );
                    } else if (sCap) {
                        oItem.setVisible(CapabilityManager.canView(sCap));
                    }
                }
            });
            // Also hide quick-action buttons for disabled capabilities
            var oView = this.getView();
            if (!CapabilityManager.canView("DEFECTS")) {
                var btnDefect = oView.byId("btnRaiseDefect");
                if (btnDefect) btnDefect.setVisible(false);
            }
        },

        // ── Load bridge data ──────────────────────────────────
        _loadBridge: function () {
            if (!this._bridgeId) return;
            const h = { Accept: "application/json" };

            // Detect whether the passed ID is a UUID or a human-readable bridgeId
            var sId = String(this._bridgeId);
            var bIsUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sId);
            var sFilter;
            if (bIsUUID) {
                sFilter = "ID eq " + sId;
            } else {
                // Escape bridgeId to prevent OData filter injection (single-quote encode)
                var safeId = sId.replace(/'/g, "''");
                sFilter = "bridgeId eq '" + safeId + "'";
            }
            var sSelect = "ID,bridgeId,name,region,state,condition,conditionRating,conditionScore,conditionStandard,postingStatus,structureType,material,clearanceHeightM,spanLengthM,totalLengthM,widthM,numberOfSpans,numberOfLanes,yearBuilt,inspectionDate,nextInspectionDue,latitude,longitude,route_ID,lga,assetOwner,maintenanceAuthority,nhvrRouteAssessed,gazetteRef,nhvrRef,scourRisk,freightRoute,overMassRoute,highPriorityAsset,floodImpacted,aadtVehicles,designLoad,designStandard,sourceRefURL,openDataRef,remarks,roadRoute,routeNumber,dataSource,geometry,bancId,bancURL,primaryExternalSystem,primaryExternalId,primaryExternalURL,loadRating,vehicularGrossWeightLimitT,nhvrRouteApprovalClass,pbsLevelApproved,currentRiskScore,currentRiskBand,priorityRank,structuralDeficiencyFlag,functionallyObsoleteFlag,bridgeHealthIndex,currentReplacementCost,writtenDownValue,deferredMaintenanceValue,remainingUsefulLifeYrs,postedSpeedLimitKmh,waterwayHorizontalClearanceM,lastPrincipalInspDate,lastRoutineInspDate,nextInspectionDueDate,inspectionFrequencyYrs,version";
            fetch(BASE + "/Bridges?$filter=" + sFilter + "&$select=" + sSelect, { headers: h })
                .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
                .then(j => {
                    const b = (j.value || [])[0];
                    if (!b) { MessageBox.error("Bridge not found. It may have been removed or the ID is invalid."); return; }
                    this._bridge = b;
                    this._currentBridgeUUID = b.ID;
                    // Merge bridge fields into detail model for binding in new tabs
                    Object.keys(b).forEach(k => this._model.setProperty("/" + k, b[k]));
                    this._renderBridgeInfo(b);
                    this._loadRestrictions(b.bridgeId);
                    this._loadAttributes(b.ID);
                    // Capability-gated data loads (A6 — skip OData requests for disabled groups)
                    if (CapabilityManager.canView("INSPECTIONS")) {
                        this._loadInspections(b.ID);
                    }
                    if (CapabilityManager.canView("DEFECTS")) {
                        this._loadDefects(b.ID);
                    }
                    this._loadExternalRefs(b.ID, b);
                    if (b.route_ID) this._loadRoute(b.route_ID);
                    this._loadHistory(b.bridgeId, b.ID);
                    this._loadCapacity();
                    // v3 loaders — gated by CAPACITY_RATINGS capability
                    if (CapabilityManager.canView("CAPACITY_RATINGS")) {
                        this._loadRiskAssessments();
                        this._loadInvestmentPlans();
                    }
                    // GAP 1: Scour Assessment
                    this._loadScourData(b.ID);
                    // Integration: load S/4HANA mapping
                    this._loadS4Mapping(b.ID);
                    // Phase 5.1: Document attachments
                    this._loadAttachments(b.ID);
                })
                .catch(function (err) {
                    console.error("[NHVR] Bridge load error:", err && err.message || err);
                    MessageBox.error("Failed to load bridge data. Please try again.");
                });
        },

        _renderBridgeInfo: function (b) {
            const condState = { GOOD: "Success", FAIR: "Warning", POOR: "Error", CRITICAL: "Error" };
            const postState = { UNRESTRICTED: "Success", POSTED: "Warning", CLOSED: "Error" };

            const fmt = (v) => v || "—";
            const fmtDate = (d) => d ? new Date(d).toLocaleDateString("en-AU") : "—";

            // Page title
            this._setText("pageTitle", b.name || b.bridgeId);
            this._setText("hdrBridgeId", b.bridgeId || "");
            this._setText("pageTitleSnapped", b.bridgeId);
            this._setText("breadcrumbBridge", b.name || b.bridgeId);

            // Header strip
            const cond = this.byId("hdrCondition");
            if (cond) { cond.setText(fmt(b.condition)); cond.setState(condState[b.condition] || "None"); }
            const post = this.byId("hdrPosting");
            if (post) { post.setText(fmt(b.postingStatus)); post.setState(postState[b.postingStatus] || "None"); }
            this._setText("hdrRegion",    `${fmt(b.region)}, ${fmt(b.state)}`);
            this._setText("hdrClearance", b.clearanceHeightM ? `${b.clearanceHeightM} m` : "—");
            this._setText("hdrInspection", fmtDate(b.inspectionDate));
            this._setText("hdrYearBuilt",  b.yearBuilt ? String(b.yearBuilt) : "—");
            this._setText("hdrAssetOwner", fmt(b.assetOwner));
            // Next Inspection Due — colour-code by overdue
            const nextDueHdr = this.byId("hdrNextInspDue");
            if (nextDueHdr) {
                if (b.nextInspectionDue) {
                    const daysLeft = Math.ceil((new Date(b.nextInspectionDue) - new Date()) / 86400000);
                    nextDueHdr.setText(fmtDate(b.nextInspectionDue));
                    nextDueHdr.setState(daysLeft < 0 ? "Error" : daysLeft < 90 ? "Warning" : "Success");
                } else { nextDueHdr.setText("Not set"); nextDueHdr.setState("None"); }
            }

            // Overview tab
            this._setText("ovBridgeId",      fmt(b.bridgeId));
            this._setText("ovName",          fmt(b.name));
            this._setText("ovStructureType", fmt(b.structureType));
            this._setText("ovMaterial",      fmt(b.material));
            this._setText("ovRegion",        fmt(b.region));
            this._setText("ovState",         fmt(b.state));
            this._setText("ovLga",           fmt(b.lga));
            this._setText("ovCoords",        (b.latitude && b.longitude) ? `${b.latitude}, ${b.longitude}` : "—");
            this._setText("ovClearance",     b.clearanceHeightM ? `${b.clearanceHeightM} m` : "—");
            this._setText("ovSpan",          b.spanLengthM ? `${b.spanLengthM} m` : "—");
            this._setText("ovTotalLength",   b.totalLengthM ? `${b.totalLengthM} m` : "—");
            this._setText("ovWidthM",        b.widthM ? `${b.widthM} m` : "—");
            this._setText("ovNumSpans",      fmt(b.numberOfSpans));
            this._setText("ovNumLanes",      fmt(b.numberOfLanes));
            this._setText("ovYearBuilt",     fmt(b.yearBuilt));
            this._setText("ovInspection",    fmtDate(b.inspectionDate));
            this._setText("ovRoadRoute",     fmt(b.roadRoute));
            this._setText("ovRouteNumber",   fmt(b.routeNumber));

            // Next Inspection Due — KPI card with overdue state
            const nextDueCtrl = this.byId("ovNextInspDue");
            if (nextDueCtrl) {
                if (b.nextInspectionDue) {
                    const daysLeft = Math.ceil((new Date(b.nextInspectionDue) - new Date()) / 86400000);
                    nextDueCtrl.setText(fmtDate(b.nextInspectionDue));
                    nextDueCtrl.setState(daysLeft < 0 ? "Error" : daysLeft < 90 ? "Warning" : "Success");
                } else { nextDueCtrl.setText("Not scheduled"); nextDueCtrl.setState("None"); }
            }

            // Condition & Engineering
            const condRatingCtrl = this.byId("ovConditionRating");
            if (condRatingCtrl) {
                condRatingCtrl.setText(b.conditionRating ? String(b.conditionRating) : "—");
                condRatingCtrl.setState(b.conditionRating >= 7 ? "Success" : b.conditionRating >= 5 ? "Warning" : b.conditionRating ? "Error" : "None");
            }
            // Condition score progress bar
            const scoreBar = this.byId("ovConditionScoreBar");
            if (scoreBar && b.conditionScore != null) {
                const pct   = Math.min(Math.max(b.conditionScore, 0), 100);
                const state = pct >= 70 ? "Success" : pct >= 40 ? "Warning" : "Error";
                scoreBar.setPercentValue(pct);
                scoreBar.setDisplayValue(pct + "%");
                scoreBar.setState(state);
                scoreBar.setVisible(true);
            }
            this._setText("ovConditionScore",    b.conditionScore ? String(b.conditionScore) : "—");
            this._setText("ovConditionStandard", fmt(b.conditionStandard));
            this._setText("ovDesignLoad",        fmt(b.designLoad));
            this._setText("ovDesignStandard",    fmt(b.designStandard));

            // NHVR & Asset Management fields
            this._setText("ovAssetOwner",    fmt(b.assetOwner));
            this._setText("ovMaintAuth",     fmt(b.maintenanceAuthority));
            this._setText("ovGazetteRef",    fmt(b.gazetteRef));
            this._setText("ovNhvrRef",       fmt(b.nhvrRef));
            this._setText("ovAadt",          b.aadtVehicles ? b.aadtVehicles.toLocaleString() + " vehicles/day" : "—");

            const nhvrAssessed = this.byId("ovNhvrAssessed");
            if (nhvrAssessed) {
                nhvrAssessed.setText(b.nhvrRouteAssessed ? "Yes — NHVR Assessed" : "Not Assessed");
                nhvrAssessed.setState(b.nhvrRouteAssessed ? "Success" : "Warning");
            }
            const scourCtrl = this.byId("ovScourRisk");
            if (scourCtrl) {
                scourCtrl.setText(fmt(b.scourRisk));
                scourCtrl.setState(b.scourRisk === "CRITICAL" ? "Error" : b.scourRisk === "HIGH" ? "Warning" : b.scourRisk === "LOW" ? "Success" : "None");
            }
            const freightCtrl = this.byId("ovFreightRoute");
            if (freightCtrl) {
                freightCtrl.setText(b.freightRoute ? "Yes — Freight Route" : "No");
                freightCtrl.setState(b.freightRoute ? "Success" : "None");
            }
            const overMassCtrl = this.byId("ovOverMassRoute");
            if (overMassCtrl) {
                overMassCtrl.setText(b.overMassRoute ? "Yes" : "No");
                overMassCtrl.setState(b.overMassRoute ? "Success" : "None");
            }
            const highPrioCtrl = this.byId("ovHighPriority");
            if (highPrioCtrl) {
                highPrioCtrl.setText(b.highPriorityAsset ? "Yes — High Priority" : "No");
                highPrioCtrl.setState(b.highPriorityAsset ? "Warning" : "None");
            }
            const floodCtrl = this.byId("ovFloodImpacted");
            if (floodCtrl) {
                floodCtrl.setText(b.floodImpacted ? "Yes — Flood Impacted" : "No");
                floodCtrl.setState(b.floodImpacted ? "Warning" : "None");
            }

            // Data Provenance
            const srcLink = this.byId("ovSourceUrl");
            if (srcLink) { srcLink.setText(b.sourceRefURL || "—"); srcLink.setHref(b.sourceRefURL || ""); }
            this._setText("ovOpenDataRef",   fmt(b.openDataRef));
            this._setText("ovRemarks",       fmt(b.remarks));

            // Risk KPI tiles — populate from bridge record (auto-computed on load)
            const scoreTile = this.byId("riskScoreTile");
            const bandTile  = this.byId("riskBandTile");
            const rankTile  = this.byId("priorityRankTile");
            if (scoreTile) scoreTile.setValue(b.currentRiskScore != null ? String(b.currentRiskScore) : "—");
            if (bandTile)  bandTile.setValue(b.currentRiskBand  || "—");
            if (rankTile)  rankTile.setValue(b.priorityRank     != null ? String(b.priorityRank)     : "—");
            const bandColors = { CRITICAL: "Error", VERY_HIGH: "Error", HIGH: "Critical", MEDIUM: "Neutral", LOW: "Good" };
            if (bandTile)  bandTile.setValueColor(bandColors[b.currentRiskBand] || "Neutral");

            // Investment financial summary tiles
            const fmtCurrency = (v) => v != null ? "$" + Number(v).toLocaleString("en-AU", { maximumFractionDigits: 0 }) : "—";
            this._setText("crcValue", fmtCurrency(b.currentReplacementCost));
            this._setText("wdvValue", fmtCurrency(b.writtenDownValue));
            this._setText("dmbValue", fmtCurrency(b.deferredMaintenanceValue));
            this._setText("rulValue", b.remainingUsefulLifeYrs != null ? b.remainingUsefulLifeYrs + " years" : "—");

            // No close/reopen buttons — status managed via Edit Bridge or posting status field
        },

        // ── Load Restrictions ─────────────────────────────────
        _loadRestrictions: function (bridgeId) {
            const h = { Accept: "application/json" };
            fetch(`${BASE}/Restrictions?$filter=bridgeId eq '${bridgeId}'&$select=ID,restrictionType,value,unit,status,permitRequired,validFromDate,validToDate,vehicleClassName,gazetteRef,directionApplied,signageRequired,notes&$orderby=status,validFromDate`, { headers: h })
                .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
                .then(j => {
                    const rows = (j.value || []).map(r => ({
                        ID               : r.ID,
                        restrictionType  : r.restrictionType || "—",
                        value            : r.value,
                        unit             : r.unit || "",
                        status           : r.status || "—",
                        permitRequired   : !!r.permitRequired,
                        vehicleClassName : r.vehicleClassName || "All",
                        validFromDate    : r.validFromDate || "—",
                        validToDate      : r.validToDate || "Ongoing",
                        gazetteRef       : r.gazetteRef || "",
                        directionApplied : r.directionApplied || "BOTH",
                        signageRequired  : !!r.signageRequired,
                        notes            : r.notes || ""
                    }));
                    this._model.setProperty("/restrictions", rows);
                    // Update active restrictions KPI card
                    const activeCount = rows.filter(r => r.status === "ACTIVE").length;
                    const arCtrl = this.byId("ovActiveRestrictions");
                    if (arCtrl) {
                        arCtrl.setText(String(activeCount));
                        arCtrl.setState(activeCount > 0 ? "Error" : "Success");
                    }
                })
                .catch(function (err) {
                    console.warn("[NHVR] Restrictions load failed:", err && err.message || err);
                    sap.m.MessageToast.show("Some data could not be loaded. Please refresh.");
                });
        },

        _renderTimeline: function (restrictions) {
            const timelineDiv = document.getElementById("nhvr-timeline");
            if (!timelineDiv) return;

            if (restrictions.length === 0) {
                timelineDiv.innerHTML = "<p style='color:#107E3E;font-weight:600;padding:12px'>✓ No restrictions on this bridge</p>";
                return;
            }

            const colorMap = { ACTIVE: "#BB0000", SCHEDULED: "#E9730C", EXPIRED: "#8396A8" };
            const html = restrictions.map(r => {
                const color = colorMap[r.status] || "#6A6D70";
                return `<div class="nhvrTimeline">
                    <div class="nhvrTimelineDot" style="background:${color}"></div>
                    <div class="nhvrTimelineContent">
                        <div class="nhvrTimelineTitle">${escapeHtml(r.restrictionType)}: ${escapeHtml(r.value)} ${escapeHtml(r.unit)}</div>
                        <div class="nhvrTimelineMeta">${escapeHtml(r.status)} &nbsp;|&nbsp; ${escapeHtml(r.vehicleClassName)} &nbsp;|&nbsp; ${escapeHtml(r.validFromDate)} → ${escapeHtml(r.validToDate)}</div>
                        ${r.permitRequired ? '<span class="nhvrTimelineBadge">Permit Required</span>' : ""}
                    </div>
                </div>`;
            }).join("");

            timelineDiv.innerHTML = html;
        },

        // ── Load Dynamic Attributes ───────────────────────────
        _loadAttributes: function (bridgeUUID) {
            if (!bridgeUUID) return;
            const h = { Accept: "application/json" };
            fetch(`${BASE}/BridgeAttributes?$filter=bridge_ID eq ${bridgeUUID}&$select=value,attribute_ID&$expand=attribute`, { headers: h })
                .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
                .then(j => {
                    const rows = (j.value || []).map(a => ({
                        attributeName: a.attribute ? (a.attribute.label || a.attribute.name) : a.attribute_ID,
                        value        : a.value || "—",
                        dataType     : a.attribute ? a.attribute.dataType : "—",
                        mandatory    : a.attribute ? !!a.attribute.isRequired : false,
                        description  : a.attribute ? (a.attribute.name || "") : ""
                    }));
                    this._model.setProperty("/attributes", rows);
                })
                .catch(function (err) {
                    console.warn("[NHVR] Attributes load failed:", err && err.message || err);
                });
        },

        // ── Load Route ────────────────────────────────────────
        _loadRoute: function (routeId) {
            const h = { Accept: "application/json" };
            fetch(`${BASE}/Routes(${routeId})?$select=routeCode,description`, { headers: h })
                .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
                .then(j => this._setText("hdrRoute", `${j.routeCode} — ${j.description || ""}` ))
                .catch(function (err) {
                    console.warn("[NHVR] Route load failed:", err && err.message || err);
                    this._setText("hdrRoute", "—");
                }.bind(this));
        },

        // ── Mini Map ──────────────────────────────────────────
        onMiniMapRendered: function () {
            if (this._miniMap || typeof L === "undefined") return;
            const b = this._bridge;
            const lat = b ? parseFloat(b.latitude) : -27.0;
            const lng = b ? parseFloat(b.longitude) : 133.0;

            if (!b || isNaN(lat) || isNaN(lng)) {
                this._setText("mapPreviewLabel", "No coordinates available for this bridge");
                return;
            }

            setTimeout(() => {
                this._miniMap = L.map("nhvr-mini-map", { center: [lat, lng], zoom: 13, zoomControl: true });
                L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
                    attribution: "© OpenStreetMap", maxZoom: 19
                }).addTo(this._miniMap);

                const color = { UNRESTRICTED: "#107E3E", POSTED: "#E9730C", CLOSED: "#BB0000" }[b.postingStatus] || "#6A6D70";

                // Point marker
                L.circleMarker([lat, lng], {
                    radius: 12, fillColor: color, color: "#fff", weight: 3, fillOpacity: 0.9
                }).bindPopup(`<strong>${b.name}</strong><br>${b.condition} / ${b.postingStatus}`).addTo(this._miniMap);

                // Bridge span LINE (simulated: ±0.003° east-west)
                L.polyline([[lat, lng - 0.004], [lat, lng + 0.004]], {
                    color: color, weight: 6, opacity: 0.85
                }).bindTooltip(`Span: ${b.spanLengthM || "?"} m`).addTo(this._miniMap);

                this._setText("mapPreviewLabel", `${b.name} — ${b.latitude}, ${b.longitude}`);
            }, 200);
        },

        // ── Edit Bridge ───────────────────────────────────────
        onEditBridge: function () {
            if (!this._bridgeId) return;
            this.getOwnerComponent().getRouter().navTo("BridgeEdit", {
                bridgeId: encodeURIComponent(this._bridgeId)
            });
        },

        // ── Actions ───────────────────────────────────────────
        onCloseBridge: function () {
            UserAnalytics.trackAction("close_bridge", "BridgeDetail", { bridgeId: this._bridgeId });
            if (!this._bridge) return;
            // Pre-fill today's date
            const today = new Date().toISOString().split("T")[0];
            const fromPicker = this.byId("closeBridgeFrom");
            if (fromPicker && !fromPicker.getValue()) fromPicker.setValue(today);
            // Clear other fields
            const reasonTa = this.byId("closeBridgeReason");
            if (reasonTa) reasonTa.setValue("");
            const reopenPicker = this.byId("closeBridgeReopenDate");
            if (reopenPicker) reopenPicker.setValue("");
            const approvalInput = this.byId("closeBridgeApproval");
            if (approvalInput) approvalInput.setValue("");
            this.byId("closeBridgeDialog").open();
        },

        onSaveCloseBridge: function () {
            const reason      = this.byId("closeBridgeReason")    ? this.byId("closeBridgeReason").getValue().trim()    : "";
            const effectiveFrom = this.byId("closeBridgeFrom")    ? this.byId("closeBridgeFrom").getValue()             : "";
            const reopenDate  = this.byId("closeBridgeReopenDate")? this.byId("closeBridgeReopenDate").getValue()       : "";
            const approvalRef = this.byId("closeBridgeApproval")  ? this.byId("closeBridgeApproval").getValue().trim()  : "";

            if (!reason) { MessageToast.show("Reason is required"); return; }
            if (!effectiveFrom) { MessageToast.show("Effective From date is required"); return; }

            AuthFetch.post(`${BASE}/Bridges(${this._bridge.ID})/closeBridge`, {
                    reason              : reason,
                    effectiveFrom       : effectiveFrom,
                    expectedReopenDate  : reopenDate || null,
                    approvalRef         : approvalRef || null
                })
            .then(async r => {
                if (!r.ok) { const b = await r.json().catch(() => ({})); throw new Error(b.error?.message || `HTTP ${r.status}`); }
                return r.json();
            })
            .then(() => {
                const msg = this._isPermanentClosure ? "Bridge permanently closed — audit record created" : "Bridge closed";
                MessageToast.show(msg);
                this._resetCloseBridgeDialog();
                this.byId("closeBridgeDialog").close();
                this._loadBridge();
            })
            .catch(err => MessageBox.error("Failed to close bridge: " + err.message));
        },

        onCancelCloseBridge: function () {
            this._resetCloseBridgeDialog();
            this.byId("closeBridgeDialog").close();
        },

        _resetCloseBridgeDialog: function () {
            this._isPermanentClosure = false;
            const dlg = this.byId("closeBridgeDialog");
            if (dlg) dlg.setTitle("Close Bridge to Traffic");
            const reopenPicker = this.byId("closeBridgeReopenDate");
            if (reopenPicker) reopenPicker.setVisible(true);
        },

        onReopenBridge: function () {
            if (!this._bridge) return;
            const today = new Date().toISOString().split("T")[0];
            const datePicker = this.byId("reopenBridgeDate");
            if (datePicker && !datePicker.getValue()) datePicker.setValue(today);
            const reasonTa = this.byId("reopenBridgeReason");
            if (reasonTa) reasonTa.setValue("");
            const approvalInput = this.byId("reopenBridgeApproval");
            if (approvalInput) approvalInput.setValue("");
            const inspRefInput = this.byId("reopenBridgeInspRef");
            if (inspRefInput) inspRefInput.setValue("");
            this.byId("reopenBridgeDialog").open();
        },

        onSaveReopenBridge: function () {
            const reason      = this.byId("reopenBridgeReason")   ? this.byId("reopenBridgeReason").getValue().trim()   : "";
            const effectiveDate = this.byId("reopenBridgeDate")   ? this.byId("reopenBridgeDate").getValue()            : "";
            const approvalRef = this.byId("reopenBridgeApproval") ? this.byId("reopenBridgeApproval").getValue().trim() : "";
            const inspectionRef = this.byId("reopenBridgeInspRef")? this.byId("reopenBridgeInspRef").getValue().trim()  : "";

            if (!reason) { MessageToast.show("Reason is required"); return; }
            if (!effectiveDate) { MessageToast.show("Effective Date is required"); return; }

            AuthFetch.post(`${BASE}/Bridges(${this._bridge.ID})/reopenBridge`, {
                    reason        : reason,
                    effectiveDate : effectiveDate,
                    approvalRef   : approvalRef || null,
                    inspectionRef : inspectionRef || null
                })
            .then(async r => {
                if (!r.ok) { const b = await r.json().catch(() => ({})); throw new Error(b.error?.message || `HTTP ${r.status}`); }
                return r.json();
            })
            .then(() => {
                MessageToast.show("Bridge reopened");
                this.byId("reopenBridgeDialog").close();
                this._loadBridge();
            })
            .catch(err => MessageBox.error("Failed to reopen bridge: " + err.message));
        },

        onCancelReopenBridge: function () {
            this.byId("reopenBridgeDialog").close();
        },

        onDownloadReport: function () {
            MessageToast.show("Report download not available in this environment");
        },

        onRestrictionFilterChange: function (e) {
            const key  = e.getParameter("selectedItem").getKey();
            const all  = this._model.getProperty("/restrictions") || [];
            const data = key === "ALL" ? all : all.filter(r => r.status === key);
            this._renderTimeline(data);
        },

        // ── Load Bridge History (BridgeEventLog) ─────────────
        _loadHistory: function (bridgeId, bridgeUUID) {
            this._allEventLog = [];
            const h = { Accept: "application/json" };
            fetch(`${BASE}/BridgeEventLog?$filter=bridge_ID eq ${bridgeUUID}&$orderby=timestamp desc&$top=200`, { headers: h })
                .then(r => r.json())
                .then(j => {
                    this._allEventLog = (j.value || []).map(e => ({
                        ID                : e.ID,
                        eventType         : e.eventType || "—",
                        title             : e.title || "—",
                        detail            : e.detail || "",
                        timestampDisplay  : e.timestamp ? new Date(e.timestamp).toLocaleString("en-AU") : "—",
                        performedBy       : e.performedBy || "system",
                        statusBefore      : e.statusBefore || "",
                        statusAfter       : e.statusAfter || "",
                        approvalRef       : e.approvalRef || "",
                        gazetteRef        : e.gazetteRef || "",
                        effectiveFrom     : e.effectiveFrom || "",
                        effectiveTo       : e.effectiveTo || "",
                        sortKey           : e.timestamp || "0"
                    }));
                    this._model.setProperty("/history", this._allEventLog);
                    // Only render timeline if History tab is currently active
                    const tabBar = this.byId("detailTabs");
                    if (tabBar && tabBar.getSelectedKey() === "history") {
                        this._renderHistoryTimeline("ALL");
                    }
                })
                .catch(() => {
                    this._model.setProperty("/history", []);
                    const tabBar2 = this.byId("detailTabs");
                    if (tabBar2 && tabBar2.getSelectedKey() === "history") {
                        this._renderHistoryTimeline("ALL");
                    }
                });
        },

        _renderHistoryTimeline: function (filter) {
            const timelineDiv = document.getElementById("nhvr-history-timeline");
            if (!timelineDiv) return;

            const eventColorMap = {
                BRIDGE_CREATED       : "#0070F2",
                BRIDGE_UPDATED       : "#6A6D70",
                CONDITION_UPDATED    : "#E9730C",
                BRIDGE_CLOSED        : "#BB0000",
                BRIDGE_REOPENED      : "#107E3E",
                RESTRICTION_ADDED    : "#BB0000",
                TEMP_RESTRICTION_ADDED: "#E9730C",
                RESTRICTION_DISABLED : "#8396A8",
                RESTRICTION_ENABLED  : "#107E3E"
            };

            const eventIconMap = {
                BRIDGE_CREATED       : "🏗",
                BRIDGE_UPDATED       : "✏️",
                CONDITION_UPDATED    : "🔧",
                BRIDGE_CLOSED        : "🚫",
                BRIDGE_REOPENED      : "✅",
                RESTRICTION_ADDED    : "⛔",
                TEMP_RESTRICTION_ADDED: "⚠️",
                RESTRICTION_DISABLED : "⬜",
                RESTRICTION_ENABLED  : "🟢"
            };

            let events = filter === "ALL"
                ? (this._allEventLog || [])
                : (this._allEventLog || []).filter(e => e.eventType === filter);

            if (events.length === 0) {
                timelineDiv.innerHTML = "<p style='color:#8396A8;padding:12px'>No events recorded for this bridge yet.</p>";
                return;
            }

            const html = events.map(ev => {
                const color = eventColorMap[ev.eventType] || "#6A6D70";
                const icon  = eventIconMap[ev.eventType]  || "📋";
                const statusChange = (ev.statusBefore || ev.statusAfter)
                    ? `<span style="color:#6A6D70;font-size:0.8rem">${escapeHtml(ev.statusBefore) || "—"} → ${escapeHtml(ev.statusAfter) || "—"}</span>`
                    : "";
                const extraMeta = [
                    ev.approvalRef ? `Ref: ${escapeHtml(ev.approvalRef)}` : "",
                    ev.effectiveFrom ? `From: ${escapeHtml(ev.effectiveFrom)}` : "",
                    ev.effectiveTo ? `To: ${escapeHtml(ev.effectiveTo)}` : ""
                ].filter(Boolean).join(" · ");

                return `<div class="nhvrHistoryEvent">
                    <div class="nhvrHistoryDot" style="background:${color}"></div>
                    <div class="nhvrHistoryContent">
                        <div class="nhvrHistoryDate">${ev.timestampDisplay}
                            <span class="nhvrHistoryType" style="background:${color}">${icon} ${ev.eventType}</span>
                        </div>
                        <div class="nhvrHistoryTitle">${escapeHtml(ev.title)}</div>
                        ${statusChange}
                        ${ev.detail ? `<div class="nhvrHistoryMeta">${escapeHtml(ev.detail)}</div>` : ""}
                        ${extraMeta ? `<div class="nhvrHistoryMeta" style="color:#6A6D70;font-size:0.8rem">${extraMeta}</div>` : ""}
                        <div class="nhvrHistoryMeta" style="color:#8396A8;font-size:0.75rem">By: ${escapeHtml(ev.performedBy)}</div>
                    </div>
                </div>`;
            }).join("");

            timelineDiv.innerHTML = html;
        },

        // ── Tab Select Handler — re-render DOM-based tabs on demand ──
        // Fixes the "Loading history…" / blank tab bug:
        // DOM-rendered elements (history timeline, restriction timeline, mini-map)
        // only exist when the tab is visible. Re-render when the tab is selected.
        onDetailTabSelect: function (e) {
            const key = e.getParameter("key") || (e.getSource ? e.getSource().getSelectedKey() : "");
            switch (key) {
                case "history": {
                    const filter = this.byId("historyEventFilter")
                        ? this.byId("historyEventFilter").getSelectedKey() : "ALL";
                    // Small delay to allow the HTML element to render into the DOM
                    setTimeout(() => this._renderHistoryTimeline(filter || "ALL"), 50);
                    break;
                }
                case "restrictions": {
                    const restData = this._model.getProperty("/restrictions") || [];
                    setTimeout(() => this._renderTimeline(restData), 50);
                    break;
                }
                case "mapPreview":
                    setTimeout(() => this.onMiniMapRendered(), 100);
                    break;
                case "scour":
                    setTimeout(() => this._renderScourMatrix(), 50);
                    break;
            }
        },

        // ── Permanent Closure ──────────────────────────────────────
        onPermanentClosure: function () {
            if (!this._bridge) return;
            var self = this;
            var bridge = this._bridge || {};
            sap.m.MessageBox.confirm(
                "Permanently close " + (bridge.name || bridge.bridgeId || "this bridge") + "?\n\nThis action creates an immutable audit record. The bridge will remain closed until a 'Lift Closure' action is authorised.",
                {
                    title: "Confirm Permanent Closure",
                    emphasizedAction: sap.m.MessageBox.Action.OK,
                    actions: [sap.m.MessageBox.Action.OK, sap.m.MessageBox.Action.CANCEL],
                    onClose: function (sAction) {
                        if (sAction !== sap.m.MessageBox.Action.OK) return;
                        self._isPermanentClosure = true;
                        const today = new Date().toISOString().split("T")[0];
                        const fromPicker = self.byId("closeBridgeFrom");
                        if (fromPicker) fromPicker.setValue(today);
                        // Clear optional fields; hide reopen date (not applicable for permanent)
                        const reopenPicker = self.byId("closeBridgeReopenDate");
                        if (reopenPicker) { reopenPicker.setValue(""); reopenPicker.setVisible(false); }
                        const reasonTa = self.byId("closeBridgeReason");
                        if (reasonTa) reasonTa.setValue("");
                        const approvalInput = self.byId("closeBridgeApproval");
                        if (approvalInput) approvalInput.setValue("");
                        const dlg = self.byId("closeBridgeDialog");
                        if (dlg) dlg.setTitle("Permanently Close Bridge");
                        self.byId("closeBridgeDialog").open();
                    }
                }
            );
        },

        // ── Scour Risk Matrix rendering ────────────────────────────
        _renderScourMatrix: function () {
            const el = document.getElementById("nhvr-scour-matrix");
            if (!el) return;

            // AustRoads BIMM §7 simplified 5×5 Likelihood × Consequence matrix
            // Risk = row × col (1-25), bands: 1-4 LOW, 5-9 MEDIUM, 10-16 HIGH, 17-25 CRITICAL
            const getRiskBand = (score) => {
                if (score >= 17) return { band: "CRITICAL", bg: "#BB0000", fg: "#fff" };
                if (score >= 10) return { band: "HIGH",     bg: "#E9730C", fg: "#fff" };
                if (score >= 5)  return { band: "MEDIUM",   bg: "#F0AB00", fg: "#000" };
                return                  { band: "LOW",      bg: "#107E3E", fg: "#fff" };
            };

            const colLabels = ["1 — Low", "2 — Minor", "3 — Moderate", "4 — Major", "5 — Catastrophic"];
            const rowLabels = ["5 — Almost Certain", "4 — Likely", "3 — Possible", "2 — Unlikely", "1 — Rare"];

            let html = `
            <div style="font-family:72,72Full,Arial,sans-serif;font-size:0.8rem;overflow-x:auto">
              <table style="border-collapse:collapse;width:100%;min-width:460px">
                <thead>
                  <tr>
                    <th style="padding:6px;text-align:center;background:#f5f5f5;border:1px solid #ccc;font-size:0.75rem" colspan="2" rowspan="2">LIKELIHOOD<br/><span style="font-weight:normal;color:#6A6D70">(Flood Exposure)</span></th>
                    <th style="padding:6px;text-align:center;background:#f5f5f5;border:1px solid #ccc" colspan="5">CONSEQUENCE (Foundation Susceptibility &amp; Traffic Impact)</th>
                  </tr>
                  <tr>
                    ${colLabels.map(l => `<th style="padding:6px 4px;text-align:center;background:#f5f5f5;border:1px solid #ccc;font-size:0.72rem;min-width:80px">${l}</th>`).join("")}
                  </tr>
                </thead>
                <tbody>`;

            for (let row = 5; row >= 1; row--) {
                html += `<tr>
                  <th style="padding:4px 6px;background:#f5f5f5;border:1px solid #ccc;font-size:0.72rem;white-space:nowrap">${rowLabels[5 - row]}</th>
                  <th style="padding:4px;background:#f5f5f5;border:1px solid #ccc;text-align:center;font-weight:bold">${row}</th>`;
                for (let col = 1; col <= 5; col++) {
                    const score = row * col;
                    const { band, bg, fg } = getRiskBand(score);
                    html += `<td style="padding:8px 4px;text-align:center;background:${bg};color:${fg};border:1px solid #ccc;cursor:pointer;font-weight:600;font-size:0.8rem"
                        onclick="sap.ui.getCore().byId(document.querySelector('[data-sap-id]')?.dataset?.sapId)?.getController && (function(){
                            var ctrl = sap.ui.getCore().getComponent ? null : null;
                        })()"
                        title="Score ${score} — ${band}: Click to select this risk level">
                        ${score}<br/><span style="font-size:0.65rem;font-weight:normal">${band}</span>
                    </td>`;
                }
                html += `</tr>`;
            }

            html += `</tbody>
              </table>
              <div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap;font-size:0.75rem">
                <span style="background:#107E3E;color:#fff;padding:3px 8px;border-radius:3px">● LOW (1–4)</span>
                <span style="background:#F0AB00;color:#000;padding:3px 8px;border-radius:3px">● MEDIUM (5–9)</span>
                <span style="background:#E9730C;color:#fff;padding:3px 8px;border-radius:3px">● HIGH (10–16)</span>
                <span style="background:#BB0000;color:#fff;padding:3px 8px;border-radius:3px">● CRITICAL (17–25)</span>
              </div>
              <p style="color:#6A6D70;font-size:0.72rem;margin-top:8px">
                <strong>How to use:</strong> Find the row matching the bridge's Flood Exposure level (flood frequency × channel velocity)
                and the column matching Consequence (foundation type × traffic importance). The intersection gives the Risk Score and Band.
                Use the "Manual Override" dropdown below to record the assessed risk.
              </p>
            </div>`;

            el.innerHTML = html;
        },

        // ── Scour Risk Manual Override ─────────────────────────────
        onScourRiskManualOverride: function () {
            // Selection acknowledged — user needs to press "Apply Override"
        },

        onApplyScourRiskOverride: function () {
            if (!this._bridge) return;
            const sel = this.byId("scourRiskManualSelect");
            if (!sel || !sel.getSelectedKey()) { MessageToast.show("Select a risk level first"); return; }
            const riskLevel = sel.getSelectedKey();
            AuthFetch.patch(`${BASE}/Bridges(${this._bridge.ID})`, { scourRisk: riskLevel })
            .then(async r => {
                if (!r.ok) { const b = await r.json().catch(() => ({})); throw new Error(b.error?.message || `HTTP ${r.status}`); }
                MessageToast.show(`Scour risk updated to ${riskLevel}`);
                this._bridge.scourRisk = riskLevel;
                // Update the display in the header
                const scourCtrl = this.byId("ovScourRisk");
                if (scourCtrl) {
                    scourCtrl.setText(riskLevel);
                    scourCtrl.setState(riskLevel === "CRITICAL" ? "Error" : riskLevel === "HIGH" ? "Warning" : riskLevel === "LOW" ? "Success" : "None");
                }
                // Reset the override select
                sel.setSelectedKey("");
            })
            .catch(err => MessageBox.error("Failed to update scour risk: " + err.message));
        },

        onHistoryFilterChange: function (e) {
            const filter = e.getParameter("selectedItem").getKey();
            const gridVisible = this.byId("historyGridTable") && this.byId("historyGridTable").getVisible();
            if (gridVisible) {
                const filtered = filter === "ALL"
                    ? this._allEventLog
                    : (this._allEventLog || []).filter(ev => ev.eventType === filter);
                this._model.setProperty("/history", filtered);
            } else {
                this._renderHistoryTimeline(filter);
            }
        },

        onHistoryViewTimeline: function () {
            const timeline = this.byId("historyTimeline");
            const grid     = this.byId("historyGridTable");
            const btnTl    = this.byId("btnHistoryTimeline");
            const btnGr    = this.byId("btnHistoryGrid");
            if (timeline) timeline.setVisible(true);
            if (grid)     grid.setVisible(false);
            if (btnTl)    btnTl.setType("Emphasized");
            if (btnGr)    btnGr.setType("Transparent");
        },

        onHistoryViewGrid: function () {
            const timeline = this.byId("historyTimeline");
            const grid     = this.byId("historyGridTable");
            const btnTl    = this.byId("btnHistoryTimeline");
            const btnGr    = this.byId("btnHistoryGrid");
            if (timeline) timeline.setVisible(false);
            if (grid)     grid.setVisible(true);
            if (btnTl)    btnTl.setType("Transparent");
            if (btnGr)    btnGr.setType("Emphasized");
        },

        // ── Unified Restriction Dialog (replaces add + temp dialogs) ─────
        onOpenBdRestDialog: function (mode) {
            if (!this._bridge) { MessageToast.show("Bridge not loaded yet"); return; }
            const isTemp = mode === "TEMPORARY";
            // Set category toggle
            const cat = this.byId("bdRestCategory");
            if (cat) cat.setSelectedKey(isTemp ? "TEMPORARY" : "PERMANENT");
            this._toggleBdRestTempFields(isTemp);
            // Set bridge info strip
            const info = this.byId("bdRestBridgeInfo");
            if (info) info.setText(`Bridge: ${this._bridge.name || this._bridge.bridgeId} (${this._bridge.bridgeId})`);
            // Set save button label
            const btn = this.byId("bdRestSaveBtn");
            if (btn) btn.setText(isTemp ? "Apply Temporary Restriction" : "Add Restriction");
            // Clear form
            this._clearBdRestForm();
            // Set default dates for temp
            if (isTemp) {
                const today   = new Date().toISOString().split("T")[0];
                const inMonth = new Date(Date.now() + 30*24*60*60*1000).toISOString().split("T")[0];
                if (this.byId("bdRestFrom") && !this.byId("bdRestFrom").getValue()) this.byId("bdRestFrom").setValue(today);
                if (this.byId("bdRestTo")   && !this.byId("bdRestTo").getValue())   this.byId("bdRestTo").setValue(inMonth);
            }
            this.byId("bdRestDialog").open();
        },

        onAddRestriction    : function () { this.onOpenBdRestDialog("PERMANENT"); },
        onAddTempRestriction: function () { this.onOpenBdRestDialog("TEMPORARY"); },

        onBdRestCategoryChange: function (e) {
            const key = e.getParameter("item") ? e.getParameter("item").getKey()
                      : (e.getSource ? e.getSource().getSelectedKey() : "PERMANENT");
            const isTemp = key === "TEMPORARY";
            this._toggleBdRestTempFields(isTemp);
            const btn = this.byId("bdRestSaveBtn");
            if (btn) btn.setText(isTemp ? "Apply Temporary Restriction" : "Add Restriction");
        },

        _toggleBdRestTempFields: function (isTemp) {
            const tempBox   = this.byId("bdRestTempFields");
            const statusBox = this.byId("bdRestStatusBox");
            const dirBox    = this.byId("bdRestDirectionBox");
            const gazBox    = this.byId("bdRestGazetteBox");
            if (tempBox)   tempBox.setVisible(isTemp);
            if (statusBox) statusBox.setVisible(!isTemp);
            if (dirBox)    dirBox.setVisible(!isTemp);
            if (gazBox)    gazBox.setVisible(!isTemp);
        },

        onSaveBdRestriction: function () {
            const cat    = this.byId("bdRestCategory") ? this.byId("bdRestCategory").getSelectedKey() : "PERMANENT";
            const isTemp = cat === "TEMPORARY";
            const type   = this.byId("bdRestType")   ? this.byId("bdRestType").getSelectedKey()     : "";
            const value  = this.byId("bdRestValue")  ? this.byId("bdRestValue").getValue().trim()   : "";
            const unit   = this.byId("bdRestUnit")   ? this.byId("bdRestUnit").getSelectedKey()     : "";
            const from   = this.byId("bdRestFrom")   ? this.byId("bdRestFrom").getValue()           : "";
            const to     = this.byId("bdRestTo")     ? this.byId("bdRestTo").getValue()             : "";
            const permit = this.byId("bdRestPermit") ? this.byId("bdRestPermit").getSelected()      : false;
            const notes  = this.byId("bdRestNotes")  ? this.byId("bdRestNotes").getValue().trim()   : "";

            if (!type || !value || !unit) {
                MessageToast.show("Restriction Type, Value and Unit are required");
                return;
            }
            if (parseFloat(value) <= 0) { MessageToast.show("Value must be greater than 0"); return; }
            if (from && to && new Date(from) > new Date(to)) {
                MessageToast.show("Valid From must be before Valid To");
                return;
            }

            if (isTemp) {
                // ── Temporary: use bound action (logs TEMP_RESTRICTION_ADDED event) ──
                AuthFetch.post(`${BASE}/Bridges(${this._bridge.ID})/applyTemporaryRestriction`, {
                        restrictionType : type,
                        value           : parseFloat(value),
                        unit            : unit,
                        validFromDate   : from || null,
                        validToDate     : to   || null,
                        permitRequired  : permit,
                        notes           : notes || null,
                        temporaryReason : this.byId("bdRestTempReason")    ? this.byId("bdRestTempReason").getValue().trim()    : null,
                        approvedBy      : this.byId("bdRestTempApprovedBy")? this.byId("bdRestTempApprovedBy").getValue().trim(): null
                    })
                .then(async r => {
                    if (!r.ok) { const b = await r.json().catch(() => ({})); throw new Error(b.error?.message || `HTTP ${r.status}`); }
                    return r.json();
                })
                .then(() => {
                    MessageToast.show("Temporary restriction applied");
                    this.byId("bdRestDialog").close();
                    this._loadRestrictions(this._bridgeId);
                    this._loadHistory(this._bridgeId, this._bridge.ID);
                })
                .catch(err => MessageBox.error("Failed to apply restriction: " + err.message));
            } else {
                // ── Permanent: use bound action (logs RESTRICTION_ADDED event) ──
                const direction = this.byId("bdRestDirection") ? this.byId("bdRestDirection").getSelectedKey() : "BOTH";
                const gazette   = this.byId("bdRestGazette")   ? this.byId("bdRestGazette").getValue().trim()  : "";
                const status    = this.byId("bdRestStatus")    ? this.byId("bdRestStatus").getSelectedKey()    : "ACTIVE";
                const signage   = this.byId("bdRestSignage")   ? this.byId("bdRestSignage").getSelected()      : false;
                AuthFetch.post(`${BASE}/Bridges(${this._bridge.ID})/addRestriction`, {
                        restrictionType  : type,
                        value            : parseFloat(value),
                        unit             : unit,
                        validFromDate    : from  || null,
                        validToDate      : to    || null,
                        status           : status,
                        permitRequired   : permit,
                        directionApplied : direction,
                        gazetteRef       : gazette  || null,
                        signageRequired  : signage,
                        notes            : notes    || null
                    })
                .then(async r => {
                    if (!r.ok) { const b = await r.json().catch(() => ({})); throw new Error(b.error?.message || `HTTP ${r.status}`); }
                    return r.json();
                })
                .then(() => {
                    MessageToast.show("Restriction added");
                    this.byId("bdRestDialog").close();
                    this._loadRestrictions(this._bridgeId);
                    this._loadHistory(this._bridgeId, this._bridge.ID);
                })
                .catch(err => MessageBox.error("Failed to add restriction: " + err.message));
            }
        },

        onCancelBdRestriction: function () {
            this.byId("bdRestDialog").close();
        },

        _clearBdRestForm: function () {
            ["bdRestValue","bdRestGazette","bdRestNotes","bdRestTempReason","bdRestTempApprovedBy"].forEach(id => {
                const c = this.byId(id); if (c && c.setValue) c.setValue("");
            });
            ["bdRestFrom","bdRestTo"].forEach(id => {
                const c = this.byId(id); if (c && c.setValue) c.setValue("");
            });
            if (this.byId("bdRestType"))      this.byId("bdRestType").setSelectedKey("HEIGHT");
            if (this.byId("bdRestUnit"))      this.byId("bdRestUnit").setSelectedKey("m");
            if (this.byId("bdRestStatus"))    this.byId("bdRestStatus").setSelectedKey("ACTIVE");
            if (this.byId("bdRestDirection")) this.byId("bdRestDirection").setSelectedKey("BOTH");
            ["bdRestPermit","bdRestSignage"].forEach(id => {
                const c = this.byId(id); if (c) c.setSelected(false);
            });
        },

        // ── Disable Restriction ───────────────────────────────
        onDisableRestriction: function (e) {
            const ctx = e.getSource().getBindingContext("detail");
            const row = ctx ? ctx.getObject() : null;
            if (!row || !row.ID) return;
            this._selectedRestrictionId = row.ID;
            const info = this.byId("disableRestInfo");
            if (info) info.setText(`Disabling: ${row.restrictionType} — ${row.value} ${row.unit}`);
            const reasonTa = this.byId("disableRestReason");
            if (reasonTa) reasonTa.setValue("");
            const untilPicker = this.byId("disableRestUntil");
            if (untilPicker) untilPicker.setValue("");
            this.byId("disableRestrictionDialog").open();
        },

        onSaveDisableRestriction: function () {
            const reason = this.byId("disableRestReason") ? this.byId("disableRestReason").getValue().trim() : "";
            if (!reason) { MessageToast.show("Reason is required"); return; }
            if (!this._selectedRestrictionId) return;

            AuthFetch.post(`${BASE}/Restrictions(${this._selectedRestrictionId})/disableRestriction`, { reason })
            .then(async r => {
                if (!r.ok) { const b = await r.json().catch(() => ({})); throw new Error(b.error?.message || `HTTP ${r.status}`); }
                return r.json();
            })
            .then(() => {
                MessageToast.show("Restriction disabled");
                this.byId("disableRestrictionDialog").close();
                this._selectedRestrictionId = null;
                this._loadRestrictions(this._bridgeId);
            })
            .catch(err => MessageBox.error("Failed to disable restriction: " + err.message));
        },

        onCancelDisableRestriction: function () {
            this.byId("disableRestrictionDialog").close();
            this._selectedRestrictionId = null;
        },

        // ── Enable Restriction ────────────────────────────────
        onEnableRestriction: function (e) {
            const ctx = e.getSource().getBindingContext("detail");
            const row = ctx ? ctx.getObject() : null;
            if (!row || !row.ID) return;
            this._selectedRestrictionId = row.ID;
            const info = this.byId("enableRestInfo");
            if (info) info.setText(`Enabling: ${row.restrictionType} — ${row.value} ${row.unit}`);
            const reasonTa = this.byId("enableRestReason");
            if (reasonTa) reasonTa.setValue("");
            this.byId("enableRestrictionDialog").open();
        },

        onSaveEnableRestriction: function () {
            const reason = this.byId("enableRestReason") ? this.byId("enableRestReason").getValue().trim() : "";
            if (!reason) { MessageToast.show("Reason is required"); return; }
            if (!this._selectedRestrictionId) return;

            AuthFetch.post(`${BASE}/Restrictions(${this._selectedRestrictionId})/enableRestriction`, { reason })
            .then(async r => {
                if (!r.ok) { const b = await r.json().catch(() => ({})); throw new Error(b.error?.message || `HTTP ${r.status}`); }
                return r.json();
            })
            .then(() => {
                MessageToast.show("Restriction enabled");
                this.byId("enableRestrictionDialog").close();
                this._selectedRestrictionId = null;
                this._loadRestrictions(this._bridgeId);
            })
            .catch(err => MessageBox.error("Failed to enable restriction: " + err.message));
        },

        onCancelEnableRestriction: function () {
            this.byId("enableRestrictionDialog").close();
            this._selectedRestrictionId = null;
        },

        // ── Inspection Records ────────────────────────────────
        _loadInspections: function (bridgeUUID) {
            const h = { Accept: "application/json" };
            fetch(`${BASE}/Bridges(${bridgeUUID})/inspections?$orderby=inspectionDate desc`, { headers: h })
                .then(r => r.json())
                .then(j => {
                    this._model.setProperty("/inspections", j.value || []);
                })
                .catch(() => this._model.setProperty("/inspections", []));
        },

        onRefreshInspections: function () {
            if (this._bridge) this._loadInspections(this._bridge.ID);
        },

        // ── Create Inspection Record ───────────────────────────
        onCreateInspection: function () {
            if (!this._bridge) { MessageToast.show("Bridge not loaded yet"); return; }
            // Clear form fields
            ["inspDlgInspector","inspDlgScourFinding","inspDlgNotes"].forEach(id => {
                const c = this.byId(id); if (c && c.setValue) c.setValue("");
            });
            const today = new Date().toISOString().split("T")[0];
            if (this.byId("inspDlgDate")) this.byId("inspDlgDate").setValue(today);
            if (this.byId("inspDlgNextDue")) this.byId("inspDlgNextDue").setValue("");
            if (this.byId("inspDlgType")) this.byId("inspDlgType").setSelectedKey("ROUTINE");
            if (this.byId("inspDlgRating")) this.byId("inspDlgRating").setValue("7");
            if (this.byId("inspDlgDefects")) this.byId("inspDlgDefects").setValue("0");
            if (this.byId("inspDlgCritical")) this.byId("inspDlgCritical").setValue("0");
            if (this.byId("inspDlgAdequacy")) this.byId("inspDlgAdequacy").setSelectedKey("ADEQUATE");
            if (this.byId("inspDlgMaintReq")) this.byId("inspDlgMaintReq").setSelected(false);
            this.byId("addInspectionDialog").open();
        },

        onSaveInspection: function () {
            const date         = this.byId("inspDlgDate")        ? this.byId("inspDlgDate").getValue()             : "";
            const type         = this.byId("inspDlgType")        ? this.byId("inspDlgType").getSelectedKey()       : "ROUTINE";
            const inspector    = this.byId("inspDlgInspector")   ? this.byId("inspDlgInspector").getValue().trim() : "";
            const ratingRaw    = this.byId("inspDlgRating")      ? this.byId("inspDlgRating").getValue()           : "";
            const rating       = parseInt(ratingRaw, 10);
            const defects      = parseInt(this.byId("inspDlgDefects")  ? this.byId("inspDlgDefects").getValue() : "0", 10) || 0;
            const critical     = parseInt(this.byId("inspDlgCritical") ? this.byId("inspDlgCritical").getValue() : "0", 10) || 0;
            const adequacy     = this.byId("inspDlgAdequacy")    ? this.byId("inspDlgAdequacy").getSelectedKey()   : "ADEQUATE";
            const maintReq     = this.byId("inspDlgMaintReq")    ? this.byId("inspDlgMaintReq").getSelected()      : false;
            const scourFinding = this.byId("inspDlgScourFinding")? this.byId("inspDlgScourFinding").getValue().trim() : "";
            const nextDue      = this.byId("inspDlgNextDue")     ? this.byId("inspDlgNextDue").getValue()           : "";
            const notes        = this.byId("inspDlgNotes")       ? this.byId("inspDlgNotes").getValue().trim()      : "";

            if (!date)      { MessageToast.show("Inspection date is required");              return; }
            if (!inspector) { MessageToast.show("Inspector name / registration is required"); return; }
            if (!rating || rating < 1 || rating > 10) { MessageToast.show("Condition rating must be between 1 and 10"); return; }

            AuthFetch.post(`${BASE}/InspectionRecords`, {
                    bridge_ID            : this._bridge.ID,
                    inspectionDate       : date,
                    inspectionType       : type,
                    inspector            : inspector,
                    conditionRatingGiven : rating,
                    defectsFound         : defects,
                    criticalDefects      : critical,
                    structuralAdequacy   : adequacy,
                    maintenanceRequired  : maintReq,
                    scourFinding         : scourFinding || null,
                    nextInspectionDue    : nextDue      || null,
                    notes                : notes        || null
                })
            .then(async r => {
                if (!r.ok) {
                    const body = await r.json().catch(() => ({}));
                    throw new Error(body.error?.message || `HTTP ${r.status}`);
                }
                return r.json();
            })
            .then(() => {
                MessageToast.show("Inspection record saved successfully");
                this.byId("addInspectionDialog").close();
                this._loadInspections(this._bridge.ID);
                // Refresh bridge header so Last Inspection Date updates
                this._loadBridge();
            })
            .catch(err => MessageBox.error("Failed to save inspection record: " + err.message));
        },

        onCancelInspection: function () {
            this.byId("addInspectionDialog").close();
        },

        // ── Vehicle Access Assessment ──────────────────────────
        onCheckVehicleAccess: function () {
            const dlg = this.byId("vehicleAccessDialog");
            if (!dlg) return;
            // Reset result panel
            const resultPanel = this.byId("vaResultPanel");
            if (resultPanel) resultPanel.setVisible(false);
            // Populate vehicle class dropdown
            const select = this.byId("vaVehicleClass");
            if (select && select.getItems().length === 0) {
                const h = { Accept: "application/json" };
                fetch(`${BASE}/VehicleClasses?$select=ID,code,name`, { headers: h })
                    .then(r => r.json())
                    .then(j => {
                        (j.value || []).forEach(vc =>
                            select.addItem(new sap.ui.core.Item({ key: vc.code, text: `${vc.code} — ${vc.name}` }))
                        );
                    });
            }
            dlg.open();
        },

        onRunVehicleAssessment: function () {
            const bridgeId    = this._bridgeId;
            const vehicleClass = this.byId("vaVehicleClass").getSelectedKey();
            const grossMassT  = parseFloat(this.byId("vaGrossMass").getValue()) || null;
            const axleLoadT   = parseFloat(this.byId("vaAxleLoad").getValue()) || null;
            const heightM     = parseFloat(this.byId("vaHeight").getValue()) || null;
            const lengthM     = parseFloat(this.byId("vaLength").getValue()) || null;

            AuthFetch.post(`${BASE}/assessRestriction`, { bridgeId, vehicleClass, grossMassT, axleLoadT, heightM, lengthM })
            .then(r => r.json())
            .then(j => {
                const result = j.value || j;
                const permitted = result.permitted;
                const permitReq = result.permitRequired;
                const panel = this.byId("vaResultPanel");
                const status = this.byId("vaResultStatus");
                const msg    = this.byId("vaResultMessage");
                const link   = this.byId("vaPermitLink");
                const gazette = this.byId("vaGazetteRef");
                if (status) {
                    status.setText(permitted ? "✅ Access Permitted" : permitReq ? "⚠️ Permit Required" : "❌ Access Prohibited");
                    status.setState(permitted ? "Success" : permitReq ? "Warning" : "Error");
                }
                if (msg) msg.setText(result.message || "");
                if (link) link.setVisible(!permitted);
                if (gazette && result.gazetteRef) gazette.setText("Gazette: " + result.gazetteRef);
                if (panel) panel.setVisible(true);
            })
            .catch(() => sap.m.MessageBox.error("Assessment failed. Check server connection."));
        },

        onCloseVehicleAccess: function () {
            this.byId("vehicleAccessDialog").close();
        },

        // ── Load Defects ──────────────────────────────────────
        _loadDefects: function (bridgeUUID) {
            const h = { Accept: "application/json" };
            fetch(`${BASE}/BridgeDefects?$filter=bridge_ID eq ${bridgeUUID}&$orderby=detectedDate desc`, { headers: h })
                .then(r => r.json())
                .then(j => this._model.setProperty("/defects", j.value || []))
                .catch(() => this._model.setProperty("/defects", []));
        },

        // ── Load External References ──────────────────────────
        _loadExternalRefs: function (bridgeUUID, bridge) {
            const h = { Accept: "application/json" };
            fetch(`${BASE}/BridgeExternalRefs?$filter=bridge_ID eq ${bridgeUUID}`, { headers: h })
                .then(r => r.json())
                .then(j => {
                    this._model.setProperty("/externalRefs", j.value || []);
                    // Update BANC summary fields
                    const bancRef = (j.value || []).find(r => r.systemType === "BANC" && r.isPrimary);
                    const bancIdCtrl = this.byId("extBancId");
                    const bancUrlCtrl = this.byId("extBancUrl");
                    const extSystemCtrl = this.byId("extPrimarySystem");
                    if (bancIdCtrl) bancIdCtrl.setText(bancRef ? bancRef.externalId : (bridge && bridge.bancId) || "—");
                    if (bancUrlCtrl) {
                        const url = bancRef ? bancRef.externalURL : (bridge && bridge.bancURL);
                        bancUrlCtrl.setText(url || "—"); bancUrlCtrl.setHref(url || "");
                    }
                    if (extSystemCtrl) extSystemCtrl.setText(bridge && bridge.primaryExternalSystem ? bridge.primaryExternalSystem : "—");
                    // Show/hide header action buttons based on available external refs
                    this._applyExternalRefButtons(j.value || []);
                })
                .catch(() => {
                    this._model.setProperty("/externalRefs", []);
                    this._applyExternalRefButtons([]);
                });
        },

        // ── External Ref Header Buttons ───────────────────────
        _applyExternalRefButtons: function (externalRefs) {
            var bancRef = (externalRefs || []).find(function (r) {
                return r.systemType === "BANC" || r.systemType === "AUSTROADS";
            });
            var sapRef = (externalRefs || []).find(function (r) {
                return r.systemType === "SAP_S4" || r.systemType === "SAP" ||
                    (r.systemType === "OTHER" && r.description && r.description.toLowerCase().includes("sap"));
            });

            this._bancUrl = bancRef ? bancRef.externalURL : null;
            this._sapUrl  = sapRef  ? sapRef.externalURL  : null;

            var btnBanc = this.byId("btnOpenBanc");
            var btnSap  = this.byId("btnOpenSap");
            if (btnBanc) btnBanc.setVisible(!!this._bancUrl);
            if (btnSap)  btnSap.setVisible(!!this._sapUrl);
        },

        onOpenBanc: function () {
            if (this._bancUrl) {
                window.open(this._bancUrl, "_blank", "noopener,noreferrer");
            } else {
                MessageBox.information(
                    "No BANC link recorded for this bridge.\n\n" +
                    "To add one, use the External Systems tab and add a reference with System Type = BANC, " +
                    "including the AustRoads BANC asset URL.",
                    { title: "BANC Link Not Configured" }
                );
            }
        },

        onOpenSap: function () {
            if (this._sapUrl) {
                window.open(this._sapUrl, "_blank", "noopener,noreferrer");
            } else {
                MessageBox.information(
                    "No SAP S/4HANA link configured for this bridge.\n\n" +
                    "SAP EAM Object Mapping:\n" +
                    "  Bridge Asset  →  SAP Functional Location (FLOC)\n" +
                    "  Bridge Defect  →  SAP PM Notification (M2)\n" +
                    "  Restriction  →  SAP Engineering Change Record\n\n" +
                    "To link this bridge to SAP, use the External Systems tab and add a reference with System Type = OTHER, description = SAP S4HANA, with the Fiori launchpad tile URL.",
                    { title: "SAP S/4HANA Link Not Configured" }
                );
            }
        },

        // ── Defect Status Filter ──────────────────────────────
        onDefectStatusFilter: function (e) {
            const key = e.getParameter("selectedItem").getKey();
            const b = this._bridge;
            if (!b) return;
            const h = { Accept: "application/json" };
            const filter = key ? `bridge_ID eq ${b.ID} and status eq '${key}'` : `bridge_ID eq ${b.ID}`;
            fetch(`${BASE}/BridgeDefects?$filter=${encodeURIComponent(filter)}&$orderby=detectedDate desc`, { headers: h })
                .then(r => r.json())
                .then(j => this._model.setProperty("/defects", j.value || []))
                .catch(() => {});
        },

        // ── Raise Defect ──────────────────────────────────────
        onRaiseDefect: function () {
            if (!this._bridge) { MessageToast.show("Bridge not loaded"); return; }
            const dlg = this.byId("raiseDefectDialog");
            if (dlg) dlg.open();
        },

        onSaveRaiseDefect: function () {
            const category      = this.byId("rdCategory")      ? this.byId("rdCategory").getSelectedKey()      : "";
            const severity      = this.byId("rdSeverity")      ? this.byId("rdSeverity").getSelectedKey()      : "";
            const extent        = this.byId("rdExtent")        ? this.byId("rdExtent").getSelectedKey()        : "";
            const structRisk    = this.byId("rdStructuralRisk")? this.byId("rdStructuralRisk").getSelectedKey(): "";
            const priority      = this.byId("rdPriority")      ? this.byId("rdPriority").getSelectedKey()      : "MEDIUM";
            const elementGroup  = this.byId("rdElementGroup")  ? this.byId("rdElementGroup").getSelectedKey()  : "";
            const elementName   = this.byId("rdElementName")   ? this.byId("rdElementName").getValue()         : "";
            const location      = this.byId("rdLocation")      ? this.byId("rdLocation").getValue()            : "";
            const description   = this.byId("rdDescription")   ? this.byId("rdDescription").getValue()         : "";

            if (!category || !severity || !description) {
                MessageToast.show("Category, Severity and Description are required");
                return;
            }

            var self = this;
            var defectLocation = location;

            // Auto-capture GPS if available and append to location field
            var gpsPromise = GeoLocation.isAvailable()
                ? GeoLocation.getCurrentPosition().then(function (pos) {
                    if (!defectLocation.includes("GPS:")) {
                        defectLocation = (defectLocation ? defectLocation + " | " : "") +
                            "GPS: " + pos.lat.toFixed(6) + ", " + pos.lng.toFixed(6) +
                            " (accuracy: " + Math.round(pos.accuracy) + "m)";
                    }
                }).catch(function () { /* GPS unavailable — proceed without */ })
                : Promise.resolve();

            gpsPromise.then(function () {
                return AuthFetch.post(`${BASE}/raiseDefect`, {
                        bridge_ID     : self._bridge.ID,
                        defectCategory: category,
                        severity      : severity,
                        extent        : extent || null,
                        structuralRisk: structRisk || null,
                        priority      : priority,
                        elementGroup  : elementGroup || null,
                        elementName   : elementName || null,
                        location      : defectLocation,
                        description   : description
                    });
            })
            .then(r => r.json())
            .then(j => {
                if (j.status === "SUCCESS") {
                    MessageToast.show(`Defect ${j.defectNumber} raised`);
                    self.byId("raiseDefectDialog").close();
                    self._clearRaiseDefectForm();
                    self._loadDefects(self._bridge.ID);
                } else {
                    MessageBox.error("Failed to raise defect: " + (j.error ? j.error.message : "Unknown error"));
                }
            })
            .catch(() => MessageBox.error("Network error raising defect"));
        },

        onCancelRaiseDefect: function () {
            this.byId("raiseDefectDialog").close();
            this._clearRaiseDefectForm();
        },

        _clearRaiseDefectForm: function () {
            ["rdElementName","rdLocation","rdDescription"].forEach(id => {
                const c = this.byId(id); if (c) c.setValue("");
            });
            ["rdCategory","rdSeverity","rdExtent","rdStructuralRisk","rdPriority","rdElementGroup"].forEach(id => {
                const c = this.byId(id); if (c && c.setSelectedKey) c.setSelectedKey(c.getItems()[0] ? c.getItems()[0].getKey() : "");
            });
        },

        // ── Close Defect ──────────────────────────────────────
        onCloseDefect: function (e) {
            const ctx = e.getSource().getBindingContext("detail");
            const defect = ctx ? ctx.getObject() : null;
            if (!defect) return;
            this._selectedDefectId = defect.ID;
            const dlg = this.byId("closeDefectDialog");
            if (dlg) { this.byId("cdNotes").setValue(""); dlg.open(); }
        },

        onSaveCloseDefect: function () {
            const notes = this.byId("cdNotes") ? this.byId("cdNotes").getValue() : "";
            if (!this._selectedDefectId) return;

            AuthFetch.post(`${BASE}/BridgeDefects(${this._selectedDefectId})/closeDefect`, { closureNotes: notes })
            .then(r => r.json())
            .then(j => {
                MessageToast.show(j.message || "Defect closed");
                this.byId("closeDefectDialog").close();
                this._selectedDefectId = null;
                this._loadDefects(this._bridge.ID);
            })
            .catch(() => MessageBox.error("Failed to close defect"));
        },

        onCancelCloseDefect: function () {
            this.byId("closeDefectDialog").close();
            this._selectedDefectId = null;
        },

        // ── Add External Reference ────────────────────────────
        onAddExternalRef: function () {
            if (!this._bridge) { MessageToast.show("Bridge not loaded"); return; }
            const dlg = this.byId("addExternalRefDialog");
            if (dlg) dlg.open();
        },

        onSaveExternalRef: function () {
            const systemType  = this.byId("erSystemType")  ? this.byId("erSystemType").getSelectedKey()  : "";
            const externalId  = this.byId("erExternalId")  ? this.byId("erExternalId").getValue()        : "";
            const externalUrl = this.byId("erExternalUrl") ? this.byId("erExternalUrl").getValue()       : "";
            const description = this.byId("erDescription") ? this.byId("erDescription").getValue()       : "";
            const isPrimary   = this.byId("erIsPrimary")   ? this.byId("erIsPrimary").getSelected()      : false;

            if (!systemType || !externalId) {
                MessageToast.show("System Type and External ID are required");
                return;
            }

            AuthFetch.post(`${BASE}/addExternalRef`, {
                    bridge_ID  : this._bridge.ID,
                    systemType : systemType,
                    externalId : externalId,
                    externalURL: externalUrl || null,
                    description: description || null,
                    isPrimary  : isPrimary
                })
            .then(r => r.json())
            .then(j => {
                if (j.status === "SUCCESS") {
                    MessageToast.show("External reference added");
                    this.byId("addExternalRefDialog").close();
                    this._clearExtRefForm();
                    this._loadExternalRefs(this._bridge.ID, this._bridge);
                } else {
                    MessageBox.error("Failed to add reference: " + (j.error ? j.error.message : "Unknown error"));
                }
            })
            .catch(() => MessageBox.error("Network error adding external reference"));
        },

        onCancelExternalRef: function () {
            this.byId("addExternalRefDialog").close();
            this._clearExtRefForm();
        },

        _clearExtRefForm: function () {
            ["erExternalId","erExternalUrl","erDescription"].forEach(id => {
                const c = this.byId(id); if (c) c.setValue("");
            });
            if (this.byId("erIsPrimary")) this.byId("erIsPrimary").setSelected(false);
            if (this.byId("erSystemType")) this.byId("erSystemType").setSelectedKey("BANC");
        },

        // ── Edit Restriction ──────────────────────────────────
        onEditRestriction: function (e) {
            const ctx = e.getSource().getBindingContext("detail");
            const row = ctx ? ctx.getObject() : null;
            if (!row || !row.ID) return;
            this._selectedRestrictionId = row.ID;

            const info = this.byId("editRestInfo");
            if (info) info.setText(`Editing: ${row.restrictionType} — ${row.value} ${row.unit}`);
            if (this.byId("editRestType"))      this.byId("editRestType").setSelectedKey(row.restrictionType || "");
            if (this.byId("editRestValue"))     this.byId("editRestValue").setValue(String(row.value || ""));
            if (this.byId("editRestUnit"))      this.byId("editRestUnit").setSelectedKey(row.unit || "");
            if (this.byId("editRestStatus"))    this.byId("editRestStatus").setSelectedKey(row.status || "ACTIVE");
            if (this.byId("editRestFrom"))      this.byId("editRestFrom").setValue(row.validFromDate === "—" ? "" : row.validFromDate);
            if (this.byId("editRestTo"))        this.byId("editRestTo").setValue(row.validToDate === "Ongoing" ? "" : row.validToDate);
            if (this.byId("editRestDirection")) this.byId("editRestDirection").setSelectedKey(row.directionApplied || "BOTH");
            if (this.byId("editRestGazette"))   this.byId("editRestGazette").setValue(row.gazetteRef || "");
            if (this.byId("editRestPermit"))    this.byId("editRestPermit").setSelected(!!row.permitRequired);
            if (this.byId("editRestSignage"))   this.byId("editRestSignage").setSelected(!!row.signageRequired);
            if (this.byId("editRestNotes"))     this.byId("editRestNotes").setValue(row.notes || "");

            this.byId("editRestrictionDialog").open();
        },

        onSaveEditRestriction: function () {
            if (!this._selectedRestrictionId) return;
            const type      = this.byId("editRestType")      ? this.byId("editRestType").getSelectedKey()      : "";
            const value     = this.byId("editRestValue")     ? this.byId("editRestValue").getValue().trim()    : "";
            const unit      = this.byId("editRestUnit")      ? this.byId("editRestUnit").getSelectedKey()      : "";
            const status    = this.byId("editRestStatus")    ? this.byId("editRestStatus").getSelectedKey()    : "ACTIVE";
            const fromDate  = this.byId("editRestFrom")      ? this.byId("editRestFrom").getValue()            : "";
            const toDate    = this.byId("editRestTo")        ? this.byId("editRestTo").getValue()              : "";
            const direction = this.byId("editRestDirection") ? this.byId("editRestDirection").getSelectedKey() : "BOTH";
            const gazette   = this.byId("editRestGazette")   ? this.byId("editRestGazette").getValue().trim()  : "";
            const permit    = this.byId("editRestPermit")    ? this.byId("editRestPermit").getSelected()       : false;
            const signage   = this.byId("editRestSignage")   ? this.byId("editRestSignage").getSelected()      : false;
            const notes     = this.byId("editRestNotes")     ? this.byId("editRestNotes").getValue().trim()    : "";

            if (!type || !value || !unit) {
                MessageToast.show("Type, Value and Unit are required");
                return;
            }

            const payload = {
                restrictionType  : type,
                value            : parseFloat(value),
                unit             : unit,
                status           : status,
                validFromDate    : fromDate || null,
                validToDate      : toDate || null,
                directionApplied : direction,
                gazetteRef       : gazette || null,
                permitRequired   : permit,
                signageRequired  : signage,
                notes            : notes || null
            };
            AuthFetch.patch(`${BASE}/Restrictions(${this._selectedRestrictionId})`, payload)
            .then(async r => {
                if (!r.ok) { const b = await r.json().catch(() => ({})); throw new Error(b.error?.message || `HTTP ${r.status}`); }
                MessageToast.show("Restriction updated");
                this.byId("editRestrictionDialog").close();
                this._selectedRestrictionId = null;
                this._loadRestrictions(this._bridgeId);
                this._loadHistory(this._bridgeId, this._bridge.ID);
            })
            .catch(err => MessageBox.error("Failed to update restriction: " + err.message));
        },

        onCancelEditRestriction: function () {
            this.byId("editRestrictionDialog").close();
            this._selectedRestrictionId = null;
        },

        // ── Report Bridge Condition ───────────────────────────
        onReportCondition: function () {
            if (!this._bridge) { MessageToast.show("Bridge not loaded"); return; }
            const today = new Date().toISOString().split("T")[0];
            if (this.byId("rcDate") && !this.byId("rcDate").getValue()) this.byId("rcDate").setValue(today);
            const slider = this.byId("rcRating");
            if (slider) {
                const curRating = this._bridge.conditionRating || 7;
                slider.setValue(curRating);
                this._updateRCLabel(curRating);
            }
            // Pre-fill condition from bridge
            const condMap = { EXCELLENT: "EXCELLENT", VERY_GOOD: "VERY_GOOD", GOOD: "GOOD",
                FAIR: "FAIR", POOR: "POOR", VERY_POOR: "VERY_POOR", CRITICAL: "CRITICAL", FAILED: "FAILED" };
            if (this.byId("rcCondition") && this._bridge.condition)
                this.byId("rcCondition").setSelectedKey(condMap[this._bridge.condition] || "GOOD");
            this.byId("reportConditionDialog").open();
        },

        onReportConditionRatingChange: function (e) {
            this._updateRCLabel(e.getParameter("value"));
        },

        _updateRCLabel: function (val) {
            const ratingMap = {10:"Excellent",9:"Very Good",8:"Good",7:"Good",6:"Fair",5:"Fair",4:"Poor",3:"Poor",2:"Very Poor",1:"Failed"};
            const lbl = this.byId("rcRatingLabel");
            if (lbl) lbl.setText(`${val} / 10 — ${ratingMap[val] || "—"}`);
        },

        onSaveReportCondition: function () {
            const rating     = this.byId("rcRating")      ? this.byId("rcRating").getValue()              : null;
            const condition  = this.byId("rcCondition")   ? this.byId("rcCondition").getSelectedKey()     : "";
            const date       = this.byId("rcDate")        ? this.byId("rcDate").getValue()                : "";
            const assessedBy = this.byId("rcAssessedBy")  ? this.byId("rcAssessedBy").getValue().trim()   : "";
            const reportRef  = this.byId("rcReportRef")   ? this.byId("rcReportRef").getValue().trim()    : "";
            const nextDue    = this.byId("rcNextDue")      ? this.byId("rcNextDue").getValue()             : "";
            const adequacy   = this.byId("rcAdequacy")    ? this.byId("rcAdequacy").getSelectedKey()      : "";
            const notes      = this.byId("rcNotes")       ? this.byId("rcNotes").getValue().trim()        : "";

            if (!date) { MessageToast.show("Assessment Date is required"); return; }
            if (!rating) { MessageToast.show("Condition Rating is required"); return; }

            // Update the bridge record
            const patchPayload = { conditionRating: parseInt(rating) };
            if (condition) patchPayload.condition = condition;
            if (date) patchPayload.inspectionDate = date;
            if (nextDue) patchPayload.nextInspectionDue = nextDue;

            AuthFetch.patch(`${BASE}/Bridges(${this._bridge.ID})`, patchPayload)
            .then(async r => {
                if (!r.ok) { const b = await r.json().catch(() => ({})); throw new Error(b.error?.message || `HTTP ${r.status}`); }
            })
            .then(() => {
                // Log the condition event
                const ratingMap = {10:"Excellent",9:"Very Good",8:"Good",7:"Good",6:"Fair",5:"Fair",4:"Poor",3:"Poor",2:"Very Poor",1:"Failed"};
                return AuthFetch.post(`${BASE}/BridgeEventLog`, {
                        bridge_ID       : this._bridge.ID,
                        eventType       : "CONDITION_UPDATED",
                        title           : `Condition reported: ${rating}/10 — ${ratingMap[rating] || condition}`,
                        detail          : [notes, assessedBy ? `Assessed by: ${assessedBy}` : "", reportRef ? `Ref: ${reportRef}` : "", adequacy ? `Structural adequacy: ${adequacy}` : ""].filter(Boolean).join(". "),
                        effectiveFrom   : date,
                        statusBefore    : this._bridge.condition || "",
                        statusAfter     : condition || "",
                        performedBy     : assessedBy || "user",
                        approvalRef     : reportRef || null,
                        timestamp       : new Date().toISOString()
                    });
            })
            .then(() => {
                MessageToast.show("Condition report saved successfully");
                this.byId("reportConditionDialog").close();
                this._clearReportConditionForm();
                this._loadBridge();
            })
            .catch(err => MessageBox.error("Failed to save condition report: " + err.message));
        },

        onCancelReportCondition: function () {
            this.byId("reportConditionDialog").close();
            this._clearReportConditionForm();
        },

        _clearReportConditionForm: function () {
            ["rcAssessedBy","rcReportRef","rcNotes"].forEach(id => {
                const c = this.byId(id); if (c) c.setValue("");
            });
            if (this.byId("rcDate")) this.byId("rcDate").setValue("");
            if (this.byId("rcNextDue")) this.byId("rcNextDue").setValue("");
            if (this.byId("rcRating")) this.byId("rcRating").setValue(7);
            if (this.byId("rcAdequacy")) this.byId("rcAdequacy").setSelectedKey("");
        },

        // ── Column Chooser (Restrictions table) ───────────────
        onRestrictionsColumnChooser: function () {
            const dlg = this.byId("restrictionColChooserDialog");
            if (dlg) dlg.open();
        },

        onApplyRestrictionsColumns: function () {
            const tbl = this.byId("restrictionDetailTable");
            if (!tbl) { this.byId("restrictionColChooserDialog").close(); return; }
            const cols = tbl.getColumns();
            // Order: Type, Value, Status, Permit, Vehicle, From, To, Direction, Gazette, Actions
            const show = {
                4: this.byId("colChkVehicle")    ? this.byId("colChkVehicle").getSelected()    : true,
                5: this.byId("colChkFrom")        ? this.byId("colChkFrom").getSelected()        : true,
                6: this.byId("colChkTo")          ? this.byId("colChkTo").getSelected()          : true,
                7: this.byId("colChkDirection")   ? this.byId("colChkDirection").getSelected()   : true,
                8: this.byId("colChkGazette")     ? this.byId("colChkGazette").getSelected()     : true
            };
            Object.keys(show).forEach(idx => {
                if (cols[idx]) cols[idx].setVisible(show[idx]);
            });
            this.byId("restrictionColChooserDialog").close();
        },

        onCloseRestrictionsColumnChooser: function () {
            this.byId("restrictionColChooserDialog").close();
        },

        // ═══════════════════════════════════════════════════
        // CAPACITY TAB
        // ═══════════════════════════════════════════════════

        _loadCapacity: function () {
            if (!this._bridgeId) return;
            const h = { Accept: "application/json" };
            // Load BridgeCapacity by bridgeId
            fetch(`/bridge-management/BridgeCapacities?$filter=bridgeId eq '${this._bridgeId}'&$top=1`, { headers: h })
                .then(r => r.json())
                .then(j => {
                    const cap = (j.value || [])[0];
                    this.byId("capNoDataBox").setVisible(!cap);
                    this.byId("capDataBox").setVisible(!!cap);
                    if (!cap) return;

                    const fmt = v => v !== undefined && v !== null ? String(v) : "—";
                    const fmtT = v => v !== undefined && v !== null ? `${v} t` : "—";
                    const fmtM = v => v !== undefined && v !== null ? `${v} m` : "—";

                    // Status banner
                    const banner = this.byId("capStatusBanner");
                    if (cap.capacityStatus === "NOT_RATED") {
                        banner.setText("⚠ No load rating completed — capacity cannot be relied on for permit decisions. Contact a qualified structural engineer (NER/CPEng).").setVisible(true).setType("Error");
                    } else if (cap.capacityStatus === "RESTRICTED") {
                        banner.setText(`⚠ RESTRICTED: ${cap.grossMassLimit_t}t gross mass limit applies. See Engineering Notes for conditions.`).setVisible(true).setType("Warning");
                    } else if (cap.capacityStatus === "UNDER_REVIEW") {
                        banner.setText("ℹ Load rating in progress — use conservative limits until review is complete.").setVisible(true).setType("Information");
                    } else {
                        banner.setVisible(false);
                    }

                    // Capacity status
                    const statusState = { FULL: "Success", RESTRICTED: "Warning", REDUCED: "Warning", UNDER_REVIEW: "Information", NOT_RATED: "Error" };
                    this.byId("capStatus").setText(cap.capacityStatus || "—").setState(statusState[cap.capacityStatus] || "None");
                    this.byId("capReviewedBy").setText(fmt(cap.lastReviewedBy));
                    this.byId("capReviewedDate").setText(fmt(cap.lastReviewedDate));
                    this.byId("capNextReviewDue").setText(fmt(cap.nextReviewDue));

                    // Mass limits
                    const rfVal = parseFloat(cap.loadRatingFactor);
                    this.byId("capGVM").setText(fmtT(cap.grossMassLimit_t)).setState(cap.grossMassLimit_t < 42.5 ? "Warning" : "Success");
                    this.byId("capGCM").setText(fmtT(cap.grossCombinedLimit_t));
                    this.byId("capSteer").setText(fmtT(cap.steerAxleLimit_t));
                    this.byId("capSingle").setText(fmtT(cap.singleAxleLimit_t));
                    this.byId("capTandem").setText(fmtT(cap.tandemAxleLimit_t));
                    this.byId("capTri").setText(fmtT(cap.triaxleGroupLimit_t));
                    this.byId("capQuad").setText(fmtT(cap.quadAxleGroupLimit_t));

                    // Load rating
                    this.byId("capRatingStd").setText(fmt(cap.loadRatingStandard));
                    this.byId("capRF").setText(cap.loadRatingFactor !== null ? String(cap.loadRatingFactor) : "—")
                        .setState(!isNaN(rfVal) ? (rfVal < 1.0 ? "Error" : rfVal < 1.1 ? "Warning" : "Success") : "None");
                    this.byId("capRatingMethod").setText(fmt(cap.loadRatingMethod));
                    this.byId("capRatingEngineer").setText(fmt(cap.loadRatingEngineer));
                    this.byId("capRatingDate").setText(fmt(cap.loadRatingDate));
                    this.byId("capRatingRef").setText(fmt(cap.loadRatingReportRef));

                    // Next review — highlight if overdue
                    const nextReviewDue = cap.nextRatingDue;
                    const reviewState = nextReviewDue && new Date(nextReviewDue) < new Date() ? "Error" : "None";
                    this.byId("capNextReview").setText(fmt(nextReviewDue)).setState(reviewState);

                    // Clearances
                    this.byId("capMinClear").setText(fmtM(cap.minVerticalClearance_m)).setState(cap.minVerticalClearance_m < 4.5 ? "Warning" : "None");
                    this.byId("capDesignClear").setText(fmtM(cap.designVerticalClearance_m));
                    this.byId("capLane1").setText(cap.clearanceLane1_m !== null ? cap.clearanceLane1_m + " m" : "—");
                    this.byId("capLane2").setText(cap.clearanceLane2_m !== null ? cap.clearanceLane2_m + " m" : "—");
                    this.byId("capSurveyDate").setText(fmt(cap.clearanceSurveyDate));
                    this.byId("capSurveyMethod").setText(fmt(cap.clearanceSurveyMethod));

                    // Geometry
                    this.byId("capCarriageway").setText(fmtM(cap.carriageway_m));
                    this.byId("capTrafficable").setText(fmtM(cap.trafficableWidth_m));
                    this.byId("capLaneWidth").setText(fmtM(cap.laneWidth_m));
                    this.byId("capLShoulder").setText(fmtM(cap.leftShoulder_m));
                    this.byId("capRShoulder").setText(fmtM(cap.rightShoulder_m));

                    // Scour
                    this.byId("capScourCrit").setText(fmtM(cap.scourCriticalDepth_m));
                    this.byId("capScourCurr").setText(fmtM(cap.currentScourDepth_m));
                    const scourMargin = cap.scourSafetyMargin_m !== null ? cap.scourSafetyMargin_m : (cap.scourCriticalDepth_m && cap.currentScourDepth_m ? (parseFloat(cap.scourCriticalDepth_m) - parseFloat(cap.currentScourDepth_m)).toFixed(2) : null);
                    this.byId("capScourMargin").setText(scourMargin !== null ? scourMargin + " m" : "—").setState(!scourMargin || scourMargin <= 0 ? "Error" : scourMargin < 0.5 ? "Warning" : "None");
                    this.byId("capFloodLevel").setText(cap.floodClosureLevel_m !== null ? cap.floodClosureLevel_m + " m AHD" : "—");
                    this.byId("capWindSpeed").setText(cap.windClosureSpeed_kmh !== null ? cap.windClosureSpeed_kmh + " km/h" : "—");

                    // Fatigue
                    this.byId("capDesignLife").setText(cap.designFatigueLife_years !== null ? cap.designFatigueLife_years + " years" : "—");
                    const consumed = cap.consumedFatigueLife_pct;
                    this.byId("capConsumed").setText(consumed !== null ? consumed + "%" : "—").setState(!consumed ? "None" : consumed > 80 ? "Error" : consumed > 60 ? "Warning" : "None");
                    const remaining = cap.remainingFatigueLife_years;
                    this.byId("capRemaining").setText(remaining !== null ? remaining + " years" : "—").setState(!remaining ? "None" : remaining < 5 ? "Error" : remaining < 15 ? "Warning" : "Success");
                    this.byId("capFatigueSensitive").setText(cap.fatigueSensitive ? "YES ⚠" : "No").setState(cap.fatigueSensitive ? "Warning" : "None");
                    this.byId("capFatigueCritEl").setText(fmt(cap.fatigueCriticalElement));
                    this.byId("capHHVD").setText(cap.heavyVehicleCountPerDay !== null ? cap.heavyVehicleCountPerDay + " / day" : "—");
                    this.byId("capDLA").setText(cap.dynamicLoadAllowance_pct !== null ? cap.dynamicLoadAllowance_pct + "%" : "—");
                    this.byId("capSpeedAssess").setText(cap.speedLimitForAssessment_kmh !== null ? cap.speedLimitForAssessment_kmh + " km/h" : "—");
                    this.byId("capReducedSpeed").setText(cap.reducedSpeedCondition_kmh !== null ? cap.reducedSpeedCondition_kmh + " km/h" : "—");
                    this.byId("capNotes").setText(fmt(cap.capacityNotes));

                    // Store for edit
                    this._currentCapacity = cap;

                    // Load active permits
                    this._loadBridgePermits();
                })
                .catch(e => console.error("Capacity load failed:", e));
        },

        _loadBridgePermits: function () {
            if (!this._bridgeId) return;
            const h = { Accept: "application/json" };
            fetch(`/bridge-management/getActivePermitsForBridge(bridgeId='${this._bridgeId}')`, { headers: h })
                .then(r => r.json())
                .then(j => {
                    const items = j.value || [];
                    const oModel = new sap.ui.model.json.JSONModel(items);
                    this.getView().setModel(oModel, "capPermits");
                })
                .catch(() => {});
        },

        onEditCapacity: function () {
            const cap = this._currentCapacity || {};
            const setVal = (id, val) => { const c = this.byId(id); if (c && c.setValue) c.setValue(val !== null && val !== undefined ? String(val) : ""); };
            setVal("ceGVM",        cap.grossMassLimit_t);
            setVal("ceGCM",        cap.grossCombinedLimit_t);
            setVal("ceSteer",      cap.steerAxleLimit_t);
            setVal("ceSingle",     cap.singleAxleLimit_t);
            setVal("ceTandem",     cap.tandemAxleLimit_t);
            setVal("ceTri",        cap.triaxleGroupLimit_t);
            setVal("ceMinClear",   cap.minVerticalClearance_m);
            setVal("ceLane1",      cap.clearanceLane1_m);
            setVal("ceLane2",      cap.clearanceLane2_m);
            setVal("ceSurveyDate", cap.clearanceSurveyDate || "");
            setVal("ceSurveyMethod", cap.clearanceSurveyMethod || "");
            setVal("ceCarriageway",  cap.carriageway_m);
            setVal("ceTrafficable",  cap.trafficableWidth_m);
            setVal("ceLaneWidth",    cap.laneWidth_m);
            setVal("ceRatingStd",    cap.loadRatingStandard || "");
            setVal("ceRF",           cap.loadRatingFactor);
            setVal("ceRatingEng",    cap.loadRatingEngineer || "");
            setVal("ceRatingDate",   cap.loadRatingDate || "");
            setVal("ceNextReview",   cap.nextRatingDue || "");
            setVal("ceRatingRef",    cap.loadRatingReportRef || "");
            setVal("ceScourCrit",    cap.scourCriticalDepth_m);
            setVal("ceScourCurr",    cap.currentScourDepth_m);
            setVal("ceFloodLevel",   cap.floodClosureLevel_m);
            setVal("ceDesignLife",   cap.designFatigueLife_years);
            setVal("ceConsumed",     cap.consumedFatigueLife_pct);
            const ceFatigue = this.byId("ceFatigueSensitive"); if (ceFatigue) ceFatigue.setSelected(!!cap.fatigueSensitive);
            setVal("ceFatigueCritEl", cap.fatigueCriticalElement || "");
            setVal("ceReviewedBy",    cap.lastReviewedBy || "");
            setVal("ceReviewDue",     cap.nextReviewDue || "");
            setVal("ceNotes",         cap.capacityNotes || "");
            const statusSelect = this.byId("ceCapStatus");
            if (statusSelect) statusSelect.setSelectedKey(cap.capacityStatus || "NOT_RATED");
            this.byId("editCapacityDialog").open();
        },

        onSaveCapacity: function () {
            const getVal = id => { const c = this.byId(id); return c ? c.getValue() : ""; };
            const payload = {
                grossMassLimit_t:          parseFloat(getVal("ceGVM")) || null,
                grossCombinedLimit_t:      parseFloat(getVal("ceGCM")) || null,
                steerAxleLimit_t:          parseFloat(getVal("ceSteer")) || null,
                singleAxleLimit_t:         parseFloat(getVal("ceSingle")) || null,
                tandemAxleLimit_t:         parseFloat(getVal("ceTandem")) || null,
                triaxleGroupLimit_t:       parseFloat(getVal("ceTri")) || null,
                minVerticalClearance_m:    parseFloat(getVal("ceMinClear")) || null,
                clearanceLane1_m:          parseFloat(getVal("ceLane1")) || null,
                clearanceLane2_m:          parseFloat(getVal("ceLane2")) || null,
                clearanceSurveyDate:       getVal("ceSurveyDate") || null,
                clearanceSurveyMethod:     getVal("ceSurveyMethod") || null,
                carriageway_m:             parseFloat(getVal("ceCarriageway")) || null,
                trafficableWidth_m:        parseFloat(getVal("ceTrafficable")) || null,
                laneWidth_m:               parseFloat(getVal("ceLaneWidth")) || null,
                loadRatingStandard:        getVal("ceRatingStd") || null,
                loadRatingFactor:          parseFloat(getVal("ceRF")) || null,
                loadRatingEngineer:        getVal("ceRatingEng") || null,
                loadRatingDate:            getVal("ceRatingDate") || null,
                nextRatingDue:             getVal("ceNextReview") || null,
                loadRatingReportRef:       getVal("ceRatingRef") || null,
                scourCriticalDepth_m:      parseFloat(getVal("ceScourCrit")) || null,
                currentScourDepth_m:       parseFloat(getVal("ceScourCurr")) || null,
                floodClosureLevel_m:       parseFloat(getVal("ceFloodLevel")) || null,
                designFatigueLife_years:   parseInt(getVal("ceDesignLife")) || null,
                consumedFatigueLife_pct:   parseFloat(getVal("ceConsumed")) || null,
                fatigueSensitive:          this.byId("ceFatigueSensitive").getSelected(),
                fatigueCriticalElement:    getVal("ceFatigueCritEl") || null,
                lastReviewedBy:            getVal("ceReviewedBy") || null,
                nextReviewDue:             getVal("ceReviewDue") || null,
                capacityNotes:             getVal("ceNotes") || null,
                capacityStatus:            this.byId("ceCapStatus").getSelectedKey()
            };

            const cap = this._currentCapacity;

            // Compute scour safety margin
            if (payload.scourCriticalDepth_m && payload.currentScourDepth_m) {
                payload.scourSafetyMargin_m = parseFloat((payload.scourCriticalDepth_m - payload.currentScourDepth_m).toFixed(2));
            }

            // Compute remaining fatigue life
            if (payload.designFatigueLife_years && payload.consumedFatigueLife_pct !== null) {
                payload.remainingFatigueLife_years = parseFloat((payload.designFatigueLife_years * (1 - payload.consumedFatigueLife_pct / 100)).toFixed(1));
            }

            const doSave = cap && cap.ID
                ? AuthFetch.patch(`/bridge-management/BridgeCapacities(${cap.ID})`, payload)
                : AuthFetch.post("/bridge-management/BridgeCapacities", { ...payload, bridge_ID: this._currentBridgeUUID });

            doSave.then(r => {
                if (r.ok) {
                    this.byId("editCapacityDialog").close();
                    sap.m.MessageToast.show("Capacity data saved successfully.");
                    this._loadCapacity();
                } else {
                    return r.json().then(e => { sap.m.MessageBox.error(e.error?.message || "Save failed"); });
                }
            }).catch(e => sap.m.MessageBox.error("Save failed: " + e.message));
        },

        onCancelCapacity: function () { this.byId("editCapacityDialog").close(); },

        onViewBridgePermits: function () { this.getOwnerComponent().getRouter().navTo("Permits"); },

        onNewPermitForBridge: function () { this.getOwnerComponent().getRouter().navTo("Permits"); },

        // ── On-screen help for Attributes tab ─────────────────
        onShowAttributeHelp: function (e) {
            if (!this._attrHelpPopover) {
                this._attrHelpPopover = new sap.m.Popover({
                    title      : "About Custom Attributes",
                    placement  : "Auto",
                    contentWidth: "340px",
                    content    : [
                        new sap.m.VBox({ items: [
                            new sap.m.Text({ text: "Custom attributes extend the bridge record with organisation-specific data fields, configured in Admin Config → Attributes & Lookups." }),
                            new sap.m.Title({ text: "Data Types", level: "H6" }).addStyleClass("sapUiSmallMarginTop"),
                            new sap.m.Text({ text: "TEXT — free text • NUMBER — numeric • BOOLEAN — Yes/No • DATE — calendar date" }),
                            new sap.m.Title({ text: "Mandatory vs Optional", level: "H6" }).addStyleClass("sapUiSmallMarginTop"),
                            new sap.m.Text({ text: "Required attributes (shown in orange) must have a value for compliance reporting. Optional attributes are informational only." }),
                            new sap.m.Title({ text: "How to add attributes", level: "H6" }).addStyleClass("sapUiSmallMarginTop"),
                            new sap.m.Text({ text: "Go to Home → Admin Config → Attributes & Lookups to define new attribute types for your organisation." })
                        ]}).addStyleClass("sapUiSmallMarginBeginEnd sapUiSmallMarginTopBottom")
                    ]
                });
                this.getView().addDependent(this._attrHelpPopover);
            }
            this._attrHelpPopover.openBy(e.getSource());
        },

        // ── Navigation ────────────────────────────────────────
        onNavHome:      function () { this._navTo("Home"); },
        onNavToBridges: function () { this._navTo("BridgesList"); },
        onNavToRestrictions: function () { this.byId("detailTabs").setSelectedKey("restrictions"); },
        onViewOnMap:    function () {
            this.getOwnerComponent().getRouter().navTo("MapView", {
                "?query": { bridgeIds: this._bridgeId }
            });
        },

        _navTo: function (routeName, params) {
            this.getOwnerComponent().getRouter().navTo(routeName, params || {});
        },

        _setText: function (id, val) {
            const ctrl = this.byId(id);
            if (ctrl) ctrl.setText(String(val || ""));
        },

        onExit: function () {
            // Detach route listener
            var oRouter = this.getOwnerComponent().getRouter();
            var oRoute  = oRouter.getRoute("BridgeDetail");
            if (oRoute) oRoute.detachPatternMatched(this._onRouteMatched, this);
            if (this._miniMap) {
                try { this._miniMap.remove(); } catch (_) { /* map already removed */ }
                this._miniMap = null;
            }
            // Destroy any dialogs that were created programmatically
            ["closeBridgeDialog", "reopenBridgeDialog", "conditionDialog", "addInspectionDialog"].forEach(function (id) {
                var dlg = this.byId(id);
                if (dlg) { dlg.destroy(); }
            }.bind(this));
        },

        // ── v3 Risk Assessment handlers ───────────────────────

        onComputeRiskScore: function () {
            const bridgeId = this._bridgeId;
            if (!bridgeId) { MessageToast.show("No bridge loaded"); return; }
            const btn = this.byId ? this.byId("computeRiskBtn") : null;
            if (btn) btn.setBusy(true);
            AuthFetch.post(`${BASE}/computeRiskScore`, { bridgeId })
            .then(r => { if (!r.ok) return r.json().then(e => Promise.reject(e)); return r.json(); })
            .then(d => {
                if (d.error) { MessageBox.error(d.error.message || "Risk score computation failed"); return; }
                // OData V4 wraps single-entity return in { value: {...} }
                const result = d.value || d;
                const score  = result.riskScore;
                const band   = result.riskBand;
                // Update KPI tiles immediately
                const scoreTile = this.byId("riskScoreTile");
                const bandTile  = this.byId("riskBandTile");
                if (scoreTile) { scoreTile.setValue(score != null ? String(score) : "—"); }
                if (bandTile)  { bandTile.setValue(band || "—"); }
                // Colour-code band tile
                const bandColors = { CRITICAL: "Error", VERY_HIGH: "Error", HIGH: "Critical", MEDIUM: "Neutral", LOW: "Good" };
                if (bandTile) bandTile.setValueColor(bandColors[band] || "Neutral");
                MessageToast.show("Risk Score computed: " + (score != null ? score : "—") + " (" + (band || "—") + ")");
                // Reload history table
                this._loadRiskAssessments();
            })
            .catch(e => {
                const msg = (e && e.error && e.error.message) || (e && e.message) || "Request failed";
                MessageBox.error(msg);
            })
            .finally(() => { if (btn) btn.setBusy(false); });
        },

        onAddRiskAssessment: function () {
            // Pre-fill today's date
            const today = new Date().toISOString().split("T")[0];
            const datePicker = this.byId("riskDate");
            if (datePicker) datePicker.setValue(today);
            const assessedBy = this.byId("riskAssessedBy");
            if (assessedBy) assessedBy.setValue("");
            const likSlider = this.byId("riskLikelihood");
            const conSlider = this.byId("riskConsequence");
            if (likSlider) likSlider.setValue(3);
            if (conSlider) conSlider.setValue(3);
            this._updateRiskComputedScore();
            const notesArea = this.byId("riskNotes");
            if (notesArea) notesArea.setValue("");
            const dlg = this.byId("riskEntryDialog");
            if (dlg) dlg.open();
        },

        _updateRiskComputedScore: function () {
            const lik = this.byId("riskLikelihood");
            const con = this.byId("riskConsequence");
            const lv  = lik ? lik.getValue() : 3;
            const cv  = con ? con.getValue() : 3;
            const score = lv * cv;
            const band  = score >= 20 ? "CRITICAL" : score >= 13 ? "HIGH" : score >= 6 ? "MEDIUM" : "LOW";
            const states = { CRITICAL: "Error", HIGH: "Warning", MEDIUM: "None", LOW: "Success" };
            const ctrl = this.byId("riskComputedScore");
            if (ctrl) {
                ctrl.setText(score + " / 25 — " + band);
                ctrl.setState(states[band] || "None");
            }
        },

        onSaveRiskEntry: function () {
            if (!this._bridge || !this._bridge.ID) return;
            const datePicker  = this.byId("riskDate");
            const assessedBy  = this.byId("riskAssessedBy");
            const likSlider   = this.byId("riskLikelihood");
            const conSlider   = this.byId("riskConsequence");
            const notesArea   = this.byId("riskNotes");

            const dateVal = datePicker  ? datePicker.getValue()  : "";
            const byVal   = assessedBy  ? assessedBy.getValue().trim()  : "";
            const lv      = likSlider   ? likSlider.getValue()   : 3;
            const cv      = conSlider   ? conSlider.getValue()   : 3;

            if (!dateVal) { MessageToast.show("Please select an assessment date."); return; }
            if (!byVal)   { MessageToast.show("Please enter the assessor name."); return; }

            const payload = {
                bridge_ID         : this._bridge.ID,
                assessmentDate    : dateVal,
                assessedBy        : byVal,
                likelihoodScore   : lv,
                consequenceScore  : cv,
                riskScore         : lv * cv,
                notes             : notesArea ? notesArea.getValue() : ""
            };

            const saveBtn = this.byId("riskEntryDialog") && this.byId("riskEntryDialog").getBeginButton
                ? this.byId("riskEntryDialog").getBeginButton() : null;
            if (saveBtn) saveBtn.setBusy(true);

            AuthFetch.post(`${BASE}/BridgeRiskAssessments`, payload)
            .then(r => { if (!r.ok) return r.json().then(e => Promise.reject(e)); return r.json(); })
            .then(() => {
                MessageToast.show("Risk assessment saved.");
                const dlg = this.byId("riskEntryDialog");
                if (dlg) dlg.close();
                this._loadRiskAssessments();
            })
            .catch(e => {
                const msg = (e && e.error && e.error.message) || (e && e.message) || "Save failed";
                MessageBox.error(msg);
            })
            .finally(() => { if (saveBtn) saveBtn.setBusy(false); });
        },

        onCancelRiskEntry: function () {
            const dlg = this.byId("riskEntryDialog");
            if (dlg) dlg.close();
        },

        onAddInvestmentPlan: function () {
            // Reset dialog fields
            const yearInput = this.byId("invYear");
            if (yearInput) yearInput.setValue("");
            const typeSelect = this.byId("invType");
            if (typeSelect) typeSelect.setSelectedKey("MAINTENANCE");
            const capexInput = this.byId("invCapex");
            if (capexInput) capexInput.setValue("");
            const opexInput = this.byId("invOpex");
            if (opexInput) opexInput.setValue("");
            const bcrInput = this.byId("invBcr");
            if (bcrInput) bcrInput.setValue("");
            const statusSelect = this.byId("invStatus");
            if (statusSelect) statusSelect.setSelectedKey("PROPOSED");
            const fundingInput = this.byId("invFundingSource");
            if (fundingInput) fundingInput.setValue("");
            const notesArea = this.byId("invNotes");
            if (notesArea) notesArea.setValue("");
            const dlg = this.byId("investmentPlanDialog");
            if (dlg) dlg.open();
        },

        onSaveInvestmentPlan: function () {
            if (!this._bridge || !this._bridge.ID) return;
            const yearInput     = this.byId("invYear");
            const typeSelect    = this.byId("invType");
            const capexInput    = this.byId("invCapex");
            const opexInput     = this.byId("invOpex");
            const bcrInput      = this.byId("invBcr");
            const statusSelect  = this.byId("invStatus");
            const fundingInput  = this.byId("invFundingSource");
            const notesArea     = this.byId("invNotes");

            const yearVal = yearInput ? parseInt(yearInput.getValue(), 10) : null;
            const typeVal = typeSelect ? typeSelect.getSelectedKey() : "MAINTENANCE";

            if (!yearVal || isNaN(yearVal) || yearVal < 2000 || yearVal > 2100) {
                MessageToast.show("Please enter a valid year (2000–2100)."); return;
            }

            const payload = {
                bridge_ID        : this._bridge.ID,
                recommendedYear  : yearVal,
                interventionType : typeVal,
                estimatedCapex   : capexInput  && capexInput.getValue()    ? parseFloat(capexInput.getValue())    : null,
                estimatedOpex    : opexInput   && opexInput.getValue()     ? parseFloat(opexInput.getValue())     : null,
                benefitCostRatio : bcrInput    && bcrInput.getValue()      ? parseFloat(bcrInput.getValue())      : null,
                programmeStatus  : statusSelect ? statusSelect.getSelectedKey() : "PROPOSED",
                fundingSource    : fundingInput ? fundingInput.getValue().trim() : "",
                notes            : notesArea    ? notesArea.getValue()           : ""
            };

            const dlg = this.byId("investmentPlanDialog");
            const saveBtn = dlg ? dlg.getBeginButton() : null;
            if (saveBtn) saveBtn.setBusy(true);

            AuthFetch.post(`${BASE}/BridgeInvestmentPlans`, payload)
            .then(r => { if (!r.ok) return r.json().then(e => Promise.reject(e)); return r.json(); })
            .then(() => {
                MessageToast.show("Investment plan entry saved.");
                if (dlg) dlg.close();
                this._loadInvestmentPlans();
            })
            .catch(e => {
                const msg = (e && e.error && e.error.message) || (e && e.message) || "Save failed";
                MessageBox.error(msg);
            })
            .finally(() => { if (saveBtn) saveBtn.setBusy(false); });
        },

        onCancelInvestmentPlan: function () {
            const dlg = this.byId("investmentPlanDialog");
            if (dlg) dlg.close();
        },

        _loadRiskAssessments: function () {
            if (!this._bridge || !this._bridge.ID) return;
            const url = `${BASE}/BridgeRiskAssessments?$filter=bridge_ID eq ${this._bridge.ID}&$orderby=assessmentDate desc`;
            fetch(url, { headers: { Accept: "application/json" } })
                .then(r => r.json())
                .then(d => {
                    const model = this.getView().getModel("riskAssessments");
                    if (model) model.setProperty("/items", d.value || []);
                })
                .catch(e => console.error("Risk assessments load failed:", e));
        },

        _loadInvestmentPlans: function () {
            if (!this._bridge || !this._bridge.ID) return;
            const url = `${BASE}/BridgeInvestmentPlans?$filter=bridge_ID eq ${this._bridge.ID}&$orderby=recommendedYear asc`;
            fetch(url, { headers: { Accept: "application/json" } })
                .then(r => r.json())
                .then(d => {
                    const model = this.getView().getModel("investmentPlans");
                    if (model) model.setProperty("/items", d.value || []);
                })
                .catch(e => console.error("Investment plans load failed:", e));
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

        onInfoPressBridgeDetail: function (oEvent) {
            this._showInfoPopover(
                oEvent.getSource(),
                "Bridge Detail — Field Guide",
                "Condition Rating — AS 5100 scale 1–10 where 10 is new and 1 is failed. Ratings ≤4 trigger urgent intervention.\n\n" +
                "Condition Score — 0–100 composite index derived from element-level measurements.\n\n" +
                "Posting Status — UNRESTRICTED (no limits), POSTED (restriction in force), CLOSED (no access).\n\n" +
                "NHVR Route Assessed — indicates this bridge has been formally reviewed under the NHVR permit assessment framework.\n\n" +
                "Scour Risk — risk of foundation scour during flood events: LOW, MEDIUM, HIGH, CRITICAL.\n\n" +
                "AADT — Annual Average Daily Traffic (vehicles per day, all vehicle types).\n\n" +
                "Year Built — year of original construction. Bridges >50 years old may require more frequent inspection."
            );
        },

        onInfoPressRestrictions: function (oEvent) {
            this._showInfoPopover(
                oEvent.getSource(),
                "About Restrictions",
                "Restrictions limit which vehicles may use this bridge.\n\n" +
                "Restriction Types:\n" +
                "• GROSS_MASS — maximum gross vehicle mass (GVM) in tonnes\n" +
                "• AXLE_LOAD — maximum load per axle group in tonnes\n" +
                "• CLEARANCE_HEIGHT — maximum vehicle height in metres\n" +
                "• CLEARANCE_WIDTH — maximum vehicle width in metres\n" +
                "• SPEED — maximum vehicle speed in km/h\n" +
                "• VEHICLE_TYPE — restricts specific vehicle classes\n\n" +
                "Temporary restrictions have a defined from/to date range and are automatically expired by the system.\n\n" +
                "NHVR permit holders may be granted overrides for POSTED bridges via approved permit conditions."
            );
        },

        onInfoPressInspections: function (oEvent) {
            this._showInfoPopover(
                oEvent.getSource(),
                "AS 5100 Formal Inspection Standard",
                "AS 5100.7 is the Australian Standard for bridge evaluation. Formal inspections assess overall bridge condition and assign a condition rating.\n\n" +
                "Condition Ratings (AS 5100):\n" +
                "• 9–10 — New / Very Good: no defects\n" +
                "• 7–8 — Good: minor defects only\n" +
                "• 5–6 — Fair: moderate defects, maintenance required\n" +
                "• 3–4 — Poor: significant defects, restricted use likely\n" +
                "• 1–2 — Critical / Failed: immediate action required\n\n" +
                "Inspection Frequency:\n" +
                "• Principal inspections: every 5 years (or as specified)\n" +
                "• Routine inspections: annually\n" +
                "• Special inspections: event-triggered"
            );
        },

        onInfoPressDefects: function (oEvent) {
            this._showInfoPopover(
                oEvent.getSource(),
                "AustRoads BIMM Defect Severity",
                "Defects are recorded per AustRoads Bridge Inspection and Maintenance Manual (BIMM).\n\n" +
                "Severity Levels:\n" +
                "• CRITICAL — immediate risk to structural safety or traffic; bridge closure may be required\n" +
                "• HIGH — significant deterioration; repair within 3 months\n" +
                "• MEDIUM — moderate defect; repair within 12 months\n" +
                "• LOW — minor defect; monitor and repair opportunistically\n\n" +
                "Defect Categories: STRUCTURAL, SURFACE, DRAINAGE, SAFETY, SCOUR, OTHER\n\n" +
                "Open defects contribute to the bridge's risk score and may trigger restriction reviews."
            );
        },

        onEditNhvrRoute: function () {
            if (!this._bridge) return;
            const b = this._bridge;
            const assessedCb = this.byId("nhvrEditAssessed");
            if (assessedCb) assessedCb.setSelected(!!b.nhvrRouteAssessed);
            const approvalSel = this.byId("nhvrEditApprovalClass");
            if (approvalSel) approvalSel.setSelectedKey(b.nhvrRouteApprovalClass || "");
            const pbsInput = this.byId("nhvrEditPbsLevel");
            if (pbsInput) pbsInput.setValue(b.pbsLevelApproved || "");
            const gazetteInput = this.byId("nhvrEditGazetteRef");
            if (gazetteInput) gazetteInput.setValue(b.gazetteRef || "");
            const nhvrRefInput = this.byId("nhvrEditNhvrRef");
            if (nhvrRefInput) nhvrRefInput.setValue(b.nhvrRef || "");
            const freightCb = this.byId("nhvrEditFreightRoute");
            if (freightCb) freightCb.setSelected(!!b.freightRoute);
            const overMassCb = this.byId("nhvrEditOverMassRoute");
            if (overMassCb) overMassCb.setSelected(!!b.overMassRoute);
            const dlg = this.byId("editNhvrRouteDialog");
            if (dlg) dlg.open();
        },

        onSaveNhvrRoute: function () {
            if (!this._bridge || !this._bridge.ID) return;
            const approvalSel = this.byId("nhvrEditApprovalClass");
            const payload = {
                nhvrRouteAssessed      : this.byId("nhvrEditAssessed")    ? this.byId("nhvrEditAssessed").getSelected()    : false,
                nhvrRouteApprovalClass : approvalSel ? approvalSel.getSelectedKey() || null : null,
                pbsLevelApproved       : this.byId("nhvrEditPbsLevel")    ? this.byId("nhvrEditPbsLevel").getValue().trim()    || null : null,
                gazetteRef             : this.byId("nhvrEditGazetteRef")  ? this.byId("nhvrEditGazetteRef").getValue().trim()  || null : null,
                nhvrRef                : this.byId("nhvrEditNhvrRef")     ? this.byId("nhvrEditNhvrRef").getValue().trim()     || null : null,
                freightRoute           : this.byId("nhvrEditFreightRoute") ? this.byId("nhvrEditFreightRoute").getSelected()  : false,
                overMassRoute          : this.byId("nhvrEditOverMassRoute")? this.byId("nhvrEditOverMassRoute").getSelected() : false
            };
            const dlg = this.byId("editNhvrRouteDialog");
            const saveBtn = dlg ? dlg.getBeginButton() : null;
            if (saveBtn) saveBtn.setBusy(true);
            AuthFetch.patch(`${BASE}/Bridges(${this._bridge.ID})`, payload)
            .then(r => { if (!r.ok) return r.json().then(e => Promise.reject(e)); })
            .then(() => {
                Object.assign(this._bridge, payload);
                Object.keys(payload).forEach(k => this._model.setProperty("/" + k, payload[k]));
                MessageToast.show("Route approval details saved.");
                if (dlg) dlg.close();
            })
            .catch(e => MessageBox.error((e && e.error && e.error.message) || "Save failed"))
            .finally(() => { if (saveBtn) saveBtn.setBusy(false); });
        },

        onCancelNhvrRoute: function () {
            const dlg = this.byId("editNhvrRouteDialog");
            if (dlg) dlg.close();
        },

        onEditLoadRating: function () {
            if (!this._bridge) return;
            const b = this._bridge;
            const set = (id, v) => { const c = this.byId(id); if (c) c.setValue(v != null ? String(v) : ""); };
            set("lrEditLoadRating",       b.loadRating);
            set("lrEditGvmLimit",         b.vehicularGrossWeightLimitT);
            set("lrEditClearanceHeight",  b.clearanceHeightM);
            set("lrEditWaterwayClearance",b.waterwayHorizontalClearanceM);
            set("lrEditSpeedLimit",       b.postedSpeedLimitKmh);
            set("lrEditBancId",           b.bancId);
            set("lrEditBancUrl",          b.bancURL);
            const dlg = this.byId("editLoadRatingDialog");
            if (dlg) dlg.open();
        },

        onSaveLoadRating: function () {
            if (!this._bridge || !this._bridge.ID) return;
            const getNum = (id) => { const c = this.byId(id); return c && c.getValue() ? parseFloat(c.getValue()) : null; };
            const getStr = (id) => { const c = this.byId(id); return c ? c.getValue().trim() || null : null; };
            const payload = {
                loadRating                    : getNum("lrEditLoadRating"),
                vehicularGrossWeightLimitT    : getNum("lrEditGvmLimit"),
                clearanceHeightM              : getNum("lrEditClearanceHeight"),
                waterwayHorizontalClearanceM  : getNum("lrEditWaterwayClearance"),
                postedSpeedLimitKmh           : getNum("lrEditSpeedLimit"),
                bancId                        : getStr("lrEditBancId"),
                bancURL                       : getStr("lrEditBancUrl")
            };
            const dlg = this.byId("editLoadRatingDialog");
            const saveBtn = dlg ? dlg.getBeginButton() : null;
            if (saveBtn) saveBtn.setBusy(true);
            AuthFetch.patch(`${BASE}/Bridges(${this._bridge.ID})`, payload)
            .then(r => { if (!r.ok) return r.json().then(e => Promise.reject(e)); })
            .then(() => {
                Object.assign(this._bridge, payload);
                Object.keys(payload).forEach(k => this._model.setProperty("/" + k, payload[k]));
                MessageToast.show("Load rating saved.");
                if (dlg) dlg.close();
            })
            .catch(e => MessageBox.error((e && e.error && e.error.message) || "Save failed"))
            .finally(() => { if (saveBtn) saveBtn.setBusy(false); });
        },

        onCancelLoadRating: function () {
            const dlg = this.byId("editLoadRatingDialog");
            if (dlg) dlg.close();
        },

        onInfoPressRiskAssessment: function (oEvent) {
            this._showInfoPopover(
                oEvent.getSource(),
                "Risk Matrix Explanation",
                "Risk Score = Likelihood × Consequence (1–5 each), giving a score from 1–25.\n\n" +
                "Risk Bands:\n" +
                "• LOW (1–5) — routine monitoring\n" +
                "• MEDIUM (6–12) — increased inspection frequency\n" +
                "• HIGH (13–19) — management action plan required\n" +
                "• CRITICAL (20–25) — immediate executive notification; possible traffic restriction\n\n" +
                "Priority Rank — relative ranking across all bridges in the network (1 = highest priority).\n\n" +
                "Structurally Deficient — AS 5100 classification for bridges with load-carrying capacity below current legal vehicle loads.\n\n" +
                "Functionally Obsolete — bridge geometry (width, clearance) no longer meets current design standards."
            );
        },

        onInfoPressInvestment: function (oEvent) {
            this._showInfoPopover(
                oEvent.getSource(),
                "Investment Plan Field Guide",
                "Current Replacement Cost (CRC) — estimated cost to replace the bridge with a modern equivalent.\n\n" +
                "Written Down Value (WDV) — CRC minus accumulated depreciation (asset accounting value).\n\n" +
                "Deferred Maintenance — backlog of maintenance that has not been performed; indicates funding shortfall.\n\n" +
                "Remaining Useful Life — estimated years of service before major rehabilitation or replacement is required.\n\n" +
                "Bridge Health Index (BHI) — WDV as a percentage of CRC; lower values indicate a more deteriorated asset.\n\n" +
                "Intervention Types:\n" +
                "• MAINTENANCE — routine works\n" +
                "• REHABILITATION — major structural works extending asset life\n" +
                "• REPLACEMENT — full structure replacement"
            );
        },

        // ── GAP 1: Scour Assessment ───────────────────────────────
        _loadScourData: function (bridgeUUID) {
            if (!bridgeUUID) return;
            const h = { "Content-Type": "application/json" };
            fetch(`${BASE}/ScourAssessments?$filter=bridge_ID eq ${bridgeUUID}&$orderby=createdAt desc&$top=1`, { headers: h })
                .then(r => r.ok ? r.json() : null)
                .then(data => {
                    const sa = (data && data.value && data.value[0]) ? data.value[0] : null;
                    const levelCtrl = this.byId("scourRiskLevelStatus");
                    const scoreCtrl = this.byId("scourRiskScoreText");
                    if (!sa) {
                        if (levelCtrl) levelCtrl.setText("Not assessed").setState("None");
                        return;
                    }
                    if (levelCtrl) {
                        const level = sa.scourRiskLevel || "UNKNOWN";
                        const stateMap = { EXTREME: "Error", HIGH: "Warning", MEDIUM: "Warning", LOW: "Success" };
                        levelCtrl.setText(level).setState(stateMap[level] || "None");
                    }
                    if (scoreCtrl) scoreCtrl.setText(sa.scourRiskScore !== null && sa.scourRiskScore !== undefined ? String(sa.scourRiskScore) : "—");
                    const setText = (id, val) => { const c = this.byId(id); if (c) c.setText(val || "—"); };
                    setText("scourAssessmentDate",  sa.assessmentDate);
                    setText("scourAssessedBy",       sa.assessedBy);
                    setText("scourWatercourseName",  sa.watercourseName);
                    setText("scourFoundationType",   sa.foundationType);
                    setText("scourFloodFrequency",   sa.floodFrequency ? sa.floodFrequency + " year ARI" : "—");
                    setText("scourDepthText",         sa.scourDepth_m !== null && sa.scourDepth_m !== undefined ? sa.scourDepth_m + " m" : "—");
                    setText("scourVelocityRating",   sa.velocityRating);
                    setText("scourSedimentRating",   sa.sedimentRating);
                    setText("scourMitigationStatus", sa.mitigationStatus);
                })
                .catch(e => console.warn("Scour data load failed", e));
        },

        onRunScourAssessment: function () {
            if (!this._bridge) { sap.m.MessageToast.show("Bridge not loaded yet"); return; }
            const b = this._bridge;
            const MessageBox = sap.m.MessageBox;
            MessageBox.confirm(
                `Run BIMM §7 scour risk assessment for bridge ${b.bridgeId}?\n\nThis will use current bridge parameters (foundation type, condition) to compute the AustRoads BIMM 4×4 matrix risk level.`,
                {
                    title: "Confirm Scour Assessment",
                    onClose: (action) => {
                        if (action !== "OK") return;
                        AuthFetch.post(`${BASE}/assessScourRisk`, {
                                bridgeId       : b.ID,
                                floodFrequency : 100,
                                scourDepth_m   : 1.5,
                                velocityRating : "MODERATE",
                                sedimentRating : "MODERATE",
                                foundationType : b.foundationType || "UNKNOWN",
                                watercourseName: b.waterway || b.name,
                                assessedBy     : null
                            })
                        .then(r => r.ok ? r.json() : Promise.reject(r.status))
                        .then(() => {
                            sap.m.MessageToast.show("Scour assessment completed");
                            this._loadScourData(b.ID);
                        })
                        .catch(e => MessageBox.error("Scour assessment failed: " + e));
                    }
                }
            );
        },

        // ── S/4HANA Integration Tab ──────────────────────────
        onSyncToS4: function () {
            const b = this._bridge;
            if (!b) return;
            const that = this;
            sap.m.MessageBox.confirm(`Sync bridge "${b.bridgeId}" to SAP S/4HANA Equipment Master?`, {
                title: 'Confirm S/4HANA Sync',
                actions: [sap.m.MessageBox.Action.YES, sap.m.MessageBox.Action.NO],
                onClose: function (action) {
                    if (action !== sap.m.MessageBox.Action.YES) return;
                    AuthFetch.post(`${BASE}/Bridges(${b.ID})/syncBridgeToS4`, {})
                        .then(r => r.json())
                        .then(data => {
                            const r = data?.value || data;
                            if (r?.success) {
                                sap.m.MessageToast.show(r.message || `Synced. Equipment: ${r.equipmentNumber}`);
                                that._loadS4Mapping(b.ID);
                            } else {
                                sap.m.MessageBox.error(r?.error?.message || JSON.stringify(r));
                            }
                        })
                        .catch(e => sap.m.MessageBox.error('Sync failed: ' + e));
                }
            });
        },

        onPullFromS4: function () {
            const b = this._bridge;
            if (!b) return;
            AuthFetch.post(`${BASE}/Bridges(${b.ID})/syncBridgeFromS4`, {})
            .then(r => r.json())
            .then(data => {
                const r = data?.value || data;
                if (r?.success) {
                    sap.m.MessageToast.show(`${r.fieldsUpdated} fields updated from S/4HANA`);
                } else {
                    sap.m.MessageBox.warning(r?.error?.message || JSON.stringify(r));
                }
            })
            .catch(e => sap.m.MessageBox.error('Pull failed: ' + e));
        },

        onCreateS4Notification: function () {
            const b = this._bridge;
            if (!b) return;
            AuthFetch.post(`${BASE}/Bridges(${b.ID})/createS4MaintenanceNotification`, { description: `Maintenance required: ${b.bridgeId}`, severity: 'MEDIUM' })
            .then(r => r.json())
            .then(data => {
                const r = data?.value || data;
                sap.m.MessageToast.show(r?.message || `PM Notification created: ${r?.notificationNumber}`);
            })
            .catch(e => sap.m.MessageBox.error('Create notification failed: ' + e));
        },

        onCreateS4Order: function () {
            const b = this._bridge;
            if (!b) return;
            AuthFetch.post(`${BASE}/Bridges(${b.ID})/createS4MaintenanceOrder`, {
                    orderNumber : `NHVR-${b.bridgeId}-${new Date().getFullYear()}`,
                    plannedDate : new Date().toISOString().slice(0, 10)
                })
            .then(r => r.json())
            .then(data => {
                const r = data?.value || data;
                sap.m.MessageToast.show(r?.message || `PM Order created: ${r?.orderNumber}`);
            })
            .catch(e => sap.m.MessageBox.error('Create order failed: ' + e));
        },

        _loadS4Mapping: function (bridgeId) {
            const that = this;
            fetch(`${BASE}/S4EquipmentMappings?$filter=bridge_ID eq ${bridgeId}&$top=1`)
                .then(r => r.json())
                .then(data => {
                    const mapping = (data?.value || [])[0] || {};
                    const setTxt = (id, val) => {
                        const el = that.byId(id);
                        if (el) el.setText(val || '—');
                    };
                    setTxt('detS4EquipNum', mapping.equipmentNumber);
                    setTxt('detS4AssetNum',  mapping.assetNumber);
                    setTxt('detS4LastSync',  mapping.lastSyncAt
                        ? new Date(mapping.lastSyncAt).toLocaleString('en-AU') : 'Never synced');

                    const statusEl = that.byId('detS4SyncStatus');
                    if (statusEl) {
                        statusEl.setText(mapping.lastSyncStatus || 'Not synced');
                        statusEl.setState(
                            mapping.lastSyncStatus === 'SUCCESS' ? 'Success' :
                            mapping.lastSyncStatus === 'ERROR'   ? 'Error'   : 'None'
                        );
                    }

                    // Build characteristics preview from current bridge data
                    const CHAR_MAP = {
                        'BRIDGE_ID': 'bridgeId',     'NHVR_REF': 'nhvrRef',
                        'BRIDGE_TYPE': 'structureType', 'SPAN_LENGTH_M': 'spanLengthM',
                        'DECK_WIDTH_M': 'deckWidthM',   'CLEARANCE_HT_M': 'clearanceHeightM',
                        'NUM_SPANS': 'numberOfSpans',   'YEAR_BUILT': 'yearBuilt',
                        'CONDITION_RTG': 'conditionRating', 'POSTING_STATUS': 'postingStatus',
                        'SCOUR_RISK': 'scourRisk',    'NHVR_ASSESSED': 'nhvrRouteAssessed',
                        'GAZETTE_REF': 'gazetteRef',  'LATITUDE': 'latitude',
                        'LONGITUDE': 'longitude',     'BANC_ID': 'bancId',
                        'ASSET_OWNER': 'assetOwner'
                    };
                    const b = that._bridge || {};
                    const chars = Object.entries(CHAR_MAP).map(([charName, nhvrField]) => ({
                        charName,
                        nhvrField,
                        value: b[nhvrField] != null ? String(b[nhvrField]) : ''
                    }));
                    const charTable = that.byId('s4CharTable');
                    if (charTable) {
                        const oModel = new sap.ui.model.json.JSONModel(chars);
                        charTable.setModel(oModel);
                    }
                })
                .catch(e => console.warn('S4 mapping load failed:', e));
        },

        onAddLoadRating: function () {
            sap.m.MessageToast.show('No load ratings recorded. Click \u201c+ Add Rating\u201d above to add the first load rating for this bridge.');
        },

        // ── Phase 5.1: Document Attachments ─────────────────────
        _loadAttachments: function (bridgeUUID) {
            var self = this;
            var h = { Accept: "application/json" };
            fetch(BASE + "/DocumentAttachments?$filter=bridge_ID eq " + bridgeUUID
                + "&$orderby=capturedAt desc"
                + "&$select=ID,fileName,mimeType,fileSize_kb,title,documentType,uploadedBy,documentDate,capturedAt,description,externalUrl",
                { headers: h })
            .then(function (r) { return r.json(); })
            .then(function (j) {
                var items = j.value || [];
                self._model.setProperty("/attachments", items);
                self._model.setProperty("/attachmentCount", items.length);
            })
            .catch(function (e) {
                console.warn("[NHVR] Attachments load failed:", e && e.message || e);
            });
        },

        onUploadDocument: function () {
            if (!this._uploadDialog) {
                var self = this;
                this._uploadDialog = new sap.m.Dialog({
                    title: "Upload Document",
                    contentWidth: "480px",
                    content: [
                        new sap.m.VBox({ items: [
                            new sap.m.Label({ text: "Title *", required: true }),
                            new sap.m.Input({ id: this.createId("attachTitle"), placeholder: "Document title..." }),
                            new sap.m.Label({ text: "Document Type *", required: true }),
                            new sap.m.Select({ id: this.createId("attachDocType"), items: [
                                new sap.ui.core.Item({ key: "INSPECTION_PHOTO", text: "Inspection Photo" }),
                                new sap.ui.core.Item({ key: "DEFECT_PHOTO", text: "Defect Photo" }),
                                new sap.ui.core.Item({ key: "STRUCTURAL_DRAWING", text: "Structural Drawing" }),
                                new sap.ui.core.Item({ key: "REPORT", text: "Report" }),
                                new sap.ui.core.Item({ key: "LOAD_TEST", text: "Load Test" }),
                                new sap.ui.core.Item({ key: "AS_BUILT", text: "As-Built" }),
                                new sap.ui.core.Item({ key: "GAZETTE", text: "Gazette" }),
                                new sap.ui.core.Item({ key: "BIM_IFC", text: "BIM / IFC Model" }),
                                new sap.ui.core.Item({ key: "OTHER", text: "Other" })
                            ]}),
                            new sap.m.Label({ text: "Description" }),
                            new sap.m.Input({ id: this.createId("attachDesc"), placeholder: "Brief description..." }),
                            new sap.m.Label({ text: "File (max 10MB: JPG, PNG, PDF, DOCX)" }),
                            new sap.ui.unified.FileUploader({
                                id: this.createId("attachFileUploader"),
                                fileType: ["jpg", "jpeg", "png", "pdf", "docx"],
                                maximumFileSize: 10,
                                style: "Emphasized",
                                buttonText: "Choose File",
                                change: function (e) {
                                    self._selectedFile = e.getParameter("files") && e.getParameter("files")[0]
                                        ? e.getParameter("files")[0] : null;
                                }
                            }),
                            new sap.m.Label({ text: "External URL (optional)" }),
                            new sap.m.Input({ id: this.createId("attachExtUrl"), placeholder: "https://..." })
                        ]}).addStyleClass("sapUiSmallMargin")
                    ],
                    beginButton: new sap.m.Button({
                        text: "Upload", type: "Emphasized",
                        press: this._doUploadAttachment.bind(this)
                    }),
                    endButton: new sap.m.Button({
                        text: "Cancel",
                        press: function () { self._uploadDialog.close(); }
                    })
                });
                this.getView().addDependent(this._uploadDialog);
            }
            // Reset fields
            this._selectedFile = null;
            this.byId("attachTitle").setValue("");
            this.byId("attachDesc").setValue("");
            this.byId("attachExtUrl").setValue("");
            var uploader = this.byId("attachFileUploader");
            if (uploader) uploader.clear();
            this._uploadDialog.open();
        },

        _doUploadAttachment: function () {
            var title = this.byId("attachTitle").getValue().trim();
            var docType = this.byId("attachDocType").getSelectedKey();
            var desc = this.byId("attachDesc").getValue().trim();
            var extUrl = this.byId("attachExtUrl").getValue().trim();

            if (!title) {
                MessageToast.show("Please enter a document title");
                return;
            }

            var payload = {
                bridge_ID: this._currentBridgeUUID,
                title: title,
                documentType: docType,
                description: desc || null,
                externalUrl: extUrl || null,
                isActive: true,
                version: "1.0"
            };

            // If a file was selected, add file metadata
            if (this._selectedFile) {
                payload.fileName = this._selectedFile.name;
                payload.mimeType = this._selectedFile.type;
                payload.fileSize_kb = Math.ceil(this._selectedFile.size / 1024);
            }

            var self = this;
            AuthFetch.post(BASE + "/DocumentAttachments", payload).then(function (r) {
                if (!r.ok) return r.json().then(function (e) { throw new Error((e.error && e.error.message) || "Upload failed"); });
                MessageToast.show("Document uploaded successfully");
                self._uploadDialog.close();
                self._loadAttachments(self._currentBridgeUUID);
            }).catch(function (e) {
                MessageBox.error("Upload failed: " + (e.message || e));
            });
        },

        onDeleteAttachment: function (oEvent) {
            var ctx = oEvent.getSource().getBindingContext("detail");
            if (!ctx) return;
            var item = ctx.getObject();
            var self = this;
            MessageBox.confirm("Delete document \"" + item.title + "\"?", {
                title: "Confirm Delete",
                onClose: function (action) {
                    if (action !== MessageBox.Action.OK) return;
                    AuthFetch.del(BASE + "/DocumentAttachments(" + item.ID + ")").then(function (r) {
                        if (!r.ok && r.status !== 204) throw new Error("Delete failed");
                        MessageToast.show("Document deleted");
                        self._loadAttachments(self._currentBridgeUUID);
                    }).catch(function (e) {
                        MessageBox.error("Delete failed: " + (e.message || e));
                    });
                }
            });
        }
    });
});
