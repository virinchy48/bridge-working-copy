/* ────────────────────────────────────────────────────────────────
   NHVR Usage Analytics — Service Extension
   Extends BridgeManagementService with analytics endpoints
   ──────────────────────────────────────────────────────────────── */

using nhvr from '../db/analytics';
using from './service';

// ── Inline type for ingested events ──────────────────────────────
type AnalyticsEventInput {
    category        : String(30);
    eventType       : String(50);
    sessionId       : String(36);
    targetRoute     : String(80);
    targetEntityId  : String(16);
    durationMs      : Integer;
    resultCount     : Integer;
    errorCode       : String(10);
    errorMessage    : String(200);
    metadata        : String(500);
    browserCategory : String(30);
    screenBucket    : String(10);
    workflowId      : String(36);
    workflowStep    : Integer;
    workflowTotal   : Integer;
    timestamp       : String(30);
}

extend service BridgeManagementService {

    // ── Ingestion (all authenticated users) ──────────────────────
    @restrict: [{ to: 'authenticated-user' }]
    action ingestEvents(events: many AnalyticsEventInput) returns {
        accepted : Integer;
        dropped  : Integer;
    };

    // ── Config (read: all, write: BridgeManager/Admin) ───────────────
    @restrict: [
        { grant: ['READ'],                    to: 'authenticated-user' },
        { grant: ['CREATE','UPDATE','DELETE'], to: ['BridgeManager','Admin'] }
    ]
    entity AnalyticsConfigs as projection on nhvr.AnalyticsConfig;

    // ── Raw data (BridgeManager + Admin, read-only) ──────────────────
    @readonly
    @restrict: [{ grant: ['READ'], to: ['BridgeManager','Admin'] }]
    entity AnalyticsEvents as projection on nhvr.AnalyticsEvent;

    @readonly
    @restrict: [{ grant: ['READ'], to: ['BridgeManager','Admin'] }]
    entity AnalyticsSessions as projection on nhvr.AnalyticsSession;

    // ── Aggregates (BridgeManager + Admin, read-only) ────────────────
    @readonly
    @restrict: [{ grant: ['READ'], to: ['BridgeManager','Admin'] }]
    entity AnalyticsDailyAggs as projection on nhvr.AnalyticsDailyAgg;

    @readonly
    @restrict: [{ grant: ['READ'], to: ['BridgeManager','Admin'] }]
    entity AnalyticsWeeklyAggs as projection on nhvr.AnalyticsWeeklyAgg;

    @readonly
    @restrict: [{ grant: ['READ'], to: ['BridgeManager','Admin'] }]
    entity AnalyticsMonthlyAggs as projection on nhvr.AnalyticsMonthlyAgg;

    // ── Reporting Functions (BridgeManager + Admin) ──────────────────
    @restrict: [{ to: ['BridgeManager','Admin'] }]
    function getAnalyticsSummary(
        fromDate    : Date,
        toDate      : Date,
        granularity : String(10)    // 'daily', 'weekly', 'monthly'
    ) returns LargeString;          // JSON payload

    @restrict: [{ to: ['BridgeManager','Admin'] }]
    function getFeatureAdoption(
        fromDate : Date,
        toDate   : Date
    ) returns LargeString;

    @restrict: [{ to: ['BridgeManager','Admin'] }]
    function getUnderusedFeatures(
        fromDate  : Date,
        toDate    : Date,
        threshold : Integer         // min events to be "used"
    ) returns LargeString;

    @restrict: [{ to: ['BridgeManager','Admin'] }]
    function getWorkflowFunnels(
        fromDate     : Date,
        toDate       : Date,
        workflowType : String(50)
    ) returns LargeString;

    @restrict: [{ to: ['BridgeManager','Admin'] }]
    function getErrorTrends(
        fromDate : Date,
        toDate   : Date
    ) returns LargeString;

    @restrict: [{ to: ['BridgeManager','Admin'] }]
    function getPerformanceHotspots(
        fromDate    : Date,
        toDate      : Date,
        thresholdMs : Integer       // flag routes slower than this
    ) returns LargeString;

    // ── Cohort & Segmentation (BridgeManager + Admin) ─────────────────
    @restrict: [{ to: ['BridgeManager','Admin'] }]
    function getAnalyticsByRole(
        fromDate : Date,
        toDate   : Date
    ) returns LargeString;

    @restrict: [{ to: ['BridgeManager','Admin'] }]
    function getAnalyticsByTenant(
        fromDate : Date,
        toDate   : Date
    ) returns LargeString;

    // ── Export (BridgeManager + Admin) ───────────────────────────────
    @restrict: [{ to: ['BridgeManager','Admin'] }]
    action exportAnalyticsCSV(
        fromDate   : Date,
        toDate     : Date,
        reportType : String(20)     // 'summary' | 'by_role' | 'by_tenant'
    ) returns LargeString;          // JSON: { csvData, rowCount, reportType, period }

    // ── Scheduled Report Trigger (BridgeManager + Admin) ────────────
    @restrict: [{ to: ['BridgeManager','Admin'] }]
    action executeAnalyticsReport(
        scheduleId : UUID
    ) returns LargeString;

    // ── Admin Actions ────────────────────────────────────────────
    @restrict: [{ to: ['BridgeManager','Admin'] }]
    action runAnalyticsRollup() returns {
        dailyRows   : Integer;
        weeklyRows  : Integer;
        monthlyRows : Integer;
    };

    @restrict: [{ to: ['BridgeManager','Admin'] }]
    action purgeAnalyticsData() returns {
        rawPurged      : Integer;
        dailyPurged    : Integer;
        weeklyPurged   : Integer;
        monthlyPurged  : Integer;
        sessionsPurged : Integer;
    };
}
