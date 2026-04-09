# NHVR Bridge System — Target Architecture (Detailed)

> Expanded from the critical review. Covers data model, API architecture,
> SAP EAM + GIS integration, and UI module design.

---

## 1. DATA MODEL — DOMAIN ENTITY MAP

### 1.1 Current State: 85 Entities Across 10 Domains

```
┌─────────────────────────────────────────────────────────────────┐
│                    ASSET CORE (14 entities)                      │
│                                                                  │
│  Bridge ─────┬── BridgeCapacity (AS 5100.7 load rating)         │
│  (89 fields) ├── BridgeExternalRef (BANC, RMS, VicRoads)       │
│              ├── BridgeAttribute (dynamic custom fields)         │
│              ├── BridgeEventLog (audit trail)                    │
│              ├── BridgeChangeLog (field-level diffs)             │
│              ├── BridgeConditionHistory (trend tracking)         │
│              ├── BridgeInspectionMetrics (computed)              │
│              ├── BridgeDeteriorationProfile (predicted)          │
│              ├── DocumentAttachment (photos, reports)            │
│              ├── BamsSync (external sync status)                 │
│              └── S4EquipmentMapping (SAP PM link)               │
│                                                                  │
│  Route ──────── VehicleClass ──── Lookup ──── AttributeDefinition│
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│               RESTRICTION DOMAIN (5 entities)                    │
│                                                                  │
│  Restriction ────┬── RestrictionChangeLog                        │
│  (34 fields)     ├── RestrictionTypeConfig                       │
│                  └── GazetteNotice                                │
│                                                                  │
│  Associations: Bridge (0..1), Route (0..1), VehicleClass (0..1)  │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│               INSPECTION DOMAIN (6 entities)                     │
│                                                                  │
│  InspectionOrder ──┬── MeasurementDocument                       │
│  (27 fields)       ├── BridgeDefect ── WorkOrder                 │
│                    └── DefectClassification (AI)                  │
│                                                                  │
│  InspectionRecord (legacy, 13 fields)                            │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                PERMIT DOMAIN (5 entities)                         │
│                                                                  │
│  VehiclePermit ──── VehicleType                                  │
│  (28 fields)                                                     │
│                                                                  │
│  ApprovedRoute ──── ApprovedRouteBridge                          │
│  LoadRating ──── LoadRatingCertificate                           │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│               FREIGHT & ROUTING (3 entities)                     │
│                                                                  │
│  FreightRoute ──── FreightRouteBridge                            │
│  BridgeRouteAssignment (M:N link)                                │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                RISK & INVESTMENT (3 entities)                     │
│                                                                  │
│  BridgeRiskAssessment (L×C scoring, 11 fields)                   │
│  BridgeInvestmentPlan (CAPEX/BCR/NPV, 15 fields)                │
│  BridgeCulvertAssessment (CCTV/hydraulic, 14 fields)             │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                   IoT & SENSORS (3 entities)                     │
│                                                                  │
│  SensorDevice ──── SensorReading                                 │
│  ScourAssessment                                                 │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│            ADMIN & CONFIG (12 entities)                           │
│                                                                  │
│  RoleConfig, MapConfig, MapProviderConfig, IntegrationConfig,    │
│  AssessmentThreshold, KPIThreshold, ReportSchedule,              │
│  Tenant, FeatureCatalog, TenantFeature, TenantRoleCapability,    │
│  JurisdictionAccess                                              │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│            AUDIT & ANALYTICS (8 entities)                        │
│                                                                  │
│  AuditLog, UploadLog, AnalyticsConfigs, AnalyticsEvents,         │
│  UserAnalytics (client-side), EntityAttribute (polymorphic)      │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2 Target State: Missing Entities to Add

| Entity | Purpose | Priority |
|--------|---------|----------|
| `MaintenanceSchedule` | Recurring maintenance plans (preventive, condition-based) linked to Bridge. Fields: frequency, lastPerformed, nextDue, estimatedCost, assignedContractor, workType. | HIGH |
| `AssetRetirement` | Decommissioning workflow. Fields: retirementDate, reason, replacementAssetId, disposalMethod, environmentalAssessment, approvedBy. | MEDIUM |
| `ConstructionRecord` | As-built data from construction/rehabilitation. Fields: contractor, completionDate, asBuiltDrawings, materialCerts, loadTestResults. | MEDIUM |
| `NotificationQueue` | System notifications for permit expiry, inspection overdue, restriction changes. Fields: recipientRole, recipientId, channel (email/push/in-app), status, sentAt. | HIGH |
| `RouteChangeAlert` | When restrictions change, notify operators who previously used affected routes. Fields: routeId, restrictionId, affectedPermits[], notificationStatus. | MEDIUM |
| `CrossBorderPermit` | Multi-jurisdiction permit spanning NSW→QLD→NT. Fields: primaryPermitId, jurisdictions[], perStateAssessment[], overallVerdict. | LOW |
| `DataQualityScore` | Per-bridge quality metric. Fields: hasCurrentInspection, hasCapacityRating, hasValidCoords, hasBancRef, overallScore (0-100). | HIGH |

### 1.3 Key Relationship Diagram

```
                          ┌──────────────┐
                          │   Tenant     │
                          │ (multi-org)  │
                          └──────┬───────┘
                                 │ 1:N
                    ┌────────────┼────────────┐
                    ▼            ▼            ▼
              ┌──────────┐ ┌─────────┐ ┌───────────┐
              │  Bridge   │ │  Route  │ │ Freight   │
              │ (2,126+)  │ │         │ │ Route     │
              └─────┬─────┘ └────┬────┘ └─────┬─────┘
                    │            │             │
       ┌────────┬──┼──┬─────┐   │      ┌──────┤
       ▼        ▼  ▼  ▼     ▼   ▼      ▼      ▼
   Capacity  Insp  Defect  Risk  Restriction  FRBridge
      │      Order   │      │      │
      │        │     ▼      │      │
      │      Meas  WorkOrder│      ▼
      │      Doc     │      │   ChangeLog
      │              │      │
      ▼              ▼      ▼
   LoadRating    DocAttach  InvestPlan
      │
      ▼
   VehiclePermit ──── VehicleType ──── ApprovedRoute
