# Lookup Mass-Upload — Design Review, Test Evidence & Fixes

**Scope:** `massUploadLookups` action in `srv/handlers/upload.js`, exposed on
`POST /bridge-management/massUploadLookups`, backing the `nhvr.Lookup` entity
that drives every dropdown in the Bridge Management UI via
`app/bridge-management/webapp/util/LookupService.js`.

**Reviewed by (role-play):** Bridge Management SME · UI5 Front-End · Solution
Designer · QA / Tester.

---

## 1. Single source of truth — coverage confirmed

The UI consumes these 11 lookup categories via `LookupService.getItems(category)`
— grep of `app/bridge-management/webapp/controller/*` and `view/*`:

| # | Category          | Used by (sample)                           |
|---|-------------------|--------------------------------------------|
| 1 | `CONDITION`       | BridgeForm, BridgeDetail, MassEdit         |
| 2 | `POSTING_STATUS`  | Bridges, BridgeDetail                      |
| 3 | `SCOUR_RISK`      | BridgeForm                                 |
| 4 | `RESTRICTION_TYPE`| Bridges, Restrictions                      |
| 5 | `RESTRICTION_STATUS` | Restrictions                            |
| 6 | `PERMIT_TYPE`     | Permits                                    |
| 7 | `PERMIT_STATUS`   | Permits                                    |
| 8 | `INSPECTION_STATUS` | InspectionDashboard                      |
| 9 | `DEFECT_SEVERITY` | BridgeDetail, Defects                      |
| 10| `DEFECT_PRIORITY` | BridgeDetail, Defects                      |
| 11| `DEFECT_STATUS`   | BridgeDetail, Defects                      |

**Verdict:** the `Lookups` entity is already the *one place* to configure
dropdown values for the whole app. No code changes are needed on the UI side —
a `LookupService.refresh()` after an upload re-fetches the cache and every
select/combobox in every controller picks up the new values automatically.

---

## 2. Test fixtures (inside project folder, no external paths)

| Path                                     | Purpose                               |
|------------------------------------------|---------------------------------------|
| `test/fixtures/lookups-full.csv`         | 61 rows — full dropdown catalogue     |
| `test/fixtures/lookups-errors.csv`       | 5 rows — mix of updates, misses, new  |

The full CSV is the **seed file** the client can keep under version control to
re-baseline a new environment: upload it once and every dropdown in the
application is populated.

---

## 3. Live test evidence (port 4044, user `admin` via mocked auth)

### 3.1 Happy path
```
POST /bridge-management/massUploadLookups   body: {csvData: <lookups-full.csv>}
→ { status: "SUCCESS", totalRecords: 61, successCount: 61, updatedCount: 0,
    failureCount: 0, errors: "" }
```
Verified via OData:
```
GET /Lookups?$count=true           → 61
GET /Lookups?$apply=groupby((category),aggregate($count as cnt))
  → 9 × CONDITION, 4 × POSTING_STATUS, 5 × SCOUR_RISK, 8 × RESTRICTION_TYPE,
    5 × RESTRICTION_STATUS, 5 × PERMIT_TYPE, 6 × PERMIT_STATUS,
    6 × INSPECTION_STATUS, 4 × DEFECT_SEVERITY, 4 × DEFECT_PRIORITY,
    5 × DEFECT_STATUS
```
All 11 categories landed with the exact expected counts.

### 3.2 Error path
```
POST /bridge-management/massUploadLookups   body: {csvData: <lookups-errors.csv>}
→ { status: "PARTIAL_SUCCESS", totalRecords: 5, successCount: 1, updatedCount: 2,
    failureCount: 2,
    errors: "Row 3: category required\nRow 4: code required" }
```
Validated behaviours:
- Row with missing `category` → rejected, row number reported (Row 3).
- Row with missing `code` → rejected, row number reported (Row 4).
- Quoted field containing a comma (`"Duplicate row with comma, in description"`)
  is parsed correctly — verified by reading back `CONDITION/EXCELLENT` which
  now has that description.
- Same `(category, code)` upserted across two rows in the same upload — the
  second row wins (expected last-write-wins semantics), and both updates are
  recorded in `AuditLog`.

### 3.3 Logging / traceability

| Log table    | Entries after test | What it captures                          |
|--------------|--------------------|-------------------------------------------|
| `UploadLog`  | 2                  | One summary row per upload: file name, type, totals, status, errorDetails string (row-by-row reasons) |
| `AuditLog` (entity=`UploadLogs`) | 2 | One summary entry per upload with aggregate counts |
| `AuditLog` (entity=`Lookups`)    | 64 | **One entry per created or updated lookup row**, with `before`/`after` JSON snapshot in `changes` |

The 64 per-row audit entries = 61 happy-path CREATEs + 3 from the error run
(1 CREATE `NEW_CATEGORY_TEST/NEW_CODE_1`, 2 UPDATEs on `CONDITION/EXCELLENT`).

Reports can now be built off `AuditLog` filtered by `entity eq 'Lookups'`
to produce a full history of who changed which lookup and when — with the
full before/after diff embedded in `changes` (JSON).

---

## 4. Defects found and fixed during review

All fixes are contained within `srv/handlers/upload.js`, `massUploadLookups`
block (no other file touched).

