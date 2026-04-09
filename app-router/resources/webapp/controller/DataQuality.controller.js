sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageToast",
    "sap/m/MessageBox",
    "nhvr/bridgemanagement/model/CapabilityManager"
], function (Controller, JSONModel, MessageToast, MessageBox, CapabilityManager) {
    "use strict";

    var BASE = "/bridge-management";

    return Controller.extend("nhvr.bridgemanagement.controller.DataQuality", {
        onInit: function () {
            CapabilityManager.guardRoute("DATA_QUALITY", this.getOwnerComponent().getRouter());
            this.getView().setModel(new JSONModel({
                overallScore: 0, completeness: 0, accuracy: 0, timeliness: 0,
                scoreColor: "Neutral", totalScored: 0,
                dist: { critical: 0, poor: 0, fair: 0, good: 0, criticalPct: 0, poorPct: 0, fairPct: 0, goodPct: 0 },
                worstBridges: [], missingFieldCounts: [], loading: false
            }), "dq");

            var oRouter = this.getOwnerComponent().getRouter();
            oRouter.getRoute("DataQuality").attachPatternMatched(this._onRouteMatched, this);
        },

        _onRouteMatched: function () {
            this._loadScores();
        },

        _loadScores: function () {
            var model = this.getView().getModel("dq");
            model.setProperty("/loading", true);

            jQuery.ajax({
                url: BASE + "/DataQualityScores?$expand=bridge($select=bridgeId,name,state)&$orderby=overallScore asc",
                headers: { Accept: "application/json" },
                success: function (data) {
                    var scores = (data.value || data.d && data.d.results || []);
                    if (scores.length === 0) {
                        model.setProperty("/loading", false);
                        return;
                    }

                    // KPIs
                    var total = scores.length;
                    var sumOverall = 0, sumCompl = 0, sumAccur = 0, sumTimel = 0;
                    var dist = { critical: 0, poor: 0, fair: 0, good: 0 };
                    var missingMap = {};

                    scores.forEach(function (s) {
                        var score = s.overallScore || 0;
                        sumOverall += score;
                        sumCompl += (s.completeness || 0);
                        sumAccur += (s.accuracy || 0);
                        sumTimel += (s.timeliness || 0);

                        if (score < 25) dist.critical++;
                        else if (score < 50) dist.poor++;
                        else if (score < 75) dist.fair++;
                        else dist.good++;

                        // Missing fields
                        var mf = s.missingFields;
                        if (mf) {
                            try {
                                var fields = typeof mf === "string" ? JSON.parse(mf) : mf;
                                if (Array.isArray(fields)) {
                                    fields.forEach(function (f) { missingMap[f] = (missingMap[f] || 0) + 1; });
                                }
                            } catch (e) { /* ignore */ }
                        }
                    });

                    var avgScore = Math.round(sumOverall / total);
                    model.setProperty("/overallScore", avgScore);
                    model.setProperty("/completeness", Math.round(sumCompl / total));
                    model.setProperty("/accuracy", Math.round(sumAccur / total));
                    model.setProperty("/timeliness", Math.round(sumTimel / total));
                    model.setProperty("/totalScored", total);
                    model.setProperty("/scoreColor", avgScore >= 75 ? "Good" : avgScore >= 50 ? "Neutral" : avgScore >= 25 ? "Critical" : "Error");

                    model.setProperty("/dist/critical", dist.critical);
                    model.setProperty("/dist/poor", dist.poor);
                    model.setProperty("/dist/fair", dist.fair);
                    model.setProperty("/dist/good", dist.good);
                    model.setProperty("/dist/criticalPct", total > 0 ? Math.round(dist.critical / total * 100) : 0);
                    model.setProperty("/dist/poorPct", total > 0 ? Math.round(dist.poor / total * 100) : 0);
                    model.setProperty("/dist/fairPct", total > 0 ? Math.round(dist.fair / total * 100) : 0);
                    model.setProperty("/dist/goodPct", total > 0 ? Math.round(dist.good / total * 100) : 0);

                    // Worst 20
                    var worst = scores.slice(0, 20).map(function (s) {
                        var sc = s.overallScore || 0;
                        return {
                            bridgeId: s.bridge ? s.bridge.bridgeId : "",
                            name: s.bridge ? s.bridge.name : "",
                            state: s.bridge ? s.bridge.state : "",
                            overallScore: Math.round(sc),
                            scoreState: sc >= 75 ? "Success" : sc >= 50 ? "None" : sc >= 25 ? "Warning" : "Error",
                            completeness: Math.round(s.completeness || 0),
                            accuracy: Math.round(s.accuracy || 0),
                            timeliness: Math.round(s.timeliness || 0),
                            missingFields: s.missingFields ? (function () {
                                try { var a = JSON.parse(s.missingFields); return Array.isArray(a) ? a.join(", ") : ""; } catch (e) { return ""; }
                            })() : ""
                        };
                    });
                    model.setProperty("/worstBridges", worst);

                    // Missing field counts
                    var mfArr = Object.keys(missingMap).map(function (f) {
                        var cnt = missingMap[f];
                        return {
                            field: f,
                            count: cnt,
                            severity: cnt > total * 0.5 ? "Error" : cnt > total * 0.25 ? "Warning" : "None"
                        };
                    }).sort(function (a, b) { return b.count - a.count; });
                    model.setProperty("/missingFieldCounts", mfArr);
                    model.setProperty("/loading", false);
                },
                error: function () {
                    model.setProperty("/loading", false);
                    MessageToast.show("Failed to load data quality scores");
                }
            });
        },

        onRecalculateAll: function () {
            var that = this;
            MessageBox.confirm("Recalculate data quality scores for all 2,126+ bridges? This may take a moment.", {
                onClose: function (action) {
                    if (action !== MessageBox.Action.OK) return;
                    jQuery.ajax({
                        url: BASE + "/calculateAllDataQuality",
                        method: "POST",
                        headers: { Accept: "application/json", "Content-Type": "application/json" },
                        data: JSON.stringify({}),
                        success: function (res) {
                            var r = typeof res === "string" ? JSON.parse(res) : (res.value ? (typeof res.value === "string" ? JSON.parse(res.value) : res.value) : res);
                            MessageToast.show("Scored " + (r.processed || 0) + " of " + (r.total || 0) + " bridges");
                            that._loadScores();
                        },
                        error: function () { MessageToast.show("Recalculation failed"); }
                    });
                }
            });
        },

        onBridgePress: function (oEvent) {
            var ctx = oEvent.getSource().getBindingContext("dq");
            if (ctx) {
                var bridgeId = ctx.getProperty("bridgeId");
                if (bridgeId) {
                    this.getOwnerComponent().getRouter().navTo("BridgeDetail", { bridgeId: bridgeId });
                }
            }
        },

        onNavBack: function () {
            window.history.go(-1);
        }
    });
});
