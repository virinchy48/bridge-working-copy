/**
 * NHVR Bridge Management — k6 Load Test
 *
 * Targets the local CAP OData V4 service at http://localhost:4004/bridge-management/
 * Run with:  k6 run test/performance/load-test.k6.js
 *
 * Prerequisites:
 *   npm run watch   (starts local CAP server with mock auth)
 */

import http from "k6/http";
import { check, group, sleep } from "k6";
import { Rate, Trend } from "k6/metrics";

// ---------------------------------------------------------------------------
// Custom metrics per endpoint
// ---------------------------------------------------------------------------
const bridgeListDuration = new Trend("bridge_list_duration", true);
const bridgeFilterDuration = new Trend("bridge_filter_duration", true);
const bridgeDetailDuration = new Trend("bridge_detail_duration", true);
const routeListDuration = new Trend("route_list_duration", true);
const healthCheckDuration = new Trend("health_check_duration", true);
const errorRate = new Rate("request_errors");

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
const BASE_URL =
  __ENV.BASE_URL || "http://localhost:4004/bridge-management";

// Basic auth for local CAP mock-auth (user: admin / password: admin)
const AUTH_HEADER = `Basic ${encoding.b64encode("admin:admin")}`;

const HEADERS = {
  Accept: "application/json",
  Authorization: AUTH_HEADER,
};

// A known Bridge ID used for the detail-with-expand call.
// Override via env var if your seed data uses a different ID.
const SAMPLE_BRIDGE_ID =
  __ENV.BRIDGE_ID || "d1a1f9a0-0001-4000-8000-000000000001";

// ---------------------------------------------------------------------------
// Scenario — ramp-up / steady / ramp-down
// ---------------------------------------------------------------------------
export const options = {
  scenarios: {
    ramp_load: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "1m", target: 50 },  // ramp 0 -> 50 over 1 min
        { duration: "3m", target: 50 },  // hold 50 VUs for 3 min
        { duration: "1m", target: 0 },   // ramp down over 1 min
      ],
      gracefulRampDown: "30s",
    },
  },
  thresholds: {
    http_req_duration: ["p(95)<2000"],   // 95th percentile < 2 s
    http_req_failed: ["rate<0.01"],      // < 1 % failure rate
    bridge_list_duration: ["p(95)<2000"],
    bridge_filter_duration: ["p(95)<2000"],
    bridge_detail_duration: ["p(95)<2000"],
    route_list_duration: ["p(95)<2000"],
    health_check_duration: ["p(95)<1000"],
  },
};

// ---------------------------------------------------------------------------
// Helper — issue GET and record custom metric
// ---------------------------------------------------------------------------
function get(url, tags, customTrend) {
  const res = http.get(url, {
    headers: HEADERS,
    tags: tags,
  });

  const ok =
    res.status === 200 || res.status === 204 || res.status === 304;
  errorRate.add(!ok);

  if (customTrend) {
    customTrend.add(res.timings.duration);
  }

  return res;
}

// ---------------------------------------------------------------------------
// Default function — executed by each VU on every iteration
// ---------------------------------------------------------------------------
export default function () {
  // 1. Bridge list (top 20)
  group("GET Bridges list (top 20)", () => {
    const res = get(
      `${BASE_URL}/Bridges?$top=20&$orderby=bridgeId`,
      { endpoint: "bridge_list" },
      bridgeListDuration
    );
    check(res, {
      "bridge list: status 200": (r) => r.status === 200,
      "bridge list: returns array": (r) => {
        const body = r.json();
        return body && Array.isArray(body.value);
      },
    });
  });

  sleep(0.5);

  // 2. Bridge filtered by state
  group("GET Bridges filtered by state", () => {
    const res = get(
      `${BASE_URL}/Bridges?$filter=state eq 'NSW'&$top=20`,
      { endpoint: "bridge_filter_state" },
      bridgeFilterDuration
    );
    check(res, {
      "bridge filter: status 200": (r) => r.status === 200,
      "bridge filter: returns array": (r) => {
        const body = r.json();
        return body && Array.isArray(body.value);
      },
    });
  });

  sleep(0.5);

  // 3. Bridge detail with restrictions expand
  group("GET Bridge detail with expand", () => {
    const res = get(
      `${BASE_URL}/Bridges(${SAMPLE_BRIDGE_ID})?$expand=restrictions`,
      { endpoint: "bridge_detail_expand" },
      bridgeDetailDuration
    );
    check(res, {
      "bridge detail: status 200 or 404": (r) =>
        r.status === 200 || r.status === 404,
    });
  });

  sleep(0.5);

  // 4. Routes list
  group("GET Routes list", () => {
    const res = get(
      `${BASE_URL}/Routes`,
      { endpoint: "route_list" },
      routeListDuration
    );
    check(res, {
      "routes list: status 200": (r) => r.status === 200,
      "routes list: returns array": (r) => {
        const body = r.json();
        return body && Array.isArray(body.value);
      },
    });
  });

  sleep(0.5);

  // 5. Health check (function import)
  group("GET health()", () => {
    const res = get(
      `${BASE_URL}/health()`,
      { endpoint: "health_check" },
      healthCheckDuration
    );
    check(res, {
      "health: status 200": (r) => r.status === 200,
    });
  });

  // Think-time between iterations (1-3 seconds)
  sleep(Math.random() * 2 + 1);
}

// ---------------------------------------------------------------------------
// Lifecycle hooks
// ---------------------------------------------------------------------------
export function setup() {
  // Verify the server is reachable before running the full test
  const res = http.get(`${BASE_URL}/Bridges?$top=1`, {
    headers: HEADERS,
    tags: { endpoint: "setup_check" },
  });

  if (res.status !== 200) {
    console.error(
      `Setup check failed (status ${res.status}). ` +
        `Ensure the CAP server is running at ${BASE_URL}`
    );
  }

  return { baseUrl: BASE_URL };
}

export function teardown(data) {
  console.log(`Load test complete against ${data.baseUrl}`);
}
