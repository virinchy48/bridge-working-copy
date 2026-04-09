# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **NHVR Bridge Asset & Restriction Management** — SAP BTP / CAP v9 / UI5 / HANA Cloud.
> This file is the **operating manual**. It is loaded into every message, so it is kept dense.
> For detail beyond what is here, read these *only when needed*: `docs/05-API-REFERENCE.md` (full OData + actions), `docs/03-IMPLEMENTATION-GUIDE.md` (CAP/UI5 impl), `docs/01-BTP-SETUP-GUIDE.md` (full BTP env), `docs/04-ADMIN-CONFIGURATION-GUIDE.md` (admin screens).
> For current version, last deploy, and session-scoped state, check `~/.claude/projects/-Users-siddharthaampolu-21-NHVR-APP/memory/MEMORY.md`.

---

## 1. SNAPSHOT

| | |
|---|---|
| **What** | Manages 2,126+ bridges (AS 5100 condition, restrictions, inspections, defects, permits, routes) for NHVR Australia |
| **Stack** | SAP CAP v9 (Node ≥20) · UI5 1.120+ · HANA Cloud (HDI) · XSUAA · OData V4 at `/bridge-management/` |
| **Prod** | SAP BTP Cloud Foundry `us10-001` · App Router → CAP backend → HANA |
| **Version** | See MEMORY.md (currently v4.7.x) |
| **Status** | 31/31 test suites, 1516/1516 tests green at v4.7.6 |

---

## 2. COMMANDS

```bash
# --- Dev ---
npm install
npm run watch                                        # hot-reload dev @ http://localhost:4004 (SQLite + mock auth)
npm run lint

# --- Test (grouped) ---
npx cds deploy --to sqlite:db.sqlite                 # FIRST-TIME ONLY — materializes SQLite file
npm test                                             # full suite (single config, default CI)
npm run test:unit                                    # unit only
npm run test:integration                             # integration only
npm run test:reports                                 # reports only
npm run test:security                                # security only
npm run test:performance                             # perf/performance
npm run test:uat                                     # UAT scenarios
npm run test:fast                                    # unit + integration (pre-commit default)
npm run test:projects                                # all groups in parallel with per-group output
npm run test:supertester                             # SuperTester v2 harness
npx jest <path>                                      # single file
npx jest -t "<name pattern>"                         # by test name

# --- Verify (fast pre-commit safety net, <30s) ---
npm run verify                                       # mirror-drift + lint + cds compile + fast tests
npm run verify:mirror                                # mirror-drift only

# --- UI mirror sync (automatic via .claude/settings.json hook) ---
npm run sync-ui                                      # → app-router/resources/nhvr.bridgemanagement/
npm run sync-ui:webapp                               # → app-router/resources/webapp/
npm run sync-ui:all                                  # both (use before manual commit)

# --- Deploy to BTP (mandatory order) ---
npx cds build --production                           # REQUIRED — mbt does NOT run this
mbt build -t ./                                      # produces nhvr-bridge-app_<ver>.mtar
cf login -a https://api.cf.us10-001.hana.ondemand.com
cf deploy nhvr-bridge-app_<ver>.mtar --version-rule ALL -f

# --- Unstick BTP ---
cf mta-ops                                           # list ops
cf deploy -i <OP_ID> -a abort                        # abort stuck op
cf update-service Hanaclouddb -c '{"data":{"serviceStopped":false}}'   # wake HANA
cf apps                                              # 3 apps expected; db-deployer STOPPED is normal
```

---

## 3. ARCHITECTURE

```
Browser ─HTTPS─> App Router (256MB, xs-app.json) ─JWT+OData─> CAP Backend (512MB, @sap/cds v9) ─HDI─> HANA Cloud
              │                                    │
              └─ XSUAA (JWT issuance, 12hr)       └─ @requires scopes → before/after hooks → srv/handlers/*.js
```

- **App Router** enforces auth, forwards JWT, serves UI5 from `/resources/`.
- **CAP backend** validates JWT, runs scope checks, delegates to handlers.
- **`srv/service.js` is only ~39 lines** — a loader. Real logic is in **`srv/handlers/*.js` (16 files, one per domain)**. Do NOT put business logic in `service.js`.

