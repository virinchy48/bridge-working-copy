# NHVR Bridge System — Master Implementation Prompt

> **Purpose**: Phased implementation of all audit findings across security, data integrity, testing, analytics, field ops, and mapping.
> **Execution model**: One phase per Claude Code session. Start fresh conversation per phase. Reference this file at session start.
> **Critical rule**: NEVER break existing functionality. Every phase must end with `npm test` passing.

---

## EXECUTION PROTOCOL (READ FIRST — EVERY SESSION)

### Token Management
- Start each session with: "Implement NHVR Phase X.Y — [title]. Read `.claude/prompts/NHVR_MASTER_IMPLEMENTATION.md` Phase X.Y only."
- Do NOT read the entire prompt. Read ONLY the phase you're implementing.
- Use agents for multi-file tasks. Use targeted grep before reading files.
- Mark completed phases in `.nhvr-implementation-tracker.json` after each session.

### Safety Rules
1. **Read before edit** — always read the target file before modifying
2. **Mirror sync** — after editing `app/bridge-management/webapp/`, ALWAYS copy to both `app-router/resources/nhvr.bridgemanagement/` AND `app-router/resources/webapp/`
3. **Run tests** — `npm test` must pass at end of every phase
4. **No regressions** — if tests break, fix before moving on
5. **Incremental commits** — commit after each sub-phase with descriptive message
6. **Preserve existing patterns** — match existing code style, use i18n for strings, follow Fiori UX guidelines
7. **CDS namespace** — always use `nhvr.compliance.XYZ` full path, never bare
8. **service.cds** — content must be inside one of the 4 `extend service` blocks

### Tracker File
Create/update `.nhvr-implementation-tracker.json` at project root:
```json
{
  "version": "4.0.0",
  "phases": {
    "1.1": { "status": "pending", "title": "CSRF + Auth Hardening" },
    "1.2": { "status": "pending", "title": "Input Sanitization" },
    "1.3": { "status": "pending", "title": "Schema Integrity" },
    "1.4": { "status": "pending", "title": "Backend Auth Gaps" },
    "2.1": { "status": "pending", "title": "Optimistic Locking" },
    "2.2": { "status": "pending", "title": "Transaction Safety" },
    "2.3": { "status": "pending", "title": "Enum + Validation" },
    "2.4": { "status": "pending", "title": "Audit Logging Hardening" },
    "3.1": { "status": "pending", "title": "Map Provider Abstraction" },
    "3.2": { "status": "pending", "title": "Google Maps + Esri Integration" },
    "3.3": { "status": "pending", "title": "Geocoding + Routing Abstraction" },
    "3.4": { "status": "pending", "title": "Map Admin Config" },
    "4.1": { "status": "pending", "title": "Assessment Consolidation" },
    "4.2": { "status": "pending", "title": "Configurable Thresholds" },
    "4.3": { "status": "pending", "title": "Pre-Trip Validation API" },
    "4.4": { "status": "pending", "title": "Permit Edit Workflow" },
    "5.1": { "status": "pending", "title": "Photo/Attachment Support" },
    "5.2": { "status": "pending", "title": "GPS Capture + Draft Persistence" },
    "5.3": { "status": "pending", "title": "Inspection Review Workflow" },
    "5.4": { "status": "pending", "title": "Offline Enhancement" },
    "6.1": { "status": "pending", "title": "Server-Side Aggregation" },
    "6.2": { "status": "pending", "title": "Trend Visualization" },
    "6.3": { "status": "pending", "title": "Configurable KPI Thresholds" },
    "6.4": { "status": "pending", "title": "Scheduled Reports" },
    "7.1": { "status": "pending", "title": "CI/CD Hardening" },
    "7.2": { "status": "pending", "title": "Route Assessment Tests" },
    "7.3": { "status": "pending", "title": "Permit + Report Tests" },
    "7.4": { "status": "pending", "title": "Concurrency + Edge Case Tests" },
    "8.1": { "status": "pending", "title": "Multi-Tenancy Foundation" },
    "8.2": { "status": "pending", "title": "Standards Adapter Conversion" },
    "8.3": { "status": "pending", "title": "Accessibility + CSS Hardening" },
    "8.4": { "status": "pending", "title": "Export + Print Improvements" }
  }
}
```

---

## PHASE 1 — SECURITY HARDENING (4 sessions)

### Phase 1.1: CSRF + Auth Hardening
**Files**: All frontend controllers, `xs-security.json`, `RoleManager.js`, `CapabilityManager.js`
**Objective**: Close CSRF, token validity, fail-open, and localStorage auth bypass vulnerabilities.

**Tasks**:

1. **CSRF Token Fetch Utility** — Create `app/bridge-management/webapp/util/AuthFetch.js`:
   ```
   - Export async function `authFetch(url, options)`
   - On first mutating call (POST/PATCH/DELETE), fetch CSRF token from HEAD request to service root with header `x-csrf-token: fetch`
   - Cache token in module-level variable; refresh on 403
   - Add `x-csrf-token` header to all mutating requests
   - Add `credentials: "include"` for production
   - Detect localhost via `window.location.hostname` for dev basic auth
   - Export as SAP UI5 module: sap.ui.define([], function() { ... })
   ```

2. **Replace all raw `fetch()` calls** in these controllers with `authFetch()`:
   - `AdminConfig.controller.js` — all POST/PATCH/DELETE calls
   - `MassUpload.controller.js` — all POST calls
   - `MassEdit.controller.js` — all PATCH/POST calls
   - `Permits.controller.js` — all POST/DELETE calls (remove hardcoded `btoa("admin:admin")`)
   - `Restrictions.controller.js` — all POST/PATCH/DELETE calls
   - `Defects.controller.js` — all POST/PATCH calls
   - `InspectionDashboard.controller.js` — all POST/PATCH calls
   - `BridgeDetail.controller.js` — all POST/PATCH/DELETE calls
   - `Bridges.controller.js` — all POST/PATCH calls
   - `FreightRoutes.controller.js` — all POST calls
   - `FreightRouteDetail.controller.js` — all POST calls
   - `RoutePlanner.controller.js` — all POST calls
   - `RouteAssessment.controller.js` — all POST calls
   - `VehicleCombinations.controller.js` — all fetch calls

3. **Fix CapabilityManager fail-open** in `CapabilityManager.js`:
   - On profile fetch error: keep PREVIOUS cached profile (not _failOpen=true)
   - If no previous cache exists: default to READ_ONLY (most restrictive)
   - Log error to `LoggerService` with severity ERROR
   - Add `_profileExpiry` timestamp; re-fetch after 5 minutes on error

