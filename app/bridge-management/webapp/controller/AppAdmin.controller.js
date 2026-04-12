sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageToast",
    "sap/m/MessageBox",
    "nhvr/bridgemanagement/util/AuthFetch"
], function (Controller, JSONModel, MessageToast, MessageBox, AuthFetch) {
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
            // `getAppConfig` is a CDS `function` (GET-only). Using
            // oModel.bindContext("/getAppConfig(...)").requestObject()
            // emits HTTP POST and the server returns 405. Use a plain GET
            // with OData function-call syntax instead.
            fetch("/bridge-management/getAppConfig()", _credOpts())
                .then(r => r.ok ? r.json() : Promise.reject(new Error(r.status + " " + r.statusText)))
                .then(data => {
                    this._oModel.setProperty("/appMode", data.mode || "full");
                    this._oModel.setProperty("/appVersion", data.version || "3.2.1");
                })
                .catch(() => {
                    // non-fatal — display defaults
                });
        },

        _loadCurrentUser: function () {
            // `me` is also a CDS function — same POST/405 hazard. Plain GET.
            fetch("/bridge-management/me()", _credOpts())
                .then(r => r.ok ? r.json() : Promise.reject(new Error(r.status + " " + r.statusText)))
                .then(data => {
                    this._oModel.setProperty("/currentUser", data.id || "—");
                    this._oModel.setProperty("/currentRoles", (data.roles || []).join(", ") || "None");
                    const mode = data.appMode || "full";
                    this._oModel.setProperty("/appMode", mode);
                })
                .catch(() => {});
        },

        _loadTenants: function () {
            const oModel = this.getOwnerComponent().getModel();
            oModel.bindList("/Tenants").requestContexts(0, 100)
                .then(contexts => {
                    const tenants = contexts.map(c => c.getObject());
                    this._oModel.setProperty("/tenants", tenants);
                })
                .catch(e => {
                    // Tenants entity may not be exposed — show empty list silently
                    this._oModel.setProperty("/tenants", []);
                });
        },

        onRunHealthCheck: function () {
            this._oModel.setProperty("/healthStatus", "Checking…");
            this._oModel.setProperty("/dbStatus", "—");
            // `health` is a CDS function — use plain GET to avoid 405.
            fetch("/bridge-management/health()", _credOpts())
                .then(r => r.ok ? r.json() : Promise.reject(new Error(r.status + " " + r.statusText)))
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
            if (!ctx) return;
        },

        onAddTenant: function () {
            MessageBox.information(
                "Tenant provisioning is managed via SAP BTP Cockpit subaccount setup.\n\n" +
                "1. Create a new subaccount in BTP Cockpit\n" +
                "2. Subscribe to the NHVR Bridge Management application\n" +
                "3. Assign role collections to users/groups\n" +
                "4. Maintain tenant-level settings through approved BTP/backend administration processes.",
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
                    "BTP Cockpit or backend configuration processes.",
                    { title: "Edit Tenant" }
                );
            }
        },

        onRefreshUsage: function () {
            const oModel = this.getOwnerComponent().getModel();
            // Attempt to load usage summary from backend
            oModel.bindContext("/getUsageSummary(...)")
                .requestObject()
                .then(data => {
                    this._oModel.setProperty("/usageActiveUsers", String(data.activeUsers ?? "—"));
                    this._oModel.setProperty("/usageBridgeCount", String(data.bridgeCount ?? "—"));
                    this._oModel.setProperty("/usageApiCalls",    String(data.apiCalls ?? "—"));
                    this._oModel.setProperty("/usageLastRefresh", new Date().toLocaleString("en-AU"));
                    MessageToast.show("Usage data refreshed");
                })
                .catch(() => {
                    // Backend action not yet implemented — show live bridge count as fallback
                    AuthFetch.getJson("/bridge-management/Bridges?$count=true&$top=0")
                        .then(j => {
                            this._oModel.setProperty("/usageBridgeCount", String(j["@odata.count"] ?? "—"));
                            this._oModel.setProperty("/usageLastRefresh", new Date().toLocaleString("en-AU"));
                        })
                        .catch(err => {
                            console.warn("[AppAdmin] Bridges count fallback failed:", err.message);
                        });
                });
        },

        onNavBack: function () {
            const oRouter = this.getOwnerComponent().getRouter();
            oRouter.navTo("Home");
        }

    });
});