```

---

## 2. API ARCHITECTURE

### 2.1 Current API Surface

| Layer | Count | Protocol |
|-------|-------|----------|
| OData V4 Entity Sets | 71 | REST/OData |
| Bound Actions | 14 | POST on entity |
| Unbound Actions | 37 | POST to service root |
| Unbound Functions | 22 | GET to service root |
| **Total endpoints** | **144** | |

### 2.2 Target API Architecture: Three Tiers

```
┌─────────────────────────────────────────────────────────────────┐
│                     TIER 1: INTERNAL API                         │
│                  (SAP UI5 Frontend → CAP Backend)                │
│                                                                  │
│  Protocol: OData V4 over HTTPS                                   │
│  Auth: XSUAA JWT (role-based)                                    │
│  Rate Limit: None (trusted internal)                             │
│                                                                  │
│  71 entity sets + 51 actions + 22 functions                      │
│  Full CRUD with role-based @restrict annotations                 │
│  CSRF token management via AuthFetch.js                          │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                     TIER 2: PARTNER API                          │
│            (Fleet TMS, Logistics Platforms, Insurers)             │
│                                                                  │
│  Protocol: REST/JSON (not OData — simplified)                    │
│  Auth: API Key + OAuth2 client credentials                       │
│  Rate Limit: Redis-backed (100 req/hr default, configurable)     │
│                                                                  │
│  Endpoints:                                                      │
│  POST /api/v1/route/validate      → Pre-trip route validation    │
│  POST /api/v1/route/assess        → Full route assessment        │
│  GET  /api/v1/bridges/{id}        → Bridge public data           │
│  GET  /api/v1/bridges/geojson     → GeoJSON feature collection   │
│  GET  /api/v1/restrictions/active → Active restriction feed      │
│  POST /api/v1/permits/check       → Permit eligibility check     │
│  GET  /api/v1/health              → Service health               │
│                                                                  │
│  Response: Standard JSON envelope                                │
│  { "status": "ok", "data": {...}, "meta": { "requestId", "ts" }}│
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                     TIER 3: INTEGRATION API                      │
│              (SAP EAM, ArcGIS, BANC, State TMCs)                 │
│                                                                  │
│  Protocol: Mixed (OData, REST, SOAP for SAP, WFS for GIS)       │
│  Auth: Service-to-service (mTLS or service keys)                 │
│  Pattern: Event-driven where possible, scheduled sync otherwise  │
│                                                                  │
│  Outbound:                                                       │
│  → SAP S/4HANA: Equipment Master, PM Notifications, PM Orders   │
│  → ArcGIS Enterprise: Feature Layer sync (bridge positions)      │
│  → BANC: CSV export (Austroads bridge condition database)        │
│                                                                  │
│  Inbound:                                                        │
│  ← State TMC feeds: Live closures, incidents (polling/webhook)   │
│  ← SAP PM: Work order status updates                             │
│  ← ArcGIS: Spatial query results (LRS chainage)                 │
│  ← WIM stations: Heavy vehicle count data                        │
└─────────────────────────────────────────────────────────────────┘
```

### 2.3 API Gateway Design

```
Internet                 BTP API Management
   │                          │
   ▼                          ▼
