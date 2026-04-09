# NHVR Bridge Asset & Restriction Management System -- Administration & Configuration Guide

**Version:** 4.7.4
**Date:** April 2026
**Audience:** System Administrators, Technical Administrators, BTP Platform Engineers

---

## Table of Contents

1. [User and Role Management](#1-user-and-role-management)
2. [Admin Configuration Screens](#2-admin-configuration-screens)
3. [Dynamic Attributes](#3-dynamic-attributes)
4. [Lookup Management](#4-lookup-management)
5. [Map Configuration](#5-map-configuration)
6. [Integration Management](#6-integration-management)
7. [Data Quality Rules](#7-data-quality-rules)
8. [Monitoring and Troubleshooting](#8-monitoring-and-troubleshooting)
9. [Backup and Data Management](#9-backup-and-data-management)

---

## 1. User and Role Management

### 1.1 XSUAA Scopes

The application defines eight XSUAA scopes in `xs-security.json`. Each scope controls access to a distinct functional area:

| Scope | Description |
|-------|-------------|
| `Admin` | Full administrative access -- manage bridges, restrictions, and attribute definitions |
| `BridgeManager` | Create and edit bridge records and restrictions |
| `Viewer` | Read-only access to bridge and restriction data |
| `Uploader` | Permission to perform mass uploads via CSV |
| `Executive` | Read-only access to dashboards and KPI analytics |
| `Inspector` | Create and manage inspection orders, defect records, and condition assessments |
| `Operator` | Operational access -- view bridge data, apply temporary restrictions, manage permits |
| `TechAdmin` | Technical Administrator -- manage BTP environment, integrations, GIS config, jurisdiction, and map configuration |

### 1.2 Role Templates

Role templates bundle scopes into logical groupings. Each template maps to a job function:

| Role Template | Included Scopes |
|---------------|-----------------|
| Admin | Admin, BridgeManager, Viewer, Uploader, Executive, Inspector, Operator |
| BridgeManager | BridgeManager, Viewer, Uploader, Executive, Inspector |
| Inspector | Inspector, Viewer |
| Operator | Operator, Viewer |
| Viewer | Viewer |
| Executive | Executive, Viewer |
| TechAdmin | TechAdmin, Viewer |

### 1.3 Role Collections

Seven role collections are pre-configured for assignment to users:

| Role Collection | Description | Recommended AD Group |
|-----------------|-------------|---------------------|
| `NHVR_Admin` | NHVR System Administrator Role Collection | sg-nhvr-admin |
| `NHVR_BridgeManager` | NHVR Bridge Manager / Engineer Role Collection | sg-nhvr-bridgemgr |
| `NHVR_Inspector` | NHVR Bridge Inspector (AS 5100) Role Collection | sg-nhvr-inspector |
| `NHVR_Operator` | NHVR Field Operator Role Collection | sg-nhvr-operator |
| `NHVR_Viewer` | NHVR General Staff Viewer Role Collection | sg-nhvr-viewer |
| `NHVR_Executive` | NHVR Executive Dashboard Role Collection | sg-nhvr-executive |
| `NHVR_TechAdmin` | BMS Technical Administrator Role Collection | sg-nhvr-techadmin |

### 1.4 Assigning Role Collections to Users in BTP Cockpit

To assign a role collection to a user:

1. Open the SAP BTP Cockpit and navigate to your subaccount.
2. Go to **Security > Role Collections**.
3. Select the desired role collection (e.g., `NHVR_BridgeManager`).
4. Click **Edit**.
5. Under the **Users** section, click **Add User**.
6. Enter the user's email address (as registered in the Identity Provider).
7. Select the appropriate Identity Provider from the dropdown.
8. Click **Save**.

For group-based assignment (recommended for production):

1. Navigate to **Security > Trust Configuration**.
2. Select your Identity Provider (e.g., SAP IAS or Azure AD).
3. Under **Role Collection Mappings**, click **New Role Collection Mapping**.
4. Select the role collection, enter the AD group name in the **Group** field (e.g., `sg-nhvr-bridgemgr`).
5. Click **Save**.

The application includes an XSUAA attribute called `Groups` for AD/IdP group membership mapping, and a `tenantCode` attribute for multi-tenant identification.

### 1.5 Permission Matrix

The following table shows what each role can access within the application. The internal role keys used by the RoleManager are: ADMIN, BRIDGE_MANAGER, INSPECTOR, OPERATOR, TECH_ADMIN, and READ_ONLY.

| Feature | Admin | Bridge Manager | Inspector | Operator | Tech Admin | Read Only (Viewer/Executive) |
|---------|:-----:|:--------------:|:---------:|:--------:|:----------:|:----------------------------:|
| Dashboard | View/Edit | View/Edit | View | View | View | View |
| Bridge Register | View/Edit | View/Edit | View | View | View | View |
| Restrictions | View/Edit | View/Edit | View | View/Edit | View | View |
| Map View | View | View | View | View | View | View |
| Reports | View | View | View | View | View | View |
| Route Assessment | View/Edit | View/Edit | View | View/Edit | View | View |
| Mass Upload | Full | Full | -- | -- | -- | -- |
| Mass Edit | Full | Full | -- | -- | -- | -- |
| Inspections | Full | Full | Full | -- | -- | -- |
| Defects | Full | Full | Full | -- | -- | -- |
| Admin Config | Full | -- | -- | -- | -- | -- |
| Tech Admin | Full | -- | -- | -- | Full | -- |
| Restriction Types | Full | -- | -- | -- | -- | -- |
| Vehicle Types | Full | -- | -- | -- | -- | -- |
| Permits | View/Edit | View/Edit | View | View/Edit | View | View |

---

## 2. Admin Configuration Screens

The system provides six administration screens, each accessible based on role permissions.

### 2.1 AdminConfig -- Business Administration

**Route:** `AdminConfig`
**Access:** Admin role only (guarded by `CapabilityManager.guardRoute("ADMIN_CONFIG")`)
**Title:** BMS Business Admin -- Configuration

This screen contains five tabs:

#### Tab 1: Attribute Definitions

Manage custom attribute definitions that extend bridge, restriction, defect, inspection, permit, and route entities. Each attribute definition includes:

- **Internal Name** -- machine-readable identifier (e.g., `floodFrequency`)
- **Display Label** -- human-readable name (e.g., "Flood Frequency (years)")
- **Data Type** -- STRING, INTEGER, DECIMAL, BOOLEAN, DATE, or LOOKUP
- **Target Entity** -- which entity the attribute applies to (BRIDGE, RESTRICTION, DEFECT, INSPECTION_ORDER, PERMIT, ROUTE)
- **Required** -- whether the attribute is mandatory
- **Display Order** -- sort position in forms and tables
- **Active** -- toggle visibility across the application
- **Filter Enabled** -- include in filter panels
- **Report Enabled** -- include in report outputs
- **Mass Edit Enabled** -- allow bulk updates

For LOOKUP-type attributes, a Valid Values builder is available to define dropdown options.

Operations: Add, Edit, Delete attribute definitions. Changes take effect immediately.

#### Tab 2: Lookup Values

Manage admin-controlled lookup values that power dropdown fields throughout the application. Each lookup entry has:

- **Category** -- grouping identifier (e.g., `STRUCTURE_TYPE`)
- **Code** -- unique value within the category (e.g., `BEAM_CONCRETE`)
- **Description** -- display text for the dropdown
- **Display Order** -- sort position
- **Active** -- toggle to show/hide without deleting

Lookups can be filtered by category. Changes are effective immediately across the application.

#### Tab 3: Audit Log

View the system audit trail for all data changes. The audit log records:

- **Timestamp** -- when the change occurred
- **Action** -- CREATE, UPDATE, DELETE, or ACTION
- **Entity** -- which data entity was affected (Bridges, Restrictions, BridgeAttributes)
- **Record** -- the specific record name
- **User** -- who performed the action
- **Role** -- the user's active role
- **Description** -- summary of the change

Filters are available for action type and entity type. A search bar supports free-text search across action, entity, and user fields.

#### Tab 4: Role Configuration

Configure which features, tabs, and actions each role can see and edit. The role configuration is divided into three sections:

- **Navigation Tiles and Menu Items** -- control which home screen tiles are visible and enabled per role. Each item has featureEnabled (global on/off toggle), visible, and editable switches.
- **Bridge Detail Tabs** -- control which tabs appear on the Bridge Detail page per role, with visible and editable toggles.
- **Actions and Buttons** -- control which action buttons are available per role.

Roles available for configuration: Administrator, Bridge Manager, Inspector, Operator, Read Only.

Changes take effect on the next role switch or page reload.

#### Tab 5: Map Settings (Provider Config)

Configure the map provider stack:

- **Map Provider** -- OpenStreetMap (Leaflet), OpenStreetMap (MapLibre), Google Maps, or Esri ArcGIS
- **Geocoding Provider** -- Nominatim (OSM, free), Google Geocoding, or Esri World Geocoder
- **Routing Provider** -- OSRM (free), Valhalla (free), OpenRouteService (API key), Google Directions, or Esri Route
- **Default Zoom** -- slider from 1 to 18
- **Clustering** -- enable/disable with configurable cluster radius in pixels
- **Traffic Layer** -- Google Maps only
- **Street View** -- Google Maps only
- **API Key Status** -- read-only display showing whether Google and Esri API keys are configured (keys are set via BTP environment variables, not through this UI)

### 2.2 AdminRestrictionTypes -- Restriction Type Management

**Route:** `AdminRestrictionTypes`
**Access:** Admin role only
**Entity:** `RestrictionTypeConfig`

Manage the restriction type codes used across the application. Each restriction type includes:

| Field | Description |
|-------|-------------|
| `code` | Short identifier (e.g., GROSS_MASS, HEIGHT) |
| `displayLabel` | Human-readable name (e.g., "Gross Vehicle Mass") |
| `defaultUnit` | Default unit of measure (t, m, km/h) |
| `valueRequired` | Whether a numeric value is mandatory |
| `description` | Additional notes |
| `sortOrder` | Display order |
| `active` | Toggle availability |
| `isSystem` | System types cannot be deleted |

Operations: Add, Edit, Delete (non-system types only).

### 2.3 AdminVehicleTypes -- Vehicle Type Register

**Route:** `AdminVehicleTypes`
**Access:** Admin role only
**Entity:** `VehicleType`

Manage vehicle type definitions used for permits and route assessments. Each vehicle type captures:

- **Basic fields**: vehicleTypeId, code, displayName, nhvrClass (GEN/HML/BD/PBS2/PBS3/PBS4/OM/RT), vehicleCategory, description
- **Mass (tonnes)**: maxGVM_t, maxGCM_t, steerAxleMax_t, driveAxleGroupMax_t, trailerAxleGroupMax_t, axleGroupConfig, numberOfAxles, axleSpacingMin_m, tyrePressureMax_kPa
- **Dimensions (metres)**: maxHeight_m, maxWidth_m, maxLength_m, maxOverhang_m, turningRadiusMin_m
- **Dynamic characteristics**: suspensionType, dynamicFactor (per AS 5100.2), maxOperatingSpeed_kmh

### 2.4 AppAdmin -- Application-Level Settings

**Route:** `AppAdmin`
**Access:** Admin role

Displays application-level information and settings:

- **BTP Region**, CF Org, CF Space
- **Application Version** and mode (full/lite)
- **Health Status** and database status
- **Uptime** and current user information
- **Tenant management** -- list of configured tenants
- **Usage statistics** -- active users, bridge count, API calls

Data is loaded via the `/getAppConfig(...)` and `/me(...)` OData function imports.

### 2.5 BmsTechAdmin -- Technical Administration

**Route:** `BmsTechAdmin`
**Access:** Admin + NHVR_TechAdmin roles
**Title:** BMS Tech Admin -- Technical Configuration

This screen contains four sections:

#### Jurisdiction Access

Manage which users can view and edit bridge data for specific Australian states and territories. Jurisdiction grants are applied on top of the user's XSUAA role collection. Each grant specifies:

- **User Ref** -- email or ID of the user
- **Jurisdiction** -- ALL, NSW, VIC, QLD, WA, SA, TAS, ACT, or NT
- **Access Level** -- READ (view only), WRITE (create and edit), or ADMIN (full)
- **Granted By** -- who created the grant
- **Expires At** -- optional expiry date

Operations: Grant Access, Revoke Access, Refresh.

#### Standards Profile

Configure compliance standards and assessment profiles for the organisation.

#### Map Config

Advanced map configuration (separate from the simpler Map Settings in AdminConfig). Manages the `MapConfig` entity with detailed settings for viewport, base maps, reference layers, ESRI integration, and draw tools.

#### Deployment Configuration (Feature Groups)

Six feature groups control which modules are deployed:

| Group | Name | Capabilities | Always On | Dependencies |
|-------|------|-------------|-----------|-------------|
| CORE | Core Platform | Bridge Registry, Restrictions, Map View, Reports, Executive Dashboard, Mass Upload, Mass Edit | Yes | None |
| INSPECTION | Inspection & Defects | Inspections, Defects, Capacity Ratings | No | CORE |
| COMPLIANCE | Compliance & Permits | Permits, Route Assessment, Freight Routes, Vehicle Combinations | No | CORE |
| ADMIN | Administration | Admin Config, Work Orders | No | CORE |
| INTEGRATION | Integration Hub | SAP S/4HANA, BANC, ESRI integration | No | CORE |
| ANALYTICS | BridgeIQ Analytics | Predictive analytics, Deterioration profiles, AI insights | No | CORE, INSPECTION |

### 2.6 LicenseConfig -- Licensing and Feature Flags

**Route:** `LicenseConfig`
**Access:** Admin role only (navigable from AdminConfig via "Client Licensing" button)

Manages multi-tenant capability licensing. Key functions:

- **Tenant management** -- list, select, and configure client organisations
- **Capability catalog** -- browse all licensable features from the `FeatureCatalog` entity
- **Per-tenant feature assignment** -- enable/disable specific capabilities for each tenant via the `TenantFeature` entity
- **Role matrix** -- configure per-tenant, per-role access within a licensed capability via the `TenantRoleCapability` entity (canView, canEdit, canAdmin)

Each tenant record (`Tenant` entity) tracks:

| Field | Description |
|-------|-------------|
| `tenantCode` | Stable key (e.g., NSW_RMS) |
| `displayName` | Human-readable organisation name |
| `jurisdiction` | State/territory or NATIONAL |
| `licenseStartDate` / `licenseEndDate` | License validity period |
| `licenseStatus` | ACTIVE, TRIAL, SUSPENDED, or EXPIRED |
| `maxUsers` | Licensed user cap |

---

## 3. Dynamic Attributes

### 3.1 Overview

The dynamic attributes system allows administrators to extend entity data models without code changes or redeployment. Attributes are defined once in the `AttributeDefinition` entity and values are stored in `BridgeAttribute` (for bridges) or `EntityAttribute` (for all other entity types).

### 3.2 AttributeDefinition Entity Schema

```
entity AttributeDefinition : cuid, managed {
    name            : String(100)   -- Internal machine name (e.g., floodFrequency)
    label           : String(200)   -- Display label (e.g., "Flood Frequency (years)")
    dataType        : String(20)    -- STRING | INTEGER | DECIMAL | BOOLEAN | DATE | LOOKUP
    entityTarget    : String(50)    -- BRIDGE | RESTRICTION | DEFECT | INSPECTION_ORDER | PERMIT | ROUTE
    isRequired      : Boolean       -- Whether the field is mandatory
    defaultValue    : String(500)   -- Default value for new records
    displayOrder    : Integer       -- Sort order in forms and tables
    isActive        : Boolean       -- Toggle visibility
    filterEnabled   : Boolean       -- Include in filter panels
    reportEnabled   : Boolean       -- Include in report outputs
    massEditEnabled : Boolean       -- Allow bulk editing
    exportEnabled   : Boolean       -- Include in CSV/Excel exports
    validValues     : Composition   -- For LOOKUP type: list of valid dropdown options
}
```

### 3.3 How to Add a New Custom Attribute

1. Navigate to **Admin Config > Attribute Definitions** tab.
2. Click **Add Attribute**.
3. Fill in the required fields:
   - **Internal Name** -- use camelCase, no spaces (e.g., `seismicZone`).
   - **Display Label** -- the label shown to users (e.g., "Seismic Zone").
   - **Data Type** -- select the appropriate type.
   - **Target Entity** -- select which entity this attribute applies to.
4. Configure optional settings (Required, Filter Enabled, Report Enabled, Mass Edit Enabled, Display Order).
5. If the data type is **LOOKUP**, the Valid Values builder will appear. Add each dropdown option with a value, label, display order, and active flag.
6. Click **Save**.

The attribute will appear in the relevant entity forms and (if enabled) in filter panels, reports, and mass edit screens.

### 3.4 Valid Values for LOOKUP-Type Attributes

When dataType is LOOKUP, the `AttributeValidValue` entity stores the dropdown options:

```
entity AttributeValidValue : cuid, managed {
    attribute    : Association to AttributeDefinition
    value        : String(200)    -- stored value
    label        : String(300)    -- display text
    displayOrder : Integer        -- sort position
    isActive     : Boolean        -- toggle without deleting
}
```

Use the Valid Values builder in the Attribute Definition dialog to add, remove, and reorder options. Each option needs a value (the stored code) and a label (the text shown in the dropdown).

### 3.5 Value Storage

- **Bridge attributes** are stored in the `BridgeAttribute` entity (association to Bridge + association to AttributeDefinition + value as String(2000)).
- **All other entity types** (RESTRICTION, DEFECT, PERMIT, ROUTE, INSPECTION_ORDER) use the polymorphic `EntityAttribute` entity, which stores entityType, entityId (UUID), attribute association, and value.

---

## 4. Lookup Management

### 4.1 Lookup Entity Schema

```
entity Lookup : cuid, managed {
    category     : String(50)    -- grouping key (e.g., STRUCTURE_TYPE, CONDITION_STATE)
    code         : String(200)   -- unique value within category (e.g., BEAM_CONCRETE)
    description  : String(300)   -- display text for the dropdown
    displayOrder : Integer       -- sort position (default 0)
    isActive     : Boolean       -- toggle without deleting (default true)
}
```

### 4.2 Usage

Lookup values power dropdown fields throughout the application. Common lookup categories include structure types, material types, condition states, defect codes, and other domain-specific classifications. When a developer adds a new dropdown to the UI, the category is referenced in the code; the actual dropdown options are loaded dynamically from the Lookup entity.

### 4.3 Managing Lookups

1. Navigate to **Admin Config > Lookup Values** tab.
2. Use the **Category** dropdown to filter by a specific category, or select "All Categories" to view everything.
3. To add a new lookup:
   - Click **Add Lookup**.
   - Enter the **Category** (e.g., `STRUCTURE_TYPE`).
   - Enter the **Code** (e.g., `ARCH_MASONRY`).
   - Enter the **Description** (the text shown in the dropdown).
   - Set the **Display Order** for sorting.
   - Ensure **Active** is checked.
   - Click **Save**.
4. To edit an existing lookup, click the edit icon on the row.
5. To delete a lookup, click the delete icon. Deactivating (unchecking Active) is preferred over deletion so that historical records referencing the code remain valid.

### 4.4 Best Practices

- Use UPPER_SNAKE_CASE for category and code values to maintain consistency.
- Always set a meaningful description -- this is what end users see in the dropdown.
- Use display order to control the sequence in which options appear. Items with the same display order are sorted alphabetically.
- Deactivate rather than delete lookup values that are no longer needed but may be referenced by existing records.

---

## 5. Map Configuration

### 5.1 Map Provider Config (AdminConfig > Map Settings)

The `MapProviderConfig` entity stores the top-level map provider selection:

| Field | Default | Options |
|-------|---------|---------|
| `mapProvider` | osm-leaflet | osm-leaflet, osm-maplibre, google, esri |
| `geocodeProvider` | nominatim | nominatim, google, esri |
| `routingProvider` | osrm | osrm, valhalla, ors, google, esri |
| `defaultZoom` | 4 | 1--18 |
| `clusterEnabled` | true | true/false |
| `clusterRadius` | 50 | pixels |
| `trafficLayerEnabled` | false | Google only |
| `streetViewEnabled` | false | Google only |

API keys for Google Maps and Esri are configured via BTP environment variables, not through the admin UI. The Map Settings tab shows the current key status as read-only.

### 5.2 MapConfig Entity (BmsTechAdmin > Map Config)

The `MapConfig` entity stores detailed map configuration:

- **Viewport**: defaultCenter_lat (-27.0), defaultCenter_lng (133.0), defaultZoom (5), minZoom (3), maxZoom (19)
- **Projection**: EPSG:4326 (WGS84) for web maps; HANA spatial uses GDA2020/EPSG:7843
- **Base map**: defaultBaseMap (osm, satellite, topo, dark, or custom)
- **Clustering**: clusteringEnabled, clusterRadius (px), maxZoomBeforeCluster
- **Custom base maps**: JSON array stored in `customBaseMaps` field. Schema: `[{key, name, url, attribution, maxZoom, isDefault}]`
- **Reference layers**: JSON array in `referenceLayers` field. Schema: `[{id, name, type, url, wmsLayers, opacity, style, description, isDefault}]`. Supported types: wms, geojson, xyz, esri_feature, esri_map
- **ESRI integration**: JSON object in `esriConfig` field. Schema: `{portalUrl, featureServiceUrl, apiKey, queryWhere, outFields, renderer}`
- **Draw tools**: JSON object in `drawConfig` field. Schema: `{polygonColor, rectangleColor, circleColor, fillOpacity, weight, dashArray}`
- **Export columns**: JSON array in `exportColumns` field. Schema: `[{field, label, include, width}]`

### 5.3 ESRI ArcGIS Integration

The ESRI integration is configured at two levels:

1. **Map level** (MapConfig.esriConfig): Portal URL, feature service URL, API key, query filter, and renderer configuration.
2. **Integration level** (IntegrationConfig with systemCode=ESRI): Base URL, authentication, portal URL, feature service URL, layer ID, spatial reference.

The `esri-client.js` adapter in `srv/integration/` handles data synchronization between BMS bridges and ESRI feature layers.

---

## 6. Integration Management

### 6.1 IntegrationConfig Entity

One record per external system. Credentials are stored in the BTP Credential Store; only non-secret configuration resides in this entity.

```
entity IntegrationConfig : cuid, managed {
    systemCode         : String(20)   -- S4HANA | BANC | ESRI | CUSTOM
    systemName         : String(100)
    description        : String(300)
    baseUrl            : String(500)
    authType           : String(20)   -- BASIC | OAUTH2 | API_KEY | CERT | NONE
    username           : String(100)  -- non-secret only
    oauthClientId      : String(200)
    oauthScope         : String(200)
    oauthTokenEndpoint : String(300)
    additionalConfig   : LargeString  -- JSON for extra parameters
    isActive           : Boolean
    lastTestedAt       : Timestamp
    lastTestStatus     : String(20)   -- OK | FAILED | UNTESTED
    lastTestMessage    : String(500)
}
```

System-specific fields are included for S/4HANA (s4SystemId, s4Client, s4PlantCode, s4AssetClass, s4EquipClass, s4EquipCategory, s4MaintenancePlant), ESRI (esriPortalUrl, esriFeatureServiceUrl, esriLayerId, esriSpatialRef), and BANC (bancStateCode, bancFormatVersion, bancSubmissionUrl, bancAgencyCode).

### 6.2 Integration Hub Screen

The Integration Hub screen provides a unified interface for managing all external system integrations. It includes:

- **Integration configuration** per system (connection settings, credentials reference, activation toggle)
- **Field mapping** -- configurable mapping between BMS fields and external system fields for S/4HANA, BANC, and ESRI. Mappings specify direction (TO_EXT, FROM_EXT, BOTH), transformation rules, and active state.
- **Cross-system launch configuration** -- define URL templates for deep-linking to external systems (e.g., opening an S/4HANA Equipment Master record from BMS)
- **Test connection** -- validates connectivity for each configured system

### 6.3 S/4HANA Integration (s4hana-client.js)

Located at `srv/integration/s4hana-client.js`. Supports:

- `syncBridgeToS4` -- push bridge data to S/4HANA as equipment master
- `syncBridgeFromS4` -- pull equipment data from S/4HANA
- `syncAllBridgesToS4` -- bulk synchronization
- `createS4MaintenanceNotification` -- create PM notifications
- `createS4MaintenanceOrder` -- create PM orders

S/4HANA-specific configuration fields: System ID, Client number, Plant Code, Asset Class, Equipment Class (BRIDGE_INFRA), Equipment Category (M), and Maintenance Plant.

### 6.4 ESRI/GIS Integration (esri-client.js)

Located at `srv/integration/esri-client.js`. Supports:

- `syncBridgeToESRI` -- push bridge data to an ESRI feature layer
- `syncAllBridgesToESRI` -- bulk push all bridges

ESRI-specific configuration: Portal URL, Feature Service URL, Layer ID, Spatial Reference (default WGS84/4326).

### 6.5 BANC Integration (banc-client.js)

Located at `srv/integration/banc-client.js`. Supports Austroads Bridge Assessment National Classification:

- `exportToBANC` -- export bridge data in BANC CSV format
- `validateBancRecord` -- validate a bridge record against BANC schema

BANC-specific configuration: State Code (NSW/VIC/QLD/SA/WA/TAS/NT/ACT), Format Version (default 3.0), Submission URL, Agency Code.

### 6.6 Integration Handlers

All integration actions are registered in `srv/integration/handlers.js`, which wires 10 actions:

- syncBridgeToS4, syncBridgeFromS4, syncAllBridgesToS4
- createS4MaintenanceNotification, createS4MaintenanceOrder
- exportToBANC, validateBancRecord
- syncBridgeToESRI, syncAllBridgesToESRI
- testIntegrationConnection, getIntegrationStatus

Every integration operation is logged in the `IntegrationLog` entity with: systemCode, operationType, entityId, status (SUCCESS/ERROR), record counts, duration, request/response summaries.

### 6.7 Testing an Integration

1. Navigate to the **Integration Hub**.
2. Select the target system tab (S/4HANA, BANC, ESRI, or Custom).
3. Verify the configuration fields are correct.
4. Click **Test Connection**.
5. The system will update the `lastTestStatus` field to OK or FAILED, along with a message and timestamp.

---

## 7. Data Quality Rules

### 7.1 Data Quality Dashboard

**Route:** `DataQuality`
**Access:** Guarded by `CapabilityManager.guardRoute("DATA_QUALITY")`

The Data Quality Dashboard provides a network-wide view of bridge data completeness and accuracy. It displays:

- **KPI tiles**: Network Score (average out of 100), Completeness %, Accuracy %, Timeliness %, and total Bridges Scored
- **Score distribution**: progress bars showing counts and percentages for Critical (0-25), Poor (25-50), Fair (50-75), and Good (75-100) ranges
- **Lowest Quality Bridges table**: the 20 worst-scoring bridges with their individual scores and missing field lists

### 7.2 DataQualityScore Entity

```
entity DataQualityScore : cuid, managed {
    bridge        : Association to Bridge
    overallScore  : Decimal(5,2)    -- composite score 0-100
    completeness  : Decimal(5,2)    -- % of required fields populated
    accuracy      : Decimal(5,2)    -- % of values within valid ranges
    timeliness    : Decimal(5,2)    -- % of fields updated within expected timeframes
    missingFields : LargeString     -- JSON array of field names
    staleFields   : LargeString     -- JSON array of field names
    calculatedAt  : Timestamp
}
```

### 7.3 Score Calculation

Scores are calculated across three dimensions:

- **Completeness** -- checks whether all required fields and mandatory attributes have values
- **Accuracy** -- validates values are within expected ranges and match valid lookup codes
- **Timeliness** -- checks whether key fields (inspection date, condition assessment, restriction reviews) have been updated within expected intervals

The overall score is a weighted composite of these three dimensions.

### 7.4 Recalculation

Click **Recalculate All** on the Data Quality Dashboard to trigger a full recalculation of scores for all bridges in the network. This operation queries every bridge record, evaluates all rules, and updates the `DataQualityScore` records.

### 7.5 Interpreting Results

| Score Range | Rating | Action Required |
|-------------|--------|-----------------|
| 0--25 | Critical | Immediate data remediation required |
| 25--50 | Poor | Priority data cleanup needed |
| 50--75 | Fair | Routine maintenance -- fill missing fields |
| 75--100 | Good | No action -- continue regular updates |

Use the **Missing Fields** column in the Lowest Quality Bridges table to identify exactly which fields need attention for each bridge. Click a bridge row to navigate to its detail page for editing.

---

## 8. Monitoring and Troubleshooting

### 8.1 Application Logging

View real-time application logs using the Cloud Foundry CLI:

```bash
# Tail live logs
cf logs nhvr-bridge-srv

# View recent log history
cf logs nhvr-bridge-srv --recent

# Filter for errors only
cf logs nhvr-bridge-srv --recent | grep -i error
```

For the application router:

```bash
cf logs nhvr-bridge-app-router --recent
```

### 8.2 AuditLog Entity

The `AuditLog` entity captures every data mutation in the system:

| Field | Type | Description |
|-------|------|-------------|
| `timestamp` | DateTime | Auto-set on insert |
| `userId` | String(100) | Identity of the user |
| `userRole` | String(100) | Active role at time of change |
| `action` | String(20) | CREATE, UPDATE, DELETE, or ACTION |
| `entity` | String(100) | Entity name (e.g., Bridges, Restrictions) |
| `entityId` | String(100) | Record identifier |
| `entityName` | String(300) | Human-readable record name |
| `changes` | LargeString | JSON diff of changed fields |
| `description` | String(500) | Summary of the change |

Access audit logs via: **Admin Config > Audit Log** tab. Filter by action type and entity type, or use the search bar for free-text queries.

### 8.3 Integration Logging

The `IntegrationLog` entity records every integration operation with: systemCode, operationType (SYNC_TO, SYNC_FROM, EXPORT, IMPORT, TEST, VALIDATE), entityType, entityId, externalId, status, record counts, duration, and request/response summaries.

### 8.4 HANA Cloud Management

SAP HANA Cloud instances on trial accounts auto-stop after a period of inactivity. To manage:

**Start HANA Cloud:**

1. Open SAP BTP Cockpit.
2. Navigate to **Cloud Foundry > Spaces > dev**.
3. Under **SAP HANA Cloud**, select your instance.
4. Click **Start** (or use the three-dot menu).

Alternatively, the repository includes a keepalive workflow (`.github/workflows/hana-keepalive.yml`) that periodically pings the database to prevent auto-shutdown.

**Stop HANA Cloud:**

Follow the same steps and click **Stop**. Stopping the instance saves compute costs when the application is not in use.

### 8.5 Application Health Check

The AppAdmin screen displays real-time health information:

- **Health Status** -- overall application health
- **DB Status** -- database connectivity
- **Uptime** -- how long the server has been running
- **Current User** -- the logged-in user and their assigned roles

The `/me(...)` function import returns the current user context including roles and application mode.

### 8.6 Common Issues and Solutions

| Issue | Cause | Solution |
|-------|-------|----------|
| HTTP 401 on API calls | XSUAA token expired or not present | Ensure user is logged in. Check token validity (default: 3600s). Clear browser cache and re-authenticate. |
| HTTP 403 on admin screens | User lacks required role collection | Assign the appropriate role collection (e.g., NHVR_Admin) in BTP Cockpit. |
| Blank Bridge Detail page | Deprecated `overflow` attribute on IconTabBar | Verify no `overflow` attribute is set on any IconTabBar elements (deprecated in UI5 1.133). |
| HANA not responding | Trial instance auto-stopped | Start the HANA Cloud instance from BTP Cockpit or check the keepalive workflow. |
| Integration test returns FAILED | Invalid credentials or unreachable endpoint | Verify baseUrl, check BTP Credential Store for correct secrets, test network connectivity. |
| BridgeDefect 400 error | Wrong field name in payload | Use `detectedDate` (not `reportedDate`), `closedDate`, `severity`, `defectCode`. |
| Missing dropdown values | Lookup not created or inactive | Navigate to Admin Config > Lookup Values, verify the category and code exist and are active. |
| Mass upload fails with 403 | User lacks Uploader scope | Assign NHVR_Admin or NHVR_BridgeManager role collection (both include the Uploader scope). |
| Map not loading | Map provider API key not configured | Set API keys via BTP environment variables. Check Map Settings tab for key status. |

---

## 9. Backup and Data Management

### 9.1 Mass Download for Backup

The application supports exporting bridge data and related records via:

- **Reports screen** -- generate and download reports in CSV format
- **Excel Export utility** (`util/ExcelExport.js`) -- export table data to Excel/CSV from various list screens
- **MapConfig export columns** -- configurable column list for CSV/GeoJSON exports from the map view

To perform a full data export:

1. Navigate to the **Reports** screen.
2. Select the desired report type and scope (all bridges or filtered).
3. Click **Export** or **Download**.
4. Store the exported files in a secure location per your organisation's data retention policy.

### 9.2 CSV Seed Data for Initial Load

The `db/data/` directory contains CSV seed files for initial data loading. These files follow the CAP CDS convention of `namespace-EntityName.csv` naming. Seed data is loaded automatically during database deployment (`cds deploy`).

To add or update seed data:

1. Place CSV files in `db/data/` following the naming convention (e.g., `nhvr-Tenant.csv`).
2. Ensure column headers match the CDS entity field names exactly.
3. Run `cds deploy` to load the data into HANA Cloud.

Seed data is typically used for:

- Tenant configurations
- Feature catalog entries
- Default lookup values
- Restriction type configurations
- Vehicle type definitions

### 9.3 HANA Cloud Backup Policies

SAP HANA Cloud provides automatic backup capabilities:

- **Automatic backups** -- HANA Cloud creates automatic daily backups with a retention period based on your service plan.
- **Point-in-time recovery** -- available within the backup retention window.
- **Manual backup** -- can be triggered from the HANA Cloud Central administration interface.

For production environments:

1. Ensure the HANA Cloud service plan includes adequate backup retention (minimum 14 days recommended).
2. Document the recovery point objective (RPO) and recovery time objective (RTO) for the NHVR application.
3. Test the recovery process at least once per quarter by restoring to a non-production instance.
4. Coordinate backup schedules with integration partners (S/4HANA, ESRI, BANC) to ensure data consistency across systems.

### 9.4 Data Retention

The `AuditLog` entity grows continuously. Plan for periodic archival:

- Export audit log records older than the retention period via the Admin Config > Audit Log search and export.
- Integration logs (`IntegrationLog`) should follow the same archival schedule.
- Data quality scores are recalculated on demand and can be safely purged if historical trends are not required.

---

## Appendix A: Configuration File Reference

| File | Purpose |
|------|---------|
| `xs-security.json` | XSUAA security configuration -- scopes, role templates, role collections |
| `mta.yaml` | MTA deployment descriptor -- modules, resources, dependencies |
| `db/schema.cds` | CDS data model -- all entities, types, and extensions |
| `srv/service.cds` | OData service definition -- exposed entities and actions |
| `srv/integration/handlers.js` | Integration action handler registry |
| `srv/integration/s4hana-client.js` | SAP S/4HANA integration adapter |
| `srv/integration/esri-client.js` | ESRI ArcGIS integration adapter |
| `srv/integration/banc-client.js` | Austroads BANC CSV integration adapter |
| `app/bridge-management/webapp/model/RoleManager.js` | Client-side role management and XSUAA-to-internal-role mapping |
| `app/bridge-management/webapp/model/AppConfig.js` | Application configuration model |

## Appendix B: XSUAA-to-Internal-Role Mapping

The `RoleManager.js` maps XSUAA role collection names to internal role keys:

| XSUAA Scope/Collection | Internal Role Key |
|------------------------|-------------------|
| Admin / NHVR_Admin | ADMIN |
| BridgeManager / NHVR_BridgeManager | BRIDGE_MANAGER |
| Inspector / NHVR_Inspector | INSPECTOR |
| Operator / NHVR_Operator | OPERATOR |
| TechAdmin / NHVR_TechAdmin | TECH_ADMIN |
| Executive / NHVR_Executive | READ_ONLY |
| Viewer / NHVR_Viewer | READ_ONLY |

Note: Both Executive and Viewer map to READ_ONLY internally. The Executive scope grants dashboard/KPI access while Viewer grants general read access, but both share the same UI permission set.

## Appendix C: OAuth2 Configuration

The application uses the following OAuth2 settings (configured in `xs-security.json`):

| Parameter | Value |
|-----------|-------|
| Token validity | 3600 seconds (1 hour) |
| Refresh token validity | 86400 seconds (24 hours) |
| Tenant mode | dedicated |

Redirect URIs must be updated in `xs-security.json` if the application URL changes after deployment to a new subaccount or region.
