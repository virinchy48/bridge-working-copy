# Reusable Fix Prompt — apply the same hardening to a sibling BIS variant

Use this prompt verbatim against another version of the same app whose
field names, tile names, route patterns and entity names may differ. The
**concepts** below are universal; do not look for the literal strings.

---

## Context (give this to the agent first)

> You're working on a SAP CAP application — a Bridge Management /
> Inspection / Asset Register app. It is a UI5 (XML view + JS controller)
> Fiori frontend served from a CDS backend (`@sap/cds`), with sqlite locally
> and HANA in production. The data model is in `db/schema/*.cds`, the
> service projections are in `srv/services/*.cds`, the service handlers are
> in `srv/handlers/*.js`, and the UI is in
> `app/<app-name>/webapp/{view,controller,...}`.
>
> A previous variant of this app had several real defects that were fixed
> by walking the live browser and the live OData endpoints, **not** by
> reading the code in isolation. Your job is to apply the same set of
> fixes/refactors to this variant. Field names, route patterns, tile
> labels, and even some entity names may differ — match by **purpose**,
> not by literal string.
>
> Workflow rules:
> 1. Use `lsof -iTCP:<port> -sTCP:LISTEN -Pn` and `cds-serve --port <port>`
>    to make sure the dev server stays in this project's directory only;
>    do not interfere with other projects.
> 2. After every code change that touches a view/controller/manifest,
>    drive the actual browser (Chrome via the MCP, or Puppeteer) and
>    inspect the rendered DOM and `sap.ui.core.Element.registry` —
>    *do not* trust greps. Most defects in this app surface only at
>    runtime (UI5 controls renamed, race-conditioned `afterRendering`,
>    silent fetch chains, etc).
> 3. If you can't observe a fix in the browser, you haven't verified it.
> 4. Add a unit-test regression guard for every defect you fix.
>
> Below is the catalogue of issues this app's siblings had. Walk through
> them in order. For each, the **Concept** section describes what to look
> for; the **What good looks like** section describes the end state.

---

## Issue 1 — Mass-upload of admin lookup values has a silent audit-log failure

### Concept
A `massUpload<Something>` action that does an upsert into a lookup table
inside a `cds.tx(req)` transaction. After the transaction commits, the
handler calls a helper like `logAudit(...)` which re-acquires the `db`
handle and runs an `INSERT` on the *committed* transaction. CDS rejects
this with `Transaction is committed, no subsequent .run allowed`. The
audit insert fails silently — only visible in the server log — so every
mass upload appears to succeed but leaves no audit trail.

### Detection
- Server log line during/after a mass upload:
  `Transaction is committed, no subsequent .run allowed, without prior .begin`
- `AuditLog` (or whatever the audit entity is called) has zero entries
  for the upload entity even though the upload claims success.

### Fix
- Move the audit `INSERT` **inside** the transaction (`tx.run(INSERT…)`),
  before `tx.commit()`.
- Inline the columns directly so the same `tx` handle is used.

### Hardening (do all of these in the same handler while you're there)
1. **Header whitelist** — define `const ALLOWED_HEADERS = new Set([…])`,
   reject unknown columns with HTTP 400 before processing any rows.
2. **Row cap** — `if (dataLines.length > MAX_CSV_ROWS) return req.error(400, …)`.
3. **Required-column check** — fail fast if `category`/`code` (or your
   equivalents) are missing from the header row.
4. **Normalisation** — trim + upper-case the natural-key columns so
   `condition` and `CONDITION` don't end up as two distinct rows.
5. **Length enforcement** — validate against the schema String(N) limits
   per row; on overflow, count as a failure (not abort the whole upload).
6. **Per-row audit** — emit one `AuditLog` row per CREATE/UPDATE inside
   the same transaction, with a `before`/`after` JSON diff in the
   `changes` column. Without this you have no way to answer
   "who changed lookup X yesterday".
7. **Server-side validation** — keep the existing enum guard in
   `srv/handlers/<entity>.js` as a final safety net even after the
   dropdown is lookup-driven (see Issue 6).

### What good looks like
- The action returns `SUCCESS` and the audit log shows N+1 entries
  (N per-row + 1 summary).
- Uploading a CSV with bad headers / over-length values / non-numeric
  display order returns a structured `errors` string with row numbers.
