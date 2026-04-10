// ============================================================
// NHVR Reports & Analytics Controller
// v3.2.1 — Hub + Report Output dual-view with 15-report catalogue
// Server-side filtering for 10K+ assets, multi-class support
// ============================================================
sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageToast",
    "sap/m/MessageBox",
    "nhvr/bridgemanagement/util/ExcelExport",
    "nhvr/bridgemanagement/util/UserAnalytics",
    "nhvr/bridgemanagement/util/ReferenceData"
], function (Controller, JSONModel, MessageToast, MessageBox, ExcelExport, UserAnalytics, ReferenceData) {
    "use strict";

    const BASE     = "/bridge-management";
    const _IS_LOC  = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
    const _AUTH_H  = _IS_LOC ? { "Authorization": "Basic " + btoa("admin:admin") } : {};
    function _credOpts(extraHeaders) {
        const opts = { headers: Object.assign({ Accept: "application/json" }, _AUTH_H, extraHeaders || {}) };
        if (!_IS_LOC) opts.credentials = "include";
        return opts;
    }

    // Region data is loaded from OData at runtime via ReferenceData.js

    // ────────────────────────────────────────────────────────────
    // REPORT CATALOGUE  (15 reports)
    // ────────────────────────────────────────────────────────────
    const REPORT_CATALOGUE = [
        {
            id: "ASSET_REGISTER",
            title: "Asset Register",
            category: "ASSET",
            categoryLabel: "Asset Health",
            icon: "sap-icon://building",
            description: "Complete exportable inventory of all bridge assets including structural characteristics, ownership, location coordinates, and condition ratings.",
            liveCountKey: null,
            countState: "None",
            info: {
                purpose: "Provides a full exportable inventory of all bridge and infrastructure assets in the NHVR network.",
                users: "Asset managers, planners, state jurisdictions, auditors",
                sources: "Bridge entity, BridgeAttribute, Restriction (count), InspectionRecord",
                logic: "One row per bridge. Active restrictions only (status=ACTIVE). Latest inspection record for condition.",
                refresh: "Real-time (live OData query)"
            },
            defaultFields: ["bridgeId","name","state","condition","conditionRating","postingStatus","inspectionDate"],
            odataFn: "getAssetRegister"
        },
        {
            id: "ASSET_SUMMARY",
            title: "Asset Portfolio Summary",
            category: "ASSET",
            categoryLabel: "Asset Health",
            icon: "sap-icon://bar-chart",
            description: "Aggregated breakdown of the asset portfolio by class, state, condition band, posting status and criticality with percentage distributions.",
            liveCountKey: null,
            countState: "None",
            info: {
                purpose: "High-level portfolio view for executive and management reporting across the national network.",
                users: "Executives, network managers, state jurisdictions",
                sources: "getAssetSummary function — aggregated from Bridge entity",
                logic: "Grouped dimensions: assetClass, state, condition, postingStatus, criticality. Percentage = count / total * 100.",
                refresh: "Real-time (live OData query)"
            },
            defaultFields: ["dimension","label","count","pct"],
            odataFn: "getAssetSummary"
        },
        {
            id: "CONDITION_DIST",
            title: "Condition Distribution",
            category: "ASSET",
            categoryLabel: "Asset Health",
            icon: "sap-icon://pulse",
            description: "Distribution of bridge assets across AS 5100 condition rating bands from Excellent to Failed, with counts and percentage share.",
            liveCountKey: null,
            countState: "None",
            info: {
                purpose: "Understand the structural condition profile of the bridge network to prioritise maintenance investment.",
                users: "Asset engineers, maintenance planners, executive sponsors",
                sources: "getConditionDistribution function — Bridge entity condition ratings",
                logic: "Count per conditionRating value. Percentage = count / total * 100. Sorted EXCELLENT → FAILED.",
                refresh: "Real-time (live OData query)"
            },
            defaultFields: ["conditionRating","conditionLabel","assetCount","pct"],
            odataFn: "getConditionDistribution"
        },
        {
            id: "BRIDGES_CAPACITY",
            title: "Capacity Exceedances",
            category: "COMPLIANCE",
            categoryLabel: "Compliance & Risk",
            icon: "sap-icon://warning2",
            description: "Bridges where active vehicle permits exceed the structure's rated gross mass capacity, ranked by exceedance magnitude.",
            liveCountKey: "capacityFlags",
            countState: "Error",
            info: {
                purpose: "Identify bridges with approved vehicle permits that exceed the bridge's current load rating capacity.",
                users: "NHVR permit officers, risk managers, bridge engineers",
                sources: "getBridgesExceedingCapacity function — Bridge + Permit entities",
                logic: "Compares approvedGVM_t from permits to capacityGVM_t from bridge load rating. Exceedance = approvedGVM - capacityGVM.",
                refresh: "Real-time (live OData query)"
            },
            defaultFields: ["bridgeId","bridgeName","bridgeState","postingStatus","approvedGVM_t","capacityGVM_t","exceedanceAmount_t","numberOfAffectedPermits","riskLevel"],
            odataFn: "getBridgesExceedingCapacity"
        },
        {
            id: "NON_COMPLIANT",
            title: "Non-Compliant Routes",
            category: "COMPLIANCE",
            categoryLabel: "Compliance & Risk",
            icon: "sap-icon://alert",
            description: "Routes with closed, critically rated, or heavily restricted bridges that pose compliance risks to heavy vehicle movements.",
            liveCountKey: null,
            countState: "Warning",
            info: {
                purpose: "Flag routes where bridge conditions or restrictions create heavy vehicle compliance risks.",
                users: "NHVR route assessment officers, permit officers, network managers",
                sources: "RouteCompliance view — Route + Bridge + Restriction entities",
                logic: "Routes filtered where closedCount > 0 OR criticalCount > 0. Risk band assigned: HIGH if closed/critical, MEDIUM if posted/poor, LOW otherwise.",
                refresh: "Real-time (live OData query)"
            },
            defaultFields: ["routeCode","routeDescription","region","bridgeCount","postedCount","closedCount","criticalCount","poorCount"],
            odataFn: "RouteCompliance"
        },
        {
            id: "OVERDUE_REVIEWS",
            title: "Overdue Capacity Reviews",
            category: "COMPLIANCE",
            categoryLabel: "Compliance & Risk",
            icon: "sap-icon://date-time",
            description: "Bridges where the AS 5100.7 load capacity rating review date has passed without a new rating being completed.",
            liveCountKey: "overdueCount",
            countState: "Warning",
            info: {
                purpose: "Ensure all bridges have current load capacity ratings in compliance with AS 5100.7 review cycles.",
                users: "Bridge engineers, compliance officers, asset managers",
                sources: "getOverdueCapacityReviews function — Bridge entity + InspectionRecord",
                logic: "nextRatingDue < today. daysOverdue = today - nextRatingDue. Sorted by daysOverdue descending.",
                refresh: "Real-time (live OData query)"
            },
            defaultFields: ["bridgeId","bridgeName","bridgeState","lastRatingDate","nextRatingDue","daysOverdue","capacityStatus","ratedBy"],
            odataFn: "getOverdueCapacityReviews"
        },
        {
            id: "ROUTE_COMPLIANCE",
            title: "Route Compliance Overview",
            category: "COMPLIANCE",
            categoryLabel: "Compliance & Risk",
            icon: "sap-icon://map-2",
            description: "Bridge counts, posting status, condition risk, and overall risk band for each named road route in the NHVR network.",
            liveCountKey: null,
            countState: "None",
            info: {
                purpose: "Give route managers a single-page view of compliance risk across all routes.",
                users: "Route assessment officers, network planners, state road authorities",
                sources: "RouteCompliance view — Route + Bridge entities",
                logic: "Aggregated per route: bridgeCount, postedCount, closedCount, criticalCount, poorCount. Risk = HIGH/MEDIUM/LOW rule.",
                refresh: "Real-time (live OData query)"
            },
            defaultFields: ["routeCode","routeDescription","region","bridgeCount","postedCount","closedCount","criticalCount","poorCount"],
            odataFn: "RouteCompliance"
        },
        {
            id: "INSPECTION_STATUS",
            title: "Inspection Status Report",
            category: "INSPECTIONS",
            categoryLabel: "Inspections",
            icon: "sap-icon://checklist-2",
            description: "All inspection orders across the network with planned dates, completion status, days overdue, and condition outcomes.",
            liveCountKey: null,
            countState: "None",
            info: {
                purpose: "Track inspection programme delivery and identify overdue inspections requiring urgent action.",
                users: "Inspection managers, bridge engineers, state maintenance teams",
                sources: "getInspectionStatusReport function — InspectionOrder + Bridge entities",
                logic: "All inspection orders. daysOverdue = today - plannedDate (if not completed). OVERDUE flag if status != COMPLETED and plannedDate < today.",
                refresh: "Real-time (live OData query)"
            },
            defaultFields: ["bridgeId","bridgeName","state","orderNumber","plannedDate","completedDate","status","daysOverdue","inspectionType","inspector","conditionResult"],
            odataFn: "getInspectionStatusReport"
        },
        {
            id: "DEFECT_KPIS",
            title: "Defect Register",
            category: "INSPECTIONS",
            categoryLabel: "Inspections",
            icon: "sap-icon://wrench",
            description: "All open and closed structural defects across the bridge network, ranked by severity with defect category and bridge location.",
            liveCountKey: null,
            countState: "None",
            info: {
                purpose: "Maintain an auditable register of all structural defects and track remediation progress.",
                users: "Bridge engineers, maintenance managers, safety officers",
                sources: "BridgeDefects entity — linked to Bridge via bridge_ID",
                logic: "All defect records. Filter: severity (CRITICAL/HIGH/MEDIUM/LOW), status (OPEN/CLOSED), category (AustRoads BIMM).",
                refresh: "Real-time (live OData query)"
            },
            defaultFields: ["bridge_ID","defectCode","defectCategory","severity","status","detectedDate","closedDate","description"],
            odataFn: "BridgeDefects"
        },
        {
            id: "RESTRICTION_SUMMARY",
            title: "Restriction Summary",
            category: "RESTRICTIONS",
            categoryLabel: "Restrictions",
            icon: "sap-icon://locked",
            description: "Aggregated restriction data by type, bridge, state, and status with value ranges and permit requirement details.",
            liveCountKey: null,
            countState: "None",
            info: {
                purpose: "Provide a comprehensive view of all active and scheduled restrictions across the network.",
                users: "Permit officers, route planners, compliance teams",
                sources: "getRestrictionSummary function — Restriction + Bridge + Route entities",
                logic: "One row per restriction. Filters: type, status, state, permitRequired, value range, direction, date range.",
                refresh: "Real-time (live OData query)"
            },
            defaultFields: ["bridgeId","bridgeName","state","region","restrictionType","value","unit","status","validFromDate","validToDate","permitRequired","vehicleClassName","routeCode"],
            odataFn: "getRestrictionSummary"
        },
        {
            id: "RESTRICTION_KPIS",
            title: "Restriction KPIs",
            category: "RESTRICTIONS",
            categoryLabel: "Restrictions",
            icon: "sap-icon://number-sign",
            description: "Key performance indicators for the restrictions programme: active count by type, state and bridge, trends in temporary and seasonal restrictions.",
            liveCountKey: null,
            countState: "None",
            info: {
                purpose: "Monitor the health and coverage of the restrictions programme across the network.",
                users: "Network managers, compliance officers, executives",
                sources: "Restrictions entity — direct OData query with $count",
                logic: "Count groups: by status, by type, by state. Percentage active = active / total * 100.",
                refresh: "Real-time (live OData query)"
            },
            defaultFields: ["ID","bridge_ID","restrictionType","value","unit","status","validFromDate","validToDate","permitRequired","direction"],
            odataFn: "Restrictions"
        },
        {
            id: "NETWORK_KPIS",
            title: "Network KPIs",
            category: "NETWORK",
            categoryLabel: "Network",
            icon: "sap-icon://connected",
            description: "High-level network health indicators: total assets, percentage in poor/critical condition, active restrictions, and open defects by state.",
            liveCountKey: null,
            countState: "None",
            info: {
                purpose: "Executive dashboard-style network health summary for board reporting and stakeholder briefings.",
                users: "Executives, board members, state government stakeholders",
                sources: "getAssetSummary function — aggregated across all bridge entities",
                logic: "Multi-dimension aggregation: class, state, condition, postingStatus. Poor/Critical = conditionRating IN ('POOR','CRITICAL','FAILED').",
                refresh: "Real-time (live OData query)"
            },
            defaultFields: ["dimension","label","count","pct"],
            odataFn: "getAssetSummary"
        },
        {
            id: "VEHICLE_ACCESS",
            title: "Vehicle Access Matrix",
            category: "NETWORK",
            categoryLabel: "Network",
            icon: "sap-icon://truck",
            description: "Active restriction matrix showing which vehicle classes are restricted at which bridges, with restriction types, values, and permit requirements.",
            liveCountKey: null,
            countState: "None",
            info: {
                purpose: "Identify which vehicle classes can access which bridges under current restriction conditions.",
                users: "Permit officers, fleet operators, NHVR route planners",
                sources: "VehicleAccess view — Restriction + VehicleClass + Bridge entities",
                logic: "One row per restriction-vehicle class combination. Filters: bridge, vehicleClassName, restrictionType.",
                refresh: "Real-time (live OData query)"
            },
            defaultFields: ["bridgeId","bridgeName","region","vehicleClassName","restrictionType","value","unit","status","permitRequired"],
            odataFn: "VehicleAccess"
        },
        {
            id: "FREIGHT_ROUTE",
            title: "Freight Route Assessment",
            category: "NETWORK",
            categoryLabel: "Network",
            icon: "sap-icon://cargo-train",
            description: "Assessment of freight routes including bridge clearances, mass limits, height and width restrictions relevant to heavy vehicle operators.",
            liveCountKey: null,
            countState: "None",
            info: {
                purpose: "Support route planning and permit assessment for oversize/overmass vehicle movements.",
                users: "NHVR route assessment officers, freight operators, permit officers",
                sources: "FreightRoute view — Route + Bridge + Restriction entities",
                logic: "Per-route bridge inventory with worst-case restrictions. MinMassLimit, MinHeightClearance, MinWidthClearance per route.",
                refresh: "Real-time (live OData query)"
            },
            defaultFields: ["routeCode","routeDescription","bridgeCount","minMassLimit_t","minHeightClearance_m","minWidthClearance_m","restrictionCount"],
            odataFn: "FreightRoute"
        },
        {
            id: "TREND_DATA",
            title: "Condition Trend Analysis",
            category: "TRENDS",
            categoryLabel: "Trends",
            icon: "sap-icon://trend-up",
            description: "Historical trend of bridge condition changes over time, showing deterioration rates, improvement after maintenance, and network-level condition trajectories.",
            liveCountKey: null,
            countState: "None",
            info: {
                purpose: "Identify deterioration trends and maintenance effectiveness to inform long-term investment planning.",
                users: "Asset managers, planners, engineers, executive sponsors",
                sources: "BridgeConditionHistory entity — linked to Bridge via bridge_ID",
                logic: "Condition changes over time grouped by year and conditionRating. Trend = change in average conditionScore per annum.",
                refresh: "Real-time (live OData query)"
            },
            defaultFields: ["bridgeId","bridgeName","changedAt","oldCondition","newCondition","conditionScore","changedBy","notes"],
            odataFn: "BridgeConditionHistory"
        }
    ];

    return Controller.extend("nhvr.bridgemanagement.controller.Reports", {

        // ── State ─────────────────────────────────────────────
        _vehicleData     : [],
        _pageOffset      : 0,
        _pageSize        : 50,
        _totalCount      : 0,
        _currentPage     : 1,
        _catalogue       : REPORT_CATALOGUE,
        _filteredCatalogue: [],
        _recentReports   : [],

        // ── Init ──────────────────────────────────────────────
        onInit: function () {
            UserAnalytics.trackView("Reports");
            this._model = new JSONModel({
                register         : [],
                conditionDist    : [],
                restrictions     : [],
                inspections      : [],
                summaryByClass   : [],
                summaryByState   : [],
                summaryByStatus  : [],
                summaryByCrit    : [],
                route            : [],
                vehicle          : [],
                capacityExceedances : [],
                overdueReviews   : [],
                portfolioReport  : [],
                safetyReport     : [],
                investmentReport : [],
                nhvrRouteReport  : [],
                loadingRegister      : false,
                loadingCondition     : false,
                loadingRestrictions  : false,
                loadingInspections   : false,
                loadingCapacity      : false,
                loadingOverdue       : false,
                // Hub model
                hubView          : true,
                currentReport    : {},
                currentResults   : [],
                catalogue        : REPORT_CATALOGUE,
                liveCounts       : {
                    capacityFlags : null,
                    overdueCount  : null
                }
            });
            this.getView().setModel(this._model, "reports");
            this._filteredCatalogue = REPORT_CATALOGUE.slice();
            // Load geographic reference data from OData
            ReferenceData.load();

            // Hub model initialisation
            this._initHubModel();

            this.getOwnerComponent().getRouter()
                .getRoute("Reports")
                .attachPatternMatched(this._onRouteMatched, this);
        },

        onExit: function () {
            // Detach route listener
            var oRouter = this.getOwnerComponent().getRouter();
            var oRoute  = oRouter.getRoute("Reports");
            if (oRoute) oRoute.detachPatternMatched(this._onRouteMatched, this);
            // Clear any timers
            if (this._hubTimer1) { clearTimeout(this._hubTimer1); this._hubTimer1 = null; }
            if (this._hubTimer2) { clearTimeout(this._hubTimer2); this._hubTimer2 = null; }
            if (this._refreshTimer)  { clearTimeout(this._refreshTimer);  this._refreshTimer  = null; }
            if (this._pollInterval)  { clearInterval(this._pollInterval); this._pollInterval  = null; }
            // Destroy locally owned models
            if (this._model) { this._model.destroy(); }
        },

        // ── Hub Model Init ────────────────────────────────────
        _initHubModel: function () {
            this._model.setProperty("/hubView", true);
            this._model.setProperty("/currentReport", {});
            this._model.setProperty("/currentResults", []);
            this._model.setProperty("/catalogue", REPORT_CATALOGUE);
        },

        // ── Route Matched ─────────────────────────────────────
        _onRouteMatched: function () {
            // Clear any pending timers from previous navigation
            if (this._hubTimer1) { clearTimeout(this._hubTimer1); }
            if (this._hubTimer2) { clearTimeout(this._hubTimer2); }

            // Reset pagination and per-page state on every visit
            this._pageOffset = 0;
            this._currentPage = 1;
            this._vehicleData = [];

            // Load legacy tabs
            this._loadRouteCompliance();
            this._loadVehicleAccess();

            // Build report cards and load live counts
            this._hubTimer1 = setTimeout(function () {
                this._buildReportCards("ALL", "");
                this._loadLiveCounts();
            }.bind(this), 100);

            // Restore saved tab selection
            try {
                const savedTab = localStorage.getItem("nhvr.reports.tab");
                if (savedTab) {
                    this._hubTimer2 = setTimeout(function () {
                        var tb = this.byId("reportsTabBar");
                        if (tb) tb.setSelectedKey(savedTab);
                    }.bind(this), 150);
                }
            } catch (e) { /* localStorage unavailable */ }
        },

        // ── Build Report Cards ────────────────────────────────
        _buildReportCards: function (filterCategory, searchText) {
            const container = this.byId("reportCardsContainer");
            if (!container) return;
            container.destroyItems();

            const catKey = filterCategory || "ALL";
            const search = (searchText || "").toLowerCase();
            const liveCounts = this._model.getProperty("/liveCounts") || {};

            // Filter catalogue
            this._filteredCatalogue = REPORT_CATALOGUE.filter(function (r) {
                const catMatch = catKey === "ALL" || r.category === catKey;
                const searchMatch = !search ||
                    r.title.toLowerCase().indexOf(search) >= 0 ||
                    r.description.toLowerCase().indexOf(search) >= 0 ||
                    r.categoryLabel.toLowerCase().indexOf(search) >= 0;
                return catMatch && searchMatch;
            });

            // Colour mapping per category
            const catColour = {
                ASSET       : "#0a6ed1",
                COMPLIANCE  : "#bb0000",
                INSPECTIONS : "#e9730c",
                RESTRICTIONS: "#6a2783",
                NETWORK     : "#107e3e",
                TRENDS      : "#0f828f"
            };

            const self = this;
            this._filteredCatalogue.forEach(function (report) {
                // Outer card VBox
                const card = new sap.m.VBox({
                    renderType: "Bare",
                    width: "280px"
                }).addStyleClass("nhvrReportCard sapUiSmallMarginEnd sapUiSmallMarginBottom");
                card.addStyleClass("nhvrReportCardBase");

                // Apply inline style via DOM after render — use addEventDelegate
                const colour = catColour[report.category] || "#0a6ed1";

                // Header row: icon + category badge
                const headerRow = new sap.m.HBox({
                    justifyContent: "SpaceBetween",
                    alignItems: "Center"
                });
                const iconCtrl = new sap.ui.core.Icon({
                    src: report.icon,
                    size: "1.5rem",
                    color: colour
                });
                const catBadge = new sap.m.ObjectStatus({
                    text: report.categoryLabel,
                    state: report.category === "COMPLIANCE" ? "Error" :
                           report.category === "INSPECTIONS" ? "Warning" :
                           report.category === "ASSET" ? "Information" :
                           report.category === "RESTRICTIONS" ? "None" : "Success"
                });
                headerRow.addItem(iconCtrl);
                headerRow.addItem(catBadge);

                // Title
                const titleCtrl = new sap.m.Title({
                    text: report.title,
                    level: "H5"
                }).addStyleClass("sapUiTinyMarginTop");

                // Description
                const descCtrl = new sap.m.Text({
                    text: report.description,
                    maxLines: 3,
                    wrapping: true
                }).addStyleClass("sapUiTinyMarginTop nhvrReportCardDesc");

                // Live count badge (compliance reports)
                let countBadge = null;
                if (report.liveCountKey && liveCounts[report.liveCountKey] !== null && liveCounts[report.liveCountKey] !== undefined) {
                    countBadge = new sap.m.ObjectStatus({
                        text: liveCounts[report.liveCountKey] + " flagged",
                        state: report.countState || "Warning",
                        icon: "sap-icon://alert"
                    }).addStyleClass("sapUiTinyMarginTop");
                }

                // Footer row: Run + Info buttons
                const footerRow = new sap.m.HBox({
                    justifyContent: "SpaceBetween",
                    alignItems: "Center"
                }).addStyleClass("sapUiSmallMarginTop");

                const runBtn = new sap.m.Button({
                    text: "\u25B6 Run",
                    type: "Emphasized",
                    press: (function (rpt) {
                        return function () {
                            self._openReport(rpt.id);
                        };
                    }(report))
                });

                const infoBtn = new sap.m.Button({
                    text: "\u24D8",
                    tooltip: "Report info",
                    type: "Ghost",
                    press: (function (rpt) {
                        return function () {
                            self._showInfoDrawer(rpt.id);
                        };
                    }(report))
                });

                footerRow.addItem(runBtn);
                footerRow.addItem(infoBtn);

                // Assemble card
                card.addItem(headerRow);
                card.addItem(titleCtrl);
                card.addItem(descCtrl);
                if (countBadge) card.addItem(countBadge);
                card.addItem(footerRow);

                // Style the card border on after-rendering
                card.addEventDelegate({
                    onAfterRendering: function () {
                        const domRef = card.getDomRef();
                        if (domRef) {
                            domRef.style.border = "1px solid #e0e0e0";
                            domRef.style.borderRadius = "6px";
                            domRef.style.padding = "16px";
                            domRef.style.cursor = "pointer";
                            domRef.style.background = "#fff";
                            domRef.style.display = "inline-block";
                            domRef.style.verticalAlign = "top";
                        }
                    }
                });

                container.addItem(card);
            });

            // No-results strip
            const noCards = this.byId("noCardsStrip");
            if (noCards) noCards.setVisible(this._filteredCatalogue.length === 0);
        },

        // ── Category Tab Change ───────────────────────────────
        onCategoryTab: function (e) {
            const key = e.getParameter("selectedKey") || "ALL";
            const search = (function (self) {
                const sf = self.byId("reportSearch");
                return sf ? sf.getValue() : "";
            }(this));
            this._buildReportCards(key, search);
        },

        // ── Report Search ─────────────────────────────────────
        onReportSearch: function (e) {
            const value = e.getParameter("newValue") || "";
            const tabBar = this.byId("reportCategoryTabs");
            const key = tabBar ? tabBar.getSelectedKey() : "ALL";
            this._buildReportCards(key || "ALL", value);
        },

        // ── Open Report ───────────────────────────────────────
        _openReport: function (reportId) {
            const report = REPORT_CATALOGUE.filter(function (r) { return r.id === reportId; })[0];
            if (!report) return;

            this._model.setProperty("/currentReport", JSON.parse(JSON.stringify(report)));
            this._model.setProperty("/hubView", false);
            this._model.setProperty("/currentResults", []);

            // Update recently viewed
            this._recentReports = this._recentReports.filter(function (id) { return id !== reportId; });
            this._recentReports.unshift(reportId);
            if (this._recentReports.length > 3) this._recentReports = this._recentReports.slice(0, 3);
            this._updateRecentTiles();

            // Reset criteria
            this.onResetCriteria();

            // Build columns for this report
            this._setReportColumns(reportId);

            // Update results title
            const titleCtrl = this.byId("resultsCountTitle");
            if (titleCtrl) titleCtrl.setText("Results — " + report.title);

            // Hide strips
            const runStrip = this.byId("reportRunningStrip");
            if (runStrip) runStrip.setVisible(false);
            const sumStrip = this.byId("resultsSummaryStrip");
            if (sumStrip) sumStrip.setVisible(false);
        },

        // ── Back to Hub ───────────────────────────────────────
        onBackToHub: function () {
            this._model.setProperty("/hubView", true);
        },

        // ── Info Drawer ───────────────────────────────────────
        onInfoDrawerOpen: function () {
            const dlg = this.byId("infoDrawerDialog");
            if (dlg) dlg.open();
        },

        onInfoDrawerClose: function () {
            const dlg = this.byId("infoDrawerDialog");
            if (dlg) dlg.close();
        },

        _showInfoDrawer: function (reportId) {
            const report = REPORT_CATALOGUE.filter(function (r) { return r.id === reportId; })[0];
            if (!report) return;
            // Ensure current report is set for binding
            const current = this._model.getProperty("/currentReport");
            if (!current || current.id !== reportId) {
                this._model.setProperty("/currentReport", JSON.parse(JSON.stringify(report)));
            }
            const dlg = this.byId("infoDrawerDialog");
            if (dlg) dlg.open();
        },

        // ── Update Recent Tiles ───────────────────────────────
        _updateRecentTiles: function () {
            const hbox = this.byId("recentTiles");
            if (!hbox) return;
            hbox.destroyItems();
            const rowContainer = this.byId("recentRow");
            if (this._recentReports.length === 0) {
                if (rowContainer) rowContainer.setVisible(false);
                return;
            }
            if (rowContainer) rowContainer.setVisible(true);
            const self = this;
            this._recentReports.forEach(function (rid) {
                const rpt = REPORT_CATALOGUE.filter(function (r) { return r.id === rid; })[0];
                if (!rpt) return;
                const btn = new sap.m.Button({
                    text: rpt.title,
                    type: "Transparent",
                    press: (function (id) {
                        return function () { self._openReport(id); };
                    }(rid))
                }).addStyleClass("sapUiTinyMarginEnd");
                hbox.addItem(btn);
            });
        },

        // ── Run Current Report ────────────────────────────────
        onRunCurrentReport: function () {
            const report = this._model.getProperty("/currentReport");
            if (!report || !report.id) {
                MessageToast.show("No report selected.");
                return;
            }

            // Get criteria
            const criteriaDateRange = this.byId("criteriaDateRange");
            const criteriaState     = this.byId("criteriaState");
            const criteriaCondMin   = this.byId("criteriaCondMin");
            const criteriaCondMax   = this.byId("criteriaCondMax");
            const criteriaSearch    = this.byId("criteriaSearch");

            const fromDate = criteriaDateRange ? criteriaDateRange.getDateValue() : null;
            const toDate   = criteriaDateRange ? criteriaDateRange.getSecondDateValue() : null;
            const state    = criteriaState ? criteriaState.getSelectedKey() : "";
            const condMin  = criteriaCondMin ? criteriaCondMin.getValue() : "";
            const condMax  = criteriaCondMax ? criteriaCondMax.getValue() : "";
            const search   = criteriaSearch ? criteriaSearch.getValue() : "";

            const criteria = {
                fromDate : fromDate ? fromDate.toISOString().slice(0, 10) : null,
                toDate   : toDate   ? toDate.toISOString().slice(0, 10)   : null,
                state    : state    || null,
                condMin  : condMin  ? parseInt(condMin) : null,
                condMax  : condMax  ? parseInt(condMax) : null,
                search   : search   || null
            };

            // Show running strip
            const runStrip = this.byId("reportRunningStrip");
            if (runStrip) runStrip.setVisible(true);
            const sumStrip = this.byId("resultsSummaryStrip");
            if (sumStrip) sumStrip.setVisible(false);

            // Dispatch to appropriate loader
            const self = this;
            this._executeReport(report, criteria)
                .then(function (rows) {
                    self._model.setProperty("/currentResults", rows);
                    if (runStrip) runStrip.setVisible(false);
                    const titleCtrl = self.byId("resultsCountTitle");
                    if (titleCtrl) titleCtrl.setText("Results — " + report.title + " (" + rows.length + " records)");
                    if (sumStrip) {
                        sumStrip.setText(rows.length + " records returned.");
                        sumStrip.setVisible(true);
                    }
                })
                .catch(function (err) {
                    if (runStrip) runStrip.setVisible(false);
                    MessageToast.show("Report failed: " + (err.message || err));
                });
        },

        // ── Execute Report (dispatch by odataFn) ──────────────
        _executeReport: function (report, criteria) {
            const fn = report.odataFn;

            // Build a simple OData filter from criteria
            const filters = [];
            if (criteria.state) filters.push("state eq '" + criteria.state + "'");
            if (criteria.condMin != null) filters.push("conditionRating ge " + criteria.condMin);
            if (criteria.condMax != null) filters.push("conditionRating le " + criteria.condMax);
            if (criteria.search) {
                filters.push("(contains(tolower(name),'" + criteria.search.toLowerCase() + "') or contains(tolower(bridgeId),'" + criteria.search.toLowerCase() + "'))");
            }
            const filterStr = filters.length > 0 ? "&$filter=" + filters.join(" and ") : "";

            // Function-based endpoints
            if (fn === "getAssetRegister") {
                const qf = {
                    assetClass: null, state: criteria.state, region: null,
                    postingStatus: null, condition: null, conditionMin: null, conditionMax: null,
                    yearBuiltFrom: null, yearBuiltTo: null, isActive: null,
                    pageSize: 200, pageOffset: 0
                };
                const params = this._buildQsRequired(qf, ["assetClass","state","region","postingStatus","condition","conditionMin","conditionMax","yearBuiltFrom","yearBuiltTo","isActive","pageSize","pageOffset"]);
                return fetch(BASE + "/getAssetRegister(" + params + ")", _credOpts())
                    .then(function (r) { return r.json(); })
                    .then(function (j) { return j.value || []; });
            }
            if (fn === "getAssetSummary") {
                const params = this._buildQsRequired({ assetClass: null, state: criteria.state, region: null }, ["assetClass","state","region"]);
                return fetch(BASE + "/getAssetSummary(" + params + ")", _credOpts())
                    .then(function (r) { return r.json(); })
                    .then(function (j) { return j.value || []; });
            }
            if (fn === "getConditionDistribution") {
                const params = this._buildQsRequired({ assetClass: null, state: criteria.state, region: null }, ["assetClass","state","region"]);
                return fetch(BASE + "/getConditionDistribution(" + params + ")", _credOpts())
                    .then(function (r) { return r.json(); })
                    .then(function (j) { return j.value || []; });
            }
            if (fn === "getRestrictionSummary") {
                const rp = { assetClass: null, state: criteria.state, region: null, restrictionType: null, status: "ACTIVE" };
                const params = this._buildQsRequired(rp, ["assetClass","state","region","restrictionType","status"]);
                return fetch(BASE + "/getRestrictionSummary(" + params + ")", _credOpts())
                    .then(function (r) { return r.json(); })
                    .then(function (j) { return j.value || []; });
            }
            if (fn === "getInspectionStatusReport") {
                const ip = { assetClass: null, state: criteria.state, region: null, overdueOnly: false };
                const params = this._buildQsRequired(ip, ["assetClass","state","region","overdueOnly"]);
                return fetch(BASE + "/getInspectionStatusReport(" + params + ")", _credOpts())
                    .then(function (r) { return r.json(); })
                    .then(function (j) { return j.value || []; });
            }
            if (fn === "getBridgesExceedingCapacity") {
                return fetch(BASE + "/getBridgesExceedingCapacity()", _credOpts())
                    .then(function (r) { return r.json(); })
                    .then(function (j) { return j.value || []; });
            }
            if (fn === "getOverdueCapacityReviews") {
                return fetch(BASE + "/getOverdueCapacityReviews(daysOverdue=0)", _credOpts())
                    .then(function (r) { return r.json(); })
                    .then(function (j) { return j.value || []; });
            }
            if (fn === "RouteCompliance") {
                return fetch(BASE + "/RouteCompliance?$orderby=closedCount desc,criticalCount desc", _credOpts())
                    .then(function (r) { return r.json(); })
                    .then(function (j) { return (j.value || []).filter(function (r) { return r.routeCode; }); });
            }
            if (fn === "VehicleAccess") {
                return fetch(BASE + "/VehicleAccess?$orderby=bridgeName,vehicleClassName" + filterStr, _credOpts())
                    .then(function (r) { return r.json(); })
                    .then(function (j) { return j.value || []; });
            }
            if (fn === "Restrictions") {
                const stateF = criteria.state ? "&$filter=status eq 'ACTIVE' and bridge/state eq '" + criteria.state + "'" : "&$filter=status eq 'ACTIVE'";
                return fetch(BASE + "/Restrictions?$top=500" + stateF, _credOpts())
                    .then(function (r) { return r.json(); })
                    .then(function (j) { return j.value || []; });
            }
            if (fn === "BridgeDefects") {
                return fetch(BASE + "/BridgeDefects?$top=500&$orderby=severity,detectedDate desc", _credOpts())
                    .then(function (r) { return r.json(); })
                    .then(function (j) { return j.value || []; });
            }
            if (fn === "BridgeConditionHistory") {
                return fetch(BASE + "/BridgeHistory?$top=500&$orderby=changedAt desc", _credOpts())
                    .then(function (r) { return r.json(); })
                    .then(function (j) { return j.value || []; });
            }
            if (fn === "FreightRoute") {
                return fetch(BASE + "/FreightRoutes?$top=500", _credOpts())
                    .then(function (r) { return r.json(); })
                    .then(function (j) { return j.value || []; });
            }
            // Fallback: generic entity set
            return fetch(BASE + "/" + fn + "?$top=200" + filterStr, _credOpts())
                .then(function (r) { return r.json(); })
                .then(function (j) { return j.value || []; });
        },

        // ── Set Report Columns ────────────────────────────────
        _setReportColumns: function (reportId) {
            const table = this.byId("reportResultsTable");
            if (!table) return;
            // Destroy existing columns + items
            table.destroyColumns();
            table.destroyItems();

            const report = REPORT_CATALOGUE.filter(function (r) { return r.id === reportId; })[0];
            if (!report) return;

            const that = this;
            const fields = report.defaultFields || [];
            const LABELS = {
                bridgeId            : "Bridge ID",
                name                : "Name",
                bridge_ID           : "Bridge ID",
                state               : "State",
                region              : "Region",
                condition           : "Condition",
                conditionRating     : "Condition Rating",
                conditionLabel      : "Condition Label",
                conditionScore      : "Score",
                postingStatus       : "Posting Status",
                inspectionDate      : "Last Inspection",
                assetCount          : "Count",
                pct                 : "%",
                dimension           : "Dimension",
                label               : "Label",
                count               : "Count",
                assetClass          : "Asset Class",
                yearBuilt           : "Year Built",
                numberOfSpans       : "Spans",
                totalLength_m       : "Length (m)",
                grossMassLimit_t    : "GVM Limit (t)",
                activeRestrictions  : "Restrictions",
                criticality         : "Criticality",
                custodian           : "Custodian",
                bridgeName          : "Bridge Name",
                restrictionType     : "Type",
                value               : "Value",
                unit                : "Unit",
                status              : "Status",
                validFromDate       : "Valid From",
                validToDate         : "Valid To",
                permitRequired      : "Permit Req.",
                vehicleClassName    : "Vehicle Class",
                routeCode           : "Route Code",
                routeDescription    : "Route Description",
                bridgeCount         : "Bridges",
                postedCount         : "Posted",
                closedCount         : "Closed",
                criticalCount       : "Critical",
                poorCount           : "Poor",
                bridgeState         : "State",
                approvedGVM_t       : "Approved GVM (t)",
                capacityGVM_t       : "Capacity GVM (t)",
                exceedanceAmount_t  : "Exceedance (t)",
                numberOfAffectedPermits : "Permits",
                riskLevel           : "Risk Level",
                lastRatingDate      : "Last Rating Date",
                nextRatingDue       : "Next Rating Due",
                daysOverdue         : "Days Overdue",
                capacityStatus      : "Capacity Status",
                ratedBy             : "Rated By",
                orderNumber         : "Order Number",
                plannedDate         : "Planned Date",
                completedDate       : "Completed",
                inspectionType      : "Insp. Type",
                inspector           : "Inspector",
                conditionResult     : "Result",
                defectCode          : "Defect Code",
                defectCategory      : "Category",
                severity            : "Severity",
                detectedDate        : "Detected",
                reportedDate        : "Reported",
                closedDate          : "Closed Date",
                description         : "Description",
                direction           : "Direction",
                minMassLimit_t      : "Min Mass (t)",
                minHeightClearance_m: "Min Height (m)",
                minWidthClearance_m : "Min Width (m)",
                restrictionCount    : "Restrictions",
                changedAt           : "Changed At",
                previousCondition   : "Previous",
                newCondition        : "New Condition",
                changedBy           : "Changed By",
                reason              : "Reason",
                ID                  : "ID"
            };

            // Build columns
            fields.forEach(function (f) {
                const col = new sap.m.Column({
                    header: new sap.m.Text({ text: LABELS[f] || f })
                });
                table.addColumn(col);
            });

            // Build template
            const template = new sap.m.ColumnListItem({ type: "Inactive" });
            fields.forEach(function (f) {
                let cell;
                if (f === "bridgeId" || f === "bridge_ID") {
                    cell = new sap.m.Link({
                        text: "{reports>" + f + "}",
                        wrapping: false,
                        press: [that.onBridgeIdPress, that]
                    });
                } else if (f === "status" || f === "conditionRating" || f === "postingStatus" ||
                           f === "severity" || f === "riskLevel" || f === "capacityStatus") {
                    cell = new sap.m.ObjectStatus({ text: "{reports>" + f + "}" });
                } else if (f === "pct") {
                    cell = new sap.m.Text({
                        text: { path: "reports>" + f, formatter: that.formatPct }
                    });
                } else if (f === "exceedanceAmount_t") {
                    cell = new sap.m.ObjectStatus({
                        text: { path: "reports>" + f, formatter: that.formatExceedance }
                    });
                } else {
                    cell = new sap.m.Text({ text: "{reports>" + f + "}", wrapping: false });
                }
                template.addCell(cell);
            });
            table.bindItems({ path: "reports>/currentResults", template: template });
        },

        // ── Load Live Counts ──────────────────────────────────
        _loadLiveCounts: function () {
            const self = this;
            // Capacity flags
            fetch(BASE + "/getBridgesExceedingCapacity()", _credOpts())
                .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
                .then(function (j) {
                    const cnt = (j.value || []).length;
                    self._model.setProperty("/liveCounts/capacityFlags", cnt);
                })
                .catch(function (err) {
                    console.warn("[NHVR] Live count load failed (capacityFlags):", err && err.message || err);
                });

            // Overdue reviews
            fetch(BASE + "/getOverdueCapacityReviews(daysOverdue=0)", _credOpts())
                .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
                .then(function (j) {
                    const cnt = (j.value || []).length;
                    self._model.setProperty("/liveCounts/overdueCount", cnt);
                })
                .catch(function (err) {
                    console.warn("[NHVR] Live count load failed (overdueCount):", err && err.message || err);
                });
        },

        // ── Export Current Report ─────────────────────────────
        onExportCurrentReport: function () {
            const rows = this._model.getProperty("/currentResults") || [];
            if (!rows.length) { MessageToast.show("No data to export — run the report first."); return; }
            const report = this._model.getProperty("/currentReport") || {};
            const today = new Date().toISOString().slice(0, 10);
            const fileName = "NHVR_" + (report.id || "Report") + "_" + today;

            // Build column list from first row keys
            const keys = Object.keys(rows[0] || {}).filter(function (k) { return k.indexOf("_") !== 0; });
            const columns = keys.map(function (k) { return { label: k, property: k, width: 20 }; });
            ExcelExport.export({ fileName: fileName, columns: columns, data: rows });
        },

        // ── Reset Criteria ────────────────────────────────────
        onResetCriteria: function () {
            const drs = this.byId("criteriaDateRange");
            if (drs) { drs.setDateValue(null); drs.setSecondDateValue(null); }
            const st = this.byId("criteriaState");
            if (st) st.setSelectedKey("");
            const cm = this.byId("criteriaCondMin");
            if (cm) cm.setValue("");
            const cx = this.byId("criteriaCondMax");
            if (cx) cx.setValue("");
            const cs = this.byId("criteriaSearch");
            if (cs) cs.setValue("");
        },

        // ── Filter collection ─────────────────────────────────
        _getFilters: function () {
            const v = (id) => {
                const ctrl = this.byId(id);
                if (!ctrl) return "";
                if (ctrl.getSelectedKey) return ctrl.getSelectedKey() || "";
                if (ctrl.getValue)       return ctrl.getValue() || "";
                if (ctrl.getSelected)    return ctrl.getSelected();
                return "";
            };
            return {
                assetClass       : v("filterAssetClass"),
                state            : v("filterState"),
                region           : v("filterRegion"),
                condition        : v("filterCondition"),
                postingStatus    : v("filterPostingStatus"),
                criticality      : v("filterCriticality"),
                yearBuiltFrom    : parseInt(v("filterYearFrom")) || null,
                yearBuiltTo      : parseInt(v("filterYearTo"))   || null,
                restrictionType  : v("filterRestType"),
                restrictionStatus: v("filterRestStatus"),
                restrictionPermit: v("filterRestPermit"),
                restValueMin     : parseFloat(v("filterRestValueMin")) || null,
                restValueMax     : parseFloat(v("filterRestValueMax")) || null,
                restFromDate     : v("filterRestFromDate"),
                restToDate       : v("filterRestToDate"),
                restDirection    : v("filterRestDirection"),
                overdueOnly      : v("filterOverdueOnly")
            };
        },

        // ── State → Region cascade ─────────────────────────────
        onStateChanged: function (e) {
            const state = e.getParameter("selectedItem").getKey();
            const sel   = this.byId("filterRegion");
            if (!sel) return;
            while (sel.getItems().length > 0) sel.removeItem(0);
            sel.addItem(new sap.ui.core.Item({ key: "", text: "All Regions" }));
            ReferenceData.getRegions(state).forEach(function (region) {
                sel.addItem(new sap.ui.core.Item({ key: region, text: region }));
            });
            sel.setSelectedKey("");
        },

        // ── Run Report (legacy entry point) ───────────────────
        onRunReport: function () {
            UserAnalytics.trackAction("run_report", "Reports");
            this._pageOffset  = 0;
            this._currentPage = 1;
            const f = this._getFilters();
            this._runAllAnalytics(f);
        },

        _runAllAnalytics: function (f) {
            const tab = this.byId("reportsTabBar") ? this.byId("reportsTabBar").getSelectedKey() : "register";
            this._loadAssetSummary(f);
            if (tab === "register" || tab === "summary") {
                this._loadAssetRegister(f);
                this._loadConditionDist(f);
            } else if (tab === "condition") {
                this._loadConditionDist(f);
            } else if (tab === "restrictions") {
                this._loadRestrictionSummary(f);
            } else if (tab === "inspection") {
                this._loadInspectionStatus(f);
            }
            Promise.all([
                this._loadAssetRegisterP(f),
                this._loadConditionDistP(f),
                this._loadRestrictionSummaryP(f),
                this._loadInspectionStatusP(f)
            ]).catch(function (err) {
                console.warn("[NHVR] One or more report queries failed:", err && err.message || err);
                sap.m.MessageToast.show("Some data could not be loaded. Please refresh.");
            });
        },

        // ── Asset Summary → KPI strip + summary tab ───────────
        _loadAssetSummary: function (f) {
            const params = this._buildQsRequired(f, ["assetClass","state","region"]);
            fetch(`${BASE}/getAssetSummary(${params})`, _credOpts())
                .then(r => r.json())
                .then(j => {
                    const dims = j.value || [];
                    let total = 0, bridges = 0, culverts = 0, other = 0;
                    let posted = 0, closed = 0, poor = 0;
                    dims.forEach(d => {
                        if (d.dimension === "assetClass") {
                            total += (d.count || 0);
                            if (d.label === "BRIDGE")       bridges  = d.count;
                            else if (d.label === "CULVERT")  culverts = d.count;
                            else other += (d.count || 0);
                        }
                        if (d.dimension === "postingStatus") {
                            if (d.label === "POSTED") posted = d.count;
                            if (d.label === "CLOSED") closed = d.count;
                        }
                        if (d.dimension === "condition") {
                            if (d.label === "POOR" || d.label === "CRITICAL" || d.label === "FAILED") poor += (d.count || 0);
                        }
                    });
                    this._setKpi("kpiTotal",    String(total));
                    this._setKpi("kpiBridges",  String(bridges));
                    this._setKpi("kpiCulverts", String(culverts));
                    this._setKpi("kpiOther",    String(other));
                    this._setKpi("kpiPosted",   String(posted));
                    this._setKpi("kpiClosed",   String(closed));
                    this._setKpi("kpiPoor",     String(poor));

                    const byClass  = dims.filter(d => d.dimension === "assetClass");
                    const byState  = dims.filter(d => d.dimension === "state");
                    const byStatus = dims.filter(d => d.dimension === "postingStatus");
                    const byCrit   = dims.filter(d => d.dimension === "criticality");
                    this._model.setProperty("/summaryByClass",  byClass);
                    this._model.setProperty("/summaryByState",  byState);
                    this._model.setProperty("/summaryByStatus", byStatus);
                    this._model.setProperty("/summaryByCrit",   byCrit);
                })
                .catch(function (err) {
                    console.warn("[NHVR] getAssetSummary failed:", err && err.message || err);
                    sap.m.MessageToast.show("Some data could not be loaded. Please refresh.");
                });

            const stateFilter = f.state ? `&$filter=status eq 'ACTIVE'${f.state ? " and bridge/state eq '" + f.state + "'" : ""}` : "&$filter=status eq 'ACTIVE'";
            fetch(`${BASE}/Restrictions?$count=true&$top=0${stateFilter}`, _credOpts())
                .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
                .then(j => this._setKpi("kpiRestrictions", String(j["@odata.count"] || 0)))
                .catch(function (err) {
                    console.warn("[NHVR] KPI restriction count failed:", err && err.message || err);
                });
        },

        _setKpi: function (id, val) {
            const ctrl = this.byId(id);
            if (ctrl) ctrl.setText(val);
        },

        // ── Asset Register (paginated) ─────────────────────────
        _loadAssetRegister: function (f) {
            this._model.setProperty("/loadingRegister", true);
            this._loadAssetRegisterP(f).then(() => {
                this._model.setProperty("/loadingRegister", false);
            }).catch(function (err) {
                this._model.setProperty("/loadingRegister", false);
                console.warn("[NHVR] Asset register load failed:", err && err.message || err);
                sap.m.MessageToast.show("Some data could not be loaded. Please refresh.");
            }.bind(this));
        },

        _loadAssetRegisterP: function (f) {
            const qf = {
                assetClass   : f.assetClass    || null,
                state        : f.state         || null,
                region       : f.region        || null,
                postingStatus: f.postingStatus || null,
                condition    : f.condition     || null,
                conditionMin : f.conditionMin  || null,
                conditionMax : f.conditionMax  || null,
                yearBuiltFrom: f.yearBuiltFrom || null,
                yearBuiltTo  : f.yearBuiltTo   || null,
                isActive     : null,
                pageSize     : this._pageSize,
                pageOffset   : this._pageOffset
            };
            const params = this._buildQsRequired(qf,
                ["assetClass","state","region","postingStatus","condition",
                 "conditionMin","conditionMax","yearBuiltFrom","yearBuiltTo",
                 "isActive","pageSize","pageOffset"]);
            return fetch(`${BASE}/getAssetRegister(${params})`, _credOpts())
                .then(r => r.json())
                .then(j => {
                    const rows = j.value || [];
                    this._totalCount = rows.length > 0 ? (rows[0]._totalCount || rows.length) : 0;
                    this._model.setProperty("/register", rows);
                    this._updatePagination();
                    const lbl = this.byId("registerCountLabel");
                    if (lbl) {
                        lbl.setText(`Showing ${this._pageOffset + 1}–${Math.min(this._pageOffset + rows.length, this._totalCount || 9999)} of ${this._totalCount || rows.length} assets.`);
                    }
                });
        },

        _updatePagination: function () {
            const hasPrev = this._pageOffset > 0;
            const hasNext = (this._pageOffset + this._pageSize) < (this._totalCount || 9999);
            const pageText = `Page ${this._currentPage}`;
            ["btnPrevPage","btnPrevPage2"].forEach(id => {
                const b = this.byId(id); if (b) b.setEnabled(hasPrev);
            });
            ["btnNextPage","btnNextPage2"].forEach(id => {
                const b = this.byId(id); if (b) b.setEnabled(hasNext);
            });
            ["pageLabel","pageLabel2"].forEach(id => {
                const t = this.byId(id); if (t) t.setText(pageText);
            });
        },

        onNextPage: function () {
            this._pageOffset  += this._pageSize;
            this._currentPage += 1;
            this._loadAssetRegister(this._getFilters());
        },

        onPrevPage: function () {
            this._pageOffset  = Math.max(0, this._pageOffset - this._pageSize);
            this._currentPage = Math.max(1, this._currentPage - 1);
            this._loadAssetRegister(this._getFilters());
        },

        onPageSizeChange: function (e) {
            this._pageSize    = parseInt(e.getParameter("selectedItem").getKey());
            this._pageOffset  = 0;
            this._currentPage = 1;
            this._loadAssetRegister(this._getFilters());
        },

        // ── Condition Distribution ─────────────────────────────
        _loadConditionDist: function (f) {
            this._model.setProperty("/loadingCondition", true);
            this._loadConditionDistP(f).then(() => {
                this._model.setProperty("/loadingCondition", false);
            }).catch(function (err) {
                this._model.setProperty("/loadingCondition", false);
                console.warn("[NHVR] Condition distribution load failed:", err && err.message || err);
                sap.m.MessageToast.show("Some data could not be loaded. Please refresh.");
            }.bind(this));
        },

        _loadConditionDistP: function (f) {
            const params = this._buildQsRequired(f, ["assetClass","state","region"]);
            return fetch(`${BASE}/getConditionDistribution(${params})`, _credOpts())
                .then(r => r.json())
                .then(j => {
                    this._model.setProperty("/conditionDist", j.value || []);
                });
        },

        // ── Restriction Summary ────────────────────────────────
        _loadRestrictionSummary: function (f) {
            this._model.setProperty("/loadingRestrictions", true);
            this._loadRestrictionSummaryP(f).then(() => {
                this._model.setProperty("/loadingRestrictions", false);
            }).catch(function (err) {
                this._model.setProperty("/loadingRestrictions", false);
                console.warn("[NHVR] Restriction summary load failed:", err && err.message || err);
                sap.m.MessageToast.show("Some data could not be loaded. Please refresh.");
            }.bind(this));
        },

        _loadRestrictionSummaryP: function (f) {
            const rp = { assetClass: f.assetClass, state: f.state, region: f.region,
                         restrictionType: f.restrictionType, status: f.restrictionStatus };
            const params = this._buildQsRequired(rp,
                ["assetClass","state","region","restrictionType","status"]);
            return fetch(`${BASE}/getRestrictionSummary(${params})`, _credOpts())
                .then(r => r.json())
                .then(j => {
                    let rows = j.value || [];
                    if (f.restrictionPermit === "true")  rows = rows.filter(r => r.permitRequired === true);
                    if (f.restrictionPermit === "false") rows = rows.filter(r => !r.permitRequired);
                    if (f.restValueMin != null)  rows = rows.filter(r => parseFloat(r.value) >= f.restValueMin);
                    if (f.restValueMax != null)  rows = rows.filter(r => parseFloat(r.value) <= f.restValueMax);
                    if (f.restFromDate)  rows = rows.filter(r => !r.validFromDate || r.validFromDate >= f.restFromDate);
                    if (f.restToDate)    rows = rows.filter(r => !r.validToDate   || r.validToDate   <= f.restToDate);
                    if (f.restDirection) rows = rows.filter(r => r.direction === f.restDirection);
                    this._model.setProperty("/restrictions", rows);
                });
        },

        // ── Inspection Status ──────────────────────────────────
        _loadInspectionStatus: function (f) {
            this._model.setProperty("/loadingInspections", true);
            this._loadInspectionStatusP(f).then(() => {
                this._model.setProperty("/loadingInspections", false);
            }).catch(function (err) {
                this._model.setProperty("/loadingInspections", false);
                console.warn("[NHVR] Inspection status load failed:", err && err.message || err);
                sap.m.MessageToast.show("Some data could not be loaded. Please refresh.");
            }.bind(this));
        },

        _loadInspectionStatusP: function (f) {
            const params = this._buildQsRequired(f, ["assetClass","state","region","overdueOnly"]);
            return fetch(`${BASE}/getInspectionStatusReport(${params})`, _credOpts())
                .then(r => r.json())
                .then(j => {
                    this._model.setProperty("/inspections", j.value || []);
                });
        },

        // ── OData function param builders ──────────────────────
        _buildQs: function (f, keys) {
            const parts = [];
            keys.forEach(k => {
                const v = f[k];
                if (v === null || v === undefined || v === "") return;
                if (typeof v === "string")  parts.push(`${k}='${v}'`);
                else if (typeof v === "boolean") parts.push(`${k}=${v}`);
                else parts.push(`${k}=${v}`);
            });
            return parts.join(",") || "";
        },

        _buildQsRequired: function (f, keys) {
            const parts = keys.map(k => {
                const v = f[k];
                if (v === null || v === undefined || v === "") return `${k}=null`;
                if (typeof v === "string")  return `${k}='${v}'`;
                if (typeof v === "boolean") return `${k}=${v}`;
                return `${k}=${v}`;
            });
            return parts.join(",");
        },

        // ── Bridge ID / Name hyperlink handler ─────────────────
        onBridgeIdPress: function (e) {
            const ctx  = e.getSource().getBindingContext("reports");
            const obj  = ctx ? ctx.getObject() : null;
            if (!obj) return;
            const bid  = obj.bridgeId || obj.ID;
            if (!bid) return;
            sap.ui.core.UIComponent.getRouterFor(this).navTo("BridgeDetail", { bridgeId: encodeURIComponent(bid) });
        },

        // ── Clear Filters ──────────────────────────────────────
        onClearFilters: function () {
            ["filterAssetClass","filterState","filterCondition","filterPostingStatus",
             "filterCriticality","filterRestType","filterRestStatus",
             "filterRestPermit","filterRestDirection","filterRegion"].forEach(id => {
                const s = this.byId(id); if (s && s.setSelectedKey) s.setSelectedKey("");
            });
            ["filterYearFrom","filterYearTo","filterRestValueMin","filterRestValueMax"].forEach(id => {
                const i = this.byId(id); if (i && i.setValue) i.setValue("");
            });
            ["filterRestFromDate","filterRestToDate"].forEach(id => {
                const d = this.byId(id); if (d) d.setValue("");
            });
            const cb = this.byId("filterOverdueOnly");
            if (cb) cb.setSelected(false);
            const reg = this.byId("filterRegion");
            if (reg) { while (reg.getItems().length > 1) reg.removeItem(1); reg.setSelectedKey(""); }
            MessageToast.show("Filters cleared — click Run Report to refresh data.");
        },

        // ── Tab-aware load on demand ───────────────────────────
        onTabSelect: function (e) {
            try {
                const key = e.getParameter("selectedKey") ||
                    (e.getSource && e.getSource().getSelectedKey && e.getSource().getSelectedKey());
                if (key) localStorage.setItem("nhvr.reports.tab", key);

                const f = this._getFilters();
                if (key === "register"    && !this._model.getProperty("/register").length)     { this._loadAssetRegister(f); }
                if (key === "condition"   && !this._model.getProperty("/conditionDist").length) { this._loadConditionDist(f); }
                if (key === "restrictions"&& !this._model.getProperty("/restrictions").length)  { this._loadRestrictionSummary(f); }
                if (key === "inspection"  && !this._model.getProperty("/inspections").length)   { this._loadInspectionStatus(f); }
                if (key === "capacity"    && !this._model.getProperty("/capacityExceedances").length) { this._loadCapacityExceedances(); }
                if (key === "route"       && !this._model.getProperty("/route").length)         { this._loadRouteCompliance(); }
                if (key === "vehicle"     && !this._model.getProperty("/vehicle").length)       { this._loadVehicleAccess(); }
            } catch (err) { jQuery.sap.log.error("[NHVR] Tab select failed", err && err.message || String(err)); }
        },

        // ── Route Compliance ───────────────────────────────────
        _loadRouteCompliance: function () {
            fetch(`${BASE}/RouteCompliance?$orderby=closedCount desc,criticalCount desc`, _credOpts())
                .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
                .then(j => {
                    const rows = (j.value || []).filter(r => r.routeCode);
                    rows.forEach(r => { r.riskBadge = this._riskBadge(r); });
                    this._model.setProperty("/route", rows);
                })
                .catch(function (err) {
                    console.warn("[NHVR] RouteCompliance load failed:", err && err.message || err);
                    sap.m.MessageToast.show("Some data could not be loaded. Please refresh.");
                });
        },

        _riskBadge: function (r) {
            let cls, label;
            if ((r.closedCount || 0) > 0 || (r.criticalCount || 0) > 0) { cls = "no";   label = "HIGH"; }
            else if ((r.postedCount || 0) > 0 || (r.poorCount || 0) > 0){ cls = "warn"; label = "MEDIUM"; }
            else                                                           { cls = "ok";   label = "LOW"; }
            return `<span class='nhvrMatrixBadge ${cls}'>${label}</span>`;
        },

        onRouteRowPress: function (e) {
            const r = e.getSource().getBindingContext("reports").getObject();
            MessageToast.show(`Route ${r.routeCode}: ${r.bridgeCount} bridges, ${r.postedCount || 0} posted, ${r.closedCount || 0} closed`);
        },

        // ── Vehicle Access ─────────────────────────────────────
        _loadVehicleAccess: function () {
            fetch(`${BASE}/VehicleAccess?$orderby=bridgeName,vehicleClassName`, _credOpts())
                .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
                .then(j => {
                    this._vehicleData = j.value || [];
                    this._model.setProperty("/vehicle", this._vehicleData);
                    this._populateBridgeFilter(this._vehicleData);
                })
                .catch(function (err) {
                    console.warn("[NHVR] VehicleAccess load failed:", err && err.message || err);
                    sap.m.MessageToast.show("Some data could not be loaded. Please refresh.");
                });
        },

        _populateBridgeFilter: function (data) {
            const select = this.byId("vehicleFilterBridge");
            if (!select) return;
            while (select.getItems().length > 1) select.removeItem(1);
            const bridges = [...new Set(data.map(d => d.bridgeName).filter(Boolean))].sort();
            bridges.forEach(b => select.addItem(new sap.ui.core.Item({ key: b, text: b })));
        },

        onVehicleBridgeFilter: function (e) {
            this._applyVehicleFilter(e.getParameter("selectedItem").getKey(),
                this.byId("vehicleFilterType").getSelectedKey());
        },
        onVehicleTypeFilter: function (e) {
            this._applyVehicleFilter(this.byId("vehicleFilterBridge").getSelectedKey(),
                e.getParameter("selectedItem").getKey());
        },
        _applyVehicleFilter: function (bridge, type) {
            let data = this._vehicleData;
            if (bridge && bridge !== "ALL") data = data.filter(d => d.bridgeName === bridge);
            if (type   && type   !== "ALL") data = data.filter(d => d.restrictionType === type);
            this._model.setProperty("/vehicle", data);
        },

        // ── Capacity Reports ───────────────────────────────────
        onRefreshCapacityExceedances: function () { this._loadCapacityExceedances(); },
        _loadCapacityExceedances: function () {
            this._model.setProperty("/loadingCapacity", true);
            fetch(`${BASE}/getBridgesExceedingCapacity()`, _credOpts())
                .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
                .then(j => {
                    this._model.setProperty("/capacityExceedances", j.value || []);
                    this._model.setProperty("/loadingCapacity", false);
                })
                .catch(function (err) {
                    this._model.setProperty("/loadingCapacity", false);
                    console.warn("[NHVR] Capacity exceedances load failed:", err && err.message || err);
                    sap.m.MessageToast.show("Some data could not be loaded. Please refresh.");
                }.bind(this));
        },

        onCapacityExceedRowPress: function (e) {
            const row = e.getSource().getBindingContext("reports").getObject();
            MessageToast.show(`${row.bridgeName}: Exceedance of ${row.exceedanceAmount_t}t. ${row.numberOfAffectedPermits} permit(s) affected.`);
        },

        onRefreshOverdueReviews: function () { this._loadOverdueReviews(); },
        _loadOverdueReviews: function () {
            const days = parseInt((this.byId("overdueThresholdInput") || {getValue: ()=>"0"}).getValue() || "0");
            this._model.setProperty("/loadingOverdue", true);
            fetch(`${BASE}/getOverdueCapacityReviews(daysOverdue=${days})`, _credOpts())
                .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
                .then(j => {
                    this._model.setProperty("/overdueReviews", j.value || []);
                    this._model.setProperty("/loadingOverdue", false);
                })
                .catch(function (err) {
                    this._model.setProperty("/loadingOverdue", false);
                    console.warn("[NHVR] Overdue reviews load failed:", err && err.message || err);
                    sap.m.MessageToast.show("Some data could not be loaded. Please refresh.");
                }.bind(this));
        },

        // ── Bridge link navigation ─────────────────────────────
        onBridgeLinkPress: function (e) {
            const ctx = e.getSource().getBindingContext("reports");
            if (!ctx) return;
            const row = ctx.getObject();
            const bid = row.bridgeId || row.ID || row.bridge_ID;
            if (bid) {
                this.getOwnerComponent().getRouter().navTo("BridgeDetail", { bridgeId: encodeURIComponent(bid) });
            }
        },
        onBridgeLinkFromRestriction: function (e) { this.onBridgeLinkPress(e); },
        onBridgeLinkFromInspection : function (e) { this.onBridgeLinkPress(e); },

        // ── Export CSV (legacy tabs) ───────────────────────────
        onExportCSV: function () {
            const tab = this.byId("reportsTabBar") ? this.byId("reportsTabBar").getSelectedKey() : "register";
            const today = new Date().toISOString().slice(0, 10);
            const tabMap = {
                register    : { data: "/register",      fileName: "NHVR_AssetRegister_" + today,      columns: ExcelExport.BridgeColumns },
                condition   : { data: "/conditionDist", fileName: "NHVR_ConditionDist_" + today,      columns: [
                    { label: "Rating",     property: "conditionRating", width: 10 },
                    { label: "Label",      property: "conditionLabel",  width: 20 },
                    { label: "Count",      property: "assetCount",      width: 10, type: "Edm.Int32" },
                    { label: "% of Total", property: "pct",             width: 12, type: "Edm.Decimal", scale: 1 }
                ]},
                restrictions: { data: "/restrictions",  fileName: "NHVR_RestrictionSummary_" + today, columns: ExcelExport.RestrictionColumns },
                inspection  : { data: "/inspections",   fileName: "NHVR_InspectionStatus_" + today,   columns: ExcelExport.InspectionColumns }
            };
            const cfg = tabMap[tab];
            if (!cfg) { MessageToast.show("Export not available for this tab."); return; }
            const rows = this._model.getProperty(cfg.data) || [];
            if (!rows.length) { MessageToast.show("No data to export — run a report first."); return; }
            ExcelExport.export({ fileName: cfg.fileName, columns: cfg.columns, data: rows });
        },

        // ── Formatters ─────────────────────────────────────────
        formatPct: function (v) {
            if (v === null || v === undefined) return "";
            return parseFloat(v).toFixed(1) + "%";
        },
        formatExceedance: function (v) {
            if (!v) return "—";
            return parseFloat(v).toFixed(2) + " t";
        },
        formatExceedanceState: function (v) {
            if (!v) return "None";
            return parseFloat(v) > 10 ? "Error" : "Warning";
        },
        formatRiskBadge: function (s) {
            if (!s) return "";
            const cls = s === "HIGH" || s === "CRITICAL" ? "no" : s === "MEDIUM" ? "warn" : "ok";
            return `<span class='nhvrMatrixBadge ${cls}'>${s}</span>`;
        },

        // ── Navigation ─────────────────────────────────────────
        onNavHome: function () {
            this.getOwnerComponent().getRouter().navTo("Home");
        },

        // ── v3 Report Loaders ──────────────────────────────────
        onLoadPortfolioReport: function () {
            const url = `${BASE}/BridgePortfolioReport?$top=500`;
            this._model.setProperty("/portfolioReport", []);
            fetch(url, _credOpts())
                .then(r => r.json())
                .then(d => { this._model.setProperty("/portfolioReport", d.value || []); })
                .catch(e => { sap.m.MessageToast.show("Portfolio report failed: " + e.message); });
        },

        onExportPortfolioCSV: function () {
            ExcelExport.export({ fileName: "NHVR_BridgePortfolioReport_" + new Date().toISOString().slice(0,10), columns: ExcelExport.BridgeColumns, data: this._model.getProperty("/portfolioReport") || [] });
        },

        onLoadSafetyReport: function () {
            const url = `${BASE}/BridgeSafetyReport?$top=500`;
            this._model.setProperty("/safetyReport", []);
            fetch(url, _credOpts())
                .then(r => r.json())
                .then(d => { this._model.setProperty("/safetyReport", d.value || []); })
                .catch(e => { sap.m.MessageToast.show("Safety report failed: " + e.message); });
        },

        onExportSafetyCSV: function () {
            ExcelExport.export({ fileName: "NHVR_BridgeSafetyReport_" + new Date().toISOString().slice(0,10), columns: ExcelExport.BridgeColumns, data: this._model.getProperty("/safetyReport") || [] });
        },

        onLoadInvestmentReport: function () {
            const url = `${BASE}/BridgeInvestmentReport?$top=500`;
            this._model.setProperty("/investmentReport", []);
            fetch(url, _credOpts())
                .then(r => r.json())
                .then(d => { this._model.setProperty("/investmentReport", d.value || []); })
                .catch(e => { sap.m.MessageToast.show("Investment report failed: " + e.message); });
        },

        onExportInvestmentCSV: function () {
            ExcelExport.export({ fileName: "NHVR_BridgeInvestmentReport_" + new Date().toISOString().slice(0,10), columns: ExcelExport.BridgeColumns, data: this._model.getProperty("/investmentReport") || [] });
        },

        onLoadNHVRRouteReport: function () {
            const url = `${BASE}/NHVRRouteReport?$top=500`;
            this._model.setProperty("/nhvrRouteReport", []);
            fetch(url, _credOpts())
                .then(r => r.json())
                .then(d => { this._model.setProperty("/nhvrRouteReport", d.value || []); })
                .catch(e => { sap.m.MessageToast.show("NHVR route report failed: " + e.message); });
        },

        onExportNHVRRouteCSV: function () {
            ExcelExport.export({ fileName: "NHVR_NHVRRouteReport_" + new Date().toISOString().slice(0,10), columns: ExcelExport.RestrictionColumns, data: this._model.getProperty("/nhvrRouteReport") || [] });
        },

        // ── Info Popover ───────────────────────────────────────
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

        onInfoPressReports: function (oEvent) {
            this._showInfoPopover(
                oEvent.getSource(),
                "Reports & Analytics — Guide",
                "Use the Reports Hub to browse and launch any of the 15 built-in reports.\n\n" +
                "Hub View:\n" +
                "• Browse report cards by category using the tabs at the top.\n" +
                "• Use the search bar to filter by name or description.\n" +
                "• Click ▶ Run on any card to open the report with selection criteria.\n" +
                "• Click ⓘ on any card to read about data sources and logic.\n\n" +
                "Report Output View:\n" +
                "• Configure selection criteria (date range, state, condition band, search term).\n" +
                "• Click ▶ Run Report to fetch live data from the server.\n" +
                "• Export results to CSV using the Export button.\n" +
                "• Use the ← Reports Hub button to return to the catalogue.\n\n" +
                "Legacy Tabs (scrolled below):\n" +
                "Asset Register, Condition, Restrictions, Inspection, Summary, Route Compliance, Vehicle Access, Capacity Reports, Portfolio, Safety, Investment, NHVR Route Compliance."
            );
        },

        onRefresh: function () {
            this._buildReportCards("ALL", "");
            this._loadLiveCounts();
        },

        onNavToAnnualReport: function () {
            this.getOwnerComponent().getRouter().navTo("AnnualConditionReport");
        },

        onNavToMap: function () {
            this.getOwnerComponent().getRouter().navTo("MapView");
        },

        onNavToRoutePlanner: function () {
            this.getOwnerComponent().getRouter().navTo("RoutePlanner");
        },

        onNavToPermitRegister: function () {
            this.getOwnerComponent().getRouter().navTo("PermitRegisterReport");
        }
    });
});
