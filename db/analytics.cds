/* ────────────────────────────────────────────────────────────────
   NHVR Usage Analytics — Data Model
   Namespace: nhvr   (same as db/schema.cds)
   ──────────────────────────────────────────────────────────────── */
namespace nhvr;

using { cuid, managed } from '@sap/cds/common';

/* ── Raw Event (high-volume, short retention) ─────────────────── */
entity AnalyticsEvent : cuid {
    timestamp       : DateTime   @cds.on.insert: $now;
    pseudoUserId    : String(64);                       // SHA-256 of real userId + salt
    userRole        : String(50);
    tenantCode      : String(50)  default 'DEFAULT';
    environment     : String(20)  default 'production';
    sessionId       : String(36);
    category        : String(30)  @mandatory;           // from allowlist
    eventType       : String(50)  @mandatory;           // from allowlist
    targetRoute     : String(80);
    targetEntityId  : String(16);                       // hashed, first 16 chars
    durationMs      : Integer;
    resultCount     : Integer;
    errorCode       : String(10);
    errorMessage    : String(200);                      // sanitized, truncated
    metadata        : String(500);                      // JSON key-value pairs
    browserCategory : String(30);                       // e.g. "Chrome/Desktop"
    screenBucket    : String(10);                       // HD, FHD, QHD, 4K, Mobile
    workflowId      : String(36);
    workflowStep    : Integer;
    workflowTotal   : Integer;
}

/* ── Session (one row per user session) ───────────────────────── */
entity AnalyticsSession : cuid {
    sessionId       : String(36)  @mandatory;
    pseudoUserId    : String(64)  @mandatory;
    userRole        : String(50);
    tenantCode      : String(50)  default 'DEFAULT';
    environment     : String(20)  default 'production';
    startedAt       : DateTime;
    lastSeenAt      : DateTime;
    endedAt         : DateTime;
    pageViewCount   : Integer     default 0;
    actionCount     : Integer     default 0;
    errorCount      : Integer     default 0;
    browserCategory : String(30);
    screenBucket    : String(10);
}

/* ── Daily Aggregate ──────────────────────────────────────────── */
entity AnalyticsDailyAgg : cuid {
    aggDate         : Date        @mandatory;
    tenantCode      : String(50)  default 'DEFAULT';
    environment     : String(20)  default 'production';
    category        : String(30)  @mandatory;
    eventType       : String(50)  @mandatory;
    targetRoute     : String(80);
    userRole        : String(50);
    eventCount      : Integer     default 0;
    uniqueUsers     : Integer     default 0;
    uniqueSessions  : Integer     default 0;
    avgDurationMs   : Integer;
    maxDurationMs   : Integer;
    errorCount      : Integer     default 0;
    totalResultCount: Integer     default 0;
}

/* ── Weekly Aggregate ─────────────────────────────────────────── */
entity AnalyticsWeeklyAgg : cuid {
    weekStartDate   : Date        @mandatory;           // Monday anchor
    tenantCode      : String(50)  default 'DEFAULT';
    environment     : String(20)  default 'production';
    category        : String(30)  @mandatory;
    eventType       : String(50)  @mandatory;
    targetRoute     : String(80);
    userRole        : String(50);
    eventCount      : Integer     default 0;
    uniqueUsers     : Integer     default 0;
    uniqueSessions  : Integer     default 0;
    avgDurationMs   : Integer;
    maxDurationMs   : Integer;
    errorCount      : Integer     default 0;
    totalResultCount: Integer     default 0;
}

/* ── Monthly Aggregate ────────────────────────────────────────── */
entity AnalyticsMonthlyAgg : cuid {
    aggMonth        : String(7)   @mandatory;           // "2026-04"
    tenantCode      : String(50)  default 'DEFAULT';
    environment     : String(20)  default 'production';
    category        : String(30)  @mandatory;
    eventType       : String(50)  @mandatory;
    targetRoute     : String(80);
    userRole        : String(50);
    eventCount      : Integer     default 0;
    uniqueUsers     : Integer     default 0;
    uniqueSessions  : Integer     default 0;
    avgDurationMs   : Integer;
    maxDurationMs   : Integer;
    errorCount      : Integer     default 0;
    totalResultCount: Integer     default 0;
}

/* ── Config (admin-managed, feature toggles) ──────────────────── */
entity AnalyticsConfig : cuid, managed {
    configKey           : String(50)   @mandatory;      // 'GLOBAL' or tenant-specific
    tenantCode          : String(50)   default 'DEFAULT';
    enabled             : Boolean      default true;
    sampleRate          : Decimal(3,2) default 1.00;    // 0.00 – 1.00
    flushIntervalMs     : Integer      default 30000;
    maxQueueSize        : Integer      default 100;
    maxPayloadBytes     : Integer      default 51200;   // 50 KB
    retentionDays       : Integer      default 90;      // raw events
    dailyRetentionDays  : Integer      default 365;
    weeklyRetentionDays : Integer      default 730;
    monthlyRetentionDays: Integer      default 1825;    // 5 years
    excludedRoutes      : LargeString;                  // JSON array
    excludedEvents      : LargeString;                  // JSON array
    rateLimitPerMin     : Integer      default 100;
}
