/* ────────────────────────────────────────────────────────────────
   Usage Analytics — Dashboard Controller
   TechAdmin-only by default; configurable via RoleManager
   ──────────────────────────────────────────────────────────────── */
sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageBox",
    "sap/m/MessageToast",
    "nhvr/bridgemanagement/model/RoleManager",
    "nhvr/bridgemanagement/util/AnalyticsMixin",
    "nhvr/bridgemanagement/util/LoggerService",
    "nhvr/bridgemanagement/model/CapabilityManager"
], function (Controller, JSONModel, MessageBox, MessageToast, RoleManager, AnalyticsMixin, Logger, CapabilityManager) {
    "use strict";

    var TAG = "AnalyticsDashboard";
    var BASE = "/bridge-management";

    var _IS_LOC = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
    var _AUTH_H = _IS_LOC ? { "Authorization": "Basic " + btoa("admin:admin") } : {};
    function _credOpts(extraHeaders) {
        var opts = { headers: Object.assign({ Accept: "application/json" }, _AUTH_H, extraHeaders || {}) };
        if (!_IS_LOC) opts.credentials = "include";
        return opts;
    }

    return Controller.extend("nhvr.bridgemanagement.controller.AnalyticsDashboard",
        Object.assign({

        // ── Private state ────────────────────────────────────────
        _period: "30d",
        _configId: null,

        onInit: function () {
            // Analytics model (data for all tabs)
            var oModel = new JSONModel({
                kpis: {}, topRoutes: [], topActions: [], topErrors: [],
                features: [], underused: [],
                funnel: { summary: {}, steps: [] },
                errorTrends: [], errorSpikes: [],
                hotspots: []
            });
            this.getView().setModel(oModel, "ana");

            // Config model
            var oCfgModel = new JSONModel({
                enabled: true, sampleRatePct: 100, flushIntervalMs: 30000,
                rateLimitPerMin: 100, retentionDays: 90,
                dailyRetentionDays: 365, weeklyRetentionDays: 730, monthlyRetentionDays: 1825
            });
            this.getView().setModel(oCfgModel, "cfg");

            // Route match
            var oRouter = this.getOwnerComponent().getRouter();
            oRouter.getRoute("AnalyticsDashboard").attachPatternMatched(this._onRouteMatched, this);

            // Analytics self-tracking
            this._initAnalytics("AnalyticsDashboard");
        },

        _onRouteMatched: function () {
            // Capability guard — redirect Home if BRIDGE_IQ is disabled
            CapabilityManager.guardRoute("BRIDGE_IQ", this.getOwnerComponent().getRouter());

            this._loadAll();
        },

        onNavBack: function () {
            this.getOwnerComponent().getRouter().navTo("Home", {}, true);
        },

        onPeriodChange: function (oEvent) {
            const oItem = oEvent.getParameter("selectedItem");
            if (!oItem) return;
            this._period = oItem.getKey();
            this._loadAll();
        },

        onRefresh: function () {
            this._loadAll();
        },

        // ── Data Loading ─────────────────────────────────────────
        _getDateRange: function () {
            var to = new Date();
            var from = new Date();
            var days = parseInt(this._period, 10) || 30;
            from.setDate(from.getDate() - days);
            return {
                fromDate: from.toISOString().split("T")[0],
                toDate: to.toISOString().split("T")[0]
            };
        },

        _loadAll: function () {
            this.getView().setBusy(true);
            var self = this;
            var range = this._getDateRange();

            Promise.all([
                this._fetchSummary(range),
                this._fetchAdoption(range),
                this._fetchUnderused(range),
                this._fetchFunnels(range),
                this._fetchErrors(range),
                this._fetchPerformance(range),
                this._fetchConfig()
            ]).then(function () {
                self.getView().setBusy(false);
            }).catch(function (err) {
                Logger.error(TAG, "Load failed", err);
                self.getView().setBusy(false);
            });
        },

        _fetchJson: function (url) {
            return fetch(url, _credOpts())
                .then(function (r) { return r.ok ? r.json() : null; })
                .then(function (data) {
                    if (!data) return null;
                    // Handle LargeString wrapping
                    var val = data.value !== undefined ? data.value : data;
                    return typeof val === "string" ? JSON.parse(val) : val;
                });
        },

        _fetchSummary: function (range) {
            var self = this;
            var url = BASE + "/getAnalyticsSummary(fromDate=" + range.fromDate + ",toDate=" + range.toDate + ",granularity='daily')";
            return this._fetchJson(url).then(function (d) {
                if (!d || d.error) return;
                var m = self.getView().getModel("ana");
                // Add avg session in minutes
                d.kpis.avgSessionMin = d.kpis.avgSessionMs ? Math.round(d.kpis.avgSessionMs / 60000) : 0;
                // Add ranks
                (d.topRoutes || []).forEach(function (r, i) { r.rank = i + 1; });
                (d.topActions || []).forEach(function (a, i) { a.rank = i + 1; });
                m.setProperty("/kpis", d.kpis);
                m.setProperty("/topRoutes", d.topRoutes || []);
                m.setProperty("/topActions", d.topActions || []);
                m.setProperty("/topErrors", d.topErrors || []);
            }).catch(function (e) { Logger.warn(TAG, "Summary fetch failed", e); });
        },

        _fetchAdoption: function (range) {
            var self = this;
            var url = BASE + "/getFeatureAdoption(fromDate=" + range.fromDate + ",toDate=" + range.toDate + ")";
            return this._fetchJson(url).then(function (d) {
                if (!d || d.error) return;
                self.getView().getModel("ana").setProperty("/features", d.features || []);
            }).catch(function (e) { Logger.warn(TAG, "Adoption fetch failed", e); });
        },

        _fetchUnderused: function (range) {
            var self = this;
            var url = BASE + "/getUnderusedFeatures(fromDate=" + range.fromDate + ",toDate=" + range.toDate + ",threshold=5)";
            return this._fetchJson(url).then(function (d) {
                if (!d || d.error) return;
                self.getView().getModel("ana").setProperty("/underused", d.underused || []);
            }).catch(function (e) { Logger.warn(TAG, "Underused fetch failed", e); });
        },

        _fetchFunnels: function (range, workflowType) {
            var self = this;
            var wfParam = workflowType ? ",workflowType='" + workflowType + "'" : ",workflowType=''";
            var url = BASE + "/getWorkflowFunnels(fromDate=" + range.fromDate + ",toDate=" + range.toDate + wfParam + ")";
            return this._fetchJson(url).then(function (d) {
                if (!d || d.error) return;
                self.getView().getModel("ana").setProperty("/funnel", d);
            }).catch(function (e) { Logger.warn(TAG, "Funnels fetch failed", e); });
        },

        _fetchErrors: function (range) {
            var self = this;
            var url = BASE + "/getErrorTrends(fromDate=" + range.fromDate + ",toDate=" + range.toDate + ")";
            return this._fetchJson(url).then(function (d) {
                if (!d || d.error) return;
                self.getView().getModel("ana").setProperty("/errorTrends", d.trends || []);
                self.getView().getModel("ana").setProperty("/errorSpikes", d.spikes || []);
                self.getView().getModel("ana").setProperty("/hasSpikes", (d.spikes || []).length > 0);
            }).catch(function (e) { Logger.warn(TAG, "Errors fetch failed", e); });
        },

        _fetchPerformance: function (range) {
            var self = this;
            var url = BASE + "/getPerformanceHotspots(fromDate=" + range.fromDate + ",toDate=" + range.toDate + ",thresholdMs=3000)";
            return this._fetchJson(url).then(function (d) {
                if (!d || d.error) return;
                self.getView().getModel("ana").setProperty("/hotspots", d.hotspots || []);
            }).catch(function (e) { Logger.warn(TAG, "Performance fetch failed", e); });
        },

        // ── Config Tab ───────────────────────────────────────────
        _fetchConfig: function () {
            var self = this;
            return fetch(BASE + "/AnalyticsConfigs?$filter=configKey eq 'GLOBAL'&$top=1", _credOpts())
            .then(function (r) { return r.ok ? r.json() : null; })
            .then(function (data) {
                if (!data || !data.value || data.value.length === 0) return;
                var cfg = data.value[0];
                self._configId = cfg.ID;
                var m = self.getView().getModel("cfg");
                m.setProperty("/enabled", cfg.enabled);
                m.setProperty("/sampleRatePct", Math.round((cfg.sampleRate || 1) * 100));
                m.setProperty("/flushIntervalMs", cfg.flushIntervalMs);
                m.setProperty("/rateLimitPerMin", cfg.rateLimitPerMin);
                m.setProperty("/retentionDays", cfg.retentionDays);
                m.setProperty("/dailyRetentionDays", cfg.dailyRetentionDays);
                m.setProperty("/weeklyRetentionDays", cfg.weeklyRetentionDays);
                m.setProperty("/monthlyRetentionDays", cfg.monthlyRetentionDays);
            }).catch(function (e) { Logger.warn(TAG, "Config fetch failed", e); });
        },

        onConfigChange: function () {
            // No-op — config saved on explicit save
        },

        onSaveConfig: function () {
            if (!this._configId) {
                MessageBox.error("No analytics config found. Run the app once to bootstrap config.");
                return;
            }
            var self = this;
            var m = this.getView().getModel("cfg");
            var body = {
                enabled:              m.getProperty("/enabled"),
                sampleRate:           Math.round(m.getProperty("/sampleRatePct")) / 100,
                flushIntervalMs:      parseInt(m.getProperty("/flushIntervalMs"), 10),
                rateLimitPerMin:      parseInt(m.getProperty("/rateLimitPerMin"), 10),
                retentionDays:        parseInt(m.getProperty("/retentionDays"), 10),
                dailyRetentionDays:   parseInt(m.getProperty("/dailyRetentionDays"), 10),
                weeklyRetentionDays:  parseInt(m.getProperty("/weeklyRetentionDays"), 10),
                monthlyRetentionDays: parseInt(m.getProperty("/monthlyRetentionDays"), 10)
            };

            fetch(BASE + "/AnalyticsConfigs(" + this._configId + ")", Object.assign(_credOpts({ "Content-Type": "application/json" }), {
                method: "PATCH",
                body: JSON.stringify(body)
            })).then(function (r) {
                if (r.ok) {
                    MessageToast.show("Analytics config saved");
                    self._trackAction("config_change", { metadata: { section: "analytics" } });
                } else {
                    MessageBox.error("Failed to save config");
                }
            }).catch(function () { MessageBox.error("Failed to save config"); });
        },

        onRunRollup: function () {
            var self = this;
            MessageBox.confirm("Run analytics rollup now? This aggregates raw events into daily/weekly/monthly tables.", {
                onClose: function (sAction) {
                    if (sAction !== MessageBox.Action.OK) return;
                    self.getView().setBusy(true);
                    fetch(BASE + "/runAnalyticsRollup", Object.assign(_credOpts({ "Content-Type": "application/json" }), {
                        method: "POST",
                        body: "{}"
                    })).then(function (r) { return r.ok ? r.json() : null; })
                    .then(function (d) {
                        self.getView().setBusy(false);
                        if (d) {
                            MessageToast.show("Rollup complete: " + (d.dailyRows || 0) + " daily, " +
                                (d.weeklyRows || 0) + " weekly, " + (d.monthlyRows || 0) + " monthly rows");
                        }
                    }).catch(function () {
                        self.getView().setBusy(false);
                        MessageBox.error("Rollup failed");
                    });
                }
            });
        },

        onRunPurge: function () {
            var self = this;
            MessageBox.warning("Purge old analytics data based on retention settings? This permanently deletes data.", {
                actions: [MessageBox.Action.DELETE, MessageBox.Action.CANCEL],
                emphasizedAction: MessageBox.Action.CANCEL,
                onClose: function (sAction) {
                    if (sAction !== MessageBox.Action.DELETE) return;
                    self.getView().setBusy(true);
                    fetch(BASE + "/purgeAnalyticsData", Object.assign(_credOpts({ "Content-Type": "application/json" }), {
                        method: "POST",
                        body: "{}"
                    })).then(function (r) { return r.ok ? r.json() : null; })
                    .then(function (d) {
                        self.getView().setBusy(false);
                        if (d) {
                            MessageToast.show("Purged: " + (d.rawPurged || 0) + " raw, " +
                                (d.dailyPurged || 0) + " daily, " + (d.sessionsPurged || 0) + " sessions");
                        }
                    }).catch(function () {
                        self.getView().setBusy(false);
                        MessageBox.error("Purge failed");
                    });
                }
            });
        },

        onWorkflowTypeChange: function (oEvent) {
            var oItem = oEvent.getParameter("selectedItem");
            if (!oItem) return;
            var sType = oItem.getKey();
            this._fetchFunnels(this._getDateRange(), sType);
        }

    }, AnalyticsMixin));
});
