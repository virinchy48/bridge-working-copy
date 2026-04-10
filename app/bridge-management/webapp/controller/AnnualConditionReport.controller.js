// ============================================================
// NHVR Annual Bridge Condition Report Controller
// Statutory report — AS 5100 / AustRoads BIMM annual summary
// ============================================================
sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageToast",
    "sap/m/MessageBox",
    "nhvr/bridgemanagement/util/LookupService"
], function (Controller, JSONModel, MessageToast, MessageBox, LookupService) {
    "use strict";

    const BASE = "/bridge-management";

    return Controller.extend("nhvr.bridgemanagement.controller.AnnualConditionReport", {

        onInit: function () {
            this._model = new JSONModel({
                conditionByState    : [],
                criticalBridges     : [],
                inspectionCompliance: [],
                restrictionsSummary : []
            });
            this.getView().setModel(this._model, "annualReport");

            var router = this.getOwnerComponent().getRouter();
            router.getRoute("AnnualConditionReport").attachPatternMatched(this._onRouteMatched, this);

            // Populate year Select dynamically (rolling 5-year window)
            var oYearSelect = this.byId("reportYear");
            if (oYearSelect) {
                oYearSelect.removeAllItems();
                var currentYear = new Date().getFullYear();
                for (var y = currentYear; y >= currentYear - 4; y--) {
                    var fyLabel = (y - 1) + "-" + String(y).slice(2);
                    oYearSelect.addItem(new sap.ui.core.Item({ key: String(y), text: fyLabel }));
                }
            }

            // Populate state Select from OData Lookups
            LookupService.load().then(function () {
                LookupService.populateSelect(this.byId("reportJurisdiction"), "STATE", "All States");
            }.bind(this));
        },

        _onRouteMatched: function () {
            var today = new Date();
            var self  = this;
            function d(ctrl) { return self.byId(ctrl); }
            if (d("rptDate")) {
                d("rptDate").setText(
                    today.getDate().toString().padStart(2, "0") + "/" +
                    (today.getMonth() + 1).toString().padStart(2, "0") + "/" +
                    today.getFullYear()
                );
            }
            if (d("reportBannerTitle")) {
                d("reportBannerTitle").setText(
                    "Annual Bridge Condition Report — FY " +
                    (today.getFullYear() - 1) + "-" + String(today.getFullYear()).slice(2)
                );
            }
        },

        onParameterChange: function () {
            // Parameters changed — user should click Generate Report
        },

        onGenerateReport: function () {
            var year  = this.byId("reportYear")         ? this.byId("reportYear").getSelectedKey()         : String(new Date().getFullYear());
            var state = this.byId("reportJurisdiction") ? this.byId("reportJurisdiction").getSelectedKey() : "ALL";
            var route = this.byId("reportRouteType")    ? this.byId("reportRouteType").getSelectedKey()    : "ALL";

            var page = this.byId("annualReportPage");
            if (page) { page.setBusy(true); }

            var h = { Accept: "application/json" };
            var stateFilter = (state !== "ALL") ? ("&$filter=state eq '" + state + "'") : "";
            var routeFilter;
            if (route === "FREIGHT") {
                routeFilter = stateFilter ? (stateFilter + " and freightRoute eq true") : "&$filter=freightRoute eq true";
            } else if (route === "NHVR_ASSESSED") {
                routeFilter = stateFilter ? (stateFilter + " and nhvrRouteAssessed eq true") : "&$filter=nhvrRouteAssessed eq true";
            } else {
                routeFilter = stateFilter;
            }

            var self = this;
            var url  = BASE + "/Bridges?$select=bridgeId,name,state,condition,conditionRating,conditionScore,postingStatus,scourRisk,inspectionDate,nextInspectionDueDate,freightRoute,nhvrRouteAssessed,roadRoute&$orderby=state,condition" + routeFilter + "&$top=5000";

            fetch(url, { headers: h })
                .then(function (r) { if (!r.ok) { throw new Error("HTTP " + r.status); } return r.json(); })
                .then(function (j) {
                    var bridges = j.value || [];
                    self._processReportData(bridges, year);
                    if (page) { page.setBusy(false); }
                    MessageToast.show("Report generated: " + bridges.length + " bridges");
                })
                .catch(function (err) {
                    if (page) { page.setBusy(false); }
                    MessageBox.error("Report generation failed: " + err.message);
                });

            // Also load restrictions summary
            fetch(BASE + "/Restrictions?$select=restrictionType,status,permitRequired,isTemporary&$top=5000", { headers: h })
                .then(function (r) { return r.json(); })
                .then(function (j) { self._processRestrictionsSummary(j.value || []); })
                .catch(function () {});
        },

        _processReportData: function (bridges, year) {
            var states  = ["NSW", "VIC", "QLD", "WA", "SA", "TAS", "ACT", "NT"];
            var cutoff  = new Date();
            cutoff.setFullYear(cutoff.getFullYear() - 2);

            // Condition breakdown by state
            var conditionByState = states.map(function (s) {
                var sb       = bridges.filter(function (b) { return b.state === s; });
                var good     = sb.filter(function (b) { return b.condition === "GOOD"; }).length;
                var fair     = sb.filter(function (b) { return b.condition === "FAIR"; }).length;
                var poor     = sb.filter(function (b) { return b.condition === "POOR"; }).length;
                var critical = sb.filter(function (b) { return b.condition === "CRITICAL"; }).length;
                var inspected = sb.filter(function (b) { return b.inspectionDate && new Date(b.inspectionDate) >= cutoff; }).length;
                var ratings  = sb.map(function (b) { return Number(b.conditionRating) || 0; }).filter(function (r) { return r > 0; });
                var avgRating    = ratings.length ? (ratings.reduce(function (a, b) { return a + b; }, 0) / ratings.length).toFixed(1) : "—";
                var compliance   = sb.length ? Math.round((inspected / sb.length) * 100) + "%" : "—";
                return { state: s, total: sb.length, good: good, fair: fair, poor: poor, critical: critical, compliance: compliance, avgRating: avgRating };
            }).filter(function (s) { return s.total > 0; });

            // Critical bridges list
            var order = { CRITICAL: 0, POOR: 1, FAIR: 2, GOOD: 3 };
            var criticalBridges = bridges
                .filter(function (b) {
                    return b.condition === "CRITICAL" || b.condition === "POOR" ||
                           b.scourRisk === "CRITICAL" || b.scourRisk === "HIGH";
                })
                .sort(function (a, b) {
                    return ((order[a.condition] !== undefined ? order[a.condition] : 9) -
                            (order[b.condition] !== undefined ? order[b.condition] : 9));
                })
                .slice(0, 100);

            // Inspection compliance by state
            var inspectionCompliance = states.map(function (s) {
                var sb        = bridges.filter(function (b) { return b.state === s; });
                var inspected = sb.filter(function (b) { return b.inspectionDate && new Date(b.inspectionDate) >= cutoff; }).length;
                var overdue   = sb.filter(function (b) { return !b.inspectionDate || new Date(b.inspectionDate) < cutoff; }).length;
                var neverInsp = sb.filter(function (b) { return !b.inspectionDate; }).length;
                var compliance = sb.length ? Math.round((inspected / sb.length) * 100) + "%" : "—";
                return { state: s, total: sb.length, inspected: inspected, overdue: overdue, neverInspected: neverInsp, compliancePct: compliance };
            }).filter(function (s) { return s.total > 0; });

            this._model.setProperty("/conditionByState", conditionByState);
            this._model.setProperty("/criticalBridges", criticalBridges);
            this._model.setProperty("/inspectionCompliance", inspectionCompliance);

            // Top-level KPIs
            var total     = bridges.length;
            var good      = bridges.filter(function (b) { return b.condition === "GOOD"; }).length;
            var fair      = bridges.filter(function (b) { return b.condition === "FAIR"; }).length;
            var poor      = bridges.filter(function (b) { return b.condition === "POOR"; }).length;
            var critical  = bridges.filter(function (b) { return b.condition === "CRITICAL"; }).length;
            var inspected = bridges.filter(function (b) { return b.inspectionDate && new Date(b.inspectionDate) >= cutoff; }).length;
            var overdue   = total - inspected;
            var score     = total > 0 ? String(Math.round((good * 100 + fair * 70 + poor * 40 + critical * 10) / total)) : "—";
            var compliance = total > 0 ? Math.round((inspected / total) * 100) + "%" : "—";

            var self = this;
            function s(id) { return self.byId(id); }
            if (s("kpiTotalBridges"))      { s("kpiTotalBridges").setText(total + " bridges"); }
            if (s("kpiGood"))              { s("kpiGood").setText(good + " (" + (total > 0 ? Math.round(good / total * 100) : 0) + "%)"); }
            if (s("kpiFair"))              { s("kpiFair").setText(fair + " (" + (total > 0 ? Math.round(fair / total * 100) : 0) + "%)"); }
            if (s("kpiPoor"))              { s("kpiPoor").setText(poor + " (" + (total > 0 ? Math.round(poor / total * 100) : 0) + "%)"); }
            if (s("kpiCritical"))          { s("kpiCritical").setText(critical + " (" + (total > 0 ? Math.round(critical / total * 100) : 0) + "%)"); }
            if (s("kpiInspectedThisYear")) { s("kpiInspectedThisYear").setText(inspected + " (" + compliance + ")"); }
            if (s("kpiOverdueInsp"))       { s("kpiOverdueInsp").setText(overdue + " overdue"); }
            if (s("kpiNetworkScore"))      { s("kpiNetworkScore").setText("Network Health Score: " + score + "/100"); }
            if (s("kpiComplianceRate"))    { s("kpiComplianceRate").setText("Inspection Compliance: " + compliance); }
            if (s("kpiHighRisk")) {
                s("kpiHighRisk").setText("High/Critical Risk: " + (poor + critical) + " bridges");
                s("kpiHighRisk").setState(critical > 0 ? "Error" : poor > 0 ? "Warning" : "None");
            }

            this._exportData         = criticalBridges;
            this._exportFileName     = "nhvr-annual-condition-report-" + year;

            // Build column templates for tables (only on first run)
            this._buildConditionByStateColumns();
            this._buildCriticalBridgesColumns();
            this._buildInspComplianceColumns();
        },

        _processRestrictionsSummary: function (restrictions) {
            var typeCounts = {};
            var activeCount = 0;
            restrictions.forEach(function (r) {
                var key = r.restrictionType || "UNKNOWN";
                if (!typeCounts[key]) {
                    typeCounts[key] = { restrictionType: key, count: 0, permitRequired: 0, temporary: 0 };
                }
                typeCounts[key].count++;
                if (r.permitRequired) { typeCounts[key].permitRequired++; }
                if (r.isTemporary)    { typeCounts[key].temporary++; }
                if (r.status === "ACTIVE") { activeCount++; }
            });
            var summary = Object.values(typeCounts)
                .sort(function (a, b) { return b.count - a.count; });
            this._model.setProperty("/restrictionsSummary", summary);
            this._buildRestrictionsSummaryColumns();

            // Update the Active Restrictions KPI card
            var kpi = this.byId("kpiActiveRestrictions");
            if (kpi) {
                kpi.setText(activeCount + " active");
                kpi.setState(activeCount > 0 ? "Warning" : "Success");
            }
        },

        _buildConditionByStateColumns: function () {
            var oTable = this.byId("conditionByStateTable");
            if (!oTable || this._colsBuilt_condState) { return; }
            this._colsBuilt_condState = true;
            var fields = ["state", "total", "good", "fair", "poor", "critical", "compliance", "avgRating"];
            var cols = oTable.getColumns();
            if (cols.length > 0) {
                // XML columns already have headers — just set bound templates
                cols.forEach(function (col, i) {
                    if (fields[i]) col.setTemplate(new sap.m.Text({ text: "{annualReport>" + fields[i] + "}" }));
                });
            } else {
                fields.forEach(function (f) {
                    oTable.addColumn(new sap.ui.table.Column({ template: new sap.m.Text({ text: "{annualReport>" + f + "}" }) }));
                });
            }
        },

        _buildCriticalBridgesColumns: function () {
            var oTable = this.byId("criticalBridgesTable");
            if (!oTable || this._colsBuilt_critical) { return; }
            this._colsBuilt_critical = true;
            var fields = ["bridgeId", "name", "state", "condition", "conditionRating", "scourRisk", "inspectionDate", "postingStatus", "roadRoute"];
            var cols = oTable.getColumns();
            if (cols.length > 0) {
                cols.forEach(function (col, i) {
                    if (fields[i]) {
                        if (fields[i] === "condition") {
                            col.setTemplate(new sap.m.ObjectStatus({ text: "{annualReport>condition}", state: "{= ${annualReport>condition} === 'CRITICAL' ? 'Error' : ${annualReport>condition} === 'POOR' ? 'Warning' : 'None' }" }));
                        } else {
                            col.setTemplate(new sap.m.Text({ text: "{annualReport>" + fields[i] + "}" }));
                        }
                    }
                });
            } else {
                fields.forEach(function (f) {
                    oTable.addColumn(new sap.ui.table.Column({ template: new sap.m.Text({ text: "{annualReport>" + f + "}" }) }));
                });
            }
        },

        _buildInspComplianceColumns: function () {
            var oTable = this.byId("inspComplianceTable");
            if (!oTable || this._colsBuilt_insp) { return; }
            this._colsBuilt_insp = true;
            var fields = ["state", "total", "inspected", "overdue", "neverInspected", "compliancePct"];
            var cols = oTable.getColumns();
            if (cols.length > 0) {
                cols.forEach(function (col, i) {
                    if (fields[i]) col.setTemplate(new sap.m.Text({ text: "{annualReport>" + fields[i] + "}" }));
                });
            } else {
                fields.forEach(function (f) {
                    oTable.addColumn(new sap.ui.table.Column({ template: new sap.m.Text({ text: "{annualReport>" + f + "}" }) }));
                });
            }
        },

        _buildRestrictionsSummaryColumns: function () {
            var oTable = this.byId("restrictionsSummaryTable");
            if (!oTable || this._colsBuilt_restSummary) { return; }
            this._colsBuilt_restSummary = true;
            var fields = ["restrictionType", "count", "permitRequired", "temporary"];
            var cols = oTable.getColumns();
            if (cols.length > 0) {
                cols.forEach(function (col, i) {
                    if (fields[i]) col.setTemplate(new sap.m.Text({ text: "{annualReport>" + fields[i] + "}" }));
                });
            } else {
                fields.forEach(function (f) {
                    oTable.addColumn(new sap.ui.table.Column({ template: new sap.m.Text({ text: "{annualReport>" + f + "}" }) }));
                });
            }
        },

        onExportPdf: function () {
            window.print();
        },

        onExportExcel: function () {
            if (!this._exportData || !this._exportData.length) {
                MessageToast.show("Generate the report first before exporting.");
                return;
            }
            // Build CSV from critical bridges data
            var headers = ["Bridge ID", "Name", "State", "Condition", "Rating", "Scour Risk", "Last Inspection", "Posting Status", "Road Route"];
            var fields  = ["bridgeId", "name", "state", "condition", "conditionRating", "scourRisk", "inspectionDate", "postingStatus", "roadRoute"];
            var rows    = [headers.join(",")];
            this._exportData.forEach(function (row) {
                rows.push(fields.map(function (f) {
                    var val = (row[f] !== undefined && row[f] !== null) ? String(row[f]) : "";
                    return val.indexOf(",") >= 0 ? '"' + val + '"' : val;
                }).join(","));
            });
            var csv  = rows.join("\n");
            var blob = new Blob([csv], { type: "text/csv" });
            var url  = URL.createObjectURL(blob);
            var a    = document.createElement("a");
            a.href   = url;
            a.download = (this._exportFileName || "nhvr-annual-condition-report") + ".csv";
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        },

        onInfoPress: function () {
            MessageBox.information(
                "Annual Bridge Condition Report\n\n" +
                "STATUTORY BASIS:\nThis report fulfils requirements under the Heavy Vehicle National Law (HVNL) " +
                "and NHVR reporting obligations to state and territory road authorities.\n\n" +
                "CONDITION RATINGS (AS 5100.7):\n" +
                "  1-3 GOOD: No significant deterioration\n" +
                "  4-6 FAIR: Moderate deterioration, maintenance planned\n" +
                "  7-8 POOR: Significant deterioration, repair required\n" +
                "  9-10 CRITICAL: Severe deterioration, urgent action required\n\n" +
                "INSPECTION COMPLIANCE:\nRoutine inspection cycle = 2 years (AS 5100.7 §6.2)\n" +
                "Principal inspection cycle = 6 years\n\n" +
                "DATA SOURCE: NHVR Bridge Management System v3 — HANA Cloud",
                { title: "About This Report" }
            );
        },

        onNavHome: function () {
            this.getOwnerComponent().getRouter().navTo("Home");
        },

        onNavToReports: function () {
            this.getOwnerComponent().getRouter().navTo("Reports");
        }

    });
});