- The transaction safely rolls back on infrastructure errors but commits
  on row-level validation failures (so you don't lose 999 good rows
  because of 1 bad one).

---

## Issue 2 — Browse File button on the Mass Upload screen is silently inert

### Concept
The Mass Upload view contains a hidden `<input type="file">` inside one
`<core:HTML>` block, and a "Browse File" button inside another. The
controller wires the `change` listener from the **drop zone's**
`afterRendering` callback. UI5 renders the two HTML controls
independently — if the drop zone fires `afterRendering` first,
`document.getElementById('<file-input-id>')` returns `null`, the wiring
silently no-ops, and the input is never armed. The user clicks Browse
File, the OS picker opens, they pick a file, and **nothing happens**.

### Detection
- In the live browser, after navigating to Mass Upload:
  ```js
  document.getElementById('<file-input-id>')._wired   // → false
  ```
- No console error. No toast. No preview table.

### Fix
- Extract a single `_wireFileInput()` helper that is **idempotent** —
  attaches the listener once, returns false if the input isn't in the
  DOM yet.
- Call it from THREE places:
  1. The drop zone's `afterRendering`.
  2. A new `afterRendering` on the file-input holder itself
     (add `afterRendering="onFileInputRendered"` to the `<core:HTML>`).
  3. **Inside `onBrowseFile`, immediately before `.click()`** — last-resort
     fallback in case neither callback ran.
- After each successful read, set `e.target.value = ""` so re-selecting
  the same file works.

### What good looks like
- `document.getElementById('<file-input-id>')._wired === true` regardless
  of render order.
- Selecting a file → preview table appears with row count.
- Selecting the SAME file twice in a row works.

### Regression test
Stub the file input + listener attachment as plain JS, write tests:
- listener attached only once (idempotent)
- change event with `files[0]` triggers `_processFile`
- `value` is reset on each read
- explicit "race-condition recovery" test: call `_wireFileInput` once
  with no input present (should return false), then attach the input,
  call again (should attach now)
- "fallback path" test: call only `onBrowseFile`-equivalent, never the
  `afterRendering` callbacks → wiring still happens

---

## Issue 3 — "Save failed: hbox.getItems is not a function" on the entity form

### Concept
A form with a "Custom Attributes" panel populated dynamically from an
`AttributeDefinition` table. The view file declares a placeholder
`<Text text="Loading custom attributes…">` inside the container so the
user sees something while definitions load. The controller's
`_collectDynAttrValues` (called on save) does:
```js
const hbox = container.getItems()[0];
if (!hbox) return vals;
hbox.getItems().forEach(...)
```
If `_renderDynAttrs` hasn't run (fetch in flight, errored, or returned
empty), `getItems()[0]` is the placeholder Text — which has no
`getItems()` method. The save crashes with `hbox.getItems is not a function`.

### Detection
- Open the entity create form, immediately click Save.
- Save toast: `Save failed: hbox.getItems is not a function`
- In the browser:
  ```js
  const c = view.byId('<dynamic-attr-container-id>');
  c.getItems().map(it => it.getMetadata().getName())
  // → ['sap.m.Text']  ← the placeholder
  ```

### Fix
Replace the blind index with a type-safe find:
```js
const items = container.getItems ? container.getItems() : [];
const hbox  = items.find(it => it && typeof it.getItems === 'function');
if (!hbox) return vals;
```
Add defensive guards at every nested level:
```js
hbox.getItems().forEach(vbox => {
    if (!vbox || typeof vbox.getItems !== 'function') return;
    const controls = vbox.getItems();
    if (controls.length < 2) return;
    const ctrl = controls[1];
    if (!ctrl || typeof ctrl.data !== 'function') return;
    …
});
```

### What good looks like
- Save with no dynamic attributes loaded yet → returns `{}` silently,
  rest of save proceeds normally, success toast.
- Save with dynamic attributes loaded → values collected as before.

### Regression test
Plain-JS stubs of `Container`, `HBox`, `VBox`, `Text`, `Input`, `Switch`,
`Select`. Tests:
- empty container → `{}`
- container with only placeholder Text → `{}` (no throw — this is the
  exact original crash)
- mixed container (Text + HBox) → still finds the HBox
- VBox with only one child → skipped (not throw)
- control without `attrName` → skipped

---