┌──────┐  API Key    ┌─────────────────┐
│Fleet │────────────▶│  API Gateway     │
│ TMS  │             │  (BTP or Kong)   │
└──────┘             │                  │
                     │ • Rate limiting  │
┌──────┐  OAuth2     │ • API key mgmt  │──▶ CAP Backend
│Insur.│────────────▶│ • Request log   │     (port 4004)
│ API  │             │ • Version route │
└──────┘             │ • CORS policy   │
                     │ • Response cache│
┌──────┐  Webhook    │   (5min TTL)    │
│State │────────────▶│                  │
│ TMC  │             └─────────────────┘
└──────┘
```

---

## 3. SAP EAM + GIS INTEGRATION DESIGN

### 3.1 SAP S/4HANA Integration (Already Implemented — Enhance)

**Current state**: `srv/integration/s4hana-client.js` implements Equipment Master sync, PM Notification/Order creation.

**Target enhancements**:

```
┌─────────────────────────────────────────────────────────────────┐
│                    SAP S/4HANA INTEGRATION                       │
│                                                                  │
│  NHVR Bridge ◄──────────────────────────────▶ SAP Equipment      │
│                                                                  │
│  Sync Direction: Bidirectional                                   │
│  Frequency: On-change (event) + daily reconciliation             │
│                                                                  │
│  NHVR → S/4:                                                     │
│  ┌──────────────────────────────────────────────────┐            │
│  │ Bridge → Equipment Master (class BRIDGE_INFRA)    │            │
│  │   Characteristics: BRIDGE_ID, COND_RATING,        │            │
│  │   POSTING_STATUS, SPAN_LEN, CLEARANCE_HT,        │            │
│  │   SCOUR_RISK, LATITUDE, LONGITUDE                 │            │
│  │                                                    │            │
│  │ BridgeDefect → PM Notification                    │            │
│  │   Priority mapping: CRITICAL→1, HIGH→2,           │            │
│  │   MEDIUM→3, LOW→4                                 │            │
│  │                                                    │            │
│  │ WorkOrder → PM Order                              │            │
│  │   With cost center, work center, material list     │            │
│  └──────────────────────────────────────────────────┘            │
│                                                                  │
│  S/4 → NHVR:                                                     │
│  ┌──────────────────────────────────────────────────┐            │
│  │ PM Order status → WorkOrder.status                │            │
│  │ PM Order actual cost → WorkOrder.actualCost       │            │
│  │ Equipment changes → Bridge field updates           │            │
│  │ Measurement points → SensorReading                │            │
│  └──────────────────────────────────────────────────┘            │
│                                                                  │
│  Auth: Basic + CSRF / Bearer token                               │
│  Protocol: OData V2 (S/4) ← CAP adapter → OData V4 (NHVR)      │
│  Error handling: Retry queue with dead-letter                     │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 ArcGIS Enterprise Integration (Enhance from Current)

**Current state**: `srv/integration/esri-client.js` pushes features to ESRI REST. Frontend uses Leaflet with ESRI satellite tiles.

**Target architecture**:

```
┌─────────────────────────────────────────────────────────────────┐
│                    ARCGIS INTEGRATION                             │
│                                                                  │
│  ┌───────────────────────────────────────────────┐               │
│  │         ArcGIS Enterprise Portal               │               │
│  │                                                │               │
│  │  ┌─────────────────────────────────────┐       │               │
│  │  │ Feature Service: NHVR_Bridges       │       │               │
│  │  │  • Point geometry (WGS84)           │       │               │
│  │  │  • 45 attribute fields              │       │               │
│  │  │  • Symbology by condition/posting   │       │               │
│  │  │  • Cluster rendering               │       │               │
│  │  └─────────────────────────────────────┘       │               │
│  │                                                │               │
│  │  ┌─────────────────────────────────────┐       │               │
│  │  │ Feature Service: NHVR_Restrictions  │       │               │
│  │  │  • Line/polygon geometry            │       │               │
│  │  │  • Active restrictions overlay      │       │               │
│  │  └─────────────────────────────────────┘       │               │
│  │                                                │               │
│  │  ┌─────────────────────────────────────┐       │               │
│  │  │ LRS Service: National Road Network  │       │               │
│  │  │  • Bridge chainage (routeKm)        │       │               │
│  │  │  • Road segment associations        │       │               │
│  │  │  • Topological bridge-on-route      │       │               │
│  │  └─────────────────────────────────────┘       │               │
│  │                                                │               │
│  │  Web Map: "NHVR Bridge Network"                │               │
│  │  Web App: "NHVR Field Inspector"               │               │
│  └───────────────────────────────────────────────┘               │
│                                                                  │
│  Sync Pattern:                                                   │
│  ┌────────────┐    applyEdits     ┌──────────────┐              │
│  │ NHVR HANA  │───────────────────▶│ ESRI Feature │              │
│  │ (source of │    (on bridge     │ Service      │              │
│  │  truth)    │◀───────────────────│              │              │
│  └────────────┘    query/spatial   └──────────────┘              │
│                                                                  │
│  LRS Integration:                                                │
│  • On bridge CREATE: derive routeKm from LRS snap-to-road       │
│  • On route ASSESS: query LRS for all bridges on road segment   │
│  • Replace haversine proximity with topological containment      │
└─────────────────────────────────────────────────────────────────┘
```

### 3.3 State TMC Integration (New)

```
┌─────────────────────────────────────────────────────────────────┐
│                 STATE TMC LIVE FEEDS                              │
│                                                                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐        │
│  │ VicRoads │  │ TfNSW    │  │ TMR QLD  │  │ Main     │        │
│  │ API      │  │ LiveTraff│  │ QLDTraff │  │ Roads WA │        │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘        │
│       │              │              │              │              │
│       └──────────────┼──────────────┼──────────────┘              │
│                      ▼                                           │
│              ┌───────────────────┐                                │
│              │ TMC Ingestion     │                                │
│              │ Service           │                                │
│              │                   │                                │
│              │ • Poll every 5min │                                │
│              │ • Normalize format│                                │
│              │ • Dedup events    │                                │
│              │ • Match to bridges│                                │
│              └───────┬───────────┘                                │
│                      │                                           │
│                      ▼                                           │
│              ┌───────────────────┐                                │
│              │ Auto-create       │                                │
│              │ Restriction       │                                │
│              │                   │                                │
│              │ • status=TEMPORARY│                                │
│              │ • source=TMC_FEED │                                │
│              │ • Auto-expire     │                                │
│              │ • Notify affected │                                │
│              │   permit holders  │                                │
│              └───────────────────┘                                │
└─────────────────────────────────────────────────────────────────┘
```

---

## 4. UI MODULES AND SCREENS

### 4.1 Current Screen Inventory (25 routes)

| Module | Screens | Users |
|--------|---------|-------|
| **Home** | Home, Dashboard | All |
| **Asset Register** | Bridges (list), BridgeDetail, BridgeForm (new/edit) | All |
| **Restrictions** | Restrictions (list) | All |
| **Inspections** | InspectionDashboard, InspectionCreate, Defects | Inspector, BridgeManager |
| **Permits** | Permits (list) | Operator, BridgeManager |
| **Routing** | RoutePlanner, RouteAssessment, FreightRoutes, FreightRouteDetail | Operator, BridgeManager |
| **Map** | MapView | All |
| **Reports** | Reports, AnnualConditionReport, PermitRegisterReport | Executive, BridgeManager |
| **Analytics** | AnalyticsDashboard | Admin |
| **Admin** | AdminConfig, AdminRestrictionTypes, AdminVehicleTypes, LicenseConfig, AppAdmin, BmsTechAdmin | Admin |
| **Bulk Ops** | MassUpload, MassEdit | Uploader, BridgeManager |
| **Integration** | IntegrationHub | Admin |
| **Vehicles** | VehicleCombinations | Operator |
| **Work Orders** | WorkOrders | BridgeManager |