4. **Remove jurisdiction localStorage override** in `RoleManager.js`:
   - Delete the `nhvr_jurisdiction_override` localStorage check (line ~419)
   - Jurisdiction access must come from server-side `/JurisdictionAccess` entity only

5. **Tighten xs-security.json**:
   - Change `token-validity` from 43200 → 3600 (1 hour)
   - Change `refresh-token-validity` from 604800 → 86400 (1 day)
   - Replace wildcard redirect URIs with exact app URL: `https://592f5a7btrial-dev-nhvr-bridge-app-router.cfapps.us10-001.hana.ondemand.com/login/callback`
   - Keep one fallback: `https://592f5a7btrial-dev-nhvr-bridge-app-router.cfapps.us10-001.hana.ondemand.com/**`

**Verification**: `npm test` passes. Grep for raw `fetch(` in controllers — should only exist in `AuthFetch.js` and non-mutating GETs.

---

### Phase 1.2: Input Sanitization
**Files**: `upload.js`, `CsvExport.js`, `AlvToolbarMixin.js`, `reports.js`, `VehicleCombinations.controller.js`
**Objective**: Close CSV injection, SQL concatenation, OData filter injection, XSS in error display.

**Tasks**:

1. **CSV formula sanitization** — In `CsvExport.js` and `AlvToolbarMixin.js`:
   - Before writing any cell value to CSV/TSV, check if first char is `=`, `+`, `-`, `@`, `\t`, `\r`
   - If yes, prefix with single quote `'` (Excel safe pattern)
   - Apply to ALL export functions: `exportBridges`, `exportRestrictions`, `exportDefects`, `exportInspections`, `exportPermits`

2. **Parameterized queries in reports.js** — Replace `buildAssetFilter()`:
   - Instead of `conds.push(\`r.field = '\${safe(val)}'\`)`, use CDS query builder:
   ```javascript
   // Before (vulnerable):
   conds.push(`r.restrictionType = '${safe(p.restrictionType)}'`);
   // After (safe):
   const query = SELECT.from('nhvr.Restriction').where({ restrictionType: p.restrictionType });
   ```
   - Convert ALL raw SQL string concatenation in `reports.js` to CDS query API
   - Remove the `safe()` function entirely once all queries are parameterized

3. **OData filter parameterization** in `VehicleCombinations.controller.js`:
   - Replace string-interpolated `$filter` with OData V4 filter builder pattern
   - Use `encodeURIComponent()` on ALL user-supplied filter values
   - Validate state/region against known enum values before including in filter

4. **XSS in error display** — In `MassUpload.controller.js`:
   - Escape HTML entities in error messages before rendering in table cells
   - Create helper: `escapeHtml(str)` that converts `<>&"'` to HTML entities
   - Apply to all error message display in upload preview table

5. **File upload validation** in `MassUpload.controller.js`:
   - Add file size limit check: reject files > 10MB
   - Validate MIME type (not just extension): check `file.type === "text/csv"` or `"application/vnd.ms-excel"`
   - Add CSV header validation: first row must match expected column headers for entity type

**Verification**: `npm test` passes. Test CSV export with cell value `=CMD("calc")` — should export as `'=CMD("calc")`.

---

### Phase 1.3: Schema Integrity Hardening
**Files**: `db/schema.cds`, `srv/service.cds`
**Objective**: Add cascade deletes, mandatory FKs, unique constraints, soft-delete, enums.

**Tasks**:

1. **Add CDS enum types** at top of `db/schema.cds` (after namespace declaration):
   ```cds
   type BridgeCondition : String(20) enum { GOOD; FAIR; POOR; CRITICAL; };
   type PostingStatus : String(20) enum { UNRESTRICTED; POSTED; CLOSED; REDUCED; };
   type AustralianState : String(3) enum { NSW; VIC; QLD; WA; SA; TAS; ACT; NT; };
   type ScourRiskLevel : String(20) enum { LOW; MEDIUM; HIGH; CRITICAL; UNKNOWN; };
   type RestrictionStatus : String(20) enum { ACTIVE; SCHEDULED; EXPIRED; INACTIVE; DISABLED; };
   type PermitStatus : String(20) enum { DRAFT; SUBMITTED; APPROVED; APPROVED_WITH_CONDITIONS; DENIED; EXPIRED; CANCELLED; SUSPENDED; };
   type InspectionOrderStatus : String(20) enum { PLANNED; IN_PROGRESS; COMPLETED; CANCELLED; };
   type DefectStatus : String(20) enum { OPEN; UNDER_REPAIR; MONITORING; REPAIRED; CLOSED; };
   ```

2. **Apply enums to existing entities** — Update Bridge, Restriction, VehiclePermit, InspectionOrder, BridgeDefect to use enum types instead of raw String. Preserve default values.

3. **Add version field for optimistic locking** to core entities:
   ```cds
   extend Bridge with { version : Integer default 1; };
   extend Restriction with { version : Integer default 1; };
   extend VehiclePermit with { version : Integer default 1; };
   ```

4. **Add soft-delete support** to core entities:
   ```cds
   extend Bridge with { deletedAt : Timestamp; isDeleted : Boolean default false; };
   extend Restriction with { deletedAt : Timestamp; isDeleted : Boolean default false; };
   ```

5. **Add missing unique constraints**:
   ```cds
   // Add @assert.unique to:
   Route.routeCode
   VehicleType.code
   VehicleClass.code
   FreightRoute.routeCode
   FeatureCatalog.capabilityCode
   ```

6. **Add @mandatory to child entity FKs**:
   - `BridgeCapacity.bridge` → add `@mandatory`
   - `LoadRating.bridge` → add `@mandatory`
   - `VehiclePermit.bridge` → add `@mandatory`
   - `FreightRouteBridge.route` → add `@mandatory`

7. **Add missing indexes** (as annotations or via `@cds.persistence.table`):
   - `Restriction`: index on `(validFromDate, validToDate, status)`
   - `BridgeDefect`: index on `(severity, status)`
   - `AuditLog`: index on `(timestamp, entity)`

8. **Update service.cds projections** — Ensure new fields (version, deletedAt, isDeleted) are included in projections. Add `where isDeleted != true` filter to all main projections.

**Verification**: `npx cds build --production` succeeds. `npm test` passes. Check that existing CSV seed data still loads.

---

### Phase 1.4: Backend Authorization Gaps
**Files**: `srv/handlers/geo.js`, `srv/handlers/bridges.js`, `srv/handlers/inspections.js`, `srv/service.cds`
**Objective**: Add missing @requires annotations and role checks to all unprotected handlers.

**Tasks**:

