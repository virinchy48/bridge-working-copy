sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageToast",
    "sap/m/MessageBox"
], function (Controller, JSONModel, MessageToast, MessageBox) {
    "use strict";

    var _IS_LOC = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
    var _AUTH_H = _IS_LOC ? { "Authorization": "Basic " + btoa("admin:admin") } : {};
    function _credOpts(extraHeaders) {
        var opts = { headers: Object.assign({ Accept: "application/json" }, _AUTH_H, extraHeaders || {}) };
        if (!_IS_LOC) opts.credentials = "include";
        return opts;
    }

    return Controller.extend("nhvr.bridgemanagement.controller.AppAdmin", {

        onInit: function () {
            this._oModel = new JSONModel({
                btpRegion          : "US10-001",
                cfOrg              : "592f5a7btrial",
                cfSpace            : "dev",
                appVersion         : "3.2.1",
                appMode            : "—",
                healthStatus       : "—",
                dbStatus           : "—",
                uptime             : "—",
                currentUser        : "—",
                currentRoles       : "—",
                tenants            : [],
                capabilities       : [],
                selectedTenantCode : "",
                usageActiveUsers   : "—",
                usageBridgeCount   : "—",
                usageApiCalls      : "—",
                usageLastRefresh   : "—"
            });
            this.getView().setModel(this._oModel, "appAdmin");

            this._loadAppConfig();
            this._loadCurrentUser();
            this._loadTenants();
        },

        _loadAppConfig: function () {
            const oModel = this.getOwnerComponent().getModel();
            oModel.bindContext("/getAppConfig(...)").requestObject()
                .then(data => {
                    this._oModel.setProperty("/appMode", data.mode || "full");
                    this._oModel.setProperty("/appVersion", data.version || "3.2.1");
                })
                .catch(e => {
                    // non-fatal — display defaults
                });
        },

        _loadCurrentUser: function () {
            const oModel = this.getOwnerComponent().getModel();
            oModel.bindContext("/me(...)").requestObject()
                .then(data => {
                    this._oModel.setProperty("/currentUser", data.id || "—");
                    this._oModel.setProperty("/currentRoles", (data.roles || []).join(", ") || "None");
                    const mode = data.appMode || "full";
                    this._oModel.setProperty("/appMode", mode);
                })
                .catch(e => {});
        },

        _loadTenants: function () {
            const oModel = this.getOwnerComponent().getModel();
            oModel.bindList("/Tenants").requestContexts(0, 100)
                .then(contexts => {
                    const tenants = contexts.map(c => c.getObject());
                    this._oModel.setProperty("/tenants", tenants);

                    // Populate tenant selector in Licensing tab
                    const oSelect = this.byId("selLicenseTenant");
                    if (oSelect) {
                        tenants.forEach(t => {
                            oSelect.addItem(new sap.ui.core.Item({
                                key : t.tenantCode,
                                text: t.displayName || t.tenantCode
                            }));
                        });
                    }
                })
                .catch(e => {
                    // Tenants entity may not be exposed — show empty list silently
                    this._oModel.setProperty("/tenants", []);
                });
        },

        onRunHealthCheck: function () {
            const oModel = this.getOwnerComponent().getModel();
            this._oModel.setProperty("/healthStatus", "Checking…");
            this._oModel.setProperty("/dbStatus", "—");
            oModel.bindContext("/health(...)").requestObject()
                .then(data => {
                    this._oModel.setProperty("/healthStatus", data.status || "UNKNOWN");
                    this._oModel.setProperty("/dbStatus", data.db || "—");
                    this._oModel.setProperty("/uptime", String(data.uptime || "—"));
                    MessageToast.show("Health check: " + (data.status || "UNKNOWN"));
                })
                .catch(e => {
                    this._oModel.setProperty("/healthStatus", "ERROR");
                    this._oModel.setProperty("/dbStatus", "UNAVAILABLE");
                    MessageToast.show("Health check failed: " + e.message);
                });
        },

        onOpenCFLogs: function () {
            MessageBox.information(
                "To view live CF logs, run in your terminal:\n\n" +
                "  cf logs nhvr-bridge-srv --recent\n\n" +
                "Or stream live:\n\n" +
                "  cf logs nhvr-bridge-srv",
                { title: "CF Application Logs" }
            );
        },

        onRefresh: function () {
            this._loadAppConfig();
            this._loadCurrentUser();
            this._loadTenants();
            MessageToast.show("Refreshed");
        },

        onRefreshTenants: function () {
            this._loadTenants();
        },

        onTenantSelect: function (oEvent) {
            const ctx = oEvent.getParameter("listItem")?.getBindingContext("appAdmin");
            if (ctx) {
                const tenantCode = ctx.getProperty("tenantCode");
                this._oModel.setProperty("/selectedTenantCode", tenantCode);
                this._loadCapabilities(tenantCode);
            }
        },

        onLicenseTenantChange: function (oEvent) {
            const code = oEvent.getParameter("selectedItem")?.getKey();
            if (code) this._loadCapabilities(code);
        },

        _loadCapabilities: function (tenantCode) {
            const oModel = this.getOwnerComponent().getModel();
            this._oModel.setProperty("/capabilities", []);
            oModel.bindContext("/getCapabilityProfile(...)").requestObject()
                .then(data => {
                    const caps = Array.isArray(data) ? data : (data.value || []);
                    this._oModel.setProperty("/capabilities", caps);
                })
                .catch(e => {
                    MessageToast.show("Could not load capabilities: " + e.message);
                });
        },

        onRefreshLicensing: function () {
            const code = this._oModel.getProperty("/selectedTenantCode");
            if (code) this._loadCapabilities(code);
        },

        onAddTenant: function () {
            MessageBox.information(
                "Tenant provisioning is managed via SAP BTP Cockpit subaccount setup.\n\n" +
                "1. Create a new subaccount in BTP Cockpit\n" +
                "2. Subscribe to the NHVR Bridge Management application\n" +
                "3. Assign role collections to users/groups\n" +
                "4. Use the Client Licensing screen to configure feature entitlements per tenant.",
                { title: "Add Tenant — Instructions" }
            );
        },

        onEditTenant: function (oEvent) {
            const ctx = oEvent.getSource().getBindingContext("appAdmin");
            const tenant = ctx ? ctx.getObject() : null;
            if (tenant) {
                MessageBox.information(
                    "Tenant: " + tenant.displayName + " (" + tenant.tenantCode + ")\n\n" +
                    "Tenant configuration (display name, state, contact) is managed via the\n" +
                    "Client Licensing screen (LicenseConfig) or directly in the BTP Cockpit.",
                    { title: "Edit Tenant" }
                );
            }
        },

        onNavToLicenseConfig: function () {
            this.getOwnerComponent().getRouter().navTo("LicenseConfig");
        },

        onRefreshUsage: function () {
            const code = this._oModel.getProperty("/selectedTenantCode");
            const oModel = this.getOwnerComponent().getModel();
            // Attempt to load usage summary from backend
            oModel.bindContext("/getUsageSummary(...)")
                .requestObject({ tenantCode: code || undefined })
                .then(data => {
                    this._oModel.setProperty("/usageActiveUsers", String(data.activeUsers ?? "—"));
                    this._oModel.setProperty("/usageBridgeCount", String(data.bridgeCount ?? "—"));
                    this._oModel.setProperty("/usageApiCalls",    String(data.apiCalls ?? "—"));
                    this._oModel.setProperty("/usageLastRefresh", new Date().toLocaleString("en-AU"));
                    MessageToast.show("Usage data refreshed");
                })
                .catch(() => {
                    // Backend action not yet implemented — show live bridge count as fallback
                    fetch("/bridge-management/Bridges?$count=true&$top=0", _credOpts())
                        .then(r => r.json())
                        .then(j => {
                            this._oModel.setProperty("/usageBridgeCount", String(j["@odata.count"] ?? "—"));
                            this._oModel.setProperty("/usageLastRefresh", new Date().toLocaleString("en-AU"));
                        })
                        .catch(() => {});
                });
        },

        onNavBack: function () {
            const oRouter = this.getOwnerComponent().getRouter();
            oRouter.navTo("Home");
        }

    });
});