## Issue 4 — "Upload failed — check console for details" toast even though the upload SUCCEEDED on the server

### Concept
After a successful mass-upload action call, the controller renders a
result panel that includes an error TextArea (e.g. `#resultErrors`).
The view declares it as `<TextArea id="resultErrors"…/>` but the
controller calls `errorsEl.setText(…)`. **TextArea's API is
`setValue()`, not `setText()`.** The TypeError thrown by `.setText`
propagates out of the `.then()` chain in the upload handler, hits the
`.catch()`, and surfaces a misleading toast — even though the data was
already in the database.

### Detection
- The data lands in the DB but the user sees `Upload failed` toast.
- In the browser:
  ```js
  view.byId('<result-errors-id>').getMetadata().getName()
  // → 'sap.m.TextArea'   ← but controller calls setText
  ```

### Fix
Detect which method exists and call the right one (cheap, robust to
future view edits):
```js
const text = errors ? `Errors:\n${escapeHtml(errors)}` : '';
if (typeof errorsEl.setValue === 'function')      errorsEl.setValue(text);
else if (typeof errorsEl.setText === 'function')  errorsEl.setText(text);
```

### Regression test
Stub a TextArea (no `setText`) and a Text (no `setValue`). Tests:
- TextArea receives `setValue` and does NOT throw
- Text fallback still works
- Empty errors → control hidden, value cleared
- **Explicit assertion**: calling `setText` on the TextArea stub throws
  (so the buggy code path can never silently come back)

---

## Issue 5 — Dropdowns in form views are hardcoded; uploaded lookup values don't appear

### Concept
A form field whose dropdown should show admin-configurable values has
hardcoded `<core:Item key="..." text="..."/>` entries in the XML view.
Two consequences:
1. The hardcoded list drifts out of sync with the server's enum guard
   (e.g. UI offers `HEIGHT_RESTRICTED` but the server's allow-list only
   has `UNRESTRICTED|POSTED|REDUCED|CLOSED`). Picking the bad value is
   a guaranteed save failure.
2. Uploading new values via Mass Upload → Lookups has zero effect on
   the dropdown — defeats the entire admin-configurable model.

### Detection
- In the live browser, dropdown contains values that the server's
  validator rejects, OR the value the user just uploaded doesn't appear.
- Search the view file: any `<Select id="…">` with `<core:Item key=`
  children that are persisted to DB columns (not period selectors,
  base maps, etc).

### Fix
1. **Strip the hardcoded items** from the view, leaving an empty
   `<Select id="..."/>`.
2. **In the controller's `onInit`**, after `LookupService.load().then(...)`,
   add `LookupService.populateFormSelect(this.byId("<id>"), "<CATEGORY>")`
   for each one.
3. **Seed the Lookup table** with the values that were previously
   hardcoded (via the same `massUploadLookups` action).

### Critical scoping rules
- Migrate ONLY dropdowns whose values are persisted to the DB and/or
  match a server-side enum check. Leave UI-only selects (period filter,
  base map, sort order) hardcoded.
- For required fields use `populateFormSelect(ctrl, cat, "— Select —")`
  (with blank leading entry). For filters use `populateSelect` (with an
  "All" leading entry).
- After migrating, the `_validateEnum`-style server guard MUST stay in
  place as a safety net. The dropdown can no longer offer a bad value,
  but a future bad mass upload could re-introduce one.

### What good looks like
- Adding a new value via Mass Upload → Lookups → refresh form → new
  value appears in the dropdown immediately.
- Saving a bridge with the new value persists and reloads correctly.
- The server's enum guard still hard-rejects garbage if the Lookup table
  is corrupted.

---

## Issue 6 — Inventory + migration of every form/filter dropdown to the Lookup table

### Concept
Apply Issue 5 systematically across the entire app. The first sweep
fixed one form; this sweep guarantees the architectural rule
("no enum value is hardcoded in a view") holds everywhere.

### Detection
Run this from the project root:
```bash
python3 << 'PYEOF'
import re, os
view_dir = "app/<app-name>/webapp/view"
results = []
for fn in sorted(os.listdir(view_dir)):
    if not fn.endswith(".view.xml"): continue
    txt = open(os.path.join(view_dir, fn)).read()
    for m in re.finditer(r'<Select\s+id="([^"]+)"[^>]*>(.*?)</Select>', txt, re.DOTALL):
        sid, body = m.group(1), m.group(2)
        items = re.findall(r'<core:Item\s+key="([^"]*)"\s+text="([^"]*)"', body)
        if items:
            results.append((fn, sid, items))
for fn, sid, items in results:
    print(fn, sid, len(items))
PYEOF
```