1. **Add @requires annotations in service.cds** for these actions:
   ```cds
   // In the appropriate extend service block:
   action assessCorridor(...) returns String @(requires: ['BridgeManager', 'Admin', 'Operator']);
   action assessFreightRouteVehicle(...) returns String @(requires: ['BridgeManager', 'Admin', 'Operator']);
   action findAlternativeRoutes(...) returns String @(requires: ['BridgeManager', 'Admin', 'Operator']);
   action assessRouteGeometry(...) returns String @(requires: ['BridgeManager', 'Admin', 'Operator']);
   action syncWithBams(...) returns String @(requires: ['Admin']);
   action geocodeAddress(...) returns String @(requires: 'authenticated-user');
   action reverseGeocode(...) returns String @(requires: 'authenticated-user');
   action proxyRoute(...) returns String @(requires: 'authenticated-user');
   ```

2. **Add role check to `addRestriction`** in `bridges.js`:
   - Before processing, verify user has `BridgeManager` or `Admin` scope
   - Use `req.user.is('BridgeManager') || req.user.is('Admin')` pattern matching existing handlers

3. **Add role checks to inspection handlers** in `inspections.js`:
   - `raiseDefectFromMeasurement` → require `Inspector` or `BridgeManager`
   - `createWorkOrder` → require `BridgeManager` or `Admin`
   - `ingestSensorReading` → require `Inspector` or `Admin`
   - `classifyDefect` → require `Inspector` or `BridgeManager`

4. **Add input validation to `ingestSensorReading`**:
   - Validate `value` is numeric and within reasonable range (0-1000)
   - Validate `sensorType` against known enum
   - Reject negative values

**Verification**: `npm test` passes. Test that unauthenticated calls to assessment endpoints return 403.

---

## PHASE 2 — DATA INTEGRITY & VALIDATION (4 sessions)

### Phase 2.1: Optimistic Locking
**Files**: `srv/handlers/bridges.js`, `srv/handlers/restrictions.js`, all frontend controllers that PATCH
**Objective**: Prevent concurrent edit data loss using version field.

**Tasks**:

1. **Backend version check** — In BEFORE UPDATE handlers for Bridge and Restriction:
   ```javascript
   srv.before('UPDATE', 'Bridges', async (req) => {
     if (req.data.version !== undefined) {
       const current = await db.read('nhvr.Bridge', req.data.ID, ['version']);
       if (current && current.version !== req.data.version) {
         req.reject(409, 'Record modified by another user. Please refresh and retry.');
       }
       req.data.version = (req.data.version || 0) + 1;
     }
   });
   ```

2. **Frontend ETag handling** — In `MassEdit.controller.js` and `BridgeDetail.controller.js`:
   - Include `version` field in all read queries
   - Send `version` in PATCH payload
   - Handle 409 response: show MessageBox with "Conflict detected — reload and retry?"
   - On reload, re-fetch current data and show diff to user

3. **Same pattern for Restrictions** in `Restrictions.controller.js`.

---

### Phase 2.2: Transaction Safety
**Files**: `srv/handlers/upload.js`, `srv/handlers/inspections.js`, `srv/handlers/restrictions.js`
**Objective**: Wrap multi-step operations in transactions.

**Tasks**:

1. **Wrap mass upload in transaction** — In `upload.js`, for each `massUpload*` handler:
   ```javascript
   const tx = cds.tx(req);
   try {
     for (const row of rows) { await tx.run(INSERT.into(...).entries(row)); }
     await tx.commit();
   } catch (e) {
     await tx.rollback();
     req.reject(500, `Upload failed at row ${i}: ${e.message}. All changes rolled back.`);
   }
   ```

2. **Wrap createWorkOrder** in `inspections.js` — Atomic insert of WorkOrder + update of BridgeDefect status.

3. **Wrap restriction expiry** in `restrictions.js` — `expireRestrictions` should update all restrictions and posting statuses atomically.

4. **Add idempotency token to uploads** — Accept optional `idempotencyKey` parameter. Store in `UploadLog`. Reject duplicate keys within 24 hours.

---

### Phase 2.3: Enum Validation + Input Hardening
**Files**: `srv/handlers/bridges.js`, `srv/handlers/restrictions.js`, `srv/handlers/inspections.js`
**Objective**: Enforce enums server-side, validate all inputs.

**Tasks**:

1. **Validate enums in BEFORE hooks** — For every entity with enum fields:
   - Bridge: validate `condition` against `BridgeCondition` enum values
   - Restriction: validate `status` against `RestrictionStatus`
   - VehiclePermit: validate `permitStatus` against `PermitStatus`
   - Add helper `validateEnum(value, enumType, fieldName)` in `common.js`

2. **Validate numeric ranges in `geo.js`**:
   - Vehicle dimensions: GVM 0-500t, GCM 0-500t, height 0-10m, width 0-10m, length 0-60m
   - Crossing speed: 1-120 km/h
   - Reject negative values with clear error messages

3. **Validate restriction unit-type consistency**:
   - GROSS_MASS/AXLE_LOAD → unit must be "t"
   - HEIGHT/WIDTH/LENGTH → unit must be "m"
   - SPEED → unit must be "km/h"

4. **Add latitude/longitude range validation** to `MassUpload.controller.js`:
   - lat: -44.0 to -10.0 (Australia only)
   - lon: 112.0 to 154.0 (Australia only)

---

### Phase 2.4: Audit Logging Hardening
**Files**: `srv/handlers/common.js`, all handler files
**Objective**: Make audit logging reliable and complete.

**Tasks**:

1. **Make audit logging non-swallowable** — In `common.js`, change `logAudit`:
   - On failure: log error to console AND write to a fallback file/queue
   - For CRITICAL operations (closeBridge, addRestriction, permit decisions): REJECT the operation if audit fails
   - For normal operations: proceed but log warning

2. **Add audit to restriction expiry** — `restrictions.js` `expireRestrictions`: log each status change.

3. **Add audit to all geo assessment actions** — Log who ran assessments, with what parameters, and what verdict.

4. **Add notification on silent restriction expiry** — When `expireRestrictions` runs, create entries in a new `SystemNotification` entity.

---

## PHASE 3 — MAPPING PROVIDER ABSTRACTION (4 sessions)

### Phase 3.1: Map Provider Abstraction Layer
**Files**: New `app/bridge-management/webapp/util/MapProviderFactory.js`, new `util/providers/`
**Objective**: Create abstract map layer supporting Google Maps, Esri, and OSM (Leaflet/MapLibre).

**Tasks**:

1. **Create `util/MapProviderFactory.js`** — Factory that returns a map provider based on config:
   ```javascript
   sap.ui.define([], function() {
     "use strict";
     return {
       /**
        * @param {string} provider - "google" | "esri" | "osm-leaflet" | "osm-maplibre"
        * @param {object} config - { apiKey, container, center, zoom, layers }
        * @returns {MapProviderInterface}
        */
       create: function(provider, config) { ... },

       // Get provider from AdminConfig MapProvider setting
       getConfiguredProvider: function() { ... }
     };
   });
   ```