---

## 4. MODULE MAP (Claude: jump here first — avoids globbing)

### 4.1 UI modules (controller ↔ view 1:1 under `app/bridge-management/webapp/`)

| Feature area | Controller(s) / View(s) | Primary entity | Backend handler |
|---|---|---|---|
| Home / dashboard | `Home`, `Dashboard` | — (aggregates) | `handlers/bridges.js`, `handlers/reports.js` |
| Bridges list + detail | `Bridges`, `BridgeDetail`, `BridgeForm` | `Bridge` | `handlers/bridges.js` |
| Restrictions | `Restrictions` | `Restriction` | `handlers/restrictions.js`, `handlers/restriction-feed.js` |
| Inspections | `InspectionDashboard`, `InspectionCreate` | `InspectionOrder`, `InspectionRecord` | `handlers/inspections.js` |
| Defects / Work Orders | `Defects`, `WorkOrders` | `BridgeDefect` | `handlers/bridges.js` |
| Permits | `Permits`, `PermitRegisterReport` | `Permit` | `handlers/bridges.js` (actions) |
| Routes | `FreightRoutes`, `FreightRouteDetail`, `RouteAssessment`, `RoutePlanner` | `FreightRoute`, `ApprovedRoute` | `handlers/routing-engine.js`, `handlers/geo.js` |
| Vehicles | `VehicleCombinations` | `VehicleClass`, `VehicleCombination` | `handlers/bridges.js` |
| Map | `MapView` | Bridges + Restrictions | `handlers/geo.js` |
| Mass ops | `MassUpload`, `MassEdit` | `Bridge` + `UploadLog` | `handlers/upload.js` |
| Reports / analytics | `Reports`, `AnalyticsDashboard`, `AnnualConditionReport` | (views, `AuditLog`) | `handlers/reports.js`, `handlers/analytics-ingest.js`, `handlers/analytics-purge.js`, `handlers/analytics-report.js` |
| Data quality | `DataQuality` | `Bridge`, all | `handlers/data-quality.js` |
| Admin | `AdminConfig`, `AdminRestrictionTypes`, `AdminVehicleTypes`, `AppAdmin`, `LicenseConfig`, `BmsTechAdmin` | `AttributeDefinition`, `RoleConfig`, `Lookup` | `handlers/attributes.js`, `handlers/system.js` |
| Integrations | `IntegrationHub` | — | `srv/integration/*-client.js` + `srv/integration/handlers.js` |

### 4.2 Backend handler files (`srv/handlers/*.js` — 16 files)

`bridges.js` · `restrictions.js` · `restriction-feed.js` · `inspections.js` · `attributes.js` · `reports.js` · `analytics-ingest.js` · `analytics-purge.js` · `analytics-report.js` · `upload.js` · `data-quality.js` · `geo.js` · `routing-engine.js` · `notifications.js` · `system.js` · `common.js`

`common.js` = shared validation/audit helpers. Wire a new handler in via `srv/service.js`.

### 4.3 Shared frontend layers

| Layer | Location | Purpose |
|---|---|---|
| Role/capability | `webapp/model/RoleManager.js`, `CapabilityManager.js`, `AppConfig.js` | XSUAA scope detection, field-level RBAC, feature flags |
| Util mixins | `webapp/util/HelpAssistantMixin.js`, `AnalyticsMixin.js`, `AlvToolbarMixin.js` | Composable controller behavior |
| Data utils | `webapp/util/AuthFetch.js`, `DraftManager.js`, `OfflineSync.js`, `NamedViews.js` | Auth-aware fetch, drafts, offline queue, cross-module saved views |
| Export | `webapp/util/CsvExport.js`, `CsvTemplate.js`, `ExcelExport.js` | Reusable export handlers |
| Map providers | `webapp/util/providers/{Esri,GoogleMaps,Leaflet,MapLibre}Provider.js` | Pluggable map backends via `MapProviderFactory.js` |
| Services | `webapp/util/AnalyticsService.js`, `GeocodingService.js`, `RoutingService.js`, `LoggerService.js`, `UserAnalytics.js` | Shared singletons |
| Help system | `webapp/util/HelpContent.js`, `ScreenHelp.js`, `view/fragments/HelpAssistant.fragment.xml` | Contextual in-app help |
| Global fragments | `webapp/view/fragments/{ConfirmDialog,EmptyState,StatCard,FieldWithHelp,ScreenGuide,HelpAssistant}.fragment.xml` | Reuse before writing new ones |
| Config | `webapp/config/{BridgeAttributes,RestrictionAttributes}.js` | Static attribute metadata |

