// ============================================================
// NHVR Command Dashboard Controller — Compact Design
// Fetches OData V4 data, computes KPIs, renders 4-row dashboard
// Template: Bridge & Infrastructure — Asset Command
// ============================================================
sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/dom/includeStylesheet",
    "sap/m/MessageBox",
    "nhvr/bridgemanagement/util/AuthFetch"
], function (Controller, includeStylesheet, MessageBox, AuthFetch) {
    "use strict";

    var BASE_PATH = "/bridge-management";
    // Auth is now handled centrally by AuthFetch.getJson() / _credOpts().
    // The legacy createFetchOptions() helper was removed along with the raw
    // fetch() call sites it served.


    return Controller.extend("nhvr.bridgemanagement.controller.Dashboard", {

        _bridges: [],
        _restrictions: [],
        _permits: [],
        _riskAssessments: [],
        _inspectionOrders: [],
        _workOrders: [],
        _delegated: false,

        // ── BOOT ─────────────────────────────────────────────
        onInit: function () {
            includeStylesheet(sap.ui.require.toUrl("nhvr/bridgemanagement/css/dashboard.css"));
            this._loadKPIThresholds();
            this._trackPageView("Dashboard");
            this._load();

            // Re-load data when navigating back to Dashboard via hash
            var oRouter = this.getOwnerComponent().getRouter();
            var oRoute  = oRouter.getRoute("Dashboard");
            if (oRoute) {
                oRoute.attachPatternMatched(this._onRouteMatched, this);
            }
        },

        _onRouteMatched: function () {
            this._load();
        },

        onAfterRendering: function () {
            var root = document.getElementById("nhvr-cmd-dashboard");
            if (root && root.querySelector(".cmd-wrap") && !root.querySelector(".cmd-dash")) {
                this._renderAll();
            }
        },

        onRefresh: function () { this._load(); },

        // ── DATA FETCH ───────────────────────────────────────
        _fetch: function (url) {
            return AuthFetch.getJson(BASE_PATH + url)
                .then(function (j) { return j.value || []; })
                .catch(function (err) {
                    console.warn("[Dashboard] " + url + " load failed:", err.message);
                    return [];
                });
        },

        _load: function () {
            var that = this;
            // InspectionOrders + WorkOrders fetches removed in cut-down BIS
            // variant — those entities no longer exist on the server. The
            // dashboard still computes condition / risk / restriction KPIs.
            Promise.all([
                this._fetch("/Bridges?$top=5000&$select=ID,bridgeId,name,condition,conditionScore,currentRiskScore,currentRiskBand,postingStatus,scourRisk,bridgeHealthIndex,inspectionDate,state,latitude,longitude,yearBuilt,structureType,structuralDeficiencyFlag"),
                this._fetch("/Restrictions?$count=true&$top=500&$filter=status eq 'ACTIVE'&$select=ID,bridgeName,bridgeId,restrictionType,value,unit,vehicleClassName,routeCode,validFromDate,validToDate"),
                this._fetch("/VehiclePermits?$top=500&$select=permitId,permitStatus,permitType,applicantName,bridge_ID,assessedGVM_t"),
                this._fetch("/BridgeRiskAssessments?$orderby=riskScore desc&$top=20&$select=bridge_ID,riskScore,riskBand,assessmentDate")
            ]).then(function (results) {
                that._bridges = results[0];
                that._restrictions = results[1];
                that._permits = results[2];
                that._riskAssessments = results[3];
                that._inspectionOrders = [];
                that._workOrders = [];
                that._renderAll();
            });
        },

        // ── RENDER ORCHESTRATOR ──────────────────────────────
        _renderAll: function () {
            var root = document.getElementById("nhvr-cmd-dashboard");
            if (!root) return;
            var k = this._computeKpis();
            var html = '<div class="cmd-dash">' +
                this._renderHeader() +
                this._renderRow1(k) +
                this._renderRow2(k) +
                this._renderRow3(k) +
                this._renderRow4(k) +
                this._renderFooter() +
                '</div>';
            root.innerHTML = html;
            this._drawConditionDonut(k);
            this._animateBars();
            if (!this._delegated) {
                this._attachEvents(root);
                this._delegated = true;
            }
        },

        // ── KPI COMPUTATION ──────────────────────────────────
        _computeKpis: function () {
            var b = this._bridges, total = b.length || 0, now = new Date();
            var twoYearsAgo = new Date(now.getFullYear() - 2, now.getMonth(), now.getDate());
            var yr = now.getFullYear();
            var critical = 0, poor = 0, fair = 0, good = 0, closed = 0, scourCrit = 0;
            var deficiency = 0, totalScore = 0, totalBhi = 0, bhiCt = 0, totalAge = 0, ageCt = 0, inspOk = 0;

            for (var i = 0; i < b.length; i++) {
                var br = b[i];
                if (br.condition === "CRITICAL") critical++;
                else if (br.condition === "POOR") poor++;
                else if (br.condition === "FAIR") fair++;
                else good++;
                if (br.postingStatus === "CLOSED") closed++;
                if (br.scourRisk === "HIGH" || br.scourRisk === "CRITICAL") scourCrit++;
                if (br.structuralDeficiencyFlag) deficiency++;
                totalScore += (br.conditionScore || 0);
                if (br.bridgeHealthIndex != null) { totalBhi += br.bridgeHealthIndex; bhiCt++; }
                if (br.yearBuilt && br.yearBuilt > 1800) { totalAge += (yr - br.yearBuilt); ageCt++; }
                if (br.inspectionDate && new Date(br.inspectionDate) >= twoYearsAgo) inspOk++;
            }

            var pendingPermits = this._permits.filter(function (p) { return p.permitStatus === "PENDING" || p.permitStatus === "SUBMITTED" || p.permitStatus === "DRAFT"; }).length;
            var rehabVal = this._workOrders.reduce(function (s, w) { return s + (w.estimatedCost || 0); }, 0);
            var bhi = bhiCt > 0 ? Math.round(totalBhi / bhiCt) : (total > 0 ? Math.round(totalScore / total) : 0);
            var sufficiency = total > 0 ? Math.round(b.filter(function (x) { return (x.conditionScore || 0) >= 60; }).length / total * 100) : 0;
            var inspComp = total > 0 ? Math.round(inspOk / total * 100) : 0;
            var avgAge = ageCt > 0 ? Math.round(totalAge / ageCt) : 0;

            // WO breakdown
            var woHigh = 0, woMed = 0, woLow = 0, woTotal = this._workOrders.length;
            for (var w = 0; w < this._workOrders.length; w++) {
                var pr = (this._workOrders[w].priority || "LOW").toUpperCase();
                if (pr === "HIGH" || pr === "EMERGENCY") woHigh++;
                else if (pr === "MEDIUM") woMed++;
                else woLow++;
            }

            return {
                total: total, bhi: bhi, critical: critical, poor: poor, fair: fair, good: good,
                criticalRisk: critical + poor, activeRestr: this._restrictions.length,
                closures: closed, avgAge: avgAge, sufficiency: sufficiency,
                scourCrit: scourCrit, deficiency: deficiency, rehabVal: rehabVal,
                inspComp: inspComp, pendingPermits: pendingPermits,
                woTotal: woTotal, woHigh: woHigh, woMed: woMed, woLow: woLow,
                inspTotal: this._inspectionOrders.length
            };
        },

        // ── HEADER ───────────────────────────────────────────
        _renderHeader: function () {
            var ts = new Date().toLocaleString("en-AU", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZoneName: "short" });
            return '<div class="cmd-hdr">' +
                '<div class="cmd-hdr-l">' +
                '<div class="cmd-logobx"><svg viewBox="0 0 18 18" fill="none"><rect x="0" y="14" width="18" height="2" rx="1" fill="var(--bl)"/><rect x="8" y="5" width="2" height="9" rx="1" fill="var(--bl)"/><path d="M1 14 Q9 4 17 14" stroke="var(--bl)" stroke-width="1.5" fill="none" stroke-linecap="round"/></svg></div>' +
                '<div><div class="cmd-otag">National Heavy Vehicle Regulator &middot; Bridge Management</div>' +
                '<div class="cmd-htitle">Bridge &amp; Infrastructure — Asset Command</div></div>' +
                '</div>' +
                '<div class="cmd-hdr-r">' +
                '<span class="cmd-lpill"><span class="cmd-ldot"></span>Live</span>' +
                '<span class="cmd-tsmp">' + ts + '</span>' +
                '</div></div>';
        },

        // ── ROW 1: Primary KPIs ──────────────────────────────
        _renderRow1: function (k) {
            var tiles = [
                { lbl: "Total Assets", val: this._fmt(k.total), color: "bl", sub: "Bridges, culverts &amp; structures" },
                { lbl: "Critical Risk", val: this._fmt(k.criticalRisk), color: "r", sub: k.critical + " critical &middot; " + k.poor + " poor", badge: k.criticalRisk > 0 ? "Action" : "", bc: "br" },
                { lbl: "Active Restrictions", val: this._fmt(k.activeRestr), color: "a", sub: "Posted network restrictions" },
                { lbl: "Closures &amp; Disruptions", val: this._fmt(k.closures), color: "r", sub: "Bridges currently closed", badge: k.closures > 0 ? "Alert" : "", bc: "br" }
            ];
            var html = '<div class="cmd-sec">Portfolio at a glance</div><div class="cmd-g4">';
            for (var i = 0; i < tiles.length; i++) {
                var t = tiles[i];
                var bdg = t.badge ? ' <span class="cmd-bdg ' + t.bc + '">' + t.badge + '</span>' : '';
                html += '<div class="cmd-tile" data-action="drill-kpi" data-param="' + i + '" style="padding-left:21px">' +
                    '<div class="cmd-tbar" style="background:var(--' + t.color + ')"></div>' +
                    '<div class="cmd-klbl">' + t.lbl + '</div>' +
                    '<div class="cmd-kval" style="color:var(--' + (t.color === "bl" ? "tx" : t.color + "t") + ')">' + t.val + '</div>' +
                    '<div class="cmd-ksub">' + t.sub + bdg + '</div></div>';
            }
            return html + '</div>';
        },

        // ── ROW 2: Portfolio Metrics ─────────────────────────
        _renderRow2: function (k) {
            var tiles = [
                { lbl: "Avg Asset Age", val: k.avgAge + " yrs", color: "p", ctx: "Threshold: 50 yrs" },
                { lbl: "Network BHI", val: k.bhi + "%", color: k.bhi >= 60 ? "g" : "r", ctx: "Bridge Health Index &middot; " + (k.bhi >= 60 ? "Healthy" : "At Risk") },
                { lbl: "Inspection Compliance", val: k.inspComp + "%", color: k.inspComp >= 90 ? "g" : "a", ctx: "AS 5100 standard &middot; " + k.inspTotal + " pending" },
                { lbl: "Pending Permits", val: this._fmt(k.pendingPermits), color: k.pendingPermits > 0 ? "a" : "g", ctx: this._permits.length + " total permits in system" }
            ];
            var html = '<div class="cmd-sec">Portfolio metrics</div><div class="cmd-g4">';
            for (var i = 0; i < tiles.length; i++) {
                var t = tiles[i];
                html += '<div class="cmd-tile" style="padding-left:21px">' +
                    '<div class="cmd-tbar" style="background:var(--' + t.color + ')"></div>' +
                    '<div class="cmd-klbl">' + t.lbl + '</div>' +
                    '<div class="cmd-mval" style="color:var(--' + (t.color === "p" ? "tx" : t.color + "t") + ')">' + t.val + '</div>' +
                    '<div class="cmd-mctx">' + t.ctx + '</div></div>';
            }
            return html + '</div>';
        },

        // ── ROW 3: Condition + WO Backlog + Restrictions ─────
        _renderRow3: function (k) {
            var html = '<div class="cmd-sec">Condition &amp; maintenance</div><div class="cmd-g3">';
            html += this._renderConditionPanel(k);
            html += this._renderWoBacklog(k);
            html += this._renderRestrictionsPanel(k);
            html += '</div>';
            return html;
        },

        _renderConditionPanel: function (k) {
            return '<div class="cmd-tile">' +
                '<div class="cmd-klbl">Condition state distribution</div>' +
                '<div class="cmd-dwrap">' +
                '<div id="cmd-donut-svg"></div>' +
                '<div class="cmd-dleg">' +
                '<div class="cmd-drow"><span class="cmd-dsq" style="background:var(--g)"></span>Good<span class="cmd-dpct">' + this._pct(k.good, k.total) + '% &middot; ' + this._fmt(k.good) + '</span></div>' +
                '<div class="cmd-drow"><span class="cmd-dsq" style="background:var(--a)"></span>Fair<span class="cmd-dpct">' + this._pct(k.fair, k.total) + '% &middot; ' + this._fmt(k.fair) + '</span></div>' +
                '<div class="cmd-drow"><span class="cmd-dsq" style="background:var(--r)"></span>Poor<span class="cmd-dpct">' + this._pct(k.poor, k.total) + '% &middot; ' + this._fmt(k.poor) + '</span></div>' +
                '<div class="cmd-drow"><span class="cmd-dsq" style="background:#991b1b"></span>Critical<span class="cmd-dpct">' + this._pct(k.critical, k.total) + '% &middot; ' + this._fmt(k.critical) + '</span></div>' +
                '</div></div>' +
                '<div class="cmd-div"></div>' +
                '<div class="cmd-klbl">Key indicators</div>' +
                '<div class="cmd-rgrid">' +
                '<div class="cmd-rcell"><div class="cmd-rval" style="color:var(--' + (k.sufficiency >= 80 ? "gt" : "at") + ')">' + k.sufficiency + '%</div><div class="cmd-rlbl">Sufficiency</div></div>' +
                '<div class="cmd-rcell"><div class="cmd-rval" style="color:var(--' + (k.scourCrit > 0 ? "rt" : "gt") + ')">' + k.scourCrit + '</div><div class="cmd-rlbl">Scour-Crit</div></div>' +
                '<div class="cmd-rcell"><div class="cmd-rval" style="color:var(--' + (k.deficiency > 0 ? "at" : "gt") + ')">' + k.deficiency + '</div><div class="cmd-rlbl">Deficient</div></div>' +
                '</div></div>';
        },

        _renderWoBacklog: function (k) {
            var html = '<div class="cmd-tile">' +
                '<div class="cmd-klbl">Workorder backlog <span style="font-family:DM Mono,monospace;font-size:11px;text-transform:none;letter-spacing:0;color:var(--txm);font-weight:400">' + k.woTotal + ' open</span></div>' +
                '<div style="margin-top:12px">';
            html += this._woBar("High Priority", k.woHigh, k.woTotal, "r");
            html += this._woBar("Medium", k.woMed, k.woTotal, "a");
            html += this._woBar("Low / Routine", k.woLow, k.woTotal, "bl");
            html += this._woBar("Inspections", k.inspTotal, k.woTotal + k.inspTotal, "t");
            html += '</div>';
            html += '<div class="cmd-div"></div>';
            // Rehab pipeline
            html += '<div class="cmd-klbl">Rehabilitation pipeline</div>';
            html += '<div style="display:flex;justify-content:space-between;align-items:baseline;margin-top:6px">' +
                '<span style="font-size:12px;color:var(--txm)">Total estimated cost</span>' +
                '<span style="font-family:DM Mono,monospace;font-size:20px;font-weight:500;color:var(--tx)">$' + this._fmtMoney(k.rehabVal) + '</span></div>';
            html += '</div>';
            return html;
        },

        _woBar: function (label, val, max, color) {
            var pct = max > 0 ? Math.round(val / max * 100) : 0;
            return '<div class="cmd-brow"><div class="cmd-bhd"><span class="cmd-bname">' + label + '</span>' +
                '<span class="cmd-bmeta">' + val + ' &middot; ' + pct + '%</span></div>' +
                '<div class="cmd-btrack"><div class="cmd-bfill" style="width:' + pct + '%;background:var(--' + color + ')"></div></div></div>';
        },

        _renderRestrictionsPanel: function (k) {
            // Count by type
            var byType = {};
            for (var i = 0; i < this._restrictions.length; i++) {
                var t = this._restrictions[i].restrictionType || "OTHER";
                byType[t] = (byType[t] || 0) + 1;
            }
            var types = Object.keys(byType).sort(function (a, b) { return byType[b] - byType[a]; });

            var html = '<div class="cmd-tile">' +
                '<div class="cmd-klbl">Active restrictions</div>' +
                '<div style="text-align:center;padding:12px 0">' +
                '<div class="cmd-kval" style="color:var(--at);font-size:36px">' + k.activeRestr + '</div>' +
                '<div style="font-size:12px;color:var(--txm);margin-bottom:12px">posted network restrictions</div>';
            if (types.length > 0) {
                html += '<div style="display:flex;flex-wrap:wrap;gap:5px;justify-content:center;margin-bottom:14px">';
                for (var j = 0; j < Math.min(types.length, 6); j++) {
                    html += '<span class="cmd-bdg ba">' + this._esc(types[j]) + ' (' + byType[types[j]] + ')</span>';
                }
                html += '</div>';
            }
            html += '<button class="cmd-navbtn" data-action="nav-restrictions">View All Restrictions \u2192</button>';
            html += '</div>';
            // Closures mini feed
            var closed = this._bridges.filter(function (b) { return b.postingStatus === "CLOSED"; }).slice(0, 3);
            html += '<div class="cmd-div"></div><div class="cmd-klbl">Current closures</div>';
            for (var c = 0; c < closed.length; c++) {
                var cb = closed[c];
                html += '<div class="cmd-aitem" data-action="nav-bridge" data-param="' + this._esc(cb.bridgeId || "") + '">' +
                    '<div class="cmd-adot" style="background:var(--r)"></div>' +
                    '<div><div class="cmd-atxt">' + this._esc(cb.name || cb.bridgeId) + ' <span class="cmd-bdg br">Closed</span></div>' +
                    '<div class="cmd-atm">' + (cb.state || "") + '</div></div></div>';
            }
            if (closed.length === 0) html += '<div style="padding:10px 0;text-align:center;font-size:12px;color:var(--txd)">No closures</div>';
            html += '</div>';
            return html;
        },

        // ── ROW 4: Risk + Alerts + Inspections ──────────────
        _renderRow4: function (k) {
            var html = '<div class="cmd-sec">Risk &amp; inspections</div><div class="cmd-g32">';
            html += this._renderRiskRegister();
            html += this._renderAlerts();
            html += this._renderInspections();
            html += '</div>';
            return html;
        },

        _renderRiskRegister: function () {
            var bridgeMap = {};
            for (var i = 0; i < this._bridges.length; i++) bridgeMap[this._bridges[i].ID] = this._bridges[i];
            var topRisk = this._riskAssessments.slice(0, 6);
            // Fallback to bridge data if no risk assessments
            if (topRisk.length === 0) {
                var sorted = this._bridges.slice().sort(function (a, b) { return (b.currentRiskScore || 0) - (a.currentRiskScore || 0); }).slice(0, 6);
                topRisk = sorted.map(function (sb) {
                    return { bridge_ID: sb.ID, riskScore: sb.currentRiskScore || 0, riskBand: sb.currentRiskBand || (sb.currentRiskScore >= 60 ? "HIGH" : "MEDIUM"), _bridge: sb };
                });
            }
            var maxRpn = topRisk.length > 0 ? Math.max(topRisk[0].riskScore || 1, 100) : 100;

            var html = '<div class="cmd-tile">' +
                '<div class="cmd-klbl">Top risk assets <span style="font-family:DM Mono,monospace;font-size:10px;text-transform:none;letter-spacing:0;color:var(--txd);font-weight:400">RPN = Severity \u00D7 Occurrence \u00D7 Detection</span></div>' +
                '<div style="margin-top:12px">';
            for (var j = 0; j < topRisk.length; j++) {
                var r = topRisk[j];
                var bridge = r._bridge || bridgeMap[r.bridge_ID] || {};
                var pct = Math.round((r.riskScore || 0) / maxRpn * 100);
                var band = r.riskBand || "MEDIUM";
                var clr = band === "CRITICAL" ? "r" : band === "HIGH" ? "a" : "bl";
                var bdgCls = band === "CRITICAL" ? "br" : band === "HIGH" ? "ba" : "bb";
                html += '<div class="cmd-brow" style="cursor:pointer" data-action="nav-bridge" data-param="' + this._esc(bridge.bridgeId || "") + '">' +
                    '<div class="cmd-bhd"><span class="cmd-bname">' + this._esc(bridge.bridgeId || bridge.name || "Bridge") + '</span>' +
                    '<span class="cmd-bdg ' + bdgCls + '" style="font-family:DM Mono,monospace">RPN ' + (r.riskScore || 0) + '</span></div>' +
                    '<div class="cmd-btrack"><div class="cmd-bfill" style="width:' + pct + '%;background:var(--' + clr + ')"></div></div></div>';
            }
            if (topRisk.length === 0) html += '<div style="padding:14px;text-align:center;font-size:12px;color:var(--txd)">No risk data</div>';
            html += '</div></div>';
            return html;
        },

        _renderAlerts: function () {
            // Build alerts from closures, restrictions, and overdue inspections
            var alerts = [];
            var closed = this._bridges.filter(function (b) { return b.postingStatus === "CLOSED"; });
            for (var i = 0; i < Math.min(closed.length, 2); i++) {
                alerts.push({ color: "r", text: this._esc(closed[i].name || closed[i].bridgeId) + " — bridge closed to traffic", time: closed[i].state || "", bridgeId: closed[i].bridgeId });
            }
            var overdue = this._inspectionOrders.filter(function (o) { return o.plannedDate && new Date(o.plannedDate) < new Date(); });
            var bridgeMap = {};
            for (var m = 0; m < this._bridges.length; m++) bridgeMap[this._bridges[m].ID] = this._bridges[m];
            for (var k = 0; k < Math.min(overdue.length, 2); k++) {
                var br = bridgeMap[overdue[k].bridge_ID] || {};
                alerts.push({ color: "a", text: "Inspection overdue — " + this._esc(br.name || overdue[k].orderNumber), time: this._fmtDate(overdue[k].plannedDate), bridgeId: br.bridgeId });
            }
            if (this._restrictions.length > 0) {
                alerts.push({ color: "bl", text: this._restrictions.length + " active restrictions across the network", time: "Network-wide" });
            }

            var html = '<div class="cmd-tile">' +
                '<div class="cmd-klbl">Active alerts</div>';
            for (var a = 0; a < alerts.length; a++) {
                var al = alerts[a];
                html += '<div class="cmd-aitem"' + (al.bridgeId ? ' data-action="nav-bridge" data-param="' + this._esc(al.bridgeId) + '"' : '') + '>' +
                    '<div class="cmd-adot" style="background:var(--' + al.color + ')"></div>' +
                    '<div><div class="cmd-atxt">' + al.text + '</div><div class="cmd-atm">' + al.time + '</div></div></div>';
            }
            if (alerts.length === 0) html += '<div style="padding:14px;text-align:center;font-size:12px;color:var(--txd)">No active alerts</div>';
            html += '</div>';
            return html;
        },

        _renderInspections: function () {
            var bridgeMap = {};
            for (var i = 0; i < this._bridges.length; i++) bridgeMap[this._bridges[i].ID] = this._bridges[i];
            var orders = this._inspectionOrders.slice(0, 6);
            var now = new Date();

            var html = '<div class="cmd-tile">' +
                '<div class="cmd-klbl">Upcoming inspections</div>';
            for (var j = 0; j < orders.length; j++) {
                var o = orders[j];
                var bridge = bridgeMap[o.bridge_ID] || {};
                var due = o.plannedDate ? new Date(o.plannedDate) : null;
                var dueStr = due ? due.toLocaleDateString("en-AU", { day: "2-digit", month: "short" }) : "\u2014";
                var overdue = due && due < now;
                var color = overdue ? "rt" : "txm";
                html += '<div class="cmd-irow" data-action="nav-bridge" data-param="' + this._esc(bridge.bridgeId || "") + '">' +
                    '<span class="cmd-iname">' + this._esc(bridge.name || bridge.bridgeId || o.orderNumber) + '</span>' +
                    '<span class="cmd-idue" style="color:var(--' + color + ')">' + dueStr + (overdue ? " !" : "") + '</span></div>';
            }
            if (orders.length === 0) html += '<div style="padding:14px;text-align:center;font-size:12px;color:var(--txd)">No pending inspections</div>';
            html += '</div>';
            return html;
        },

        // ── FOOTER ───────────────────────────────────────────
        _renderFooter: function () {
            var ts = new Date().toLocaleString("en-AU", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
            return '<div class="cmd-foot">' +
                '<span>SAP CAP &middot; BTP &middot; AS 5100 &middot; NHVR</span>' +
                '<span>Refreshed: ' + ts + '</span></div>';
        },

        // ── DONUT ────────────────────────────────────────────
        _drawConditionDonut: function (k) {
            var el = document.getElementById("cmd-donut-svg");
            if (!el) return;
            var total = k.total || 1;
            var r = 40, cx = 50, cy = 50, circ = 2 * Math.PI * r;
            var segs = [
                { count: k.good, color: "var(--g)" },
                { count: k.fair, color: "var(--a)" },
                { count: k.poor, color: "var(--r)" },
                { count: k.critical, color: "#991b1b" }
            ];
            var svg = '<svg width="100" height="100" viewBox="0 0 100 100">';
            svg += '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke-width="13" stroke="var(--surf3)"/>';
            var offset = 0;
            for (var i = 0; i < segs.length; i++) {
                var s = segs[i];
                var pct = s.count / total;
                var dash = pct * circ;
                svg += '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="' + s.color + '" stroke-width="13" ' +
                    'stroke-dasharray="' + dash + ' ' + (circ - dash) + '" stroke-dashoffset="' + (-offset) + '" ' +
                    'transform="rotate(-90 ' + cx + ' ' + cy + ')" style="transition:stroke-dasharray .6s"/>';
                offset += dash;
            }
            var goodPct = Math.round(k.good / total * 100);
            svg += '<text x="' + cx + '" y="' + (cy - 2) + '" text-anchor="middle" fill="var(--tx)" font-family="DM Mono,monospace" font-size="15" font-weight="500">' + goodPct + '%</text>';
            svg += '<text x="' + cx + '" y="' + (cy + 10) + '" text-anchor="middle" fill="var(--txm)" font-family="Instrument Sans,system-ui" font-size="9">good</text>';
            svg += '</svg>';
            el.innerHTML = svg;
        },

        // ── ANIMATE BARS ─────────────────────────────────────
        _animateBars: function () {
            var fills = document.querySelectorAll(".cmd-bfill");
            for (var i = 0; i < fills.length; i++) {
                var f = fills[i];
                var w = f.style.width;
                f.style.width = "0";
                (function (el, width) {
                    requestAnimationFrame(function () {
                        requestAnimationFrame(function () { el.style.width = width; });
                    });
                })(f, w);
            }
        },

        // ── EVENT DELEGATION ─────────────────────────────────
        _attachEvents: function (root) {
            var that = this;
            root.addEventListener("click", function (e) {
                var target = e.target.closest("[data-action]");
                if (!target) return;
                var action = target.dataset.action;
                var param = target.dataset.param || "";
                switch (action) {
                    case "drill-kpi":
                        that._drillKpi(parseInt(param, 10));
                        break;

                    case "nav-bridge":
                        if (param) that.getOwnerComponent().getRouter().navTo("BridgeDetail", { bridgeId: encodeURIComponent(param) });
                        break;
                    case "nav-restrictions":
                        that.getOwnerComponent().getRouter().navTo("RestrictionsList", { "?query": { status: "ACTIVE" } });
                        break;
                }
            });
        },

        // ── DRILL-DOWN NAV ───────────────────────────────────
        _drillKpi: function (index) {
            var filters = [
                {},
                { condition: "HIGH_RISK" },
                { status: "ACTIVE" },
                { postingStatus: "CLOSED" }
            ];
            var routes = ["BridgesList", "BridgesList", "RestrictionsList", "BridgesList"];
            var route = routes[index] || "BridgesList";
            var filter = filters[index] || {};
            this.getOwnerComponent().getRouter().navTo(route, { "?query": filter });
        },

        // ── NAVIGATION ───────────────────────────────────────
        onNavHome: function () { this.getOwnerComponent().getRouter().navTo("Home"); },

        onInfoPressDashboard: function () {
            MessageBox.information(
                "Asset Command Dashboard \u2014 KPI Guide\n\n" +
                "TOTAL ASSETS: All bridges in the NHVR registry\n" +
                "CRITICAL RISK: Bridges with condition = CRITICAL or POOR\n" +
                "ACTIVE RESTRICTIONS: Posted network restrictions\n" +
                "CLOSURES: Bridges currently closed to traffic\n\n" +
                "RPN = Risk Priority Number = Severity \u00D7 Occurrence \u00D7 Detection (1\u2013100)\n\n" +
                "Condition: AS 5100 rating standard\n" +
                "Inspection Levels: L1 Annual \u00B7 L2 Biennial \u00B7 L3 Engineering \u00B7 L4 Special\n\n" +
                "Click any KPI tile to drill down. Click bridge names to open detail page.",
                { title: "Dashboard Guide" }
            );
        },

        // ── UTILITY ──────────────────────────────────────────
        _fmt: function (n) { return n != null ? n.toLocaleString() : "\u2014"; },
        _fmtMoney: function (n) {
            if (n >= 1000000) return (n / 1000000).toFixed(1) + "M";
            if (n >= 1000) return (n / 1000).toFixed(0) + "K";
            return String(n || 0);
        },
        _fmtDate: function (d) {
            if (!d) return "\u2014";
            return new Date(d).toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" });
        },
        _pct: function (val, total) { return total > 0 ? Math.round(val / total * 100) : 0; },
        _esc: function (s) {
            if (!s) return "";
            return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
        },

        // ── v4.0 KPI THRESHOLDS (Phase 6.3) ─────────────────────
        _kpiThresholds: {
            INSPECTION_OVERDUE_DAYS: { warning: 365, critical: 730 },
            RESTRICTION_EXPIRY_DAYS: { warning: 30, critical: 7 },
            CONDITION_AT_RISK_SCORE: { warning: 50, critical: 40 },
            COMPLIANCE_TARGET_PCT: { warning: 90, critical: 80 }
        },

        _loadKPIThresholds: function () {
            var self = this;
            this._fetch("/KPIThresholds?$filter=isActive eq true").then(function (items) {
                (items || []).forEach(function (t) {
                    self._kpiThresholds[t.kpiKey] = { warning: parseFloat(t.warningValue), critical: parseFloat(t.criticalValue) };
                });
            }).catch(function () { /* use defaults */ });
        },

        // ── v4.0 USER ANALYTICS TRACKING ─────────────────────────
        _trackPageView: function (screenName) {
            try {
                var entry = {
                    screen: screenName || "Dashboard",
                    user: "anonymous",
                    timestamp: new Date().toISOString(),
                    sessionId: window.sessionStorage.getItem("nhvr_session_id") || this._initSession()
                };
                var views = JSON.parse(window.localStorage.getItem("nhvr_analytics_views") || "[]");
                views.push(entry);
                // Keep last 500 entries
                if (views.length > 500) views = views.slice(-500);
                window.localStorage.setItem("nhvr_analytics_views", JSON.stringify(views));
            } catch (e) { /* analytics non-critical */ }
        },

        _trackAction: function (action, detail) {
            try {
                var entry = {
                    action: action,
                    detail: detail || "",
                    screen: "Dashboard",
                    timestamp: new Date().toISOString(),
                    sessionId: window.sessionStorage.getItem("nhvr_session_id") || ""
                };
                var actions = JSON.parse(window.localStorage.getItem("nhvr_analytics_actions") || "[]");
                actions.push(entry);
                if (actions.length > 500) actions = actions.slice(-500);
                window.localStorage.setItem("nhvr_analytics_actions", JSON.stringify(actions));
            } catch (e) { /* analytics non-critical */ }
        },

        _initSession: function () {
            var id = "s-" + Date.now() + "-" + Math.random().toString(36).substr(2, 6);
            window.sessionStorage.setItem("nhvr_session_id", id);
            return id;
        }
    });
});