2. **Define `util/providers/MapProviderInterface.js`** — Abstract interface:
   ```javascript
   // All providers must implement:
   {
     init(containerId, options) → Promise<void>,
     destroy() → void,

     // Layers
     addMarkerLayer(id, geojsonFeatures, options) → LayerRef,
     addPolylineLayer(id, coordinates, options) → LayerRef,
     addPolygonLayer(id, coordinates, options) → LayerRef,
     removeLayer(id) → void,
     toggleLayer(id, visible) → void,

     // Basemaps
     setBasemap(type) → void,  // "streets" | "satellite" | "topo" | "dark"
     getAvailableBasemaps() → string[],

     // Interaction
     fitBounds(bounds) → void,
     setCenter(lat, lng, zoom) → void,
     getCenter() → {lat, lng, zoom},
     onClick(callback) → void,
     onMoveEnd(callback) → void,

     // Drawing
     enableDraw(type, callback) → void,  // "polygon" | "rectangle" | "circle"
     disableDraw() → void,
     clearDrawn() → void,

     // Clustering
     enableClustering(layerId, options) → void,

     // Markers
     createMarkerIcon(options) → MarkerIcon,
     addPopup(marker, content) → void,

     // Export
     getMapImage() → Promise<Blob>,

     // Reference layers (WMS, ESRI Feature Service)
     addWMSLayer(id, url, layers, options) → LayerRef,
     addEsriFeatureLayer(id, url, options) → LayerRef,
     addXYZTileLayer(id, urlTemplate, options) → LayerRef,

     // Spatial queries
     pointInPolygon(lat, lng, polygon) → boolean,
     bufferPoint(lat, lng, radiusM) → polygon,
   }
   ```

3. **Create `util/providers/LeafletProvider.js`** — Wraps existing Leaflet logic:
   - Extract all Leaflet code from `MapView.controller.js`, `RouteAssessment.controller.js`, `FreightRouteDetail.controller.js`
   - Implement MapProviderInterface
   - Include Leaflet.Draw, Leaflet.MarkerCluster
   - Basemaps: OSM, CARTO, OpenTopoMap, Esri Satellite (free tile URL)
   - This is the FREE/OSS fallback provider

4. **Create `util/providers/MapLibreProvider.js`** — Wraps existing MapLibre logic:
   - Extract from `RoutePlanner.controller.js`
   - Implement MapProviderInterface
   - Basemaps: OpenFreeMap streets/satellite/topo
   - This is the alternative FREE/OSS provider

**Verification**: Existing map functionality unchanged. MapView, RoutePlanner, RouteAssessment, FreightRouteDetail all work as before using their current provider via the factory.

---

### Phase 3.2: Google Maps + Esri ArcGIS JS SDK Integration
**Files**: New `util/providers/GoogleMapsProvider.js`, new `util/providers/EsriProvider.js`
**Objective**: Add commercial map providers behind the abstraction layer.

**Tasks**:

1. **Create `util/providers/GoogleMapsProvider.js`**:
   - Load Google Maps JS API dynamically (no script tag in index.html)
   - `init()`: load API with key from config, create `google.maps.Map`
   - Implement all MapProviderInterface methods using Google Maps API:
     - Markers → `google.maps.marker.AdvancedMarkerElement`
     - Polylines → `google.maps.Polyline`
     - Drawing → `google.maps.drawing.DrawingManager`
     - Clustering → `@googlemaps/markerclusterer`
     - Basemaps → `roadmap`, `satellite`, `terrain`, `hybrid`
   - Add Google-specific features:
     - StreetView integration (for bridge visual inspection)
     - Traffic layer toggle
     - 3D tilt for bridge approach visualization

2. **Create `util/providers/EsriProvider.js`**:
   - Load ArcGIS Maps SDK for JavaScript (4.x) dynamically via `@arcgis/core`
   - `init()`: create `esri/Map` + `esri/views/MapView`
   - Implement MapProviderInterface using Esri API:
     - Markers → `esri/layers/FeatureLayer` with client-side graphics
     - Basemaps → `streets-vector`, `satellite`, `topo-vector`, `dark-gray-vector`
     - Drawing → `esri/widgets/Sketch`
     - Clustering → `esri/layers/FeatureLayer` with `featureReduction: { type: "cluster" }`
   - Add Esri-specific features:
     - Native ESRI Feature Service consumption (replace custom REST calls)
     - Web Map integration (load from ArcGIS Online item ID)
     - Spatial analysis widgets (buffer, intersect)
     - LRS support via ArcGIS Roads & Highways (if available)

3. **API Key Management** — Store keys in BTP Destination Service (NOT localStorage):
   - Create new backend action: `getMapApiConfig` in `srv/handlers/system.js`
   - Returns: `{ provider, apiKey (masked), geocodingProvider, routingProvider }`
   - Keys stored in BTP environment variables: `GOOGLE_MAPS_API_KEY`, `ESRI_API_KEY`
   - Frontend fetches on app init, passes to MapProviderFactory

4. **Fallback chain**: Google → Esri → OSM (Leaflet). If commercial provider fails to load (invalid key, network), auto-fallback to Leaflet with user notification.

**Verification**: Toggle map provider in AdminConfig → all 4 map views render correctly with each provider.

---

### Phase 3.3: Geocoding + Routing Provider Abstraction
**Files**: New `util/GeocodingService.js`, new `util/RoutingService.js`
**Objective**: Abstract geocoding and routing behind switchable providers.

**Tasks**:

1. **Create `util/GeocodingService.js`**:
   ```javascript
   // Providers: "google" | "esri" | "nominatim" (OSM)
   {
     geocode(address) → Promise<{lat, lng, formatted, confidence}[]>,
     reverseGeocode(lat, lng) → Promise<{address, components}>,
     suggest(partialAddress) → Promise<{text, placeId}[]>  // autocomplete
   }
   ```
   - Google: `google.maps.Geocoder` + Places Autocomplete
   - Esri: `esri/rest/locator` (ArcGIS World Geocoding Service)
   - Nominatim: existing code from RoutePlanner (free, AU-focused)
   - Add debounce (400ms) to all suggest() calls
   - Country filter: Australia (`componentRestrictions: { country: "au" }`)