| # | Severity | Defect                                                                                                                                     | Fix |
|---|----------|--------------------------------------------------------------------------------------------------------------------------------------------|-----|
| 1 | **High** | `logAudit` was called AFTER `tx.commit()`, re-opening `db` and running an INSERT on a committed transaction → **audit log silently failed** for every mass upload. Error `Transaction is committed, no subsequent .run allowed, without prior .begin` was only visible in server logs. | Moved audit INSERT inside the transaction, before `tx.commit()`, and inlined the columns so it uses the same `tx` handle. |
| 2 | High     | No header whitelist — CSV with typos in column names (`descripton`) was silently ignored, leaving rows with all-empty metadata.            | Added `LOOKUP_HEADERS` whitelist; rejects unknown columns with 400 before any row is touched. |
| 3 | High     | No row-count guard → large CSV could starve the event loop and hold a transaction open.                                                    | Added `MAX_CSV_ROWS` check (10 000) — rejects with 400 before processing begins. |
| 4 | Medium   | No category/code normalisation → `CONDITION` and `condition` would live as two distinct categories in the DB and break the UI.             | Trim + upper-case both `category` and `code` before the upsert check. |
| 5 | Medium   | No length enforcement → values longer than the schema's `String(50)`/`String(200)` would crash the DB mid-transaction and roll back the *whole* upload. | Pre-validate length per row and skip offending rows (counted as failures) instead of aborting the transaction. |
| 6 | Medium   | `displayOrder = 'abc'` was silently coerced to `NaN` and inserted.                                                                         | Pre-parse; rows with non-numeric `displayOrder` are rejected with `Row N: displayOrder must be numeric`. |
| 7 | Medium   | `UploadLog.successCount` was double-counting (`successCount + updatedCount`) while the action return split them — confusing for reporting. | Return payload still splits `successCount` and `updatedCount` (backwards compatible); `UploadLog.successCount` keeps the aggregate so existing dashboards don't break. Documented in code. |
| 8 | Medium   | No per-row change log — only a single aggregate audit entry per upload. Change tracking was impossible for individual lookup updates.      | Added per-row `AuditLog` INSERT inside the transaction with `action=CREATE|UPDATE`, `entityId=CATEGORY/CODE`, and a JSON `before`/`after` diff in `changes`. |

**Note on transactionality:** row-level validation failures are now *counted*
(not thrown), so the transaction commits with a `COMPLETED_WITH_ERRORS` status.
Only infrastructure-level errors (DB disconnect, schema drift, etc.) trigger
the `tx.rollback()` path — that's the right trade-off for a bulk-upload tool.

---

## 5. Unit-test coverage added

| Suite                                  | Tests | What it guards                                               |
|----------------------------------------|-------|--------------------------------------------------------------|
| `test/unit/common-helpers.test.js`     | 20    | `buildAssetFilter`, `validateEnum`, `getTenantId`, export surface |
| `test/unit/bridge-logic.test.js`       | 33    | Condition-label map, risk-score formula, risk-band thresholds, remaining life, highPriority rule |
| `test/unit/lookup-upload.test.js`      | 23    | CSV parser (quoted fields, commas-in-quotes, whitespace), header whitelist, row normalisation (upper-casing, `displayOrder` coercion, `isActive` coercion, description truncation) |
| **Total**                              | **76**| All passing                                                  |

Run with:
```bash
npm run test:unit
```

---

## 6. Recommendations for future work (not implemented — out of this task)

1. **Dry-run preview** — add a `preview: Boolean` parameter so the action can
   validate a CSV and return the error list *without* writing anything.
2. **Localisation** — add a `label_<lang>` column family (LookupTranslation
   entity) so dropdowns in the UI can be translated without altering `code`.
3. **Soft-delete audit** — when a row is flipped from `isActive=true` to
   `false`, optionally send a `DEPRECATED` event to any downstream consumer
   (the app currently hides inactive rows via `$filter=isActive eq true`, but
   there's no notification).
4. **CSV schema versioning** — first line could optionally be
   `#version:1` so future format changes don't silently break old imports.
5. **Reporting view** — add a `LookupChangeReport` projection that joins
   `AuditLog` entries with `entity='Lookups'` by month/user/category, exposed
   as an OData entity so SuperTester and the admin screen can both render it.
6. **UI5 upload wizard step** — wire `MassUpload.controller.js` to include a
   "Lookups" tile that POSTs to this action, displays the per-row errors in a
   `sap.m.Table`, and offers a "download errors as CSV" button.

---

## 7. How to re-run this test suite

```bash
# Start the isolated server on port 4044 (if not running)
PORT=4044 NODE_ENV=development npx cds-serve --port 4044 &

# Happy path
curl -X POST http://localhost:4044/bridge-management/massUploadLookups \
  -u admin:admin -H "Content-Type: application/json" \
  --data "{\"csvData\":\"$(sed 's/"/\\"/g' test/fixtures/lookups-full.csv | tr '\n' '\\n')\"}"

# Error path
curl -X POST http://localhost:4044/bridge-management/massUploadLookups \
  -u admin:admin -H "Content-Type: application/json" \
  --data "{\"csvData\":\"$(sed 's/"/\\"/g' test/fixtures/lookups-errors.csv | tr '\n' '\\n')\"}"

# Verify
curl 'http://localhost:4044/bridge-management/Lookups?$count=true&$top=0' -u admin:admin
curl 'http://localhost:4044/bridge-management/UploadLogs?$filter=uploadType%20eq%20%27LOOKUP%27' -u admin:admin
curl "http://localhost:4044/bridge-management/AuditLogs?\$filter=entity%20eq%20'Lookups'&\$count=true&\$top=0" -u admin:admin
```

**Environment:** Node v20.19.6 via nvm · `@sap/cds` v9.8.3 · SQLite backend
(`db.sqlite` local file) · mocked auth (admin/admin).

---

*Generated 2026-04-11 as part of the NHVR Bridge Management simplified app
hardening pass. All changes are contained within this project folder.*