### 4.4 Integration adapters (`srv/integration/` — NOT `srv/adapters/`)

| File | Role |
|---|---|
| `banc-client.js` | Austroads BANC CSV import |
| `esri-client.js` | ESRI ArcGIS GIS feeds |
| `s4hana-client.js` | S/4HANA ERP (tech objects, work orders) |
| `handlers.js` | Registry — wires 10 integration actions to CAP |

### 4.5 Test layout (`test/`)

| Dir | Contents |
|---|---|
| `test/unit/` | Pure-JS unit tests (controllers, handlers, validation) |
| `test/integration/` | OData CRUD, entity coverage, field precision |
| `test/reports/` | Report controller + aggregation |
| `test/security/` | Auth, RBAC, scope enforcement |
| `test/performance/`, `test/perf/` | Perf benchmarks |
| `test/supertester-v2/` | SuperTester harness (needs `db-supertester.sqlite`) |
| `test/uat/` | UAT scenarios |
| `test/root-global-setup.js` | Jest globalSetup (copies SQLite DB for supertester) |

### 4.6 Data model sources of truth

| File | Owns |
|---|---|
| `db/schema.cds` (~25-line barrel) | Imports all sub-files; `srv/service.cds` uses `using nhvr from '../db/schema'` |
| `db/schema/types.cds` | 39 enum types |
| `db/schema/core.cds` | Bridge, Route, VehicleClass + infrastructure extends |
| `db/schema/attributes.cds` | Lookup, AttributeDefinition, BridgeAttribute, EntityAttribute |
| `db/schema/restrictions.cds` | Restriction + extends, RestrictionChangeLog, GazetteValidation/Notice, RestrictionTypeConfig, RestrictionFeedSource |
| `db/schema/inspection.cds` | InspectionOrder/Record, MeasurementDocument, BridgeDefect, WorkOrder, DefectClassification, BridgeInspection, BridgeEventLog |
| `db/schema/capacity-permits.cds` | BridgeCapacity, VehicleType, VehiclePermit, ApprovedRoute, LoadRating, LoadRatingCertificate |
| `db/schema/risk-investment.cds` | BridgeRiskAssessment, BridgeInvestmentPlan, BridgeCulvertAssessment, BridgeInspectionMetrics, BridgeChangeLog, BridgeConditionHistory, BridgeDeteriorationProfile, ScourAssessment |
| `db/schema/freight.cds` | FreightRoute, FreightRouteBridge, BridgeRouteAssignment |
| `db/schema/integration.cds` | BridgeExternalRef, DocumentAttachment, IntegrationConfig/Log, S4EquipmentMapping, BamsSync, SensorDevice/Reading |
| `db/schema/tenancy.cds` | Tenant, FeatureCatalog, TenantFeature, TenantRoleCapability + tenant extends on core entities |
| `db/schema/admin.cds` | RoleConfig, MapConfig, UploadLog, AuditLog, thresholds, notifications, RoutingEngineConfig, MapProviderConfig |
| `db/analytics.cds` | Analytics projections (separate bounded context) |
| `srv/service.cds` (~45-line barrel) | Imports all service sub-files; defines empty `BridgeManagementService` |
| `srv/services/bridges.cds` | Bridges, Routes, VehicleClasses, Restrictions, BridgeAttributes + batch import |
| `srv/services/restrictions.cds` | Gazette + restriction feed sources |
| `srv/services/inspections.cds` | InspectionOrders/Records, MeasurementDocuments, BridgeDefects, WorkOrders, BridgeInspections |
| `srv/services/capacity-permits.cds` | BridgeCapacities, LoadRatings, VehicleTypes, VehiclePermits, ApprovedRoutes, assessment functions |
| `srv/services/risk-investment.cds` | BridgeRiskAssessment, InvestmentPlan, DeteriorationProfile, ScourAssessment |
| `srv/services/freight.cds` | FreightRoutes + corridor/routing actions + RoutingEngineConfigs |
| `srv/services/integration.cds` | DocumentAttachments, IntegrationConfig/Log, S4Mappings, BamsSync, SensorDevices |
| `srv/services/admin.cds` | Lookups, Attributes, RoleConfigs, MapConfigs, thresholds, notifications |
| `srv/services/tenancy.cds` | Tenants, FeatureCatalog, TenantFeature, TenantRoleCapability |
| `srv/services/reporting.cds` | Views, analytics functions, report projections, utility functions, proxies |
| `srv/services/_annotations.cds` | All UI + value-help annotations (loads last) |
| `srv/analytics-service.cds` | Analytics OData surface |
| `db/data/nhvr-*.csv` | Seed data (bridges, attributes, lookups, audit, etc.) |

