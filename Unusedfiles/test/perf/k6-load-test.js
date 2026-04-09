// ============================================================
// D8: k6 Performance & Load Test
// Run: k6 run test/perf/k6-load-test.js
// Requires: local CDS server running on http://localhost:4004
// ============================================================
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const BASE = 'http://localhost:4004/bridge-management';
const AUTH = 'Basic ' + __ENV.K6_AUTH || 'Basic YWRtaW46YWRtaW4='; // admin:admin

const errorRate = new Rate('errors');
const bridgeListDuration = new Trend('bridge_list_duration');
const bridgeDetailDuration = new Trend('bridge_detail_duration');
const dashboardKPIDuration = new Trend('dashboard_kpi_duration');

export const options = {
    scenarios: {
        // Scenario 1: Steady load — 10 VUs for 30s
        steady: {
            executor: 'constant-vus',
            vus: 10,
            duration: '30s',
            startTime: '0s',
        },
        // Scenario 2: Spike — ramp up to 30 VUs
        spike: {
            executor: 'ramping-vus',
            startVUs: 0,
            stages: [
                { duration: '10s', target: 30 },
                { duration: '10s', target: 30 },
                { duration: '10s', target: 0 },
            ],
            startTime: '30s',
        },
    },
    thresholds: {
        http_req_duration: ['p(95)<3000'],   // p95 < 3s
        http_req_failed: ['rate<0.01'],       // Error rate < 1%
        errors: ['rate<0.01'],
        bridge_list_duration: ['p(95)<2000'], // Bridge list < 2s
        bridge_detail_duration: ['p(95)<1000'], // Detail < 1s
        dashboard_kpi_duration: ['p(95)<2000'], // KPIs < 2s
    },
};

const headers = {
    'Authorization': AUTH,
    'Accept': 'application/json',
};

export default function () {
    // 1. Bridge list (first 100)
    let res = http.get(`${BASE}/Bridges?$top=100&$select=ID,bridgeId,name,state,condition`, { headers });
    check(res, { 'bridge list 200': (r) => r.status === 200 });
    errorRate.add(res.status !== 200);
    bridgeListDuration.add(res.timings.duration);

    // 2. Single bridge detail
    res = http.get(`${BASE}/Bridges?$filter=bridgeId eq 'B00001'&$top=1`, { headers });
    check(res, { 'bridge detail 200': (r) => r.status === 200 });
    errorRate.add(res.status !== 200);
    bridgeDetailDuration.add(res.timings.duration);

    // 3. Dashboard KPIs
    res = http.get(`${BASE}/getDashboardKPIs()`, { headers });
    check(res, { 'KPI 200': (r) => r.status === 200 });
    errorRate.add(res.status !== 200);
    dashboardKPIDuration.add(res.timings.duration);

    // 4. Restrictions list
    res = http.get(`${BASE}/Restrictions?$top=50`, { headers });
    check(res, { 'restrictions 200': (r) => r.status === 200 });
    errorRate.add(res.status !== 200);

    // 5. Health check
    res = http.get(`${BASE}/health()`, { headers });
    check(res, { 'health 200': (r) => r.status === 200 });

    sleep(0.5);
}
