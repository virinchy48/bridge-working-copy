// ============================================================
// NHVR Bridge Management — UI5 Application Component
// ============================================================
sap.ui.define([
    "sap/ui/core/UIComponent",
    "sap/m/App",
    "sap/m/Toolbar",
    "sap/m/OverflowToolbar",
    "sap/m/ToolbarSpacer",
    "sap/m/ToolbarSeparator",
    "nhvr/bridgemanagement/model/AppConfig",
    "nhvr/bridgemanagement/model/RoleManager",
    "nhvr/bridgemanagement/util/AnalyticsService",
    "nhvr/bridgemanagement/model/CapabilityManager"
], function (UIComponent, App, Toolbar, OverflowToolbar, ToolbarSpacer, ToolbarSeparator, AppConfig, RoleManager, AnalyticsService, CapabilityManager) {
    "use strict";

    // ── Route → Capability mapping for feature isolation ──────
    var ROUTE_CAPABILITY_MAP = {
        "InspectionDashboard": "INSPECTIONS",
        "InspectionCreate": "INSPECTIONS",
        "InspectionCreateNew": "INSPECTIONS",
        "DefectRegister": "DEFECTS",
        "Permits": "PERMITS",
        "PermitRegisterReport": "PERMITS",
        "RouteAssessment": "ROUTE_ASSESSMENT",
        "RoutePlanner": "ROUTE_ASSESSMENT",
        "FreightRoutes": "FREIGHT_ROUTES",
        "FreightRouteDetail": "FREIGHT_ROUTES",
        "VehicleCombinations": "VEHICLE_COMBINATIONS",
        "WorkOrders": "WORK_ORDERS",
        "IntegrationHub": "INTEGRATION_HUB",
        "AnalyticsDashboard": "BRIDGE_IQ",
        "LicenseConfig": "ADMIN_CONFIG",
        "AdminConfig": "ADMIN_CONFIG",
        "AppAdmin": "ADMIN_CONFIG",
        "BmsTechAdmin": "ADMIN_CONFIG"
    };

    return UIComponent.extend("nhvr.bridgemanagement.Component", {
        metadata: {
            manifest: "json"
        },

        init: function () {
            UIComponent.prototype.init.apply(this, arguments);

            // Initialize app mode and role config before routing so feature-gated
            // buttons render consistently even when users land on deep links.
            var oRouter = this.getRouter();
            Promise.all([
                AppConfig.init(),
                RoleManager.loadConfig().catch(function () { return null; })
            ]).then(function () {
                oRouter.initialize();

                // Initialize analytics (fire-and-forget — never blocks app start)
                try {
                    fetch("/bridge-management/me", { headers: { Accept: "application/json" } })
                        .then(function (r) { return r.ok ? r.json() : {}; })
                        .then(function (user) {
                            AnalyticsService.init({
                                userId: user.id || "anonymous",
                                role: (user.roles && user.roles[0]) || "Unknown",
                                environment: AppConfig.isLite() ? "lite" : "production"
                            });
                        })
                        .catch(function () {
                            AnalyticsService.init({ userId: "anonymous", role: "Unknown" });
                        });
                } catch (e) {
                    // Analytics failure never blocks business flow
                }
                // In lite mode, attach a route-matched guard to redirect hidden routes to Home
                if (AppConfig.isLite()) {
                    oRouter.attachRouteMatched(function (oEvent) {
                        var sRoute = oEvent.getParameter("name");
                        if (AppConfig.isRouteHidden(sRoute)) {
                            oRouter.navTo("Home", {}, true);
                        }
                    });
                }

                // ── Feature isolation guard (per-tenant capability check) ──
                oRouter.attachRouteMatched(function (oEvent) {
                    var sRoute = oEvent.getParameter("name");
                    var sCapability = ROUTE_CAPABILITY_MAP[sRoute];
                    if (sCapability && !CapabilityManager.canView(sCapability)) {
                        sap.m.MessageToast.show("This feature is not available in your current deployment.");
                        oRouter.navTo("Home", {}, true);
                    }
                });
            });
        },

        createContent: function () {
            return new App({ id: "nhvrRootApp" });
        }
    });
});