---

## 5. WHERE TO EDIT — decision table

Use this to skip exploration. Columns = every file that must change for that task type.

| Task | Files to touch (in order) |
|---|---|
| **Add OData entity** | `db/schema/<domain>.cds` (add entity) → `srv/service.cds` (inside an `extend service` block, with `key`) → optional CSV in `db/data/` → `srv/handlers/<domain>.js` for hooks → test in `test/integration/` |
| **Add OData action** | `srv/service.cds` (action decl inside correct `extend service` block) → `srv/handlers/<domain>.js` (impl + `this.on('actionName', ...)`) → unit test in `test/unit/` |
| **Add UI screen** | `webapp/view/<Name>.view.xml` → `webapp/controller/<Name>.controller.js` → `webapp/manifest.json` (route + target) → `webapp/i18n/i18n.properties` (labels) → mirror-sync (see §6.1) → unit test |
| **Add field to existing entity** | `db/schema/<domain>.cds` (add field; use §4.6 to find domain) → `srv/service.cds` (if projection) → controller form binding → i18n → CSV seed if required |
| **Add dynamic attribute** | AdminConfig UI → DB write to `AttributeDefinition` + `AttributeValidValue` → `BridgeForm.controller.js` auto-renders section 9 |
| **Add role / scope** | `xs-security.json` (scope + role-template + role-collection) → `mta.yaml` if new binding → `webapp/model/RoleManager.js` fallback config → seed `RoleConfig` rows |
| **Add feature flag / field-level RBAC** | `RoleConfig` rows (via AdminConfig UI) → call `RoleManager.applyFields(dialog, "<DialogId>")` in controller's open handler |
| **Add custom filter to list** | Controller's `_buildFilter()` (AND/OR engine on Bridges sets the pattern) → consider `util/NamedViews.js` for saved presets |
| **Add KPI tile to Home** | `Home.view.xml` (GenericTile — use `<tileContent>` aggregation, NOT attribute) → `Home.controller.js` `_load<Name>()` + `onAfterRendering` → i18n |
| **Add export** | Use `util/CsvExport.js` or `ExcelExport.js` — don't roll your own |
| **Add integration** | New `srv/integration/<vendor>-client.js` → register action(s) in `srv/integration/handlers.js` → surface via `IntegrationHub` controller |
| **Fix runtime bug** | Check MEMORY.md "Critical Patterns" first (11 silent-failure gotchas in §6) before debugging |

---

## 6. RULES

### 6.1 Non-obvious patterns (repeat offenders — silent failures)

These bit past sessions. Not discoverable from reading any single file.