### Fix
Categorise each hit into one of three buckets:
| Bucket | Action |
|---|---|
| **Already lookup-driven (controller wires it)** | Leave the dead `<core:Item>` children — they're overridden at runtime — OR strip them for tidiness. No functional change. |
| **Persisted enum field** | Migrate per Issue 5. Required. |
| **UI-only (period, base map, role picker)** | Leave hardcoded. |

For each migrated category that doesn't yet exist in the Lookup table,
seed it via a CSV upload through `massUploadLookups`. Build the seed
CSV from the values that were previously in the view.

### What good looks like
- Re-running the detector finds only UI-only and (optionally) dead-code
  selects.
- A single source of truth: every persisted-enum dropdown reads from the
  Lookup table at runtime.

---

## Issue 7 — Excel "Download Template" should ship a real starter file with all current values, not a 1-row stub

### Concept
The Mass Upload screen has a "Download Template" button that, for most
entity types, generates a 1-row CSV stub from in-controller config. For
the Lookup Values type that's useless — admins want a working starter
file containing every category and every current value, ready to edit
in Excel and re-upload.

### Fix
1. **Generator script** — write a small Python script
   (`scripts/generate-lookups-template.py`) using `openpyxl`. Pulls the
   live Lookup table via OData, writes a 2-sheet xlsx:
   - Sheet 1 `Lookups`: every active row, frozen header, alternating row
     tint per category, **cell comments on every header explaining the
     field's purpose, length limits, and upsert semantics**.
   - Sheet 2 `Categories`: one row per category with a human-curated
     `purpose` column ("Bridge posting status — server-validated",
     "Inspection access method — used by BridgeDetail", etc) so admins
     know which UI screens they'll affect when editing.
2. **Static path** — write the xlsx into
   `app/<app>/webapp/resources/templates/lookups-template.xlsx` so the
   CDS static-asset middleware serves it as
   `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`.
3. **Wire the button** — in `MassUpload.controller.js` `onDownloadTemplate`,
   add a branch: `if (this._uploadType === "lookups") return
   this._downloadLookupsXlsxTemplate();`. The download function
   `fetch`es the static path, blob-downloads it as `lookups-template.xlsx`,
   and shows a success toast.
4. **Error path** — if the static file is missing, show a `MessageBox.error`
   that tells the admin to run the generator script.

### What good looks like
- Mass Upload → Lookup Values → Download Template ⇒ `lookups-template.xlsx`
  opens in Excel with N rows on `Lookups` and one entry per category on
  `Categories`.
- Admin edits, saves as CSV (or xlsx → CSV via the same screen), uploads
  via the same Mass Upload screen, new values flow into dropdowns.

---

## Issue 8 — Removing whole feature areas (e.g. WorkOrder, InspectionOrder)

### Concept
The cut-down variant of the app removes entire entity hierarchies that
the upstream variant has. Three layers must be cleaned in lockstep:
1. **Persistence layer**: entity, type imports, association backreferences.
2. **Service layer**: projections, actions, redirected-target attributes.
3. **UI layer**: views, controllers, manifest routes/targets, navigation
   tiles, capability maps, role fallbacks, and lite-mode hidden lists.

### Procedure
For each entity to remove (call it `Foo`):

#### Step A — DB schema (`db/schema/*.cds`)
1. Delete the `entity Foo : ...` and any `extend Foo with { ... }` blocks.
2. Delete any **type definitions** used only by `Foo`
   (e.g. `FooStatus : String enum { ... }`).
3. Remove `Foo` from any `using { Foo, ... } from './types'` import lists.
4. **Search for associations TO `Foo`** in OTHER entities — e.g.
   `inspectionOrder : Association to InspectionOrder` on
   `MeasurementDocument` or `BridgeDefect`. Either remove the association
   or, if it was optional, drop the field entirely.
5. **Search for `@mandatory` associations TO `Foo`** — these dependents
   probably also need to be deleted (e.g. `MeasurementDocument` exists
   only as a child of `InspectionOrder` → delete it too).
