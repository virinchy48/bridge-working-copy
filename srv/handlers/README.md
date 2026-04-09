# srv/handlers — CAP domain handlers

`srv/service.js` is a ~39-line loader. **Real business logic lives here**, one domain per file.
Each file registers `before` / `on` / `after` hooks against its entities and actions.

## Index

| File | Domain | Entities / actions |
|---|---|---|
| `bridges.js` | Bridge CRUD + actions | `Bridge`, `BridgeCapacity`, `BridgeDefect`, `Permit*`, `changeCondition`, `closeBridge`, `reopenBridge`, `closeForTraffic`, `reopenForTraffic`, `addRestriction` |
| `restrictions.js` | Restriction lifecycle | `Restriction`, `disableRestriction`, `enableRestriction`, `createTemporaryRestriction`, `extendTemporaryRestriction` |
| `restriction-feed.js` | Public restriction feed | `RestrictionFeed` projection, change-log emission |
| `inspections.js` | Inspection workflow | `InspectionOrder`, `InspectionRecord`, `startInspection`, `completeInspection`, `closeDefect` |
| `attributes.js` | Dynamic attribute schema | `AttributeDefinition`, `AttributeValidValue`, `BridgeAttribute` |
| `reports.js` | Standard reports | Report projections, aggregations |
| `analytics-ingest.js` | Analytics ETL in | Raw event ingestion |
| `analytics-purge.js` | Analytics retention | TTL-based cleanup |
| `analytics-report.js` | Analytics output | KPI queries, dashboard data |
| `upload.js` | CSV bulk import | `UploadLog`, parser, validator, chunked writer |
| `data-quality.js` | DQ rules | Cross-entity checks, completeness scores |
| `geo.js` | Geospatial | Coord validation, proximity, map data |
| `routing-engine.js` | Route planner | Approved-route bridge assignment, obstacle detection |
| `notifications.js` | In-app notifications | User notification inbox, event dispatch |
| `system.js` | Admin/system | `RoleConfig`, `Lookup`, `FeatureCatalog`, `me()` endpoint |
| `common.js` | Shared helpers | Audit writer, validation utilities, error builders — **import from here**, do not duplicate |

## Conventions

- One domain per file. If a new concern doesn't fit, create a new file, don't overload `common.js`.
- **Validation** in `before` hooks. Throw `req.error(400, "message")`.
- **Audit** in `after` hooks via `common.js::writeAudit(req, entity, action, delta)`.
- **@requires** scopes are declared in `srv/service.cds`, not in the handler.
- Import shared helpers: `const { writeAudit, assertInRange } = require('./common');`

## Adding a new handler

1. Create `srv/handlers/<domain>.js` — use `srv/handlers/_template.js` as the starting point.
2. Export a function that receives the CAP service instance: `module.exports = (srv) => { ... }`
3. Register it in `srv/service.js` (add to the handler-loading list).
4. Add a row to this README.
5. Write a unit test in `test/unit/<domain>.unit.test.js`.