2. **Create `util/RoutingService.js`**:
   ```javascript
   // Providers: "google" | "esri" | "ors" | "osrm" | "valhalla"
   {
     route(origin, destination, waypoints, vehicleProfile) → Promise<RouteResult[]>,
     // RouteResult: { geometry: GeoJSON, distance_km, duration_min, alternatives: RouteResult[] }
   }
   ```
   - Google: Directions API with truck restrictions (via `routingPreference: "TRAFFIC_AWARE"`)
   - Esri: Route service with barriers from bridge restrictions
   - ORS: existing HGV profile (requires API key)
   - OSRM: existing fallback (no truck params)
   - Valhalla: existing truck costing
   - **Fix Valhalla hardcoded vehicle specs** — pass actual user input instead of 20t/4.3m/2.5m/19m defaults

3. **Refactor RoutePlanner.controller.js** — Replace inline geocoding/routing with service calls:
   - `_geocode()` → `GeocodingService.suggest()`
   - `_fetchRoute()` → `RoutingService.route()`
   - Remove all inline Nominatim/ORS/OSRM/Valhalla code

4. **Refactor RouteAssessment.controller.js** — Replace inline OSRM calls with `RoutingService.route()`.

5. **Refactor FreightRouteDetail.controller.js** — Replace inline routing engine code.

**Verification**: All routing/geocoding works through abstraction. Switching provider in config changes the engine used.

---

### Phase 3.4: Map Admin Configuration
**Files**: `AdminConfig.controller.js`, `AdminConfig.view.xml`, `db/schema.cds`, `srv/service.cds`
**Objective**: Admin UI to configure map provider, API keys, and default settings.

**Tasks**:

1. **Add schema entity** `nhvr.MapProviderConfig`:
   ```cds
   entity MapProviderConfig : cuid, managed {
     mapProvider     : String(20) default 'osm-leaflet';  // google | esri | osm-leaflet | osm-maplibre
     geocodeProvider : String(20) default 'nominatim';
     routingProvider : String(20) default 'osrm';
     defaultCenter   : array of Decimal;  // [-25, 134]
     defaultZoom     : Integer default 4;
     clusterEnabled  : Boolean default true;
     clusterRadius   : Integer default 50;
     trafficLayerEnabled : Boolean default false;
     streetViewEnabled   : Boolean default false;
     isActive        : Boolean default true;
   }
   ```
   - API keys stored in BTP environment ONLY (never in DB)

2. **Add "Map Settings" tab** in `AdminConfig.view.xml`:
   - Provider dropdown (Google Maps, Esri ArcGIS, OpenStreetMap Leaflet, OpenStreetMap MapLibre)
   - Geocoding provider dropdown
   - Routing provider dropdown
   - Default center (lat/lng inputs)
   - Default zoom (slider 1-18)
   - Cluster toggle + radius
   - Traffic layer toggle (Google only)
   - Test connection button (validates API key works)

3. **Role-gate**: Only `Admin` role can access Map Settings tab.

**Verification**: Admin can switch providers. Map views respect the configured provider.

---

## PHASE 4 — ASSESSMENT ENGINE & PERMITS (4 sessions)

### Phase 4.1: Assessment Logic Consolidation
**Files**: `RouteAssessment.controller.js`, `srv/handlers/geo.js`
**Objective**: Remove client-side 8-point assessment; all assessment through server actions.

**Tasks**:

1. **Remove client-side assessment logic** from `RouteAssessment.controller.js`:
   - Delete the multi-step client-side evaluation (mass, clearance, width, posting, condition, restrictions)
   - Replace with call to `/assessRouteGeometry` action (same as RoutePlanner and FreightRouteDetail)
   - Parse response and bind to existing UI models
   - Keep UI rendering exactly the same — only the data source changes

2. **Standardize assessment response** in `geo.js`:
   - All 4 assessment actions return identical response schema:
     ```json
     {
       "verdict": "APPROVED|APPROVED_WITH_CONDITIONS|REFUSED",
       "bridges": [{ "bridgeId", "name", "verdict", "issues": [], "warnings": [], "massMargin", "clearanceMargin", "restrictions": [] }],
       "summary": { "total", "pass", "conditions", "fail" },
       "limitingAsset": { "bridgeId", "constraint" },
       "minMassMargin_t": number,
       "minClearanceMargin_m": number
     }
     ```

3. **Add CapabilityManager guard** to all assessment views:
   - RouteAssessment: guard with `ROUTE_ASSESSMENT` capability
   - RoutePlanner: guard with `ROUTE_PLANNER` capability
   - FreightRouteDetail: guard with `FREIGHT_ROUTES` capability

---

### Phase 4.2: Admin-Configurable Assessment Thresholds
**Files**: `db/schema.cds`, `srv/service.cds`, `srv/handlers/geo.js`, `AdminConfig`
**Objective**: Move all hardcoded assessment thresholds to admin-configurable entity.

**Tasks**:

1. **Add schema entity** `nhvr.AssessmentThreshold`:
   ```cds
   entity AssessmentThreshold : cuid, managed {
     thresholdKey    : String(50) @mandatory;  // e.g., "MASS_MARGIN_WARNING_T"
     value           : Decimal(10,3) @mandatory;
     unit            : String(10);
     description     : String(200);
     jurisdiction    : String(3);  // NULL = global, or state code
     isActive        : Boolean default true;
   }
   ```

2. **Seed default thresholds**:
   ```csv
   MASS_MARGIN_WARNING_T, 2.0, t, "Mass margin below which permit is required"
   HEIGHT_MARGIN_WARNING_M, 0.3, m, "Height clearance margin below which warning triggered"
   WIDTH_MARGIN_WARNING_M, 0.6, m, "Width margin safety buffer"
   FATIGUE_WARNING_PCT, 20, %, "Fatigue life remaining below which fail triggered"
   SCOUR_CRITICAL_MARGIN_M, 0, m, "Scour margin at or below which fail triggered"
   PROXIMITY_RADIUS_M, 500, m, "Bridge proximity threshold for geometry-based assessment"
   CROSSING_SPEED_DEFAULT_KMH, 40, km/h, "Default crossing speed if not specified"
   ```

3. **Load thresholds in geo.js** — At start of each assessment action, fetch active thresholds:
   ```javascript
   const thresholds = await loadThresholds(jurisdiction);
   // Use thresholds.MASS_MARGIN_WARNING_T instead of hardcoded 2
   ```

4. **Add "Assessment Thresholds" tab** in `AdminConfig` — CRUD for thresholds. Role-gated to `Admin`.

---

### Phase 4.3: Pre-Trip Validation API
**Files**: `srv/service.cds`, `srv/handlers/geo.js`
**Objective**: External-facing route validation endpoint for fleet/TMS integration.

**Tasks**:

1. **Add unbound action** in `service.cds`:
   ```cds
   action validateRoute(
     routeGeometry : LargeString,  // GeoJSON LineString
     vehicleGVM_t : Decimal, vehicleGCM_t : Decimal,
     vehicleHeight_m : Decimal, vehicleWidth_m : Decimal, vehicleLength_m : Decimal,
     crossingSpeed_kmh : Integer, vehicleClass : String
   ) returns String;  // JSON assessment result
   ```
   - Annotate with `@requires: 'authenticated-user'`
   - This is a thin wrapper around `assessRouteGeometry`

