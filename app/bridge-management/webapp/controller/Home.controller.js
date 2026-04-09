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
            this._loadMySavedViews();
            this._initHelpAssistant("home");
            this._loadVersionInfo();

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
            const requestHeaders = { Accept: "application/json" };

            fetch(`${BASE}/me()`, { headers: requestHeaders })
                .then(response => response.json())
                .then(info => {
                    const roles   = info.roles || [];
                    const isAdmin = roles.some(roleName => roleName === "Admin" || roleName === "NHVR_Admin" || roleName === "admin");
                    this._isAdmin = isAdmin; // stored for use in _applyCapabilitiesToHome
                    const isMgr   = isAdmin || roles.some(roleName => roleName === "BridgeManager" || roleName === "NHVR_BridgeManager");

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
                    const adminSection = this.byId("sectionAdmin");
                    if (adminSection) adminSection.setVisible(isAdmin);
                })
                .catch(() => {
                    // me() failed — default to showing Viewer access
                    const chip = this.byId("roleChip");
                    if (chip) { chip.setText("Viewer"); chip.addStyleClass("nhvrRoleBadgeViewer"); }
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
        onNavToRestrictionTypes:     function () { this._navTo("AdminRestrictionTypes"); },
        onNavToMassEdit:             function () { this._navTo("MassEdit"); },
        onNavToVehicleTypes:         function () { this._navTo("AdminVehicleTypes"); },
        onNavToIntegrationHub:       function () { this._navTo("integrationHub"); },
        onNavToInspectionCreate:     function () { this._navTo("InspectionCreateNew"); },
        onNavToFreightRoutes:        function () { this._navTo("FreightRoutes"); },
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
            opsTiles.forEach(tileConfig => {
                const tile = this.byId(tileConfig.id);
                if (tile) tile.setVisible(RoleManager.isVisible(tileConfig.key));
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
            adminTiles.forEach(tileConfig => {
                const tile = this.byId(tileConfig.id);
                if (tile) tile.setVisible(RoleManager.isVisible(tileConfig.key));
            });

            // Inspector section — visible for Inspector, BridgeManager, Admin
            const showInspection = RoleManager.isVisible("inspections") || RoleManager.isVisible("defects");
            const sectionInspection = this.byId("sectionInspection");
            if (sectionInspection) sectionInspection.setVisible(showInspection && !showAdmin);
            if (this.byId("inspectionsTileMain")) this.byId("inspectionsTileMain").setVisible(RoleManager.isVisible("inspections"));
            if (this.byId("defectsTileMain"))     this.byId("defectsTileMain").setVisible(RoleManager.isVisible("defects"));

            // ── Network Tools section ──────────────────────────────────────
            var showNetworkTools = RoleManager.isVisible("bridgeMap") ||
                                   RoleManager.isVisible("recordInspection") ||
                                   RoleManager.isVisible("freightCorridors");
            var sectionNetworkTools = this.byId("sectionNetworkTools");
            if (sectionNetworkTools) sectionNetworkTools.setVisible(showNetworkTools);
            if (this.byId("tileBridgeMap"))        this.byId("tileBridgeMap").setVisible(RoleManager.isVisible("bridgeMap"));
            if (this.byId("tileRecordInspection")) this.byId("tileRecordInspection").setVisible(RoleManager.isVisible("recordInspection"));
            if (this.byId("tileFreightCorridors")) this.byId("tileFreightCorridors").setVisible(RoleManager.isVisible("freightCorridors"));


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
                { id: "tileFreightCorridors", capability: "FREIGHT_ROUTES" },
                // Work Orders
                { id: "tileWorkOrdersMain",   capability: "WORK_ORDERS" },
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