1. **UI mirror sync (3 locations)** — source of truth is `app/bridge-management/webapp/`, but the app-router serves its own copies. After every UI edit, copy to BOTH `app-router/resources/nhvr.bridgemanagement/` AND `app-router/resources/webapp/`. Local dev masks the bug; BTP shows stale UI.
2. **`srv/service.js` is a ~39-line loader** — real logic lives in `srv/handlers/<domain>.js`. Never put business logic in `service.js`.
3. **`srv/service.cds` has 4 `extend service` blocks** — actions/annotations outside any block are invisible to OData. `grep -n "extend service" srv/service.cds` first.
4. **CDS v9 key requirement** — every view/projection needs ≥1 `key` field. CDS v8 was lenient; v9 errors.
5. **CDS namespaces are fully qualified** — `nhvr.compliance.XYZ`, never bare `compliance.XYZ`.
6. **BridgeDetail nav uses `bridgeId` (business code), NEVER UUID `ID`** — `navTo("BridgeDetail", { bridgeId: obj.bridgeId })`. Same for `PermitDetail` via `permitId`.
7. **OData LargeString unwrap** — `const data = typeof resp.value === "string" ? JSON.parse(resp.value) : resp.value;`
8. **`BridgeDefect` fields** — `detectedDate` (NOT `reportedDate`), `closedDate`, `severity`, `defectCode`. Wrong name → HTTP 400, no hint.
9. **IconTabBar `overflow` attribute** — deprecated in UI5 1.133+, causes **blank white page with no console error**. Remove it.
10. **UI5 control traps**:
    - `Avatar` → `displaySize` (not `size`)
    - `GenericTile` → use `<tileContent>` aggregation, never `tileContent=""` attribute
    - Never inline `style="flex:1"` — use CSS class `nhvrFlexGrow1`
    - Fragments need explicit `<items>` aggregation wrapper around `IconTabBar` children
