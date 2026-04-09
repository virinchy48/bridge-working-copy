# NHVR Bridge Asset & Restriction Management System -- Implementation Guide

Version 4.7.4 | Last Updated: April 2026

---

## Table of Contents

1. [Architecture Deep Dive](#1-architecture-deep-dive)
2. [Development Environment Setup](#2-development-environment-setup)
3. [Data Model Reference](#3-data-model-reference)
4. [Service Layer (CDS + Handlers)](#4-service-layer-cds--handlers)
5. [UI5 Frontend Architecture](#5-ui5-frontend-architecture)
6. [Adding New Features](#6-adding-new-features)
7. [Integration Points](#7-integration-points)
8. [Testing Strategy](#8-testing-strategy)
9. [Build & Deployment Pipeline](#9-build--deployment-pipeline)
10. [Configuration & Customization](#10-configuration--customization)

---

## 1. Architecture Deep Dive

### 1.1 Technology Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Frontend | SAP UI5 (sap.m, sap.f, sap.ui.layout) | 1.120+ |
| Backend | SAP Cloud Application Programming Model (CAP) | Node.js runtime |
| CDS Framework | @sap/cds | v9 |
| Database (Production) | SAP HANA Cloud | HDI container |
| Database (Development) | SQLite | In-memory or file-based |
| Authentication | SAP XSUAA | JWT-based |
| API Protocol | OData V4 | Service path: /bridge-management/ |
| Application Router | @sap/approuter | xs-app.json routing |
| Build/Deploy | MTA (Multi-Target Application) | Schema 3.1 |

### 1.2 Deployment Architecture

The application deploys to SAP Business Technology Platform (BTP) as an MTA archive containing four modules:

```
+-------------------------------------------+
|            SAP BTP Cloud Foundry           |
|                                            |
|  +-------------+    +------------------+   |
|  | App Router   |--->| CAP Backend      |   |
|  | (nhvr-app)   |    | (nhvr-bridge-srv)|   |
|  +-------------+    +--------+---------+   |
|        |                     |              |
|        |              +------+------+       |
|        |              |  HANA Cloud |       |
|        |              |  (nhvr-db)  |       |
|        |              +-------------+       |
|        |                                    |
|  +-----+--------+                           |
|  | XSUAA Service |                          |
|  | (nhvr-xsuaa)  |                          |
|  +---------------+                          |
+-------------------------------------------+
```

**Module breakdown:**

1. **nhvr-bridge-app-cds-build** -- Custom build step that runs `npx cds build --production` before other modules deploy.
2. **nhvr-bridge-srv** -- The CAP Node.js backend (512 MB memory, 1 GB disk). Binds to HANA, XSUAA, and logging services.
3. **nhvr-bridge-db-deployer** -- HDI container deployer that pushes the compiled schema to HANA Cloud (256 MB memory).
4. **nhvr-bridge-app** -- The @sap/approuter instance serving the UI5 frontend and proxying OData requests to the backend.

### 1.3 Request Flow

1. Browser loads the UI5 application from the App Router.
2. The App Router enforces XSUAA authentication (redirect to IdP login if no valid JWT).
3. Authenticated requests to `/bridge-management/` are proxied to the CAP backend.
4. The CAP backend validates the JWT, enforces CDS-level `@restrict` annotations, and delegates to handler modules.
5. Handlers interact with SAP HANA Cloud via CDS queries. External integrations (S/4HANA, ESRI, BANC) are called from `srv/integration/`.

### 1.4 Security Model

Eight XSUAA scopes govern access:

| Scope | Description |
|-------|-------------|
| Admin | Full administrative access including entity deletion and attribute definition management |
| BridgeManager | Create and edit bridge records and restrictions |
| Inspector | Create and manage inspection orders, defect records, condition assessments |
| Operator | Operational access -- temporary restrictions, permits, bridge data viewing |
| Uploader | Mass upload via CSV |
| Executive | Read-only dashboards and KPI analytics |
| Viewer | Read-only access to bridge and restriction data |
| TechAdmin | Technical administration -- BTP environment, integrations, GIS config |

Role templates aggregate scopes. For example, the `Admin` role template includes Admin, BridgeManager, Viewer, Uploader, Inspector, and Operator scopes.

Custom attributes include `Groups` (for IdP group-to-role-collection mapping) and `tenantCode` (for multi-tenant identification).

---

## 2. Development Environment Setup

### 2.1 Prerequisites

- Node.js >= 20.0.0
- @sap/cds-dk (CDS development kit) installed globally: `npm install -g @sap/cds-dk`
- SAP UI5 CLI (optional): `npm install -g @ui5/cli`
- Cloud Foundry CLI with MTA plugin for deployment
- SQLite3 (bundled with most systems; used for local dev)

### 2.2 Initial Setup

```bash
# Clone the repository
git clone <repository-url>
cd nhvr-bridge-app

# Install dependencies
npm install

# Start local development server (uses SQLite + mock auth)
npm run watch
```

The `cds watch` command:
- Starts the CAP server on http://localhost:4004
- Serves the OData V4 service at http://localhost:4004/bridge-management/
- Loads seed data from the 41 CSV files in `db/data/`
- Enables hot-reload on file changes
- Uses SQLite in-memory database
- Bypasses XSUAA (mock authentication for development)

### 2.3 Demo Mode

A dedicated demo mode seeds the database with representative data:

```bash
# Seed the demo database
npm run demo:seed

# Start in demo mode
npm run demo
```

Demo mode sets `NHVR_APP_MODE=demo` and `NODE_ENV=demo`, which the backend uses to expose a training-mode banner and limit certain destructive operations.

### 2.4 Project Directory Structure

```
nhvr-bridge-app/
|-- db/
|   |-- schema.cds              # Barrel file — imports 10 domain files from db/schema/
|   |-- schema/                 # Bounded-context entity files
|   |   |-- types.cds           # 39 enum types
|   |   |-- core.cds            # Bridge, Route, VehicleClass
|   |   |-- restrictions.cds    # Restriction, Gazette, RestrictionTypeConfig
|   |   |-- inspection.cds      # InspectionOrder, BridgeDefect, WorkOrder
|   |   |-- capacity-permits.cds # BridgeCapacity, VehicleType, VehiclePermit
|   |   |-- risk-investment.cds # Risk, Investment, Deterioration, Scour
|   |   |-- freight.cds         # FreightRoute, BridgeRouteAssignment
|   |   |-- integration.cds     # Documents, S/4HANA, BANC, BAMS, Sensors
|   |   |-- tenancy.cds         # Tenant, FeatureCatalog
|   |   |-- admin.cds           # Lookups, Attributes, Config, Notifications
|   |   |-- attributes.cds      # Dynamic attribute system
|   |-- data/                   # 41 CSV seed data files (nhvr-*.csv)
|
|-- srv/
|   |-- service.cds             # Barrel file — imports 11 domain files from srv/services/
|   |-- services/               # Domain service files (extend BridgeManagementService)
|   |   |-- bridges.cds         # Bridges, Routes, VehicleClasses + batch import
|   |   |-- restrictions.cds    # Gazette, restriction feeds
|   |   |-- inspections.cds     # Inspections, defects, work orders
|   |   |-- capacity-permits.cds # Capacity, permits, load ratings
|   |   |-- risk-investment.cds # Risk, investment, deterioration
|   |   |-- freight.cds         # Freight routes, routing engine
|   |   |-- integration.cds     # Documents, S/4HANA, BANC, ESRI, IoT
|   |   |-- admin.cds           # Lookups, attributes, config, audit
|   |   |-- tenancy.cds         # Multi-tenant licensing
|   |   |-- reporting.cds       # Views, analytics, utilities, proxies
|   |   |-- _annotations.cds    # All UI + value-help annotations
|   |-- service.js              # Main event handler bootstrap (thin orchestrator)
|   |-- handlers/               # Modular handler files
|   |   |-- common.js           # Shared helpers
|   |   |-- bridges.js          # Bridge CRUD + actions
|   |   |-- restrictions.js     # Restriction CRUD + actions
|   |   |-- inspections.js      # Inspection workflow
|   |   |-- attributes.js       # Dynamic attribute management
|   |   |-- upload.js           # Mass upload/download processing
|   |   |-- reports.js          # Reporting and analytics queries
|   |   |-- geo.js              # GIS and geolocation
|   |   |-- analytics-ingest.js # Usage analytics ingestion
|   |   |-- analytics-report.js # Usage analytics reporting
|   |   |-- analytics-purge.js  # Analytics data cleanup
|   |   |-- data-quality.js     # Data quality scoring and rules
|   |   |-- notifications.js    # Notification handling
|   |   |-- routing-engine.js   # Route calculation engine
|   |   |-- restriction-feed.js # External restriction feed publishing
|   |   |-- system.js           # System info, config, health
|   |-- integration/            # External system clients
|       |-- handlers.js         # Integration handler registry (10 actions)
|       |-- s4hana-client.js    # SAP S/4HANA ERP adapter
|       |-- esri-client.js      # ESRI ArcGIS GIS adapter
|       |-- banc-client.js      # BANC (Austroads CSV) adapter
|
|-- app/
|   |-- bridge-management/
|       |-- webapp/             # UI5 application (source of truth)
|           |-- manifest.json   # UI5 app descriptor
|           |-- index.html      # Entry point
|           |-- controller/     # 31 controllers
|           |-- view/           # 34 views + fragments
|           |-- model/          # AppConfig.js, CapabilityManager.js, RoleManager.js
|           |-- util/           # 22 utility modules
|           |-- i18n/           # Internationalization properties
|           |-- css/            # Custom stylesheets
|
|-- app-router/                 # SAP App Router
|   |-- xs-app.json             # Route configuration
|   |-- resources/
|       |-- nhvr.bridgemanagement/  # Mirror of app/bridge-management/webapp/
|       |-- webapp/                 # Second mirror location
|
|-- test/                       # Test suites (Jest)
|-- scripts/                    # Operational scripts
|-- .github/workflows/          # CI/CD pipelines
|-- mta.yaml                    # MTA deployment descriptor
|-- xs-security.json            # XSUAA security configuration
|-- package.json                # Node.js project manifest
```

### 2.5 The Mirror Sync Rule

**CRITICAL**: The source of truth for all frontend code is `app/bridge-management/webapp/`. After editing any file in that directory, you MUST synchronize it to both mirror locations:

- `app-router/resources/nhvr.bridgemanagement/`
- `app-router/resources/webapp/`

Use the built-in sync script:

```bash
npm run sync-ui
```

This runs rsync from the source to the `nhvr.bridgemanagement` mirror. You must also copy changes to the `webapp` mirror manually or extend the script.

Failure to sync causes divergence between local development (which serves from `app/`) and production (which serves from `app-router/resources/`).

---

## 3. Data Model Reference

### 3.1 Schema Location

All entity definitions reside under the `nhvr` namespace, organized into bounded-context files under `db/schema/` (e.g., `core.cds`, `restrictions.cds`, `inspection.cds`). The barrel file `db/schema.cds` imports all sub-files. The CDS namespace must always be referenced using its full path: `nhvr.compliance.XYZ` (not bare `compliance.XYZ`), or compile errors will result. Cross-file entity references require explicit imports: `using { nhvr.Bridge } from './core';`.

### 3.2 Key Entities

**Core Asset Management:**

| Entity | Description | Key Fields |
|--------|-------------|------------|
| Bridge | Core asset with 47+ attributes (location, condition, dimensions, posting status) | ID (UUID), bridgeId (human-readable) |
| Route | Road corridor definitions | ID, routeCode |
| FreightRoute | Freight-specific route corridors | ID |
| BridgeRouteAssignment | Many-to-many bridge-to-route mapping | ID |

**Restrictions and Compliance:**

| Entity | Description | Key Fields |
|--------|-------------|------------|
| Restriction | Load, clearance, and speed rules with nhvrRef | ID, bridge_ID, restrictionType |
| RestrictionTypeConfig | Admin-configurable restriction type definitions | ID |
| VehicleClass | Vehicle classification definitions | ID, code |
| VehicleType | Specific vehicle type definitions | ID |
| GazetteNotice | Legal gazette notification records | ID |

**Inspection Workflow:**

| Entity | Description | Key Fields |
|--------|-------------|------------|
| InspectionOrder | Work orders for inspections | ID, orderNumber |
| InspectionRecord | Historical inspection results | ID |
| MeasurementDocument | Inspection measurements and readings | ID |
| BridgeDefect | Defect tracking (uses detectedDate, closedDate, severity, defectCode) | ID, defectNumber |

**Permits and Access:**

| Entity | Description | Key Fields |
|--------|-------------|------------|
| Permit | Heavy vehicle permit records | ID |
| ApprovedRoute | Pre-approved route definitions | ID |
| ApprovedRouteBridge | Bridge-to-approved-route mapping | ID |
| AssessmentThreshold | Route assessment threshold values | ID |

**Dynamic Attributes:**

| Entity | Description | Key Fields |
|--------|-------------|------------|
| AttributeDefinition | Schema for dynamic custom attributes | ID, attributeKey |
| BridgeAttribute | Per-bridge attribute values | ID |
| EntityAttribute | Polymorphic attribute values for Restriction, Defect, Permit, Route, InspectionOrder | ID |
| AttributeValidValue | Allowed values for constrained attributes | ID |

**Administration and Audit:**

| Entity | Description | Key Fields |
|--------|-------------|------------|
| AuditLog | Immutable change history (append-only) | ID |
| BridgeEventLog | Rich event log replacing simple condition history | ID |
| BridgeConditionHistory | Legacy condition change tracking | ID |
| RestrictionChangeLog | Restriction modification audit trail | ID |
| UploadLog | Mass upload operation records | ID |
| RoleConfig | Per-role UI feature visibility configuration | ID |
| FeatureCatalog | Available features for role-based toggling | ID |
| Lookup | Admin-configurable dropdown values | ID |

**GIS and Mapping:**

| Entity | Description | Key Fields |
|--------|-------------|------------|
| MapConfig | Map display configuration | ID |
| MapProviderConfig | GIS provider settings (Google Maps, ESRI) | ID |

### 3.3 CDS v9 Key Requirement

CDS v9 enforces that all view and projection entities must have explicit key fields. When defining new projections in the service domain files (`srv/services/*.cds`), always ensure the underlying entity has a `key` field that propagates through the projection. Using `select from` without a `key` column will cause a compile error.

### 3.4 Seed Data

The 41 CSV files in `db/data/` follow the naming convention `nhvr-<EntityName>.csv`. These are loaded automatically by CDS during `cds watch` (development) and by the HANA deployer during production deployment. The CSV files contain representative Australian bridge infrastructure data.

---

## 4. Service Layer (CDS + Handlers)

### 4.1 Service Definition Structure

The OData V4 service is defined in `srv/service.cds` as an empty `BridgeManagementService` barrel at path `/bridge-management/`. The barrel imports 11 domain files from `srv/services/`, each of which uses `extend service BridgeManagementService with { ... }` to add entities, actions, and functions. Annotations live in `srv/services/_annotations.cds` and load last.

**CRITICAL**: All entity projections and action definitions must be placed inside an `extend service BridgeManagementService` block in the appropriate domain file under `srv/services/`. Content defined outside any block is invisible to OData. The `redirected to X` clause requires entity X to be in the **same file** as the entity that redirects — CDS does not resolve redirects across files.

The service file structure:

```
service BridgeManagementService @(path: '/bridge-management') {
    // Block 1: Core entities (Bridges, Routes, Restrictions, VehicleClasses)
    // Block 1: Bridge actions (changeCondition, closeBridge, reopenBridge, etc.)
    // Block 1: Restriction actions (disable, enable, createTemporary, extend)
    // Block 1: Inspection entities and actions
    // Block 1: Defect entities and actions
    // Block 1: Admin entities (Lookups, RestrictionTypeConfigs, AttributeValidValues)
    // Block 1: Reporting views (VehicleAccess, RouteCompliance, ActiveRestrictions)
    // Block 1: Functions (me, getAppConfig, getSystemInfo, getMapApiConfig)
    // Block 1: Unbound actions (mass upload/download, validation, compliance report)
    // Block 1: Dashboard functions (getDashboardKPIs, getConditionTrend)
}

// Blocks 2-4: extend service blocks for additional entity groups
```

### 4.2 Entity Projections with Annotations

Each entity projection includes:

- **@cds.redirection.target: true** -- marks the canonical projection for a base entity (required when multiple projections exist).
- **@cds.query.limit** -- optional pagination defaults (e.g., `{ max: 5000, default: 200 }` on Bridges).
- **@restrict** -- role-based access control at the CDS level. READ is typically granted to `authenticated-user`; CREATE/UPDATE to BridgeManager and Admin; DELETE to Admin only.

Example pattern:

```cds
@cds.redirection.target: true
@restrict: [
    { grant: ['READ'],            to: 'authenticated-user' },
    { grant: ['CREATE','UPDATE'], to: ['BridgeManager','Admin'] },
    { grant: ['DELETE'],          to: ['Admin'] }
]
entity Bridges as projection on nhvr.Bridge {
    *,
    route.routeCode as routeCode,
    restrictions : redirected to Restrictions
} actions {
    action changeCondition(conditionValue: String, score: Integer) returns { ... };
};
```

### 4.3 Bound and Unbound Actions

**Bound actions** are defined within an entity's `actions { }` block and operate on a specific entity instance:

- Bridge: `changeCondition`, `closeBridge`, `reopenBridge`, `closeForTraffic`, `reopenForTraffic`, `applyTemporaryRestriction`, `addRestriction`
- Restriction: `disableRestriction`, `enableRestriction`, `createTemporaryRestriction`, `extendTemporaryRestriction`
- InspectionOrder: `startInspection`, `completeInspection`
- BridgeDefect: `closeDefect`

**Unbound actions** are defined at the service level:

- `massUploadBridges(csvData: LargeString)` -- Bulk bridge import from CSV
- `massUploadRestrictions(csvData: LargeString)` -- Bulk restriction import
- `massUploadRoutes(csvData: LargeString)` -- Bulk route import
- `massUploadVehicleClasses(csvData: LargeString)` -- Bulk vehicle class import
- `massUploadInspectionOrders(csvData: LargeString)` -- Bulk inspection order import
- `massUploadBridgeDefects(csvData: LargeString)` -- Bulk defect import
- `massUploadLookups(csvData: LargeString)` -- Bulk lookup value import (Admin only)
- `massDownloadBridges(region, state, routeCode)` -- CSV export with optional filters
- `validateRestriction(bridgeId, vehicleClassCode, checkDate, checkTime, restrictionType)` -- Real-time restriction validation
- `createInspectionOrder(...)` -- Create new inspection work orders
- `raiseDefect(...)` -- Raise a defect against a bridge/inspection
- `reviewInspection(inspectionOrderId, decision, notes)` -- Approve or reject completed inspections

**Functions** (read-only):

- `me()` -- Returns current user ID, roles, and app mode
- `getAppConfig()` -- Returns mode (full/lite), hidden features, version
- `getSystemInfo()` -- Returns mode, label, version, isTraining flag
- `getMapApiConfig()` -- Returns GIS provider settings and API keys
- `getDashboardKPIs(jurisdiction)` -- Aggregated dashboard metrics (returns LargeString JSON)
- `getConditionTrend(periods, jurisdiction)` -- Condition trend data over time
- `bridgeComplianceReport()` -- Per-bridge compliance issue report

### 4.4 Handler Architecture

The backend follows a thin orchestrator pattern. `srv/service.js` imports all handler modules and passes the service instance and shared helpers:

```javascript
const cds = require('@sap/cds');

module.exports = cds.service.impl(async function (srv) {
    const h = require('./handlers/common')(srv);

    require('./handlers/system')(srv);
    require('./handlers/bridges')(srv, h);
    require('./handlers/restrictions')(srv, h);
    require('./handlers/inspections')(srv, h);
    require('./handlers/upload')(srv, h);
    require('./handlers/reports')(srv, h);
    require('./handlers/geo')(srv, h);
    require('./handlers/analytics-ingest')(srv, h);
    require('./handlers/analytics-report')(srv, h);
    require('./handlers/analytics-purge')(srv, h);
    require('./handlers/data-quality')(srv, h);
    require('./handlers/notifications')(srv, h);
    require('./handlers/routing-engine')(srv, h);
    require('./handlers/restriction-feed')(srv, h);
    require('./integration/handlers')(srv);
});
```

**Handler modules and their responsibilities:**

| Module | File | Responsibility |
|--------|------|----------------|
| Common | common.js | Shared helper functions passed as `h` to all handlers |
| System | system.js | `me()`, `getAppConfig()`, `getSystemInfo()`, `getMapApiConfig()` |
| Bridges | bridges.js | Bridge CRUD hooks, `changeCondition`, `closeBridge`, `reopenBridge`, traffic actions |
| Restrictions | restrictions.js | Restriction CRUD hooks, enable/disable, temporary restriction lifecycle |
| Inspections | inspections.js | Inspection order lifecycle, `startInspection`, `completeInspection`, `reviewInspection`, defect actions |
| Attributes | attributes.js | Dynamic attribute CRUD, attribute definition management |
| Upload | upload.js | All `massUpload*` actions, `massDownloadBridges`, CSV parsing and validation |
| Reports | reports.js | Compliance reports, dashboard KPIs, condition trends |
| Geo | geo.js | Geolocation, geocoding, map configuration |
| Analytics Ingest | analytics-ingest.js | Usage event ingestion |
| Analytics Report | analytics-report.js | Analytics query and aggregation |
| Analytics Purge | analytics-purge.js | Periodic analytics data cleanup |
| Data Quality | data-quality.js | Data quality scoring rules and remediation |
| Notifications | notifications.js | Event-driven notification dispatch |
| Routing Engine | routing-engine.js | Route calculation and optimization |
| Restriction Feed | restriction-feed.js | External restriction data feed publishing |
| Integration | integration/handlers.js | Registry for 10 integration actions (S/4HANA, ESRI, BANC) |

### 4.5 LargeString Handling Pattern

Several functions and actions return `LargeString` (e.g., `getDashboardKPIs`). The OData V4 protocol may wrap these values differently depending on the client. Always use this unwrap pattern in controllers:

```javascript
var data = typeof resp.value === "string" ? JSON.parse(resp.value) : resp.value;
```

This handles both the case where the value arrives as a raw JSON string and where it arrives as an already-parsed object.

---

## 5. UI5 Frontend Architecture

### 5.1 Application Descriptor

The UI5 application is configured in `app/bridge-management/webapp/manifest.json`:

- Application ID: `nhvr.bridgemanagement`
- OData V4 data source at `/bridge-management/`
- OData version: 4.0
- Semantic object: `NHVRBridgeManagement` with action `manage`
- Device support: desktop and tablet (phone excluded)

### 5.2 Controllers (31 total)

| Controller | Purpose |
|-----------|---------|
| Home | Landing page with role-based navigation tiles |
| Dashboard | Operational dashboard with KPIs and charts |
| AnalyticsDashboard | Advanced analytics with configurable chart widgets |
| Bridges | Bridge list with advanced filtering and search |
| BridgeDetail | Full bridge profile -- tabs for details, restrictions, inspections, defects, history |
| BridgeForm | Create/edit bridge form |
| Restrictions | Restriction list management |
| Permits | Permit register and management |
| InspectionDashboard | Inspection order overview and workflow |
| InspectionCreate | New inspection order creation |
| Defects | Defect register and tracking |
| FreightRoutes | Freight route listing |
| FreightRouteDetail | Individual freight route with bridge assignments |
| RouteAssessment | Route assessment calculations |
| RoutePlanner | Interactive route planning with map |
| MapView | Map-based bridge visualization |
| Reports | Report hub with multiple report types |
| AnnualConditionReport | Yearly condition state report |
| PermitRegisterReport | Permit register report |
| MassUpload | CSV upload interface for bulk operations |
| MassEdit | Bulk edit interface with column picker |
| VehicleCombinations | Vehicle class and type management |
| WorkOrders | Work order tracking |
| DataQuality | Data quality dashboard and rule management |
| IntegrationHub | External system integration management |
| AdminConfig | Application configuration |
| AdminRestrictionTypes | Restriction type administration |
| AdminVehicleTypes | Vehicle type administration |
| AppAdmin | Application-level administration |
| BmsTechAdmin | BTP technical administration |
| LicenseConfig | License and tenant configuration |

### 5.3 Views (34 views + fragments)

Views are XML-based and located in `app/bridge-management/webapp/view/`. Fragment files provide reusable dialog and partial view components:

- `IntegrationConfigDialog.fragment.xml` -- Integration setup dialog
- `MassEditColumnPicker.fragment.xml` -- Column selection for bulk edit
- `MassEditPreview.fragment.xml` -- Preview before applying bulk edits
- Additional fragments in the `fragments/` subdirectory

### 5.4 Model Layer

Three model files in `app/bridge-management/webapp/model/`:

| File | Purpose |
|------|---------|
| AppConfig.js | Application configuration model -- mode detection (full/lite), feature flags |
| RoleManager.js | RBAC UI visibility -- determines which views, buttons, and sections are visible based on the user's roles. Queries the `me()` function at startup. |
| CapabilityManager.js | Feature capability detection for progressive enhancement |

### 5.5 Utility Modules (22 files)

Located in `app/bridge-management/webapp/util/`:

| Utility | Purpose |
|---------|---------|
| AlvToolbarMixin.js | Consistent table toolbar behavior (sort, column selection, CSV/Excel export). Mix into any controller with a table. |
| AnalyticsMixin.js | Analytics event tracking mixin for controllers |
| AnalyticsService.js | Client-side analytics service layer |
| AuthFetch.js | Authenticated API call wrapper -- adds JWT token, handles 401 refresh, provides `_credOpts()` method for fetch options |
| CsvExport.js | Client-side CSV generation from table data |
| CsvTemplate.js | CSV template generation for mass upload |
| DateFormat.js | Date formatting utilities for Australian locale |
| DraftManager.js | Draft handling for unsaved form changes |
| ExcelExport.js | Excel (XLSX) export functionality |
| GeoLocation.js | Browser geolocation API wrapper |
| GeocodingService.js | Address-to-coordinate resolution |
| HelpAssistantMixin.js | Contextual help overlay mixin |
| HelpContent.js | Help text content definitions |
| LoggerService.js | Client-side structured logging |
| MapProviderFactory.js | Factory pattern for map provider instantiation (Google Maps, ESRI) |
| OfflineSync.js | Offline data synchronization for field use |
| RoutingService.js | Route calculation service client |
| ScreenHelp.js | Screen-level help annotations |
| StandardsAdapter.js | Bridge standards compliance adapter |
| TablePersonalisation.js | Table column/sort/filter personalization persistence |
| UserAnalytics.js | User behavior analytics tracking |

The `providers/` subdirectory under `util/` contains provider-specific implementations for the MapProviderFactory.

### 5.6 Key UI Patterns

**AlvToolbarMixin usage:**

Controllers that display tables should mix in AlvToolbarMixin for a consistent toolbar with sort, column visibility, and export controls:

```javascript
sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "../util/AlvToolbarMixin"
], function(Controller, AlvToolbarMixin) {
    return Controller.extend("nhvr.bridgemanagement.controller.MyList", {
        // AlvToolbarMixin methods become available
    });
});
```

**AuthFetch for API calls:**

All backend API calls must use the AuthFetch utility to ensure JWT tokens are included:

```javascript
var oCredOpts = this._credOpts();
fetch("/bridge-management/SomeEntity", oCredOpts)
    .then(function(resp) { return resp.json(); })
    .then(function(data) { /* process data */ });
```

**RoleManager for UI visibility:**

Use RoleManager to conditionally show/hide UI elements based on the user's assigned roles:

```javascript
var bCanEdit = RoleManager.hasRole("BridgeManager") || RoleManager.hasRole("Admin");
this.byId("editButton").setVisible(bCanEdit);
```

**Bridge navigation:**

Always navigate to bridge detail using the human-readable `bridgeId`, never the UUID:

```javascript
this.getOwnerComponent().getRouter().navTo("BridgeDetail", {
    bridgeId: oContext.getProperty("bridgeId")
});
```

### 5.7 IconTabBar Restriction

Never use the `overflow` attribute on `sap.m.IconTabBar`. This attribute was deprecated in UI5 1.133 and causes a blank page render failure. Use the default overflow behavior instead.

---

## 6. Adding New Features

This section walks through the complete process of adding a new feature end-to-end: entity definition, service exposure, handler logic, UI view, and controller.

### 6.1 Step 1: Define the Entity in the Appropriate Domain File

Add the new entity to the correct domain file under `db/schema/` (e.g., `core.cds` for bridge-related, `inspection.cds` for inspection-related). See CLAUDE.md §4.6 for the domain map:

```cds
namespace nhvr;

// ... existing entities ...

entity MaintenanceTask : managed {
    key ID            : UUID;
    taskNumber        : String(20);
    bridge            : Association to Bridge;
    description       : String(500);
    priority          : String(10);  // HIGH, MEDIUM, LOW
    status            : String(10);  // OPEN, IN_PROGRESS, COMPLETED
    assignedTo        : String(100);
    dueDate           : Date;
    completedDate     : Date;
    notes             : LargeString;
}
```

Always include a `key` field. Use `managed` aspect for automatic `createdAt`, `createdBy`, `modifiedAt`, `modifiedBy` columns.

### 6.2 Step 2: Add Seed Data (optional)

Create `db/data/nhvr-MaintenanceTask.csv` with representative test data. Column headers must match the CDS field names exactly.

### 6.3 Step 3: Expose in the Appropriate Service Domain File

Add the entity projection inside the `extend service BridgeManagementService` block in the matching domain file under `srv/services/` (e.g., `bridges.cds`, `inspections.cds`, `admin.cds`):

```cds
extend service BridgeManagementService with {

    @cds.redirection.target: true
    @restrict: [
        { grant: ['READ'],            to: 'authenticated-user' },
        { grant: ['CREATE','UPDATE'], to: ['BridgeManager','Admin'] },
        { grant: ['DELETE'],          to: ['Admin'] }
    ]
    entity MaintenanceTasks as projection on nhvr.MaintenanceTask {
        *,
        bridge.bridgeId as bridgeId @readonly,
        bridge.name     as bridgeName @readonly
    } actions {
        action completeTask(completionNotes: String) returns {
            status: String; message: String
        };
    };

}
```

**Do not** create a new service block or place the entity outside an existing block.

### 6.4 Step 4: Implement the Handler

Create `srv/handlers/maintenance.js`:

```javascript
'use strict';

module.exports = function (srv, h) {
    const { MaintenanceTasks } = srv.entities;

    srv.before('CREATE', 'MaintenanceTasks', async (req) => {
        const { maxID } = await SELECT.one`max(taskNumber) as maxID`.from(MaintenanceTasks);
        req.data.taskNumber = 'MT-' + String((parseInt((maxID || 'MT-0').split('-')[1]) + 1)).padStart(5, '0');
        req.data.status = 'OPEN';
    });

    srv.on('completeTask', 'MaintenanceTasks', async (req) => {
        const { ID } = req.params[0];
        await UPDATE(MaintenanceTasks, ID).set({
            status: 'COMPLETED',
            completedDate: new Date().toISOString().slice(0, 10)
        });
        return { status: 'success', message: 'Task completed' };
    });
};
```

### 6.5 Step 5: Register the Handler

Add the require statement in `srv/service.js`:

```javascript
require('./handlers/maintenance')(srv, h);
```

### 6.6 Step 6: Create the UI5 View

Create `app/bridge-management/webapp/view/MaintenanceTasks.view.xml`:

```xml
<mvc:View
    controllerName="nhvr.bridgemanagement.controller.MaintenanceTasks"
    xmlns:mvc="sap.ui.core.mvc"
    xmlns="sap.m"
    xmlns:f="sap.f"
    xmlns:semantic="sap.f.semantic">
    <semantic:SemanticPage headerPinnable="false">
        <semantic:titleHeading>
            <Title text="{i18n>maintenanceTasksTitle}" />
        </semantic:titleHeading>
        <semantic:content>
            <Table id="maintenanceTable"
                items="{/MaintenanceTasks}"
                growing="true"
                growingThreshold="50">
                <headerToolbar>
                    <OverflowToolbar id="tableToolbar">
                        <Title text="{i18n>maintenanceTasksCount}" />
                        <ToolbarSpacer />
                        <SearchField search=".onSearch" width="300px" />
                    </OverflowToolbar>
                </headerToolbar>
                <columns>
                    <Column><Text text="Task Number" /></Column>
                    <Column><Text text="Bridge" /></Column>
                    <Column><Text text="Priority" /></Column>
                    <Column><Text text="Status" /></Column>
                    <Column><Text text="Due Date" /></Column>
                </columns>
                <items>
                    <ColumnListItem type="Navigation" press=".onItemPress">
                        <cells>
                            <Text text="{taskNumber}" />
                            <Text text="{bridgeName}" />
                            <ObjectStatus text="{priority}" state="{= ${priority} === 'HIGH' ? 'Error' : ${priority} === 'MEDIUM' ? 'Warning' : 'Success' }" />
                            <ObjectStatus text="{status}" />
                            <Text text="{path: 'dueDate', type: 'sap.ui.model.type.Date', formatOptions: { style: 'medium' }}" />
                        </cells>
                    </ColumnListItem>
                </items>
            </Table>
        </semantic:content>
    </semantic:SemanticPage>
</mvc:View>
```

### 6.7 Step 7: Create the Controller

Create `app/bridge-management/webapp/controller/MaintenanceTasks.controller.js`:

```javascript
sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "../util/AlvToolbarMixin",
    "../util/AuthFetch"
], function (Controller, Filter, FilterOperator, AlvToolbarMixin, AuthFetch) {
    "use strict";

    return Controller.extend("nhvr.bridgemanagement.controller.MaintenanceTasks", {

        onInit: function () {
            // initialization logic
        },

        onSearch: function (oEvent) {
            var sQuery = oEvent.getParameter("query");
            var aFilters = sQuery ? [
                new Filter("taskNumber", FilterOperator.Contains, sQuery)
            ] : [];
            this.byId("maintenanceTable").getBinding("items").filter(aFilters);
        },

        onItemPress: function (oEvent) {
            var oCtx = oEvent.getSource().getBindingContext();
            // Navigate to detail if needed
        }
    });
});
```

### 6.8 Step 8: Add i18n Keys

Add translations to `app/bridge-management/webapp/i18n/i18n.properties`:

```properties
maintenanceTasksTitle=Maintenance Tasks
maintenanceTasksCount=Maintenance Tasks
```

### 6.9 Step 9: Add Route in manifest.json

Add a route and target in `app/bridge-management/webapp/manifest.json` under `sap.ui5.routing`:

```json
{
    "pattern": "MaintenanceTasks",
    "name": "MaintenanceTasks",
    "target": "MaintenanceTasks"
}
```

And the corresponding target:

```json
{
    "MaintenanceTasks": {
        "viewName": "MaintenanceTasks",
        "viewLevel": 2
    }
}
```

### 6.10 Step 10: Mirror Sync

After all UI files are created/modified:

```bash
npm run sync-ui
# Also copy to the webapp mirror:
cp -r app/bridge-management/webapp/view/MaintenanceTasks.view.xml app-router/resources/webapp/view/
cp -r app/bridge-management/webapp/controller/MaintenanceTasks.controller.js app-router/resources/webapp/controller/
```

### 6.11 Step 11: Write Tests

Create a test file in `test/` following existing patterns. See Section 8 for testing strategy details.

---

## 7. Integration Points

### 7.1 Integration Architecture

All integration clients reside in `srv/integration/`. The handler registry in `srv/integration/handlers.js` wires 10 integration actions to the service layer.

**Important**: The integration directory is `srv/integration/`, not `srv/adapters/`. The `srv/adapters/` directory does not exist.

### 7.2 S/4HANA Integration (s4hana-client.js)

The S/4HANA adapter connects to SAP S/4HANA ERP for plant maintenance and asset management data synchronization.

**Capabilities:**
- Functional location synchronization
- Equipment master data exchange
- Maintenance order creation and status updates
- Technical object queries

**Technical note:** The `TechObjIsEquipment` field is a function that returns a boolean. Ensure boolean handling (not string comparison) when checking equipment status.

**Configuration:** S/4HANA connection parameters are stored in BTP destination service bindings. The adapter uses OAuth2 client credentials flow for authentication.

### 7.3 ESRI ArcGIS Integration (esri-client.js)

The ESRI adapter provides GIS capabilities for bridge geospatial data.

**Capabilities:**
- Geocoding (address to coordinates)
- Reverse geocoding (coordinates to address)
- Spatial queries (bridges within radius)
- Map tile and feature layer serving

**Configuration:** ESRI API key is stored in environment variables and served to the frontend via the `getMapApiConfig()` function.

### 7.4 BANC Integration (banc-client.js)

The BANC (Bridge Assessment National Classification) adapter interfaces with the Austroads standard CSV format.

**Capabilities:**
- Import bridge data from Austroads CSV format
- Export bridge data to Austroads CSV format
- Classification mapping between NHVR and Austroads schemas

**Status:** Production ready. Used for data exchange with state road authorities.

### 7.5 Adding a New Integration

1. Create `srv/integration/<name>-client.js` with the client class.
2. Export a factory function or class that accepts configuration parameters.
3. Register actions in `srv/integration/handlers.js`.
4. Add any required BTP destination or environment variable configuration.
5. Add the integration to the IntegrationHub UI for monitoring and configuration.

---

## 8. Testing Strategy

### 8.1 Test Infrastructure

- **Framework:** Jest
- **Total tests:** 1514 (unit + integration)
- **Test location:** `test/` directory
- **Operational test script:** `scripts/btp-comprehensive-test.sh` (101 functional tests)

### 8.2 Running Tests

```bash
# Run all tests
npm test

# Run unit tests only
npm run test:unit

# Run integration tests only
npm run test:integration

# Run all tests including supertester suite
npm run test:all

# Run the BTP comprehensive functional test suite
bash scripts/btp-comprehensive-test.sh

# Run the supertester v2 suite
npm run test:supertester
```

### 8.3 Test Categories

**Unit tests** (`test/unit/`):
- Controller logic testing
- Handler function testing
- Utility module testing
- Data transformation testing
- Example: `test/unit/reports-controller.unit.test.js` (49 tests for report generation)

**Integration tests** (`test/integration/` or `test/` root):
- OData endpoint testing via supertest
- Service-level action testing
- Database interaction testing with SQLite
- CSV upload/download round-trip testing

**Property-based tests:**
- `test/d22-property-based.test.js` -- Property-based testing for data validation

**Exploratory tests:**
- `test/s4-personas-exploratory.test.js` -- S/4HANA persona-based exploratory tests

**Supertester v2:**
- Located in `test/supertester-v2/`
- Uses `test/supertester-v2/global-setup.js` for test environment bootstrap
- Dedicated Jest configuration at `test/supertester-v2/jest.config.js`

### 8.4 Writing New Tests

Follow existing patterns. A typical unit test for a handler:

```javascript
const cds = require('@sap/cds');

describe('MaintenanceTasks Handler', () => {
    let srv;

    beforeAll(async () => {
        srv = await cds.test('serve', '--in-memory').run();
    });

    afterAll(async () => {
        await srv.disconnect();
    });

    test('should auto-generate task number on CREATE', async () => {
        const { data } = await srv.post('/bridge-management/MaintenanceTasks', {
            bridge_ID: '<valid-uuid>',
            description: 'Test task',
            priority: 'HIGH'
        });
        expect(data.taskNumber).toMatch(/^MT-\d{5}$/);
        expect(data.status).toBe('OPEN');
    });
});
```

### 8.5 Test Data

Tests use the same 41 CSV seed files from `db/data/` loaded into an in-memory SQLite database. For tests requiring specific data states, create fixtures within the test file or a shared `test/fixtures/` directory.

---

## 9. Build & Deployment Pipeline

### 9.1 MTA Build

The MTA descriptor (`mta.yaml`) defines the build and deployment configuration:

```bash
# Build the MTA archive
mbt build

# This produces nhvr-bridge-app_<version>.mtar in the mta_archives/ directory
```

The build process:
1. Runs `npx cds build --production` (compiles CDS to HANA artifacts and generates `gen/srv` and `gen/db`).
2. Runs `npm ci` in the `gen/srv` directory for the backend module.
3. Packages the App Router with its `resources/` directory.
4. Creates the `.mtar` archive.

### 9.2 Deployment to BTP

```bash
# Login to Cloud Foundry
cf login -a https://api.cf.us10-001.hana.ondemand.com

# Deploy the MTA archive
cf deploy nhvr-bridge-app_4.7.4.mtar --version-rule ALL -f
```

The `--version-rule ALL` flag allows deploying any version (not just incremental). The `-f` flag forces redeployment of unchanged modules.

### 9.3 CI/CD Pipelines

Three GitHub Actions workflows in `.github/workflows/`:

| Workflow | File | Purpose |
|----------|------|---------|
| Test | test.yml | Runs Jest test suite on push and pull request |
| Deploy BTP | deploy-btp.yml | Builds MTA and deploys to SAP BTP Cloud Foundry |
| HANA Keepalive | hana-keepalive.yml | Periodic ping to prevent HANA Cloud instance from hibernating |

### 9.4 Build Configuration

Key `package.json` scripts:

| Script | Command | Purpose |
|--------|---------|---------|
| start | cds-serve | Production server start |
| watch | cds watch | Development server with hot reload |
| build | cds build --production | Production CDS build |
| test | jest --testPathPattern=test/ | Run test suite |
| lint | eslint . --ext .js,.cds | Code quality checks |
| sync-ui | rsync from app/ to app-router/ | Mirror sync |
| openapi | cds compile to openapi | Generate OpenAPI spec |
| health | curl localhost:4004/bridge-management/ | Health check |

### 9.5 Pre-Deployment Checklist

1. Run all tests: `npm test` (must pass all 1514 tests).
2. Run the BTP comprehensive test: `bash scripts/btp-comprehensive-test.sh`.
3. Run lint: `npm run lint`.
4. Verify mirror sync: `npm run sync-ui` and check `app-router/resources/webapp/` is also current.
5. Build the MTA: `mbt build`.
6. Deploy: `cf deploy <mtar-file> --version-rule ALL -f`.
7. Verify the deployed application health endpoint.

---

## 10. Configuration & Customization

### 10.1 Application Configuration

The application supports two operational modes:

- **Full mode** -- All features enabled (default).
- **Lite mode** -- Reduced feature set controlled by `liteFeatures` configuration. The `getAppConfig()` function returns the current mode and a JSON array of hidden feature keys.

The `AppConfig.js` model reads the configuration at startup and propagates it to the UI layer.

### 10.2 Role-Based UI Configuration

`RoleConfig` entities (managed via the AdminConfig view) define per-role visibility for UI features. Each configuration record maps a role to a feature key with an enabled/disabled flag.

The `FeatureCatalog` entity provides the master list of available feature keys. The `RoleManager.js` model queries these at startup and exposes visibility methods to controllers.

### 10.3 Dynamic Attributes

The `AttributeDefinition` and `BridgeAttribute` entities implement a dynamic attribute system:

1. **Admin defines attributes** via the `AttributeDefinitions` entity -- specifying the attribute key, label, data type, whether it is required, and optionally constraining allowed values via `AttributeValidValues`.
2. **Users set values** via the `BridgeAttributes` entity (for bridges) or `EntityAttributes` (for restrictions, defects, permits, routes, inspection orders).
3. **UI rendering** is driven by `BridgeAttributes.js` and `RestrictionAttributes.js` controller mixins, which dynamically build form fields based on attribute definitions.

### 10.4 Restriction Type Configuration

`RestrictionTypeConfig` entities allow administrators to define and customize restriction types without code changes. Each configuration record specifies:

- Restriction type code and label
- Unit of measurement
- Applicable vehicle classes
- Whether permits are available for this restriction type

The `AdminRestrictionTypes` view provides the administration interface.

### 10.5 GIS / Map Configuration

Map behavior is configured through two entity types:

- **MapConfig** -- Display settings (default center coordinates, zoom level, clustering options).
- **MapProviderConfig** -- Provider-specific settings (Google Maps API key, ESRI API key, provider selection).

The `getMapApiConfig()` function exposes the active configuration to the frontend. The `MapProviderFactory.js` utility instantiates the appropriate provider implementation.

### 10.6 Lookup Values

The `Lookups` entity provides admin-configurable dropdown values throughout the application. Lookup records are grouped by category (e.g., `BRIDGE_MATERIAL`, `DEFECT_SEVERITY`, `RESTRICTION_STATUS`). The `massUploadLookups` action allows bulk import of lookup values.

### 10.7 Internationalization

All UI labels and messages are externalized in `app/bridge-management/webapp/i18n/i18n.properties`. When adding new UI text:

1. Add the key-value pair to `i18n.properties`.
2. Reference it in views as `{i18n>keyName}`.
3. Reference it in controllers via `this.getView().getModel("i18n").getResourceBundle().getText("keyName")`.

### 10.8 Environment Variables

Key environment variables for production configuration:

| Variable | Purpose |
|----------|---------|
| NODE_ENV | Environment mode (production, development, demo) |
| NHVR_APP_MODE | Application mode (demo for training instances) |
| VCAP_SERVICES | BTP service bindings (auto-injected by Cloud Foundry) |

HANA, XSUAA, and logging service credentials are automatically injected by Cloud Foundry through `VCAP_SERVICES` and do not require manual configuration.

### 10.9 CSV Seed Data Customization

To customize the initial dataset for a new deployment:

1. Edit the relevant CSV files in `db/data/`.
2. Follow the naming convention `nhvr-<EntityName>.csv`.
3. Ensure column headers match CDS field names exactly.
4. UUIDs must be valid v4 format for key fields.
5. Association fields use the pattern `<association>_ID` (e.g., `bridge_ID`).

### 10.10 XSUAA Configuration

The `xs-security.json` file defines the security descriptor. To add a new role:

1. Add a new scope entry in the `scopes` array.
2. Create a role template that references the scope.
3. After deployment, create a role collection in the BTP cockpit and assign the role template.
4. Assign users or IdP groups to the role collection.
5. Update CDS `@restrict` annotations in the appropriate `srv/services/*.cds` domain file to reference the new scope.
6. Update `RoleManager.js` and `RoleConfig` data to control UI visibility.

---

## Appendix A: Common Pitfalls

| Pitfall | Cause | Resolution |
|---------|-------|------------|
| Blank page on BridgeDetail | Using deprecated `overflow` attribute on IconTabBar | Remove the `overflow` attribute entirely |
| Entity not visible in OData | Entity defined outside an `extend service` block | Move entity inside one of the 4 existing blocks |
| CDS compile error on namespace | Using bare `compliance.XYZ` instead of `nhvr.compliance.XYZ` | Always use full namespace path |
| 401 errors on dashboard/analytics | Missing `_credOpts()` on fetch calls | Use AuthFetch utility for all API calls |
| Bridge detail shows UUID in URL | Navigation uses ID instead of bridgeId | Use `bridgeId` (human-readable) in `navTo()` |
| BridgeDefect 400 error | Using `reportedDate` field (does not exist) | Use `detectedDate` (correct field name) |
| Production UI differs from local | Mirror sync not performed after UI changes | Run `npm run sync-ui` and copy to `webapp` mirror |
| LargeString parse failure | Not handling string vs object response | Apply unwrap pattern: `typeof resp.value === "string" ? JSON.parse(resp.value) : resp.value` |
| CDS v9 key error | View/projection entity missing key field | Ensure base entity has key and it propagates to projection |

## Appendix B: Useful Commands Reference

```bash
# Development
npm run watch                    # Start dev server with hot reload
npm run demo                     # Start in demo/training mode
npm run demo:seed                # Seed demo database

# Testing
npm test                         # Run all Jest tests
npm run test:unit                # Unit tests only
npm run test:integration         # Integration tests only
npm run test:supertester         # Supertester v2 suite
bash scripts/btp-comprehensive-test.sh  # 101 functional tests

# Build & Deploy
npm run build                    # CDS production build
mbt build                        # Build MTA archive
cf deploy <file>.mtar --version-rule ALL -f  # Deploy to BTP

# Maintenance
npm run sync-ui                  # Mirror sync source to app-router
npm run lint                     # ESLint checks
npm run openapi                  # Generate OpenAPI spec
npm run health                   # Health check (local)
npm audit --audit-level=high     # Security audit
```

---

End of Implementation Guide.