6. Remove any dangling FK columns like `fooRef : String(100)` in
   investment plans, defects, etc.

#### Step B — Service projections (`srv/services/*.cds`)
1. Delete `entity Foos as projection on nhvr.Foo { ... } actions { ... };`.
2. Delete any unbound actions referencing `Foo` in their parameters or
   return types (e.g. `action createFoo(...)`, `action raiseDefect(...,
   foo_ID : UUID, ...)` — drop the FK parameter).
3. Delete any `redirected to Foos` annotations on remaining entities.
4. Remove any cross-cutting actions that compose `Foo` with another
   entity (e.g. S/4HANA integration: `action createS4MaintenanceOrder(
   inspectionOrderId : UUID)` ⇒ delete).

#### Step C — Service handlers (`srv/handlers/*.js`, `srv/integration/*.js`)
1. Delete `srv.before/srv.after/srv.on` handlers for `Foos` (CRUD,
   actions, validation).
2. Delete helper functions like `getFoo(id, db)` from `common.js` and
   remove them from the `helpers` export object.
3. **Find load-time references** in handlers like
   `BridgeDetail.controller.js` and `Dashboard.controller.js` that fetch
   `/Foos?...` on mount. Either:
   - Replace with an inline `[]` (if the rest of the controller can cope),
     or
   - Stub the loader function as a no-op:
     ```js
     _loadFoos: function () { this._model.setProperty("/foos", []); }
     ```
4. Delete capability-map entries like `'Foos' : 'FOOS'` in
   `system.js` `ENTITY_CAPABILITY_MAP`.
5. Delete entries from `LITE_HIDDEN_FEATURES`.
6. Delete `'Foos'` from analytics `DEFAULT_KNOWN_ROUTES`.
7. **Critically:** if a handler like `getInspectionsDue` was implemented
   by querying `nhvr.InspectionOrder`, REWRITE it to query an alternative
   source (e.g. `Bridge.nextInspectionDueDate`) instead of removing the
   action — otherwise the dashboard breaks. Decide based on whether the
   action is still useful.

#### Step D — UI files
1. **Delete** any view files dedicated to `Foo`:
   `app/<app>/webapp/view/Foos.view.xml`,
   `app/<app>/webapp/controller/Foos.controller.js`. Same for any
   "FooDashboard" / "FooDetail" pair.
2. **Manifest** (`app/<app>/webapp/manifest.json`):
   - Remove the route entry: `{ "pattern": "Foos", "name": "Foos", "target": "Foos" }`.
   - Remove the target entry: `"Foos": { "type": "XML", "viewName": "..."}`.
   - **Run a JSON validator** on the result before saving.
3. **Home view** (`Home.view.xml`):
   - Remove any tile pointing at the `Foos` route.
   - Remove section headers that become empty.
4. **Home controller**:
   - Delete the corresponding `_navTo` handler OR stub it as a no-op
     to avoid breaking other tiles that may share helpers.
   - Remove the entry from `_applyCapabilityVisibility`'s tile list.
   - Remove the entry from `_applyLiteMode`'s tile list.
5. **Mass Upload UI** (`MassUpload.controller.js` + `MassUpload.view.xml`):
   - Remove the `foos: { ... }` entry from `ENTITY_CONFIG`.
   - Remove the `<core:Item key="foos" text="Foos"/>` from the
     `uploadTypeSelect` dropdown.
6. **Mass Edit UI** (`MassEdit.controller.js`):
   - Remove the `FOO: { entitySet: "Foos", ... }` entry from the
     entity registry.
7. **BridgeDetail / parent-entity views**: remove tabs, dialogs and
   action-bar buttons for `Foo`. Stub any controller fetch that loads
   `/Foos?$filter=parent_ID eq …` to a no-op so the parent screen still
   renders.
8. **Defects / Reports / IntegrationHub**: remove "Create Foo" buttons,
   columns, and any mapping-table entries that mention `Foo`.
9. **i18n** (`i18n.properties`): remove `btn.newFoo=…` entries.
10. **AppConfig.js**: remove `'foos'` from `LITE_FEATURES` and `Foos`
    from `LITE_HIDDEN_ROUTES`.
11. **Component.js**: remove the `"Foos": "FOOS"` mapping from the
    capability map.