2. **Add API documentation** as a function annotation in service.cds:
   ```cds
   @Core.Description: 'Pre-trip route validation. Submit vehicle specs + route geometry, receive bridge-by-bridge assessment.'
   @Core.LongDescription: 'Returns JSON with verdict (APPROVED/APPROVED_WITH_CONDITIONS/REFUSED), per-bridge results, and limiting asset.'
   ```

3. **Add rate limiting** in handler: max 100 calls per hour per user.

---

### Phase 4.4: Permit Edit Workflow
**Files**: `Permits.controller.js`, `Permits.view.xml`
**Objective**: Replace stubbed permit edit with full amendment workflow.

**Tasks**:

1. **Add permit edit dialog** — Reuse the 3-step wizard structure but in "edit" mode:
   - Step 1: Show current bridge + vehicle (read-only), allow dimension changes
   - Step 2: Re-run `assessVehicleOnBridge` with updated dimensions
   - Step 3: Show new assessment vs. old assessment diff; capture amendment reason

2. **Backend support** — PATCH handler for VehiclePermit:
   - Only allow edits on DRAFT and PENDING permits (not APPROVED/DENIED)
   - Log amendment in AuditLog with old + new values
   - Increment version field

3. **Add version history panel** — In permit detail view, show change log from AuditLog filtered by permit ID.

4. **Remove the stub toast** — Replace "Permit edit — full edit dialog coming in next phase" with actual implementation.

---

## PHASE 5 — FIELD OPERATIONS (4 sessions)

### Phase 5.1: Photo/Document Attachment Support
**Files**: `db/schema.cds`, `srv/service.cds`, `srv/handlers/inspections.js`, `BridgeDetail.controller.js`, `Defects.controller.js`, `InspectionCreate.view.xml`
**Objective**: Enable photo/document upload for inspections and defects.

**Tasks**:

1. **Add/verify schema entity** `nhvr.DocumentAttachment` (may already exist):
   ```cds
   entity DocumentAttachment : cuid, managed {
     bridge         : Association to Bridge;
     inspection     : Association to InspectionRecord;
     defect         : Association to BridgeDefect;
     fileName       : String(255) @mandatory;
     mimeType       : String(100);
     fileSize       : Integer;  // bytes
     content        : LargeBinary @Core.MediaType: mimeType;
     caption        : String(500);
     gpsLatitude    : Decimal(11,8);
     gpsLongitude   : Decimal(11,8);
     capturedAt     : Timestamp;
     uploadedBy     : String(100);
   }
   ```

2. **Add service projection and CRUD** in service.cds.

3. **Add upload handler** in `inspections.js`:
   - Accept multipart form data
   - Validate file type: JPEG, PNG, PDF, DOCX only
   - Validate file size: max 10MB per file, max 50MB per inspection
   - Store in HANA (LargeBinary) or BTP Document Management Service (if available)
   - Extract EXIF GPS data from photos (if present) → populate gpsLatitude/gpsLongitude

4. **Add FileUploader to InspectionCreate.view.xml**:
   ```xml
   <upload:UploadSet id="inspectionPhotos"
     uploadEnabled="true"
     fileTypes="jpg,jpeg,png,pdf"
     maxFileSize="10"
     items="{ path: 'attachments>/items' }">
   </upload:UploadSet>
   ```

5. **Add FileUploader to Defect Raise dialog** in `BridgeDetail.controller.js`.

6. **Add photo gallery** in BridgeDetail Inspections tab — Show thumbnails of attached photos per inspection.

7. **Role-gate**: `Inspector`, `BridgeManager`, and `Admin` can upload. `Viewer` can view only.

---

### Phase 5.2: GPS Capture + Draft Persistence
**Files**: `InspectionCreate.controller.js`, `BridgeDetail.controller.js`, `Defects.controller.js`
**Objective**: Auto-capture GPS on field actions; persist drafts to survive app crashes.

**Tasks**:

1. **Create `util/GeoLocation.js`**:
   ```javascript
   {
     getCurrentPosition() → Promise<{lat, lng, accuracy, timestamp}>,
     watchPosition(callback) → watchId,
     stopWatch(watchId) → void,
     isAvailable() → boolean
   }
   ```

2. **Auto-capture GPS** on:
   - Inspection creation → populate inspection GPS fields
   - Defect raise → populate defect location fields
   - Photo upload → stamp photo with GPS if not in EXIF

3. **Draft persistence** — Create `util/DraftManager.js`:
   ```javascript
   {
     saveDraft(entityType, entityId, data) → void,  // saves to IndexedDB
     loadDraft(entityType, entityId) → data | null,
     deleteDraft(entityType, entityId) → void,
     listDrafts() → [{entityType, entityId, savedAt}]
   }
   ```
   - Auto-save every 30 seconds during inspection/defect creation
   - On controller init: check for existing draft, prompt user to restore
   - On successful submit: delete draft

4. **Add "Drafts" indicator** to InspectionDashboard — Badge showing count of saved drafts.

---

### Phase 5.3: Inspection Review/Approval Workflow
**Files**: `db/schema.cds`, `srv/handlers/inspections.js`, `InspectionDashboard.controller.js`
**Objective**: Add supervisor review step before inspection completion.

**Tasks**:

1. **Extend InspectionOrder status enum**: Add `PENDING_REVIEW` between `IN_PROGRESS` and `COMPLETED`.

2. **Add review fields** to InspectionOrder:
   ```cds
   extend InspectionOrder with {
     reviewedBy     : String(100);
     reviewedAt     : Timestamp;
     reviewNotes    : String(1000);
     reviewDecision : String(20);  // APPROVED, REJECTED, NEEDS_REVISION
   };
   ```

3. **Modify workflow**:
   - Inspector submits → status changes to `PENDING_REVIEW`
   - Reviewer (BridgeManager/Admin) sees pending reviews in dashboard
   - Reviewer can: Approve (→ COMPLETED), Reject (→ IN_PROGRESS with notes), or Request Revision
   - Only on Approve: bridge condition rating updates

4. **Add "Pending Reviews" section** to InspectionDashboard — Filtered list of PENDING_REVIEW orders. Visible only to BridgeManager and Admin roles.

---

### Phase 5.4: Offline Enhancement
**Files**: `util/OfflineSync.js`, `util/DraftManager.js`
**Objective**: Harden offline capability with retry, dedup, and auth token handling.

**Tasks**:

1. **Add retry strategy to OfflineSync.js**:
   - Exponential backoff: 1s, 2s, 4s, 8s, max 60s
   - Max 5 retries per mutation
   - After max retries: move to dead-letter queue, notify user