### 4.2 Target Screen Additions

| New Screen | Module | Purpose | Users |
|------------|--------|---------|-------|
| **NotificationInbox** | Home | Centralised notification centre (permit expiry, inspection overdue, restriction changes, TMC alerts) | All |
| **DataQualityDashboard** | Reports | Data completeness metrics per bridge (inspection currency, capacity rating, coordinates, BANC ref) | Admin, BridgeManager |
| **PermitRenewal** | Permits | Guided renewal flow — re-run assessment against current bridge conditions, carry forward conditions | Operator |
| **MultiStopPlanner** | Routing | VRP-based multi-delivery route optimization with bridge constraint injection | Operator |
| **FieldInspectorApp** | Inspections | Simplified mobile-first view — photo capture, GPS auto-tag, offline queue, voice notes | Inspector |
| **CrossBorderPermit** | Permits | Multi-jurisdiction permit application — assess each state's bridges, unified approval | Operator, BridgeManager |
| **MaintenanceScheduler** | Work Orders | Preventive maintenance calendar — recurring tasks, resource allocation, contractor dispatch | BridgeManager |
| **AssetRetirement** | Asset Register | Decommissioning workflow — reason, replacement, environmental assessment, regulatory notice | Admin |
| **TMCFeedMonitor** | Integration | Live feed status — connected TMCs, last poll time, auto-created restrictions, errors | Admin |
| **SensorDashboard** | Asset Register | IoT sensor readings — load cells, strain gauges, water level, alert thresholds | BridgeManager |

### 4.3 UI Module Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     NHVR UI SHELL                                │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │ ShellBar: Logo | Title | Search | Notifications | User  │    │
│  └──────────────────────────────────────────────────────────┘    │
│                                                                  │
│  ┌──────────┐  ┌──────────────────────────────────────────┐      │
│  │ Side Nav │  │              Content Area                 │      │
│  │          │  │                                          │      │
│  │ Home     │  │  ┌────────────────────────────────────┐  │      │
│  │ Dashboard│  │  │ Dynamic Page (per route)            │  │      │
│  │ ──────── │  │  │                                    │  │      │
│  │ Assets   │  │  │ Breadcrumb > Title > Actions       │  │      │
│  │  Bridges │  │  │                                    │  │      │
│  │  Map     │  │  │ ┌───────────────────────────────┐  │  │      │
│  │ ──────── │  │  │ │ Tab / Section Content         │  │  │      │
│  │ Ops      │  │  │ │ (tables, forms, charts, maps) │  │  │      │
│  │  Restrict│  │  │ └───────────────────────────────┘  │  │      │
│  │  Permits │  │  │                                    │  │      │
│  │  Routes  │  │  └────────────────────────────────────┘  │      │
│  │ ──────── │  │                                          │      │
│  │ Inspect  │  └──────────────────────────────────────────┘      │
│  │  Orders  │                                                    │
│  │  Defects │  Shared Utilities:                                 │
│  │ ──────── │  ├── AuthFetch.js (CSRF + auth)                    │
│  │ Reports  │  ├── UserAnalytics.js (tracking)                   │
│  │ Analytics│  ├── MapProviderFactory.js (Google/Esri/OSM)       │
│  │ ──────── │  ├── GeocodingService.js (3 providers)             │
│  │ Admin    │  ├── RoutingService.js (5 engines)                 │
│  │ ──────── │  ├── GeoLocation.js (GPS capture)                  │
│  │ Bulk Ops │  ├── DraftManager.js (IndexedDB persistence)       │
│  │          │  ├── OfflineSync.js (mutation queue + retry)        │
│  └──────────┘  ├── StandardsAdapter.js (AU/NZ/EU/US)             │
│                ├── ExcelExport.js / CsvExport.js                 │
│                ├── AlvToolbarMixin.js (list toolbar)              │
│                └── HelpAssistantMixin.js (contextual help)       │
└─────────────────────────────────────────────────────────────────┘
```

### 4.4 Screen Design Specifications

#### A. Command Dashboard (Current — Enhanced)

```
┌─────────────────────────────────────────────────────────────────┐
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ NHVR · Bridge & Infrastructure — Asset Command    LIVE  ☾  │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                  │
│ PORTFOLIO AT A GLANCE                                            │
│ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐            │
│ │ 2,126    │ │    7     │ │   12     │ │    1     │            │
│ │ Assets   │ │ Critical │ │ Active   │ │ Closures │            │
│ │ View → │ │ Risk     │ │ Restrict │ │          │            │
│ └──────────┘ └──────────┘ └──────────┘ └──────────┘            │
│                                                                  │
│ PORTFOLIO METRICS                                                │
│ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐            │
│ │ 70 yrs   │ │   0%     │ │   1%     │ │    0     │            │
│ │ Avg Age  │ │ Net BHI  │ │ Inspect  │ │ Pending  │            │
│ │          │ │          │ │ Comply   │ │ Permits  │            │
│ └──────────┘ └──────────┘ └──────────┘ └──────────┘            │
│                                                                  │
│ CONDITION & MAINTENANCE                    ACTIVE RESTRICTIONS   │
│ ┌───────────────────────┐  ┌──────────────────────────────────┐ │
│ │ ● Good    1%  · 19    │  │        12                        │ │
│ │ ● Fair    99% · 2,100 │  │ posted network restrictions      │ │
│ │ ● Poor    0%  · 6     │  │ MASS(8) HEIGHT(3) AXLE(1)       │ │
│ │ ● Critical 0% · 1     │  │ View All Restrictions →          │ │
│ └───────────────────────┘  └──────────────────────────────────┘ │
│                                                                  │
│ UPCOMING ACTIONS                           RECENT ACTIVITY       │
│ ┌───────────────────────┐  ┌──────────────────────────────────┐ │
│ │ 3 overdue inspections │  │ Bridge BR-0042 closed            │ │
│ │ 1 expiring restriction│  │ 2 permits approved today         │ │
│ │ 0 pending approvals   │  │ 15 bridges inspected this week   │ │
│ └───────────────────────┘  └──────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

