// ============================================================
// NHVR Home / Launchpad Controller — Role-Adaptive
// ============================================================
sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/StandardListItem",
    "sap/m/CustomListItem",
    "sap/m/Button",
    "sap/m/HBox",
    "sap/m/Text",
    "sap/ui/core/Icon",
    "sap/m/MessageToast",
    "nhvr/bridgemanagement/model/RoleManager",
    "nhvr/bridgemanagement/model/CapabilityManager",
    "nhvr/bridgemanagement/model/AppConfig",
    "nhvr/bridgemanagement/util/OfflineSync",
    "nhvr/bridgemanagement/util/HelpAssistantMixin",
    "nhvr/bridgemanagement/util/UserAnalytics",
    "nhvr/bridgemanagement/util/NamedViews"
], function (Controller, JSONModel, StandardListItem, CustomListItem, Button, HBox, Text, Icon, MessageToast, RoleManager, CapabilityManager, AppConfig, OfflineSync, HelpAssistantMixin, UserAnalytics, NamedViews) {
    "use strict";

    const BASE = "/bridge-management";

    return Controller.extend("nhvr.bridgemanagement.controller.Home", Object.assign({

        onInit: function () {
            UserAnalytics.trackView("Home");
            this._loadUserInfo();
            this._loadKpis();
            this._loadRecentRestrictions();
            this._loadMySavedViews();
            this._initHelpAssistant("home");
            this._loadVersionInfo();

            // Initialize home model (KPI loading state + misc flags)
            var oHomeModel = new JSONModel({ kpiLoading: false });
            this.getView().setModel(oHomeModel, "home");

            // Initialize UI model for ShellBar bindings
            var oUiModel = new JSONModel({
                userInitials : "US",
                userName     : "Loading…",
                appSubtitle  : new Date().toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
            });
            this.getView().setModel(oUiModel, "ui");

            // Load role config + capability + app mode, then apply all to home
            RoleManager.loadConfig()
                .then(() => CapabilityManager.load())
                .then(() => AppConfig.init())
                .then(() => {
                    this._applyRoleToHome();
                    this._applyCapabilitiesToHome();
                    this._applyLiteMode();
                });


            // ── P05: Offline resilience init ──────────────────────────────
            OfflineSync.init();
            OfflineSync.onStatusChange(this._onNetworkChange.bind(this));
            const banner = this.byId("offlineBanner");
            if (banner) banner.setVisible(!OfflineSync.isOnline());
        },

        onExit: function () {
            // Destroy cached popovers
            if (this._oInfoPopover) { this._oInfoPopover.destroy(); this._oInfoPopover = null; }
            // Clear any timers
            if (this._refreshTimer)  { clearTimeout(this._refreshTimer);  this._refreshTimer  = null; }
            if (this._pollInterval)  { clearInterval(this._pollInterval); this._pollInterval  = null; }
        },

        // ── App Version & Environment Display ─────────────────────
        _loadVersionInfo: function () {
            try {
                var manifest = this.getOwnerComponent().getManifestEntry("sap.app");
                var version  = (manifest && manifest.applicationVersion && manifest.applicationVersion.version) || "–";
                var env      = this._detectEnvironment();
                var vBadge   = this.byId("appVersionBadge");
                var eBadge   = this.byId("appEnvBadge");
                if (vBadge) vBadge.setText("v" + version);
                var oUiModel = this.getView().getModel("ui");
                if (oUiModel) oUiModel.setProperty("/appSubtitle", "v" + version + " · " + env + " | National Heavy Vehicle Regulator");
                if (eBadge) {
                    eBadge.setText(env);
                    eBadge.removeStyleClass("nhvrEnvLocal nhvrEnvDev nhvrEnvQA nhvrEnvPreProd nhvrEnvProd");
                    if      (env === "LOCAL")    eBadge.addStyleClass("nhvrEnvLocal");
                    else if (env === "DEV")      eBadge.addStyleClass("nhvrEnvDev");
                    else if (env === "QA")       eBadge.addStyleClass("nhvrEnvQA");
                    else if (env === "PRE-PROD") eBadge.addStyleClass("nhvrEnvPreProd");
                    else                         eBadge.addStyleClass("nhvrEnvProd");
                }
            } catch (e) { /* non-critical — version badge is cosmetic */ }
        },

        _detectEnvironment: function () {
            var host = (window.location.hostname || "").toLowerCase();
            if (host === "localhost" || host === "127.0.0.1" || host === "") return "LOCAL";
            if (host.includes("us10-001") || host.includes("-dev-") || host.includes(".dev.")) return "DEV";
            if (host.includes("-qa-")   || host.includes(".qa.")  || host.includes("-qa."))  return "QA";
            if (host.includes("preprod")|| host.includes("pre-prod") || host.includes("staging")) return "PRE-PROD";
            return "PROD";
        },

        _onNetworkChange: function (isOnline) {
            const banner = this.byId("offlineBanner");
            if (banner) banner.setVisible(!isOnline);
            MessageToast.show(isOnline ? "Connection restored — pending changes are syncing" : "You are offline");
        },

        // ── Load current user info and adapt UI to role ───────────────
        _loadUserInfo: function () {
            const h = { Accept: "application/json" };

            fetch(`${BASE}/me()`, { headers: h })
                .then(r => r.json())
                .then(info => {
                    const roles   = info.roles || [];
                    const isAdmin = roles.some(r => r === "Admin" || r === "NHVR_Admin" || r === "admin");
                    this._isAdmin = isAdmin; // stored for use in _applyCapabilitiesToHome
                    const isMgr   = isAdmin || roles.some(r => r === "BridgeManager" || r === "NHVR_BridgeManager");

                    // Show role badge
                    const chip = this.byId("roleChip");
                    if (chip) {
                        const label = isAdmin ? "Admin"
                                    : isMgr  ? "Bridge Manager"
                                    : "Viewer";
                        chip.setText(label);
                        chip.removeStyleClass("nhvrRoleBadgeAdmin");
                        chip.removeStyleClass("nhvrRoleBadgeMgr");
                        chip.removeStyleClass("nhvrRoleBadgeViewer");
                        chip.addStyleClass(isAdmin ? "nhvrRoleBadgeAdmin" : isMgr ? "nhvrRoleBadgeMgr" : "nhvrRoleBadgeViewer");
                    }

                    // Update ShellBar Avatar initials
                    var oUiModel = this.getView().getModel("ui");
                    if (oUiModel) {
                        var sName = info.name || info.id || "";
                        var parts = sName.trim().split(" ");
                        var initials = parts.length >= 2
                            ? (parts[0][0] + parts[parts.length-1][0]).toUpperCase()
                            : sName.slice(0,2).toUpperCase();
                        oUiModel.setProperty("/userInitials", initials || "US");
                        oUiModel.setProperty("/userName", sName || "User");
                    }

                    // Show admin sections based on role
                    const isTechAdmin = isAdmin || roles.some(r => r === "TechAdmin" || r === "NHVR_TechAdmin");
                    const adminSection = this.byId("sectionAdmin");
                    if (adminSection) adminSection.setVisible(isAdmin);
                    const techSection  = this.byId("sectionTechAdmin");
                    if (techSection)  techSection.setVisible(isTechAdmin);
                })
                .catch(() => {
                    // me() failed — default to showing Viewer access
                    const chip = this.byId("roleChip");
                    if (chip) { chip.setText("Viewer"); chip.addStyleClass("nhvrRoleBadgeViewer"); }
                });
        },

        // ── Load KPI counts ───────────────────────────────────────
        _loadKpis: function () {
            const h = { Accept: "application/json" };

            // Show loading spinner on KPI tile container
            const oHomeModel = this.getView().getModel("home");
            if (oHomeModel) oHomeModel.setProperty("/kpiLoading", true);

            const _kpiErr = (id) => (err) => {
                console.warn(`[NHVR] KPI load failed for '${id}':`, err);
                this._setValue(id, "—");
            };

            const today = new Date().toISOString().slice(0, 10);
            const in30  = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);

            const p1 = fetch(`${BASE}/Bridges?$count=true&$top=0`, { headers: h })
                .then(r => r.json())
                .then(j => this._setValue("homeTotalBridges", j["@odata.count"] ?? "—"))
                .catch(_kpiErr("homeTotalBridges"));

            const p2 = fetch(`${BASE}/Restrictions?$count=true&$top=0&$filter=status eq 'ACTIVE'`, { headers: h })
                .then(r => r.json())
                .then(j => this._setValue("homeActiveRestrictions", j["@odata.count"] ?? "—"))
                .catch(_kpiErr("homeActiveRestrictions"));

            const p3 = fetch(`${BASE}/Bridges?$count=true&$top=0&$filter=postingStatus eq 'CLOSED'`, { headers: h })
                .then(r => r.json())
                .then(j => this._setValue("homeClosedBridges", j["@odata.count"] ?? "—"))
                .catch(_kpiErr("homeClosedBridges"));

            // Permit-required restrictions — skip if PERMITS capability disabled
            const p4 = CapabilityManager.canView("PERMITS")
                ? fetch(`${BASE}/Restrictions?$count=true&$top=0&$filter=status eq 'ACTIVE' and permitRequired eq true`, { headers: h })
                    .then(r => r.json())
                    .then(j => this._setValue("homePermitRequired", j["@odata.count"] ?? "—"))
                    .catch(_kpiErr("homePermitRequired"))
                : Promise.resolve();

            // Open defects (status != CLOSED) — skip if DEFECTS capability disabled
            const p5 = CapabilityManager.canView("DEFECTS")
                ? fetch(`${BASE}/BridgeDefects?$count=true&$top=0&$filter=status ne 'CLOSED'`, { headers: h })
                    .then(r => r.json())
                    .then(j => this._setValue("homeOpenDefects", j["@odata.count"] ?? "—"))
                    .catch(_kpiErr("homeOpenDefects"))
                : Promise.resolve();

            // Overdue inspections — skip if INSPECTIONS capability disabled
            const p6 = CapabilityManager.canView("INSPECTIONS")
                ? fetch(`${BASE}/InspectionOrders?$count=true&$top=0&$filter=status ne 'COMPLETED' and status ne 'CANCELLED' and nextInspectionDue lt ${today}`, { headers: h })
                    .then(r => r.json())
                    .then(j => {
                        const count = j["@odata.count"] ?? 0;
                        this._setValue("homeOverdueInspections", count);
                        const strip = this.byId("overdueInspStrip");
                        if (strip && count > 0) {
                            strip.setText(`${count} inspection order${count > 1 ? "s are" : " is"} overdue — review required.`);
                            strip.setVisible(true);
                        }
                    })
                    .catch(_kpiErr("homeOverdueInspections"))
                : Promise.resolve();

            // Restrictions expiring in the next 30 days
            const p7 = fetch(`${BASE}/Restrictions?$count=true&$top=0&$filter=status eq 'ACTIVE' and validToDate le ${in30}`, { headers: h })
                .then(r => r.json())
                .then(j => {
                    const count = j["@odata.count"] ?? 0;
                    const strip = this.byId("expiringRestrictStrip");
                    if (strip && count > 0) {
                        strip.setText(`${count} active restriction${count > 1 ? "s expire" : " expires"} within 30 days — check validity.`);
                        strip.setVisible(true);
                    }
                })
                .catch(function (err) {
                    // KPI fetch failure is non-fatal; show dash instead of throwing
                    console.warn("[NHVR Home] KPI fetch failed:", err && err.message);
                });

            // Clear loading state once all KPI requests have settled (success or error)
            Promise.allSettled([p1, p2, p3, p4, p5, p6, p7]).then(function () {
                if (oHomeModel) oHomeModel.setProperty("/kpiLoading", false);
            });

            // Condition distribution (GOOD / FAIR / POOR / CRITICAL)
            this._loadConditionDistribution(h);
        },

        _loadConditionDistribution: function (h) {
            const conditions = ["GOOD","FAIR","POOR","CRITICAL"];
            const ids        = { GOOD: "condGoodCount", FAIR: "condFairCount", POOR: "condPoorCount", CRITICAL: "condCritCount" };

            Promise.all(conditions.map(c =>
                fetch(`${BASE}/Bridges?$count=true&$top=0&$filter=condition eq '${c}'`, { headers: h })
                    .then(r => r.json())
                    .then(j => ({ cond: c, count: j["@odata.count"] || 0 }))
                    .catch(() => ({ cond: c, count: 0 }))
            )).then(results => {
                const total = results.reduce((s, r) => s + r.count, 0);
                if (total === 0) return;

                results.forEach(r => {
                    const ctrl = this.byId(ids[r.cond]);
                    if (ctrl) ctrl.setText(String(r.count));
                });

                // Build the stacked bar
                const bar = this.byId("condDistBar");
                if (bar) {
                    bar.destroyItems();
                    results.forEach(r => {
                        if (r.count === 0) return;
                        const pct = (r.count / total * 100).toFixed(1);
                        bar.addItem(new sap.m.HBox({
                            width : pct + "%",
                            tooltip: `${r.cond}: ${r.count} (${pct}%)`
                        }).addStyleClass("nhvrCondSegment").addStyleClass("nhvrCondSeg" + r.cond.charAt(0) + r.cond.slice(1).toLowerCase()));
                    });
                }

                this.byId("conditionDistBox") && this.byId("conditionDistBox").setVisible(true);
            });
        },

        _setValue: function (id, val) {
            const ctrl = this.byId(id);
            if (ctrl) ctrl.setValue(String(val));
            // Pulse the parent KPI tile red if value is non-zero and critical
            const urgentKpis = ["homeClosedBridges","homeOpenDefects","homeOverdueInspections"];
            if (urgentKpis.includes(id) && Number(val) > 0) {
                const tile = ctrl && ctrl.getParent && ctrl.getParent() &&
                             ctrl.getParent().getParent && ctrl.getParent().getParent();
                if (tile && tile.addStyleClass) tile.addStyleClass("nhvrKpiUrgent");
            }
        },

        // ── Load recent active restrictions ───────────────────────
        _loadRecentRestrictions: function () {
            const h    = { Accept: "application/json" };
            const list = this.byId("homeRestrictionList");
            if (!list) return;

            fetch(`${BASE}/ActiveRestrictions?$top=5&$select=bridgeName,restrictionType,value,unit,vehicleClassName,routeCode`, { headers: h })
                .then(r => r.json())
                .then(j => {
                    list.destroyItems();
                    (j.value || []).forEach(r => {
                        const vehicleLabel = r.vehicleClassName ? ` · ${r.vehicleClassName}` : "";
                        const routeLabel   = r.routeCode ? ` · ${r.routeCode}` : "";
                        list.addItem(new StandardListItem({
                            title      : r.bridgeName || "Unknown Bridge",
                            description: `${r.restrictionType}: ${r.value} ${r.unit}${vehicleLabel}${routeLabel}`,
                            icon       : "sap-icon://alert",
                            iconInset  : false,
                            info       : "ACTIVE",
                            infoState  : "Warning"
                        }));
                    });
                    if (!j.value || j.value.length === 0) {
                        list.addItem(new StandardListItem({
                            title: "No active restrictions",
                            icon : "sap-icon://accept"
                        }));
                    }
                })
                .catch(err => {
                    console.warn("[NHVR] Failed to load recent restrictions:", err);
                    if (list) {
                        list.destroyItems();
                        list.addItem(new StandardListItem({
                            title: "Unable to load restrictions",
                            icon : "sap-icon://message-error",
                            iconInset: false
                        }));
                    }
                });
        },

        // ── Cross-module saved views ("My Saved Views" card) ──────
        _loadMySavedViews: function () {
            var MODULE_META = {
                BRIDGES:      { label: "Bridges",      icon: "sap-icon://journey-arrive", route: "BridgesList"      },
                RESTRICTIONS: { label: "Restrictions", icon: "sap-icon://alert",          route: "RestrictionsList" },
                DEFECTS:      { label: "Defects",      icon: "sap-icon://warning2",       route: "DefectRegister"   },
                PERMITS:      { label: "Permits",      icon: "sap-icon://document-text",  route: "Permits"          }
            };
            var all = NamedViews.listAll();
            var items = all.map(function (v) {
                var meta = MODULE_META[v.module] || { label: v.module, icon: "sap-icon://bookmark", route: null };
                var when = v.updatedAt ? new Date(v.updatedAt) : null;
                return {
                    id           : v.id,
                    name         : v.name,
                    module       : v.module,
                    moduleLabel  : meta.label,
                    icon         : meta.icon,
                    route        : meta.route,
                    filters      : v.filters,
                    updatedAt    : v.updatedAt || 0,
                    updatedLabel : when ? when.toLocaleDateString("en-AU", { day: "numeric", month: "short" }) : ""
                };
            });
            // Attach to the "home" JSON model
            var oModel = this.getView().getModel("home");
            if (oModel) {
                oModel.setProperty("/savedViews", items);
            }
            var oSection = this.byId("sectionSavedViews");
            if (oSection) {
                oSection.setVisible(items.length > 0);
            }
        },

        onNamedViewPress: function (oEvent) {
            var oItem = oEvent.getParameter("listItem") || oEvent.getSource();
            var oCtx  = oItem && oItem.getBindingContext("home");
            if (!oCtx) { return; }
            var view = oCtx.getObject();
            if (!view || !view.route) {
                MessageToast.show("Cannot open this saved view");
                return;
            }
            // Stash the full NamedViews record (not the UI-decorated copy)
            NamedViews.setPending({
                id       : view.id,
                name     : view.name,
                module   : view.module,
                filters  : view.filters,
                createdAt: 0,
                updatedAt: view.updatedAt
            });
            this._navTo(view.route);
        },

        // ── Navigation handlers ───────────────────────────────────
        onNavToDashboard:    function () { this._navTo("Dashboard"); },
        onNavToBridges:      function () { this._navTo("BridgesList"); },
        onNavToRestrictions: function () { this._navTo("RestrictionsList"); },

        // ── KPI drill-down with pre-applied filters ───────────────
        onNavToClosedBridges: function () {
            this.getOwnerComponent().getRouter().navTo("BridgesList", { "?query": { postingStatus: "CLOSED" } });
        },
        onNavToPermitRestrictions: function () {
            this.getOwnerComponent().getRouter().navTo("RestrictionsList", { "?query": { permitRequired: "true" } });
        },
        onNavToMap:          function () { this._navTo("MapView"); },
        onNavToReports:      function () { this._navTo("Reports"); },
        onNavToAnnualConditionReport: function () { this._navTo("AnnualConditionReport"); },
        onNavToExecutive:    function () { this._navTo("Dashboard"); },
        onNavToMassUpload:   function () { this._navTo("MassUpload"); },
        onNavToAdmin:        function () { this._navTo("AdminConfig"); },
        onNavToInspections:          function () { this._navTo("InspectionDashboard"); },
        onNavToDefects:              function () { this._navTo("DefectRegister"); },
        onNavToVehicleCombinations:  function () { this._navTo("VehicleCombinations"); },
        onNavToRestrictionTypes:     function () { this._navTo("AdminRestrictionTypes"); },
        onNavToMassEdit:             function () { this._navTo("MassEdit"); },
        onNavToVehicleTypes:         function () { this._navTo("AdminVehicleTypes"); },
        onNavToPermits:              function () { this._navTo("Permits"); },
        onNavToRouteAssessment:      function () { this._navTo("RouteAssessment"); },
        onNavToRoutePlanner:         function () { this._navTo("RoutePlanner"); },
        onNavToIntegrationHub:       function () { this._navTo("integrationHub"); },
        onNavToInspectionCreate:     function () { this._navTo("InspectionCreateNew"); },
        onNavToFreightRoutes:        function () { this._navTo("FreightRoutes"); },
        onNavToLicenseConfig:        function () { this._navTo("LicenseConfig"); },
        onNavToAppAdmin:             function () { this._navTo("AppAdmin"); },
        onNavToTechAdmin:            function () { this._navTo("BmsTechAdmin"); },
        onNavToAnalytics:            function () { this._navTo("AnalyticsDashboard"); },

        _navTo: function (routeName) {
            this.getOwnerComponent().getRouter().navTo(routeName);
        },

        // ── Role switching ────────────────────────────────────────
        onRoleChange: function (e) {
            const newRole = e.getParameter("selectedItem").getKey();
            RoleManager.switchRole(newRole).then(() => {
                this._applyRoleToHome();
                MessageToast.show("Role switched to: " + RoleManager.getLabel());
            });
        },

        onOpenRoleDialog: function () {
            var dlg = this.byId("roleSwitchDialog");
            if (dlg) {
                var roleSelector = this.byId("roleSelector");
                if (roleSelector) roleSelector.setSelectedKey(RoleManager.getRole());
                // In production environments, disable role switching — show assigned role read-only
                var env = this._detectEnvironment();
                var isDevMode = (env === "LOCAL" || env === "DEV");
                if (roleSelector) roleSelector.setEnabled(isDevMode);
                var applyBtn = dlg.getBeginButton();
                if (applyBtn) applyBtn.setVisible(isDevMode);
                dlg.open();
            }
        },

        onRoleSwitchConfirm: function () {
            var dlg = this.byId("roleSwitchDialog");
            if (dlg) dlg.close();
        },

        onRoleSwitchCancel: function () {
            var dlg = this.byId("roleSwitchDialog");
            if (dlg) dlg.close();
        },

        onAvatarPress: function (oEvent) {
            this._showInfoPopover(
                oEvent.getSource(),
                "User Profile",
                "Role: " + RoleManager.getLabel() + "\n" +
                "Environment: " + this._detectEnvironment() + "\n" +
                "Session: XSUAA JWT (1hr validity)"
            );
        },

        _applyRoleToHome: function () {
            const role = RoleManager.getRole();

            // Sync the dropdown immediately
            const roleSelector = this.byId("roleSelector");
            if (roleSelector) roleSelector.setSelectedKey(role);

            // Operations tiles (featureKey matches tile ID prefix)
            const opsTiles = [
                { id: "tileDashboard",       key: "dashboard" },
                { id: "tileBridges",         key: "bridges" },
                { id: "tileRestrictions",    key: "restrictions" },
                { id: "tileReports",         key: "reports" },
                { id: "tileVehicleAccess",   key: "vehicleaccess" },
                { id: "tileRouteAssessment", key: "routeassessment" }
            ];
            opsTiles.forEach(t => {
                const tile = this.byId(t.id);
                if (tile) tile.setVisible(RoleManager.isVisible(t.key));
            });

            // Analytics section — Map View tile (visible to all roles)
            if (this.byId("tileAnalyticsMap"))
                this.byId("tileAnalyticsMap").setVisible(RoleManager.isVisible("analyticsMap"));

            // BMS Business Admin section — show for Admin role (adminconfig, massupload, massedit)
            const showAdmin = RoleManager.isVisible("adminconfig") ||
                              RoleManager.isVisible("massupload")  ||
                              RoleManager.isVisible("massedit");
            const adminSection = this.byId("sectionAdmin");
            if (adminSection) adminSection.setVisible(showAdmin);

            // Individual admin tiles
            const adminTiles = [
                { id: "massUploadTile",        key: "massupload" },
                { id: "adminConfigTile",        key: "adminconfig" },
                { id: "inspectionsTile",        key: "inspections" },
                { id: "defectsTile",            key: "defects" },
                { id: "restrictionTypesTile",   key: "restrictionTypes" },
                { id: "massEditTile",           key: "massedit" },
                { id: "vehicleTypesTile",       key: "vehicletypes" }
            ];
            adminTiles.forEach(t => {
                const tile = this.byId(t.id);
                if (tile) tile.setVisible(RoleManager.isVisible(t.key));
            });

            // BMS Tech Admin section — visible for Admin and TechAdmin roles
            const showTechAdmin = RoleManager.isVisible("adminconfig") ||
                                  RoleManager.isVisible("techAdmin");
            const techSection = this.byId("sectionTechAdmin");
            if (techSection) techSection.setVisible(showTechAdmin);

            // Inspector section — visible for Inspector, BridgeManager, Admin
            const showInspection = RoleManager.isVisible("inspections") || RoleManager.isVisible("defects");
            const sectionInspection = this.byId("sectionInspection");
            if (sectionInspection) sectionInspection.setVisible(showInspection && !showAdmin);
            if (this.byId("inspectionsTileMain")) this.byId("inspectionsTileMain").setVisible(RoleManager.isVisible("inspections"));
            if (this.byId("defectsTileMain"))     this.byId("defectsTileMain").setVisible(RoleManager.isVisible("defects"));

            // Operator section — visible for Operator, BridgeManager, Admin
            const showOperator = RoleManager.isVisible("permits") || RoleManager.isVisible("vehicleaccess") || RoleManager.isVisible("routeassessment");
            const sectionOperator = this.byId("sectionOperator");
            if (sectionOperator) sectionOperator.setVisible(showOperator);
            if (this.byId("operatorPermitsTile"))         this.byId("operatorPermitsTile").setVisible(RoleManager.isVisible("permits"));
            if (this.byId("operatorVehicleTile"))         this.byId("operatorVehicleTile").setVisible(RoleManager.isVisible("vehicleaccess"));
            if (this.byId("operatorRouteAssessmentTile")) this.byId("operatorRouteAssessmentTile").setVisible(RoleManager.isVisible("routeassessment"));

            // ── Road Capacity & Permits section ───────────────────────────
            var showRoadCapacity = RoleManager.isVisible("vehiclePermits") ||
                                   RoleManager.isVisible("capacityReports") ||
                                   RoleManager.isVisible("routeassessment");
            var sectionRoadCapacity = this.byId("sectionRoadCapacity");
            if (sectionRoadCapacity) sectionRoadCapacity.setVisible(showRoadCapacity);
            if (this.byId("tileVehiclePermits"))    this.byId("tileVehiclePermits").setVisible(RoleManager.isVisible("vehiclePermits"));
            if (this.byId("tileCapacityReports"))   this.byId("tileCapacityReports").setVisible(RoleManager.isVisible("capacityReports"));
            if (this.byId("tileRouteAssessmentRC")) this.byId("tileRouteAssessmentRC").setVisible(RoleManager.isVisible("routeassessment"));

            // ── Network Tools section ──────────────────────────────────────
            var showNetworkTools = RoleManager.isVisible("bridgeMap") ||
                                   RoleManager.isVisible("recordInspection") ||
                                   RoleManager.isVisible("freightCorridors");
            var sectionNetworkTools = this.byId("sectionNetworkTools");
            if (sectionNetworkTools) sectionNetworkTools.setVisible(showNetworkTools);
            if (this.byId("tileBridgeMap"))        this.byId("tileBridgeMap").setVisible(RoleManager.isVisible("bridgeMap"));
            if (this.byId("tileRecordInspection")) this.byId("tileRecordInspection").setVisible(RoleManager.isVisible("recordInspection"));
            if (this.byId("tileFreightCorridors")) this.byId("tileFreightCorridors").setVisible(RoleManager.isVisible("freightCorridors"));

            // ── Admin section extra tiles ─────────────────────────────────
            if (this.byId("integrationHubTile"))  this.byId("integrationHubTile").setVisible(RoleManager.isVisible("integrationHub"));
            if (this.byId("tileLicenseConfig"))   this.byId("tileLicenseConfig").setVisible(RoleManager.isVisible("licenseConfig"));

        },

        // ── Quick Access Rail ─────────────────────────────────────
        /**
         * Dynamically render role-specific quick-access buttons into the rail VBox.
         * Clears existing buttons before re-rendering to support role switching.
         */
        // ── Refresh ───────────────────────────────────────────────
        onRefresh: function () {
            this._loadKpis();
            this._loadRecentRestrictions();
            MessageToast.show("Data refreshed");
        },

        // ── Capability gating for home tiles ─────────────────────
        // Called after CapabilityManager.load() resolves.
        // Hides tiles whose capability is not licensed for this tenant.
        _applyCapabilitiesToHome: function () {
            CapabilityManager.applyToControls(this.getView(), [
                // Inspection & Defects section
                { id: "tileInspectionMain",   capability: "INSPECTIONS" },
                { id: "tileInspectionCard",   capability: "INSPECTIONS" },
                { id: "inspectionsTileMain",  capability: "INSPECTIONS" },
                { id: "tileRecordInspection", capability: "INSPECTIONS" },
                { id: "tileDefectsMain",      capability: "DEFECTS" },
                { id: "tileDefectsCard",      capability: "DEFECTS" },
                { id: "defectsTileMain",      capability: "DEFECTS" },
                // Operator section
                { id: "tilePermitsMain",      capability: "PERMITS" },
                { id: "tileRouteMain",        capability: "ROUTE_ASSESSMENT" },
                { id: "tileVehicleMain",      capability: "VEHICLE_COMBINATIONS" },
                { id: "tileFreightCorridors", capability: "FREIGHT_ROUTES" },
                // Work Orders
                { id: "tileWorkOrdersMain",   capability: "WORK_ORDERS" },
                // Analytics / Bridge IQ
                { id: "tileAnalytics",        capability: "BRIDGE_IQ" },
                // Admin section
                { id: "tileMassUploadMain",   capability: "MASS_UPLOAD" },
                { id: "tileMassEditMain",     capability: "MASS_EDIT" },
                { id: "tileIntegrationMain",  capability: "INTEGRATION_HUB" },
            ]);
            // LicenseConfig manages the capability system itself — always visible to Admins.
            // Visibility is controlled by the Admin section container (sectionAdmin), not capability.
            // No additional check needed here; the tile defaults to visible=true in the view.
        },

        // ── Lite Mode: hide sections not available in lite edition ───
        // All code/routes stay intact. AppConfig.isLite() = true only when
        // NHVR_APP_MODE=lite is set server-side (CF env var or local .env).
        _applyLiteMode: function () {
            if (!AppConfig.isLite()) return;

            var oView = this.getView();

            // Section-level hiding (works regardless of role)
            var aSections = ['sectionInspection', 'sectionOperator'];
            aSections.forEach(function (sId) {
                var oCtrl = oView.byId(sId);
                if (oCtrl) oCtrl.setVisible(false);
            });

            // Individual tile hiding (tiles that may live in other sections)
            AppConfig.applyToControls({
                'defects'          : [oView.byId('tileDefectsMain'), oView.byId('tileDefectsCard'), oView.byId('defectsTileMain')],
                'inspections'      : [oView.byId('tileInspectionMain'), oView.byId('tileInspectionCard'), oView.byId('inspectionsTileMain')],
                'permits'          : [oView.byId('tilePermitsMain')],
                'routeAssessment'  : [oView.byId('tileRouteMain')],
                'workOrders'       : [oView.byId('tileWorkOrdersMain')]
            });

            // Update ShellBar subtitle to indicate mode
            var oUiModel = oView.getModel("ui");
            if (oUiModel) {
                var sCurrent = oUiModel.getProperty("/appSubtitle") || '';
                oUiModel.setProperty("/appSubtitle", sCurrent + AppConfig.getModeLabel());
            }
        },

        // ── Info Popover ──────────────────────────────────────────
        /**
         * Reusable helper: opens a Popover anchored to oButton with sTitle / sContent.
         */
        _showInfoPopover: function (oButton, sTitle, sContent) {
            if (!this._oInfoPopover) {
                this._oInfoPopover = new sap.m.Popover({
                    placement: sap.m.PlacementType.Auto,
                    showHeader: true,
                    contentWidth: "360px"
                });
                this.getView().addDependent(this._oInfoPopover);
            }
            this._oInfoPopover.setTitle(sTitle);
            this._oInfoPopover.destroyContent();
            this._oInfoPopover.addContent(new sap.m.Text({ text: sContent }).addStyleClass("sapUiSmallMargin"));
            this._oInfoPopover.openBy(oButton);
        },

        onInfoPressHome: function (oEvent) {
            this._showInfoPopover(
                oEvent.getSource(),
                "About This Application",
                "NHVR Bridge Management is the National Heavy Vehicle Regulator's asset management system for 2,100+ bridges on the Australian road network.\n\n" +
                "Roles:\n" +
                "• Admin — full access including configuration\n" +
                "• Bridge Manager — manage bridges, restrictions and inspections\n" +
                "• Inspector — record inspection results and defects\n" +
                "• Operator — manage permits and route assessments\n" +
                "• Read Only — view-only access\n\n" +
                "KPI Tiles:\n" +
                "• Total Bridges — count of all bridge assets in the registry\n" +
                "• Restricted — bridges with POSTED or CLOSED posting status\n" +
                "• Open Defects — defects not yet closed/resolved\n" +
                "• Overdue Inspections — bridges whose next inspection due date has passed"
            );
        },

    }, HelpAssistantMixin));
});