2. **Add deduplication**: Hash each mutation (URL + method + body); reject duplicates in queue.

3. **Add auth token refresh check**: Before flushing queue, verify JWT is still valid. If expired, prompt user to re-authenticate.

4. **Add tile caching strategy** (for offline maps):
   - When using Leaflet/MapLibre: intercept tile requests via ServiceWorker
   - Cache tiles for regions user has viewed (LRU cache, max 500MB)
   - Show "Offline" indicator on map when cached tiles are served

---

## PHASE 6 — ANALYTICS & REPORTING (4 sessions)

### Phase 6.1: Server-Side Aggregation
**Files**: `srv/handlers/reports.js`, `srv/service.cds`
**Objective**: Replace client-side aggregation with server-side computed functions.

**Tasks**:

1. **Add aggregation actions** in service.cds:
   ```cds
   function getDashboardKPIs(jurisdiction: String) returns {
     totalBridges: Integer; activeBridges: Integer; closedBridges: Integer;
     criticalBridges: Integer; activeRestrictions: Integer; permitRequired: Integer;
     openDefects: Integer; overdueInspections: Integer;
     conditionDistribution: array of { condition: String; count: Integer; };
   };

   function getConditionTrend(periods: Integer, jurisdiction: String) returns
     array of { period: String; avgScore: Decimal; minScore: Decimal; maxScore: Decimal; count: Integer; };
   ```

2. **Implement in reports.js** — Single SQL query with GROUP BY for each aggregation. Return JSON.

3. **Refactor Dashboard.controller.js** — Replace 4+ parallel fetch calls with single `getDashboardKPIs()` call.

4. **Refactor Home.controller.js** — Replace multiple count queries with single aggregation call.

5. **Add pagination to all report endpoints** — Enforce `$top` max 500 on all list endpoints. Return `$count` for total.

---

### Phase 6.2: Trend Visualization
**Files**: `Dashboard.controller.js`, `Dashboard.view.xml`
**Objective**: Add time-series charts for condition trends, restriction activity, and inspection compliance.

**Tasks**:

1. **Add `sap.viz` chart** to Dashboard for condition trend:
   - Line chart: X = period (month), Y = average condition score
   - Multi-series: one line per condition band (GOOD/FAIR/POOR/CRITICAL)
   - Data from `getConditionTrend(12)` — last 12 months

2. **Add restriction activity chart**:
   - Stacked bar: X = month, Y = count, series = restriction type
   - Data from new `getRestrictionTrend(12)` function

3. **Add inspection compliance gauge**:
   - Radial micro chart: % bridges with inspection within required frequency
   - Red/yellow/green zones

4. **Role-gate**: Charts visible to `BridgeManager`, `Admin`, `Executive` only. `Viewer` sees KPI numbers without charts.

---

### Phase 6.3: Admin-Configurable KPI Thresholds
**Files**: `db/schema.cds`, `AdminConfig.controller.js`, `Dashboard.controller.js`
**Objective**: Make all dashboard thresholds admin-configurable.

**Tasks**:

1. **Add entity** `nhvr.KPIThreshold`:
   ```cds
   entity KPIThreshold : cuid, managed {
     kpiKey      : String(50) @mandatory;
     warningValue : Decimal;
     criticalValue : Decimal;
     unit        : String(10);
     description : String(200);
   }
   ```

2. **Seed defaults**:
   - `INSPECTION_OVERDUE_DAYS`: warning=365, critical=730
   - `RESTRICTION_EXPIRY_DAYS`: warning=30, critical=7
   - `CONDITION_AT_RISK_SCORE`: warning=50, critical=40
   - `COMPLIANCE_TARGET_PCT`: warning=90, critical=80

3. **Load thresholds** in Dashboard.controller.js and use instead of hardcoded values.

4. **Add "KPI Thresholds" section** in AdminConfig — CRUD table. Role-gated to Admin.

---

### Phase 6.4: Scheduled Reports
**Files**: `srv/handlers/reports.js`, `srv/service.cds`, `AdminConfig`
**Objective**: Enable report scheduling with email distribution.

**Tasks**:

1. **Add entity** `nhvr.ReportSchedule`:
   ```cds
   entity ReportSchedule : cuid, managed {
     reportKey    : String(50) @mandatory;
     cronSchedule : String(50);  // "0 8 * * 1" = every Monday 8am
     recipients   : LargeString;  // JSON array of email addresses
     format       : String(10) default 'CSV';  // CSV | XLSX | PDF
     filters      : LargeString;  // JSON filter config
     isActive     : Boolean default true;
     lastRunAt    : Timestamp;
     lastRunStatus: String(20);
   }
   ```

2. **Add report execution action**:
   ```cds
   action executeScheduledReport(scheduleId: UUID) returns { status: String; downloadUrl: String; };
   ```

3. **Add "Report Schedules" tab** in AdminConfig — CRUD for schedules. Role-gated to Admin + Executive.

4. **Note**: Actual email sending requires BTP Mail Service integration (can be stubbed with download-link-only for now).

---

## PHASE 7 — TEST COVERAGE (4 sessions)

### Phase 7.1: CI/CD Hardening
**Files**: `.github/workflows/deploy-btp.yml`
**Objective**: Make tests block deployment; add rollback strategy.

**Tasks**:

1. **Remove `continue-on-error: true`** from test job (line ~36)
2. **Remove `continue-on-error: true`** from CodeQL job (line ~157)
3. **Add explicit deployment gate**:
   ```yaml
   deploy:
     needs: [audit-and-test]
     if: ${{ needs.audit-and-test.result == 'success' }}
   ```
4. **Add rollback step** on health check failure:
   ```yaml
   - name: Rollback on failure
     if: failure()
     run: |
       cf rollback nhvr-bridge-srv || echo "No previous version to rollback to"
   ```
5. **Pin Node version** to `20.11.0` (LTS) instead of `>=20.0.0`

---

### Phase 7.2: Route Assessment Tests
**Files**: `test/route-assessment.test.js` (new)
**Objective**: Test all 4 assessment actions end-to-end.

**Tasks**:

1. **Create test file** with fixtures:
   - Seed 5 test bridges with known capacities on a test route
   - Seed 3 restrictions (MASS, HEIGHT, TEMPORARY)

2. **Test `assessCorridor`** (8 tests):
   - Route with all passing bridges → APPROVED
   - Route with one failing bridge → corridor max = lowest limit
   - Route with critical bridge → critical count incremented
   - Empty route → appropriate error
   - Non-existent route → 404