#### B. Bridge Detail (Current — 16 Tabs)

```
┌─────────────────────────────────────────────────────────────────┐
│ Home / Bridges / BR-NSW-0042                                     │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ Harbour Crossing Bridge               Condition: 8/10 GOOD │ │
│ │ NSW · Sydney · Pacific Hwy · Km 42.3  Status: UNRESTRICTED │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                  │
│ ┌────┬────┬────┬────┬────┬────┬────┬────┬────┬────┬────┬────┐  │
│ │Over│Capa│Rest│Attr│Map │Ext │Insp│Insp│Defe│Hist│Risk│Docs│  │
│ │view│city│rict│    │    │Sys │Ordr│    │cts │    │    │    │  │
│ └────┴────┴────┴────┴────┴────┴────┴────┴────┴────┴────┴────┘  │
│                                                                  │
│ Active tab content renders here                                  │
│ • Overview: ID, location, physical, condition, KPIs              │
│ • Capacity: AS 5100.7 load limits, clearance, fatigue           │
│ • Restrictions: Active/expired with gazette refs                 │
│ • Map Preview: Leaflet/Google/Esri pin + satellite              │
│ • Inspection Orders: Planned/in-progress/review/completed       │
│ • Defects: Open/closed with severity, work orders               │
│ • Documents: Photos, reports, drawings with upload              │
│ • Risk: Scour matrix, L×C scoring, investment plan              │
└─────────────────────────────────────────────────────────────────┘
```

#### C. Route Planner (Current — Enhanced)

