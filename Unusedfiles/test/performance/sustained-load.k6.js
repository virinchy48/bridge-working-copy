/**
 * NHVR Bridge Management — Sustained Load Test
 *
 * 10-minute sustained load at 100 VUs with database query timing.
 * Run with:  k6 run test/performance/sustained-load.k6.js
 *
 * Prerequisites:
 *   npm run watch   (starts local CAP server with mock auth)
 */

import http from "k6/http";
import { check, group, sleep } from "k6";
import { Rate, Trend, Counter } from "k6/metrics";
import encoding from "k6/encoding";

// ---------------------------------------------------------------------------
// Custom metrics
// ---------------------------------------------------------------------------
const bridgeListDuration = new Trend("bridge_list_duration", true);
const restrictionListDuration = new Trend("restriction_list_duration", true);
const inspectionListDuration = new Trend("inspection_list_duration", true);
const auditLogDuration = new Trend("audit_log_duration", true);
const dashboardKpiDuration = new Trend("dashboard_kpi_duration", true);
const errorRate = new Rate("request_errors");
const totalRequests = new Counter("total_requests");

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
const BASE_URL =
  __ENV.BASE_URL || "http://localhost:4004/bridge-management";

const AUTH_HEADER = `Basic ${encoding.b64encode("admin:admin")}`;

const HEADERS = {
  Accept: "application/json",
  Authorization: AUTH_HEADER,
};

// ---------------------------------------------------------------------------
// Scenario — sustained 100 VUs for 10 minutes
// ---------------------------------------------------------------------------
export const options = {
  scenarios: {
    sustained_load: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "1m", target: 100 },   // ramp 0 -> 100 over 1 min
        { duration: "10m", target: 100 },  // hold 100 VUs for 10 min
        { duration: "1m", target: 0 },     // ramp down over 1 min
      ],
      gracefulRampDown: "30s",
    },
  },
  thresholds: {
    http_req_duration: ["p(95)<3000"],       // 95th < 3s under sustained load
    http_req_failed: ["rate<0.02"],          // < 2% failure under load
    bridge_list_duration: ["p(95)<3000"],
    restriction_list_duration: ["p(95)<3000"],
    inspection_list_duration: ["p(95)<3000"],
    audit_log_duration: ["p(95)<3000"],
    dashboard_kpi_duration: ["p(95)<5000"],  // KPIs may aggregate
  },
};

// ---------------------------------------------------------------------------
// Default function — each VU cycles through these groups
// ---------------------------------------------------------------------------
export default function () {

  group("Bridge List (paginated)", () => {
    const skip = Math.floor(Math.random() * 50) * 10;
    const res = http.get(`${BASE_URL}/Bridges?$top=10&$skip=${skip}&$count=true`, { headers: HEADERS });
    bridgeListDuration.add(res.timings.duration);
    totalRequests.add(1);
    check(res, { "bridges 200": (r) => r.status === 200 }) || errorRate.add(1);
  });

  group("Restriction List (filtered)", () => {
    const states = ["ACTIVE", "DISABLED", "EXPIRED"];
    const status = states[Math.floor(Math.random() * states.length)];
    const res = http.get(`${BASE_URL}/Restrictions?$filter=status eq '${status}'&$top=20`, { headers: HEADERS });
    restrictionListDuration.add(res.timings.duration);
    totalRequests.add(1);
    check(res, { "restrictions 200": (r) => r.status === 200 }) || errorRate.add(1);
  });

  group("Inspection Orders", () => {
    const res = http.get(`${BASE_URL}/InspectionOrders?$top=10&$orderby=plannedDate desc`, { headers: HEADERS });
    inspectionListDuration.add(res.timings.duration);
    totalRequests.add(1);
    check(res, { "inspections 200": (r) => r.status === 200 }) || errorRate.add(1);
  });

  group("Audit Log (recent)", () => {
    const res = http.get(`${BASE_URL}/AuditLogs?$top=50&$orderby=timestamp desc`, { headers: HEADERS });
    auditLogDuration.add(res.timings.duration);
    totalRequests.add(1);
    check(res, { "audit 200": (r) => r.status === 200 }) || errorRate.add(1);
  });

  group("Dashboard KPIs", () => {
    const res = http.get(`${BASE_URL}/getDashboardKPIs(jurisdiction='ALL')`, { headers: HEADERS });
    dashboardKpiDuration.add(res.timings.duration);
    totalRequests.add(1);
    check(res, { "kpi 200": (r) => r.status === 200 }) || errorRate.add(1);
  });

  sleep(Math.random() * 2 + 1); // 1-3s think time
}