3. **Test `assessFreightRouteVehicle`** (15 tests):
   - Vehicle within all limits → APPROVED
   - Vehicle exceeds mass on one bridge → REFUSED + correct limiting asset
   - Vehicle exceeds height → REFUSED
   - Vehicle within mass but close margin → APPROVED_WITH_CONDITIONS
   - Temporary restriction triggers permit required
   - CLOSED bridge → automatic REFUSED
   - POOR condition bridge → APPROVED_WITH_CONDITIONS

4. **Test `assessRouteGeometry`** (10 tests):
   - Route geometry near known bridges → bridges discovered
   - Route geometry with no nearby bridges → empty result
   - Invalid geometry → error

5. **Test `findAlternativeRoutes`** (5 tests):
   - Alternative routes returned with assessment summary
   - No alternatives found → empty array

---

### Phase 7.3: Permit + Report Tests
**Files**: `test/permit-workflow.test.js` (new), `test/report-handlers.test.js` (new)
**Objective**: Test permit lifecycle and all report handlers.

**Tasks**:

1. **Permit tests** (20 tests):
   - Create permit → DRAFT status
   - Assess vehicle on bridge → 6-point check results
   - Submit permit → status transition
   - Approve/deny permit with conditions
   - Edit draft permit
   - Reject edit of approved permit → 400
   - Permit expiry logic

2. **Report tests** (15 tests):
   - `getDashboardKPIs` returns correct counts
   - `getAssetRegister` with filters
   - `getConditionTrend` returns correct period grouping
   - `getRestrictionSummary` with status filter
   - `getNetworkKPIs` computed correctly
   - Pagination works correctly (skip/top)

---

### Phase 7.4: Concurrency + Edge Case Tests
**Files**: `test/concurrency.test.js` (new), `test/edge-cases.test.js` (new)
**Objective**: Test race conditions and boundary values.

**Tasks**:

1. **Concurrency tests** (10 tests):
   - Simultaneous bridge condition updates → version conflict detected
   - Simultaneous restriction creation on same bridge → both succeed
   - Concurrent mass upload → no duplicate records
   - Simultaneous inspection completion → version lock

2. **Edge case tests** (15 tests):
   - Bridge with 0 restrictions → assessment works
   - Vehicle dimensions at exact limit → correct verdict
   - Restriction with validFromDate = validToDate → handled
   - Bridge at lat -90, lon 180 → accepted
   - Unicode in bridge name → stored correctly
   - Empty CSV upload → graceful error
   - CSV with 10,000 rows → batch processing works
   - Special characters in restriction notes → no injection

---

## PHASE 8 — PLATFORM HARDENING (4 sessions)

### Phase 8.1: Multi-Tenancy Foundation
**Files**: `db/schema.cds`, `srv/service.cds`, `srv/handlers/common.js`
**Objective**: Add tenant isolation at data layer.

**Tasks**:

1. **Add tenant_ID** to Bridge, Route, Restriction, FreightRoute, VehiclePermit.
2. **Add tenant filter** to all service projections: `where tenant_ID = $user.tenant`.
3. **Add tenant context middleware** in service.js — extract tenant from JWT claims.
4. **Seed default tenant** for existing data.

---

### Phase 8.2: Standards Adapter Unit Conversion
**Files**: `util/StandardsAdapter.js`
**Objective**: Add actual value conversion between AU/NZ/EU/US standards.

**Tasks**:

1. **Add conversion functions**:
   - `convertMass(value, fromUnit, toUnit)` — tonnes ↔ kips ↔ kg
   - `convertLength(value, fromUnit, toUnit)` — metres ↔ feet
   - `convertSpeed(value, fromUnit, toUnit)` — km/h ↔ mph
   - `convertRating(value, fromScale, toScale)` — AS5100 1-10 ↔ AASHTO 0-9 ↔ NZ 0-100

2. **Apply conversions** when user switches standard profile in UI.

---

### Phase 8.3: Accessibility + CSS Hardening
**Files**: `css/style.css`, all view XML files
**Objective**: WCAG AA compliance.

**Tasks**:

1. **Add focus indicators**: `:focus-visible` outline on all interactive elements
2. **Add high-contrast media query**: `@media (prefers-contrast: more)`
3. **Add reduced-motion query**: `@media (prefers-reduced-motion: reduce)`
4. **Add print stylesheet**: `@media print` with appropriate layout
5. **Remove `!important` overrides** — fix specificity properly
6. **Add aria-labels** to all icon-only buttons across views
7. **Ensure colour is never the sole indicator** — add text labels alongside condition chips

---

### Phase 8.4: Export + Print Improvements
**Files**: `AlvToolbarMixin.js`, `ExcelExport.js`
**Objective**: Real XLSX export, print-ready reports.

**Tasks**:

1. **Integrate SheetJS (xlsx)** for real XLSX generation:
   - Replace TSV-with-.xls-extension with proper `XLSX.writeFile()`
   - Add frozen header row
   - Add conditional formatting (red for CRITICAL, yellow for WARNING)
   - Add column auto-width

2. **Add batch export** — "Export All" button that exports bridges, restrictions, defects as multi-sheet XLSX.

3. **Add print view** for reports — Print-optimized CSS with headers, page breaks, and logos.

---

## DEPENDENCY ORDER

```
Phase 1 (Security) → can start immediately, no dependencies
Phase 2 (Data Integrity) → depends on Phase 1.3 (schema changes)
Phase 3 (Mapping) → independent, can run parallel with Phase 2
Phase 4 (Assessment) → depends on Phase 2.3 (validation) and Phase 3.1 (map abstraction)
Phase 5 (Field Ops) → depends on Phase 1.3 (schema) and Phase 5.2 depends on Phase 5.1
Phase 6 (Analytics) → depends on Phase 2 (data integrity)
Phase 7 (Testing) → depends on all prior phases; run as each phase completes
Phase 8 (Platform) → depends on Phases 1-6
```

**Parallel execution possible**:
- Phase 1 + Phase 3 (in separate sessions/worktrees)
- Phase 4 + Phase 5 (after Phase 2 completes)
- Phase 6 + Phase 7 (after Phase 4+5 complete)

---

## SESSION STARTUP TEMPLATE

Copy-paste this into each new Claude Code session:

```
Implement NHVR Phase [X.Y] — [Title].

Read `.claude/prompts/NHVR_MASTER_IMPLEMENTATION.md` — ONLY Phase [X.Y].
Read CLAUDE.md for project rules.
Read `.nhvr-implementation-tracker.json` for current status.

Rules:
1. Read target files before editing
2. Mirror sync all webapp changes to both app-router/resources/ paths
3. Run `npm test` at end — must pass
4. Commit with message: "feat(phase-X.Y): [description]"
5. Update tracker JSON status to "complete" with date

Start by listing the files you'll modify, then implement incrementally.
```