```
┌─────────────────────────────────────────────────────────────────┐
│ Route Planner                                                    │
│                                                                  │
│ ┌─────────────────────────┐  ┌───────────────────────────────┐  │
│ │ VEHICLE PROFILE         │  │         MAP (full width)       │  │
│ │                         │  │                               │  │
│ │ GVM: [42.5] t           │  │   ┌─── Route polyline         │  │
│ │ Height: [4.3] m         │  │   │    ● Bridge (PASS)        │  │
│ │ Width: [2.5] m          │  │   │    ● Bridge (CONDITIONS)  │  │
│ │ Length: [19.0] m        │  │   │    ● Bridge (FAIL)        │  │
│ │ Axle: [11.0] t          │  │   └─── Alternative routes     │  │
│ │ Speed: [80] km/h        │  │                               │  │
│ │ Class: [HML ▼]          │  │   Basemap: [Streets ▼]        │  │
│ │                         │  │   Layers: ☑ Bridges ☑ Route   │  │
│ │ FROM: [Sydney CBD    ]  │  │          ☐ Traffic ☐ Alt      │  │
│ │ TO:   [Newcastle     ]  │  │                               │  │
│ │ + Add waypoint          │  │   Engine: [ORS ▼] [OSRM] [V] │  │
│ │                         │  │                               │  │
│ │ [Find Routes]           │  └───────────────────────────────┘  │
│ │ [Assess Bridges]        │                                      │
│ │ [Export GPX] [CSV]      │  ASSESSMENT RESULTS                  │
│ └─────────────────────────┘  ┌───────────────────────────────┐  │
│                               │ Verdict: ⚠ CONDITIONS          │  │
│ ROUTE OPTIONS                │ Bridges: 12 total               │  │
│ ┌───────────────────────┐    │ Pass: 10 | Conditions: 1        │  │
│ │ Route 1: 162km 2h10m  │    │ Fail: 1 (BR-0042 — CLOSED)     │  │
│ │ Route 2: 178km 2h25m  │    │ Min Mass Margin: 0.5t           │  │
│ │ Route 3: 195km 2h40m  │    │ Min Clearance: 0.2m             │  │
│ └───────────────────────┘    └───────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

#### D. Field Inspector App (New — Mobile-First)

```
┌──────────────────────────────┐
│ ≡  Field Inspector    ● GPS  │
│────────────────────────────│
│                              │
│ [Search bridge ID or name ]  │
│                              │
│ ┌──────────────────────────┐ │
│ │ BR-NSW-0042              │ │
│ │ Harbour Crossing Bridge  │ │
│ │ Condition: 8/10  GOOD    │ │
│ │ Next Insp: 15 Mar 2027   │ │
│ │ [Start Inspection]       │ │
│ └──────────────────────────┘ │
│                              │
│ ┌──────────────────────────┐ │
│ │ QUICK ACTIONS            │ │
│ │                          │ │
│ │ [📷 Photo]  [⚠ Defect]  │ │
│ │ [📋 Inspect] [📍 GPS]   │ │
│ └──────────────────────────┘ │
│                              │
│ INSPECTION FORM              │
│ ┌──────────────────────────┐ │
│ │ Deck:    [●●●●○] 4/5    │ │
│ │ Super:   [●●●○○] 3/5    │ │
│ │ Sub:     [●●●●●] 5/5    │ │
│ │ Bearings:[●●●●○] 4/5    │ │
│ │ Joints:  [●●●○○] 3/5    │ │
│ │                          │ │
│ │ Notes: [              ]  │ │
│ │                          │ │
│ │ Photos: [+] 📷 📷 📷    │ │
│ │                          │ │
│ │ [Save Draft] [Submit]    │ │
│ │ Draft auto-saved 30s ago │ │
│ └──────────────────────────┘ │
│                              │
│ ⚡ Offline mode (3 queued)   │
└──────────────────────────────┘
```

---

## 5. TECHNOLOGY STACK SUMMARY

| Layer | Current | Target |
|-------|---------|--------|
| **Frontend** | SAP UI5 1.120+ | SAP UI5 + PWA wrapper for mobile |
| **Backend** | SAP CAP (Node.js) v9 | Same + self-hosted ORS microservice |
| **Database** | HANA Cloud (hdi-shared) | HANA Cloud (dedicated for prod) |
| **Auth** | XSUAA + JWT | Same + API key management for Tier 2 |
| **Map Rendering** | Leaflet / MapLibre / Google / Esri | Same (via MapProviderFactory) |
| **Geocoding** | Nominatim / Google / Esri | Same (via GeocodingService) |
| **Routing** | ORS / OSRM / Valhalla / Google / Esri | Self-hosted ORS with NHVR restriction graph |
| **File Storage** | HANA LargeBinary (metadata only) | BTP Object Store (actual files) |
| **Rate Limiting** | In-memory counter | Redis (BTP Redis service) |
| **Analytics** | Client-side localStorage | Server-side AnalyticsEvents entity |
| **CI/CD** | GitHub Actions | Same (tests now block deploy) |
| **Monitoring** | BTP Application Logging | + Grafana/Prometheus for SLAs |

---

*Document generated 2026-04-03. Covers NHVR Bridge System v4.0 with 85 entities, 144 API endpoints, 25 UI screens.*
