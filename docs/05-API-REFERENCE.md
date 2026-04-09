# NHVR Bridge Management System -- API Reference

Version 4.7.4 | OData V4 | Base Path: `/bridge-management/`

---

## Table of Contents

1. [Authentication](#1-authentication)
2. [Entity Sets](#2-entity-sets)
3. [Function Imports (Reports)](#3-function-imports-reports)
4. [Bound Actions](#4-bound-actions)
5. [Unbound Actions](#5-unbound-actions)
6. [Error Handling](#6-error-handling)
7. [Filtering & Pagination](#7-filtering--pagination)

---

## 1. Authentication

All API calls require authentication. In production (BTP), requests must include a valid JWT token issued by XSUAA. In local development, HTTP Basic Authentication is used with mock users.

### Local Development Credentials

| Username   | Password   | Roles                          |
|-----------|-----------|--------------------------------|
| admin     | admin     | Admin, BridgeManager, Viewer   |
| manager   | manager   | BridgeManager, Viewer          |
| viewer    | viewer    | Viewer                         |
| executive | executive | Executive, Viewer              |
| inspector | inspector | Inspector, Viewer              |
| operator  | operator  | Operator, Viewer               |

### Example: Basic Auth

```bash
curl -u admin:admin http://localhost:4004/bridge-management/Bridges?$top=5
```

### Example: JWT (BTP Production)

```bash
# Obtain token from XSUAA
TOKEN=$(curl -s -X POST "$XSUAA_URL/oauth/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials&client_id=$CLIENT_ID&client_secret=$CLIENT_SECRET" \
  | jq -r '.access_token')

# Use token
curl -H "Authorization: Bearer $TOKEN" \
  https://<app-router-url>/bridge-management/Bridges?$top=5
```

---

## 2. Entity Sets

### 2.1 Bridges

**Path:** `/bridge-management/Bridges`
**Access:** Read = Viewer+, Write = BridgeManager+

| Field             | Type        | Description                              |
|-------------------|-------------|------------------------------------------|
| ID                | UUID        | System-generated primary key              |
| bridgeId          | String(50)  | Human-readable bridge code (e.g. BRG-HWY31-001) |
| name              | String(200) | Bridge name                               |
| state             | String(10)  | State/territory (NSW, VIC, QLD, etc.)     |
| region            | String(100) | Geographic region                         |
| structureType     | String(50)  | Structure type (Beam, Arch, Truss, etc.)  |
| material          | String(50)  | Primary material                          |
| condition         | String(20)  | Condition label (GOOD, FAIR, POOR, CRITICAL) |
| conditionRating   | Integer     | 1-10 AS 5100 rating                      |
| conditionScore    | Integer     | 0-100 composite score                    |
| postingStatus     | String(20)  | UNRESTRICTED, POSTED, CLOSED             |
| operationalStatus | String(20)  | OPEN, CLOSED, RESTRICTED                 |
| latitude          | Decimal     | GPS latitude (-90 to 90)                  |
| longitude         | Decimal     | GPS longitude (-180 to 180)               |
| yearBuilt         | Integer     | Year of construction                      |
| routeCode         | String(50)  | Primary route code                        |
| isActive          | Boolean     | Active/decommissioned flag                |

**Examples:**

```bash
# List bridges with pagination
GET /Bridges?$top=50&$skip=100&$orderby=bridgeId

# Filter by state and condition
GET /Bridges?$filter=state eq 'NSW' and condition eq 'POOR'

# Get single bridge by UUID
GET /Bridges(30000000-0000-0000-0000-000000000001)

# Filter by bridge ID (human-readable)
GET /Bridges?$filter=bridgeId eq 'BRG-HWY31-001'

# Search by name (contains)
GET /Bridges?$filter=contains(tolower(name),'creek')

# Create new bridge
POST /Bridges
Content-Type: application/json
{
  "bridgeId": "BRG-NEW-001",
  "name": "New Creek Bridge",
  "state": "NSW",
  "condition": "GOOD",
  "conditionRating": 7,
  "postingStatus": "UNRESTRICTED",
  "operationalStatus": "OPEN"
}

# Update bridge
PATCH /Bridges(<UUID>)
Content-Type: application/json
{"name": "Updated Bridge Name", "conditionRating": 8}

# Delete bridge
DELETE /Bridges(<UUID>)
```

### 2.2 Restrictions

**Path:** `/bridge-management/Restrictions`
**Access:** Read = Viewer+, Write = BridgeManager+

| Field              | Type         | Description                               |
|--------------------|-------------|-------------------------------------------|
| ID                 | UUID        | System-generated primary key               |
| nhvrRef            | String(100) | Human-readable ref (e.g. NHVR-BRG-NSW-002-R001) |
| bridge_ID          | UUID        | Foreign key to Bridge                      |
| bridgeId           | String(50)  | Bridge code (read-only, derived)           |
| bridgeName         | String(200) | Bridge name (read-only, derived)           |
| restrictionType    | String(20)  | MASS, GROSS_MASS, HEIGHT, WIDTH, LENGTH, SPEED, AXLE_LOAD, AXLE_MASS, COMBINATION_MASS, VEHICLE_TYPE, WIND_SPEED, WEIGHT, CLEARANCE |
| value              | Decimal     | Numeric restriction value                  |
| unit               | String(20)  | t, kN, m, km/h                            |
| status             | String(20)  | ACTIVE, INACTIVE, EXPIRED, SEASONAL       |
| direction          | String(20)  | BOTH, NORTHBOUND, SOUTHBOUND, etc.        |
| permitRequired     | Boolean     | Whether permit is needed to exceed         |
| validFromDate      | Date        | Effective start date                       |
| validToDate        | Date        | Expiry date                                |
| gazetteRef         | String(100) | Legal gazette reference                    |
| isTemporary        | Boolean     | Temporary restriction flag                 |
| isActive           | Boolean     | Active enforcement flag                    |
| notes              | String(1000)| Justification/reason                       |

**Examples:**

```bash
# All restrictions with bridge details
GET /Restrictions?$select=nhvrRef,bridgeId,bridgeName,restrictionType,value,unit,status

# Restrictions for a specific bridge
GET /Restrictions?$filter=bridgeId eq 'BRG-HWY31-003'

# Active mass restrictions only
GET /Restrictions?$filter=status eq 'ACTIVE' and restrictionType eq 'MASS'

# Create restriction
POST /Restrictions
Content-Type: application/json
{
  "bridge_ID": "<bridge-uuid>",
  "restrictionType": "MASS",
  "value": 42.5,
  "unit": "t",
  "status": "ACTIVE",
  "direction": "BOTH"
}
```

### 2.3 InspectionOrders

**Path:** `/bridge-management/InspectionOrders`
**Access:** Read = Viewer+, Write = BridgeManager+, Inspector+

| Field                   | Type         | Description                        |
|------------------------|-------------|-------------------------------------|
| ID                     | UUID        | Primary key                          |
| bridge_ID              | UUID        | Foreign key to Bridge                |
| bridgeId               | String(50)  | Bridge code (read-only)              |
| orderNumber            | String(50)  | Unique inspection order number       |
| inspectionType         | String(50)  | ROUTINE, SPECIAL, PRINCIPAL, UNDERWATER |
| status                 | String(20)  | PLANNED, IN_PROGRESS, COMPLETED, CANCELLED |
| plannedDate            | Date        | Scheduled inspection date            |
| inspector              | String(200) | Inspector name                       |
| overallConditionRating | Integer     | Result: 1-10 AS 5100 rating         |

### 2.4 BridgeDefects

**Path:** `/bridge-management/BridgeDefects`
**Access:** Read = Viewer+, Write = BridgeManager+, Inspector+

| Field          | Type         | Description                            |
|----------------|-------------|----------------------------------------|
| ID             | UUID        | Primary key                             |
| bridge_ID      | UUID        | Foreign key to Bridge                   |
| defectNumber   | String(50)  | Defect reference number                 |
| defectCategory | String(50)  | CRACK, CORROSION, SPALLING, DEFORMATION, SCOUR, SETTLEMENT, OTHER |
| severity       | String(20)  | LOW, MEDIUM, HIGH, CRITICAL            |
| status         | String(20)  | OPEN, IN_PROGRESS, CLOSED              |
| description    | LargeString | Detailed description                    |
| detectedDate   | Date        | Date defect was found                   |
| detectedBy     | String(200) | Inspector who found it                  |

### 2.5 Other Entity Sets

| Entity Set           | Path                        | Description                          |
|---------------------|-----------------------------|--------------------------------------|
| Routes              | /Routes                     | Road corridor definitions            |
| FreightRoutes       | /FreightRoutes              | Freight route corridors              |
| VehicleClasses      | /VehicleClasses             | NHVR vehicle categories              |
| Lookups             | /Lookups                    | Admin-managed dropdown values        |
| AttributeDefinitions| /AttributeDefinitions       | Dynamic attribute schema             |
| BridgeAttributes    | /BridgeAttributes           | Dynamic attribute values per bridge  |
| RoleConfigs         | /RoleConfigs                | Per-role UI feature visibility       |
| AuditLogs           | /AuditLogs                  | Immutable change history             |
| BridgeHistory       | /BridgeHistory              | Bridge condition change log          |
| RouteCompliance     | /RouteCompliance            | Route compliance summaries           |
| VehicleAccess       | /VehicleAccess              | Vehicle access assessments           |
| RestrictionTypeConfigs | /RestrictionTypeConfigs  | Configurable restriction types       |

---

## 3. Function Imports (Reports)

All report functions return `{ value: [...] }` arrays. All require Viewer+ role.

### 3.1 getAssetRegister

Full bridge inventory with filtering and pagination.

```
GET /getAssetRegister(
  assetClass=null,
  state=null,
  region=null,
  postingStatus=null,
  condition=null,
  conditionMin=null,
  conditionMax=null,
  yearBuiltFrom=null,
  yearBuiltTo=null,
  isActive=null,
  pageSize=200,
  pageOffset=0
)
```

### 3.2 getAssetSummary

Aggregated asset counts by state/class.

```
GET /getAssetSummary(assetClass=null, state=null, region=null)
```

### 3.3 getConditionDistribution

Condition breakdown across the network.

```
GET /getConditionDistribution(assetClass=null, state=null, region=null)
```

### 3.4 getRestrictionSummary

Restriction statistics by type and status.

```
GET /getRestrictionSummary(
  assetClass=null,
  state=null,
  region=null,
  restrictionType=null,
  status='ACTIVE'
)
```

### 3.5 getInspectionStatusReport

Inspection compliance and overdue analysis.

```
GET /getInspectionStatusReport(
  assetClass=null,
  state=null,
  region=null,
  overdueOnly=false
)
```

### 3.6 getBridgesExceedingCapacity

Bridges where current loads exceed rated capacity.

```
GET /getBridgesExceedingCapacity()
```

### 3.7 getOverdueCapacityReviews

Bridges with overdue capacity review assessments.

```
GET /getOverdueCapacityReviews(daysOverdue=0)
```

### 3.8 KPI Functions

```
GET /getNetworkKPIs()                  -- Total bridges, avg condition, % restricted
GET /getInspectionComplianceKPIs()     -- Overdue inspections, compliance rate
GET /getDefectKPIs()                   -- Open defects, critical count
GET /getRestrictionKPIs()              -- Active restrictions, permit count
```

---

## 4. Bound Actions

Bound actions are called on specific entity instances.

### 4.1 Bridge Actions

**Requires:** BridgeManager or Admin role

```bash
# Change bridge condition
POST /Bridges(<UUID>)/BridgeManagementService.changeCondition
Content-Type: application/json
{"conditionValue": "GOOD", "score": 70}

# Close bridge for traffic
POST /Bridges(<UUID>)/BridgeManagementService.closeForTraffic
Content-Type: application/json
{}

# Reopen bridge for traffic
POST /Bridges(<UUID>)/BridgeManagementService.reopenForTraffic
Content-Type: application/json
{}

# Close bridge (full closure with details)
POST /Bridges(<UUID>)/BridgeManagementService.closeBridge
Content-Type: application/json
{
  "reason": "Structural assessment required",
  "effectiveFrom": "2026-04-01",
  "expectedReopenDate": "2026-06-01",
  "approvalRef": "ENG-2026-001"
}

# Reopen bridge
POST /Bridges(<UUID>)/BridgeManagementService.reopenBridge
Content-Type: application/json
{
  "reason": "Assessment complete - safe for traffic",
  "effectiveDate": "2026-06-01",
  "approvalRef": "ENG-2026-002",
  "inspectionRef": "INS-2026-001"
}
```

### 4.2 Restriction Actions

**Requires:** BridgeManager or Admin role

```bash
# Disable restriction
POST /Restrictions(<UUID>)/BridgeManagementService.disableRestriction
Content-Type: application/json
{"reason": "Superseded by new assessment"}

# Enable restriction
POST /Restrictions(<UUID>)/BridgeManagementService.enableRestriction
Content-Type: application/json
{"reason": "Re-activated after review"}

# Create temporary restriction
POST /Restrictions(<UUID>)/BridgeManagementService.createTemporaryRestriction
Content-Type: application/json
{
  "fromDate": "2026-04-01",
  "toDate": "2026-04-30",
  "reason": "Flood damage repair in progress"
}

# Extend temporary restriction
POST /Restrictions(<UUID>)/BridgeManagementService.extendTemporaryRestriction
Content-Type: application/json
{
  "newToDate": "2026-06-30",
  "reason": "Repair works delayed"
}
```

### 4.3 Inspection Actions

```bash
# Start inspection (Inspector+ or BridgeManager+)
POST /InspectionOrders(<UUID>)/BridgeManagementService.startInspection
Content-Type: application/json
{}

# Complete inspection
POST /InspectionOrders(<UUID>)/BridgeManagementService.completeInspection
Content-Type: application/json
{
  "overallConditionRating": 7,
  "structuralAdequacy": "ADEQUATE",
  "recommendations": "Minor maintenance required on pier cap",
  "nextInspectionDue": "2028-04-01"
}
```

### 4.4 Defect Actions

```bash
# Close defect (Inspector+ or BridgeManager+)
POST /BridgeDefects(<UUID>)/BridgeManagementService.closeDefect
Content-Type: application/json
{"closureNotes": "Repaired and verified by site team"}
```

---

## 5. Unbound Actions

### 5.1 Mass Upload Bridges

**Requires:** BridgeManager or Admin role

```bash
POST /massUploadBridges
Content-Type: application/json
{
  "csvData": "bridgeId,name,state,condition,conditionRating,postingStatus\nBRG-NEW-001,New Bridge,NSW,GOOD,7,UNRESTRICTED"
}
```

**Response:**
```json
{
  "status": "SUCCESS",
  "totalRecords": 1,
  "successCount": 1,
  "updatedCount": 0,
  "failureCount": 0,
  "errors": ""
}
```

### 5.2 Mass Download Bridges

**Requires:** Viewer+ role

```bash
POST /massDownloadBridges
Content-Type: application/json
{
  "region": null,
  "state": "NSW",
  "routeCode": null
}
```

**Response:**
```json
{
  "csvData": "bridgeId,name,region,state,...\nBRG-HWY31-001,Marulan Creek Bridge,...",
  "totalRecords": 500
}
```

### 5.3 Mass Upload Restrictions

**Requires:** BridgeManager or Admin role

```bash
POST /massUploadRestrictions
Content-Type: application/json
{
  "csvData": "bridge_ID,restrictionType,value,unit,status,direction\n<uuid>,MASS,42.5,t,ACTIVE,BOTH"
}
```

### 5.4 Utility Functions

```bash
# Health check
GET /health()

# System info
GET /getSystemInfo()

# App configuration
GET /getAppConfig()

# Current user info
GET /me()
# Response: {"id": "admin", "roles": ["Admin","BridgeManager","Viewer"], "appMode": "full"}
```

---

## 6. Error Handling

All errors follow OData V4 error format:

```json
{
  "error": {
    "message": "Human-readable error message",
    "code": "400",
    "@Common.numericSeverity": 4
  }
}
```

### Common Error Codes

| Code | Meaning                  | Example                                    |
|------|--------------------------|--------------------------------------------|
| 400  | Bad Request              | Invalid field name, wrong enum value        |
| 401  | Unauthorized             | Missing or expired JWT                      |
| 403  | Forbidden                | User lacks required role                    |
| 404  | Not Found                | Entity with given ID does not exist         |
| 409  | Conflict                 | Duplicate unique field (e.g. bridgeId)      |
| 500  | Internal Server Error    | Unexpected backend error                    |

### Validation Error Examples

```json
// Invalid restriction type
{"error": {"message": "Invalid restrictionType: 'MASS_LIMIT'. Must be one of: MASS, GROSS_MASS, HEIGHT, WIDTH, LENGTH, SPEED, AXLE_LOAD, AXLE_MASS, COMBINATION_MASS, VEHICLE_TYPE, WIND_SPEED, WEIGHT, CLEARANCE"}}

// Invalid unit for type
{"error": {"message": "Invalid unit \"tonnes\" for restriction type \"MASS\". Expected: t"}}

// Missing required field
{"error": {"message": "Property \"plannedDate\" is required"}}

// Unexpected CSV column
{"error": {"message": "Unexpected columns: assetClass, operationalStatus"}}
```

---

## 7. Filtering and Pagination

### OData V4 Query Options

| Option     | Example                                           | Description            |
|-----------|---------------------------------------------------|------------------------|
| $top      | `$top=50`                                          | Limit results          |
| $skip     | `$skip=100`                                        | Offset for pagination  |
| $orderby  | `$orderby=bridgeId asc,condition desc`             | Sort results           |
| $filter   | `$filter=state eq 'NSW'`                           | Filter results         |
| $select   | `$select=ID,bridgeId,name,condition`               | Choose fields          |
| $count    | `$count=true`                                      | Include total count    |
| $expand   | `$expand=restrictions`                             | Include related data   |

### Filter Operators

| Operator   | Example                                          |
|-----------|--------------------------------------------------|
| eq        | `$filter=state eq 'NSW'`                          |
| ne        | `$filter=condition ne 'GOOD'`                     |
| gt / lt   | `$filter=conditionRating gt 5`                    |
| ge / le   | `$filter=yearBuilt ge 1990 and yearBuilt le 2000` |
| contains  | `$filter=contains(name,'Creek')`                  |
| tolower   | `$filter=contains(tolower(name),'creek')`         |
| and / or  | `$filter=state eq 'NSW' and condition eq 'POOR'`  |

### Pagination Pattern

```bash
# Page 1 (items 1-50)
GET /Bridges?$top=50&$skip=0&$orderby=bridgeId&$count=true

# Page 2 (items 51-100)
GET /Bridges?$top=50&$skip=50&$orderby=bridgeId

# Page 3 (items 101-150)
GET /Bridges?$top=50&$skip=100&$orderby=bridgeId
```

---

## Appendix: Service Metadata

The full OData V4 service metadata document is available at:

```
GET /bridge-management/$metadata
```

This returns the complete EDMX schema with all entity types, function imports, action imports, and annotations.