11. **Integration adapters are in `srv/integration/`**, NOT `srv/adapters/` (doesn't exist).
12. **Map ↔ List handoff** — `MapView` writes BOTH `nhvr_map_selection` (Bridges) AND `nhvr_map_restriction_selection` (Restrictions) to localStorage. Each consumer reads+deletes its own key (5-min TTL).
13. **Cross-module saved views** — `util/NamedViews.js` with key `nhvr_named_views_v1`. Bridges dual-writes presets here.
14. **Every `fetch()` in a controller** must use `_credOpts()` (AuthFetch wrapper) or gets 401 on auth-required endpoints.
15. **Role-based UI visibility** goes through `RoleManager.applyFields(dialog, "DialogId")` — never inline `if (isAdmin) {...}`.
16. **ESLint flat config is required** — eslint v10 is installed; the project config lives in `eslint.config.js` (flat config, not `.eslintrc*`). The `package.json` `lint` script is `eslint .` (NOT `eslint . --ext .js,.cds` — that flag was removed in eslint v9+). UI5 files under `app/**` and `scripts/**/webapp/**` need browser + map-library globals; CAP files under `srv/**` need `cds`/`SELECT`/`INSERT`/`UPDATE`/`DELETE` globals; k6 scripts (`test/perf`, `test/performance`) are ignored because they're ES modules run by k6. `no-useless-assignment`, `no-redeclare`, `preserve-caught-error`, `no-empty-pattern` are all disabled — the legacy JS codebase triggers them heavily and they aren't worth chasing.
17. **`cf`/`mbt` live in `/opt/homebrew/bin`** on this machine, not in the default non-login `$PATH` that spawned shells see. If a CF command returns "command not found", prepend `export PATH="/opt/homebrew/bin:/opt/homebrew/sbin:$PATH"` to the command.
18. **Repo root accumulates `nhvr-bridge-app_*.mtar` archives after every deploy** — they're in `.gitignore` but pile up on disk. Delete old ones (keep only the latest 1–2) after a successful deploy: `ls -t nhvr-bridge-app_*.mtar | tail -n +3 | xargs rm -f`.
19. **CDS v9 does NOT auto-resolve bare entity names across files in the same namespace.** The correct form is `using { nhvr.Bridge } from './core';` (note the `nhvr.` prefix **inside** the braces; `using nhvr.{ X } from '...'` is a parse error). Alternatively, fully-qualify the reference inline as `nhvr.Bridge`. The full entity split (v4.7.15) uses this pattern throughout `db/schema/*.cds`. When adding a new entity that references entities from another domain file, add an explicit `using { nhvr.X } from './other';` import.
20. **XSUAA foreign-scope-references need a `grant-as-authority-to-apps` on the PROVIDER side** — declaring a foreign scope reference in a consumer app's `xs-security.json` (e.g. `infra/smoke-tester/xs-security.json`) is NOT sufficient. The MAIN app's `xs-security.json` scope entry must also declare `"grant-as-authority-to-apps": ["$XSAPPNAME(application,<consumer>)"]` and the main app must be redeployed. Without that, a `client_credentials` token issued to the consumer only contains `uaa.resource` + the consumer's local scopes, and backend calls return 401. Also: the `$XSAPPNAME(application,...)` prefix is only valid in LOCAL scope/authority declarations — foreign-scope-references must use the bare `<other-xsappname>.<Scope>` form.
22. **Backlink associations live in the child's domain file, not the parent's.** E.g., `Bridge.restrictions` is an `extend Bridge with { restrictions: ... }` in `restrictions.cds`, not in `core.cds`. This avoids circular imports. When adding a new child entity that needs a backlink on Bridge, add the `extend Bridge` in your domain file with a `using { nhvr.Bridge } from './core';` import.
24. **`redirected to X` in a service projection requires X in the SAME extend block file.** CDS does NOT resolve redirect targets across files even within the same service. That's why `bridges.cds` contains Bridges + Restrictions + BridgeAttributes (the redirect targets). If you add a new `redirected to`, ensure the target entity is declared in the same file.
23. **Tests that read `db/schema.cds` or `srv/service.cds` must also read sub-files.** Both are now barrels. Pattern: concat all `.cds` files from `db/schema/` or `srv/services/` when grepping for field/entity names. The barrel file alone no longer contains entity definitions. Pattern: concat all `.cds` files from `db/schema/` directory when grepping for field names.
21. **Every `cf deploy` rotates the nhvr-xsuaa `clientsecret`** — `cf deploy` rebinds `nhvr-xsuaa` to `nhvr-bridge-srv` during the upgrade, and the rebind issues a fresh `clientsecret`. The previous secret stops working immediately, so the GH repo secret `XSUAA_SECRET` used by the scheduled BTP Smoke Test (`.github/workflows/btp-smoke-test.yml`) goes stale on every deploy. Symptom: smoke test starts returning `4/5 — Could not obtain JWT — invalid_client - Bad credentials`. Fix after every deploy: re-extract from `cf env nhvr-bridge-srv` → `VCAP_SERVICES.xsuaa[0].credentials.{clientid,clientsecret}` and push via `gh secret set XSUAA_CLIENT_ID` / `gh secret set XSUAA_SECRET` (pipe stdin, never display the value). The clientid usually stays stable but set both to be safe. This is baked into the §10 deploy checklist.

### 6.2 NEVER

```
1.  NEVER edit gen/ — auto-generated
2.  NEVER skip `cds build --production` before `mbt build`
3.  NEVER `cf push` — always `cf deploy <mtar>`
4.  NEVER `cf delete-service nhvr-db` (destroys prod data)
5.  NEVER commit: default-env.json, .env, *.key, *.pem, private-key.pem
6.  NEVER remove `key` from CDS view/projection (CDS v9 breaks)
7.  NEVER downgrade @cap-js/hana below v2 or remove @sap/hana-client
8.  NEVER re-enable csrfProtection in xs-app.json (CAP handles it)
9.  NEVER change xs-security.json `xsappname` without updating mta.yaml
10. NEVER put business logic in srv/service.js (use srv/handlers/<domain>.js)
11. NEVER hardcode user-visible strings (use i18n.properties)
12. NEVER write mutating logic without a corresponding AuditLog entry
```

### 6.3 ALWAYS

```
1.  ALWAYS edit the source of truth AND mirror-sync to the 2 app-router copies
2.  ALWAYS add @requires to new entities/actions
3.  ALWAYS validate business rules in BEFORE hooks (srv/handlers/<domain>.js)
4.  ALWAYS write to AuditLog on data mutations
5.  ALWAYS bump mta.yaml version or use `--version-rule ALL -f`
6.  ALWAYS run the relevant single test before committing, full suite before deploy
7.  ALWAYS use RoleManager for visibility; use AuthFetch (_credOpts) for fetch
8.  ALWAYS use existing util/* (CsvExport, DraftManager, NamedViews) before writing new ones
9.  ALWAYS use existing view/fragments/* (ConfirmDialog, EmptyState, StatCard) before writing new ones
10. ALWAYS test navigation end-to-end after any routing/manifest change
```

---

## 7. CONVENTIONS

- **UI5**: `sap.m`, `sap.ui.layout`, `sap.ui.comp` only — no raw HTML. Fiori List-Detail / Object Page patterns.
- **i18n**: every user-visible string in `webapp/i18n/i18n.properties`. Key style: `<screen>.<element>.<purpose>` (e.g., `bridges.filter.applyBtn`).
- **CSS**: extend `webapp/css/style.css` with class names. No inline styles.
- **Controllers**: `onInit()` → bind model → register event handlers. Use mixins (`HelpAssistantMixin`, `AnalyticsMixin`) instead of copy-paste.
- **Handlers**: one domain per file in `srv/handlers/`. Import shared logic from `common.js`. Register in `srv/service.js`.
- **Validation**: in BEFORE hooks, inside the handler. Throw `req.error(400, "message")`.
- **Audit**: AFTER hooks write to `AuditLog` with `entityType`, `entityId`, `action`, `userId`, `timestamp`, `delta`.
- **Tests**: co-locate by type (`test/unit/<feature>.unit.test.js`, `test/integration/<feature>.integration.test.js`).

---

## 8. SECURITY (quick ref)

| Role collection | Scopes | User |
|---|---|---|
| NHVR_Admin | All | System admin |
| NHVR_BridgeManager | BridgeManager+Viewer+Uploader+Executive | Engineer/Planner |
| NHVR_Inspector | Inspector+Viewer | Field inspector |
| NHVR_Operator | Operator+Viewer | Permit/route operator |
| NHVR_Executive | Executive+Viewer | Senior mgmt |
| NHVR_Viewer | Viewer | Read-only staff |

Local mock users: `alice` (Admin), `bob` (BridgeMgr), `carol` (Viewer), `dave` (Executive).
`csrfProtection: false` in `xs-app.json` is intentional (CAP handles CSRF).

---

## 9. TOKEN DISCIPLINE (rules for Claude on this repo)

These keep sessions cheap and fast:

1. **Start with this file + MEMORY.md + the MODULE MAP (§4)** — don't glob the repo unless the map doesn't cover your task.
2. **Use Grep over Read** when looking for identifiers. Use Read only for files you're about to edit.
3. **Use the Explore agent** only when the task spans >3 unknown files. For known single-file edits, read directly.
4. **Batch independent tool calls** in a single message (parallel Bash/Read/Grep).
5. **Never dump entire files** — use `offset`/`limit` on Read for >500-line files (`db/schema.cds`, `srv/service.cds`).
6. **Skip reading `gen/`, `node_modules/`, `mta_archives/`, `app-router/resources/`** unless specifically debugging mirror drift.
7. **Prefer editing over rewriting** — use Edit for targeted changes; Write only for new files or complete replacements.
8. **Don't summarize what you just did** — the diff speaks.
9. **Verify before complete**: run the relevant single test; visually confirm on `npm run watch`; update CLAUDE.md if a new non-obvious pattern emerged.
10. **If MEMORY.md says a version shipped, trust it over cached assumptions** — but if you recommend a specific file/function, `grep` first to confirm it still exists.

---

## 10. DEPLOY CHECKLIST

```
[ ] Source edits mirrored to both app-router/resources/{nhvr.bridgemanagement,webapp}/
[ ] npm test passes (31/31 suites)
[ ] mta.yaml version bumped
[ ] npx cds build --production
[ ] mbt build -t ./
[ ] cf login (correct org/space: 592f5a7btrial / dev)
[ ] cf mta-ops clean (no stuck ops)
[ ] cf deploy <mtar> --version-rule ALL -f
[ ] cf apps — verify app-router + srv are STARTED (db-deployer STOPPED is normal)
[ ] Smoke test: `curl -sI https://<app-router-url>/` returns 302 (XSUAA redirect = healthy)
[ ] **Rotate XSUAA secret**: `npm run postdeploy` (runs `scripts/post-deploy-rotate-secrets.sh` — extracts rotated clientid+clientsecret, pushes to GH secrets, triggers smoke test)
[ ] Trigger BTP Smoke Test workflow to verify 11/11: `gh workflow run "BTP Smoke Test"`
[ ] Update MEMORY.md with version + commit SHA
[ ] Delete built mtar to reclaim disk: `ls -t nhvr-bridge-app_*.mtar | tail -n +3 | xargs rm -f`
[ ] `git push origin main` (mta.yaml version bump commit)
```

---

## 11. REFERENCE POINTERS

- **Full OData API + action list** → `docs/05-API-REFERENCE.md`
- **CAP/UI5 implementation deep-dive** → `docs/03-IMPLEMENTATION-GUIDE.md`
- **BTP setup + env details** → `docs/01-BTP-SETUP-GUIDE.md`
- **Admin config screens** → `docs/04-ADMIN-CONFIGURATION-GUIDE.md`
- **User-facing guide** → `docs/02-USER-GUIDE.md`
- **Doc index** → `docs/DOCUMENTATION_INDEX.md`
- **Session state, last deploy, current work** → `~/.claude/projects/-Users-siddharthaampolu-21-NHVR-APP/memory/MEMORY.md`
- **Change history** → `git log --oneline -20` (NOT appended to this file)
- **Feedback memory** (patterns learned from user) → `~/.claude/projects/-Users-siddharthaampolu-21-NHVR-APP/memory/feedback_*.md`

---

## 12. AUTOMATION & TOOLING (active)

Pre-wired safety nets — trust them, don't reinvent:

| Tool | Where | What it does |
|---|---|---|
| **Auto mirror-sync hook** | `.claude/settings.json` → `scripts/sync-ui-mirror.sh` | Claude's PostToolUse hook syncs `app/bridge-management/webapp/` → both `app-router/resources/*` paths after every Edit/Write. Kills gotcha §6.1#1. |
| **CI drift check** | `.github/workflows/mirror-drift.yml` | Blocks PRs that touch UI without mirroring. |
| **Pre-commit verify** | `scripts/verify-session.sh` (`npm run verify`) | <30s: mirror drift → lint → cds compile → unit tests. Bails on first failure. |
| **Handler template** | `srv/handlers/_template.js` | Copy when adding a new domain handler. |
| **Directory READMEs** | `srv/handlers/README.md`, `app/bridge-management/webapp/controller/README.md` | Per-folder indexes (controller ↔ handler ↔ entity). |
| **Jest projects** | `jest.projects.config.js` (`npm run test:projects`) | Opt-in parallel runner with per-group output. Default `npm test` unchanged. |
| **Role fallback config** | `app/bridge-management/webapp/config/RoleFallback.js` | Declarative feature matrix — tweak without touching `RoleManager.js`. |
| **Schema navigation** | Header comments in `db/schema.cds` + `srv/service.cds` | Line-range hot-spots for fast grep; documents the 4 `extend service` blocks. |

### CDS split complete (schema v4.7.15 + service v4.7.16)

- **v4.7.13: `db/schema/types.cds`** — 39 enum types extracted.
- **v4.7.15: Full entity split** — `db/schema.cds` (1868 → 25-line barrel). 65 entities across 10 domain files under `db/schema/`.
- **v4.7.16: Full service split** — `srv/service.cds` (2343 → 45-line barrel). 11 domain files + 1 annotation file under `srv/services/`. Each domain file uses `extend service BridgeManagementService with { ... }`. Annotations in `_annotations.cds` load last.
- **Key patterns**: (a) each domain file imports `nhvr from '../../db/schema'` + `BridgeManagementService from '../service'`, (b) `redirected to X` targets must be in the SAME file as the entity that redirects — CDS doesn't resolve across extend blocks, (c) annotations load AFTER all entities via barrel ordering.
- **Do not re-inline** entities/projections into the barrels.

---

## 13. LIVING DOCUMENT RULE

This file is a living reference. When you discover a new **non-obvious** pattern, gotcha, or convention mid-task — add it to §6.1 immediately. Do not wait for end of session. Do not append changelogs. Rules and patterns only.