12. **`util/HelpContent.js`** and **`config/RoleFallback.js`**: leave
    benign metadata entries (they're dictionaries, no harm if a key is
    no longer used).

#### Step E — Validation gates BEFORE re-deploying
1. JSON validate the manifest:
   `python3 -c "import json; json.load(open('app/<app>/webapp/manifest.json'))"`
2. XML validate every edited view:
   `python3 -c "import xml.etree.ElementTree as ET; ET.parse('<file>')"`
3. JS syntax check every edited controller:
   `node --check <file>`
4. CDS compile:
   `npx cds compile srv/service.cds > /dev/null`
5. Schema deploy:
   `rm -f db.sqlite db.sqlite-shm db.sqlite-wal && npx cds deploy --to sqlite:db.sqlite`
6. **Re-seed lookup data** — `npx cds deploy` wipes the lookup table.
   Re-upload your lookup CSVs via `massUploadLookups`. Don't forget the
   ones added in Issue 7's xlsx.

#### Step F — Browser sanity check (mandatory; do not skip)
1. Force a hard reload (`?cb=<timestamp>`) — UI5 caches modules
   aggressively.
2. Verify the Home page renders. If it's blank but `nhvrRootApp` exists
   in the element registry with `pages: []`, the router target failed
   silently. Likely cause: a stub controller method threw, or a manifest
   target points at a deleted view. Read the server log
   (`preview_logs --level error`).
3. Inspect every dropdown on the form view that you migrated in Issue 5
   — confirm item counts match the Lookup table.
4. Drive a real `onSave()` through the controller with values that
   were previously in the deleted feature area (e.g. for InspectionOrder
   removal: save a bridge, then verify it persists; do NOT try to create
   an inspection order). Confirm the success toast and DB row.
5. Hit the deleted endpoints with curl — they MUST return `HTTP 404`.

### Pitfalls observed in the previous variant
- The bridge-form panel had a `<Text text="Loading…"/>` placeholder
  inside the dynamic-attribute container. After removing
  `getInspectionOrder` from `common.js`, ensure no other helper still
  destructures it from `helpers` (`const { getInspectionOrder } = helpers`).
- `LookupService` caches per session. After re-seeding lookups, you must
  hard-reload the browser tab — a soft route change won't pick up the
  new categories.
- The CDS server returns `503` once on the first request after a
  schema deploy while it builds the preload bundle. Just retry.
- `cds deploy` wipes the SQLite file — re-seed lookups.
- After deleting an entity, `cds compile` will still succeed even if a
  handler's `srv.on('Foos', ...)` references it. The handler binds at
  runtime and is silently ignored. Always do step C carefully.
- Removing a tile from the Home view but leaving its `_navTo` handler
  in the controller is fine — UI5 won't NPE on an unused method. But
  removing the handler while leaving the tile button **does** crash on
  press.

---

## Issue 9 — Lookup categories that should universally exist

These categories were added to the variant during the migration. Seed
them in the new variant if they're not already present, and migrate
the corresponding form fields to use them:

| Category | Used by (concept) | Sample values |
|---|---|---|
| `POSTING_STATUS` | Bridge posting/closure status | UNRESTRICTED, POSTED, REDUCED, CLOSED |
| `SCOUR_RISK` | Scour risk band | LOW, MEDIUM, HIGH, CRITICAL, UNKNOWN |
| `STRUCTURE_TYPE` | Bridge structure type | ARCH, BEAM, SUSPENSION, CABLE_STAYED, TRUSS, SLAB, BOX_GIRDER, CULVERT |
| `DESIGN_LOAD` | AS 5100 / AASHTO design load | T44, L44, M1600, S1600, SM1600, HLP320, HLP400, HISTORIC, OTHER |
| `NHVR_APPROVAL_CLASS` | NHVR PBS / approval class | CLASS1..CLASS4, HML, B_DOUBLE, B_TRIPLE, NONE |
| `EXTERNAL_SYSTEM_TYPE` | Backend system reference | S4_HANA, ESRI, BANC, GAZETTE, WEATHER, RMS, VICROADS, MRWA, TMR, DPTI, OTHER |
| `INSPECTION_TYPE` | Inspection workflow level | ROUTINE, PRINCIPAL, DETAILED, SPECIAL, UNDERWATER, POST_EVENT (or L1_ROUTINE..L4_EMERGENCY) |
| `INSPECTION_STANDARD` | Inspection standard | AS5100_7_2017, TFNSW_TMC_2012, NAASRA_BMS, etc |
| `ACCESS_METHOD` | Inspector access method | DRIVE_ON, WALK, UNDERSIDE, BOAT, DRONE, ROPE_ACCESS, VISUAL, UBIV |
| `DEFECT_CATEGORY` | Defect family | CRACKING, SPALLING, CORROSION, DEFORMATION, SCOUR, DRAINAGE, BEARING, DECK_WEAR |
| `DEFECT_CLASSIFICATION` | Detailed defect codes | NONE, D1..D13 |
| `DEFECT_SEVERITY` | Severity scale | MINOR, MODERATE, MAJOR, CRITICAL (or NONE..CRITICAL) |
| `DEFECT_PRIORITY` | Triage priority | LOW, MEDIUM, HIGH, URGENT |
| `DEFECT_STATUS` | Lifecycle | OPEN, IN_REPAIR, REPAIRED, CLOSED, DEFERRED |
| `RISK_BAND` / `STRUCTURAL_RISK` | Bridge risk band | LOW, MEDIUM, HIGH, VERY_HIGH, CRITICAL |
| `STATE` | Australian states | NSW, VIC, QLD, WA, SA, TAS, NT, ACT |
| `ASSET_CLASS` | Top-level asset class | BRIDGE, CULVERT, UNDERPASS, OVERPASS, FOOTBRIDGE, VIADUCT, RETAINING_WALL, TUNNEL |
| `MATERIAL` | Construction material | CONCRETE, STEEL, COMPOSITE, TIMBER, STONE |
| `RESTRICTION_TYPE` | Restriction kind | MASS_LIMIT, AXLE_LIMIT, HEIGHT_LIMIT, WIDTH_LIMIT, LENGTH_LIMIT, SPEED_LIMIT, LANE_CLOSURE, FULL_CLOSURE |
| `RESTRICTION_STATUS` | Restriction lifecycle | ACTIVE, PENDING, SUPERSEDED, LIFTED, EXPIRED |
| `RESTRICTION_DIRECTION` | Travel direction | BOTH, INCREASING, DECREASING, NORTHBOUND, SOUTHBOUND, EASTBOUND, WESTBOUND |
| `MEASUREMENT_UNIT` | SI / common units | t, kN, m, km, kph, mm |
| `PERMIT_TYPE` / `PERMIT_STATUS` / `PERMIT_DECISION` | Vehicle permits | (see source) |
| `ROUTE_CLASS` / `ROUTE_STATUS` | Freight routes | (see source) |
| `VEHICLE_CLASS` | NHVR vehicle classes | A_DOUBLE, B_DOUBLE, B_TRAIN, ROAD_TRAIN, PBS_1..3, GENERAL, OVERSIZE |

For brand-new variants, the safest approach is to upload the full
`lookups-template.xlsx` from a sibling install as a starter file.

---

## Final pre-shipping checklist

```
[ ] Issue 1: massUploadLookups audit-log fix + 7-point hardening verified
[ ] Issue 2: Browse File button works first-attempt; regression test added
[ ] Issue 3: Save with no dynamic-attrs loaded → no crash; test added
[ ] Issue 4: Successful upload no longer shows misleading "Upload failed"
              toast; test added
[ ] Issue 5: Form dropdowns sourced from Lookup table; sibling enum
              guard still in place on the server
[ ] Issue 6: Detector script reports zero hardcoded persisted-enum
              dropdowns
[ ] Issue 7: lookups-template.xlsx generates, downloads, opens in Excel
              with correct sheets and comments
[ ] Issue 8: All deleted entities return 404; surviving entities return
              200; Home page renders; Bridge save end-to-end works
[ ] Issue 9: All canonical Lookup categories seeded
[ ] Server log: no "Transaction is committed" errors during upload
[ ] Server log: no Unhandled Promise Rejections during page loads
[ ] Browser console: no JavaScript errors during normal navigation
[ ] All unit tests passing: `npm run test:unit`
```

---

*Apply this prompt against any sibling BIS / asset-management variant.
Field names and tile labels may differ — match by **purpose**, not by
literal string. Verify every fix in the live browser, not in the source.*
