# NHVR Bridge Management App — Expert QA, UX Audit & Power-User Enhancements
### App: `/Users/siddharthaampolu/21 NHVR APP`
### Authored as: Principal SAP Solution Architect + Senior UX Designer + Critical End User

---

## ROLE & MINDSET

You are simultaneously three people reviewing this application:

**1 — The Critical End User** (a bridge inspector who uses this daily on a tablet in the field)
> "Why do I have to open Edit mode just to see the condition rating? Why is the external link buried in a separate tab but also half-duplicated on the edit form? Why can't I just sort this table by clicking the column header like every other app I use?"

**2 — The Power Admin** (a TfNSW data manager responsible for 4,000 bridges)
> "I need to update 200 bridges at once after a flood event. Copy-pasting one record at a time into a form is not acceptable. I need an Excel-like grid. I need to add a 'Flood Response Status' attribute this afternoon and have it appear in filters, reports, and exports by tonight — without calling a developer."

**3 — The Senior SA/UX Architect** (20 years building enterprise apps for government)
> "The data model is sound but the presentation layer has fundamental consistency problems. Fields shown in view mode must match fields shown in edit mode — full stop. Configuration and data entry must be separated clearly. Every grid must be a proper data grid: sort, filter, search, column resize, export. Dynamic attributes must be first-class citizens of the query and filter engine — not bolted-on afterthoughts."

---

## STEP 0 — MANDATORY RECON (read everything before touching a line)

```bash
APP="/Users/siddharthaampolu/21 NHVR APP"

# Full file inventory
find "$APP" -not -path "*/node_modules/*" -not -path "*/.git/*" \
  -not -path "*/dist/*" | sort

# All CDS schema — capture the full picture
find "$APP" -name "*.cds" | xargs -I{} sh -c 'echo "\n=== {} ===" && cat "{}"'

# All frontend components — identify every view, tab, form, table
find "$APP" -not -path "*/node_modules/*" \
  \( -name "*.jsx" -o -name "*.tsx" -o -name "*.js" -o -name "*.view.xml" \) \
  | grep -v node_modules | xargs -I{} sh -c 'echo "\n=== {} ===" && cat "{}"'

# Package.json — framework, versions, existing deps
cat "$APP/package.json"
```

**Before writing any code, document:**
- Every field on every entity (Bridge, BridgeRestriction, etc.)
- Every screen/tab/panel and what it currently shows in VIEW mode
- Every screen/tab/panel and what it shows in EDIT mode
- Every discrepancy between view and edit (this is the core UX bug)
- Which tables exist and whether they have sort/filter/search today
- Where external refs, dynamic attributes, and vehicle types are currently managed

---

## PART A — UX AUDIT: FIX ALL VIEW/EDIT INCONSISTENCIES

### The Fundamental Rule
**Every field that exists on a record must be visible in view mode.** Edit mode adds input controls to those same fields — it does not reveal hidden data. If a user must click "Edit" to see data, the design is broken.

### A1 — Audit Every Tab on Bridge Detail

For each tab, do this analysis:

```
TAB: [tab name]
Fields visible in VIEW mode: [list every field shown]
Fields visible in EDIT mode only: [list every field that only appears when editing]
Fields in the data model not shown anywhere: [list fields from CDS not surfaced in UI]
VERDICT: PASS / FAIL
ACTION REQUIRED: [specific fix]
```

**Known gaps to fix immediately (from the issue description):**

**Gap 1 — Condition data hidden in edit mode**

In the Overview/Condition tab, if fields like `conditionStandard`, `inspectionDate`, `nextInspectionDue`, `designLoad`, `designStandard`, `aadtVehicles`, `seismicZone` only appear when the user clicks Edit — fix this. Every field must display in a read layout first, with an [Edit] button to make them editable.

Implementation pattern:
```jsx
// WRONG — only appears in edit mode:
{editMode && <FormField label="Condition Standard" value={bridge.conditionStandard} />}

// CORRECT — always visible, editable when in edit mode:
<FieldRow
  label="Condition Standard"
  value={bridge.conditionStandard || '—'}
  editMode={editMode}
  editControl={<input value={editData.conditionStandard} onChange={...} />}
/>
```

Build a reusable `<FieldRow>` component (or UI5 equivalent) that handles this pattern once and uses it everywhere.

**Gap 2 — External references: split personality between Edit form and External Systems tab**

The Edit Bridge form has 1 external ref field. The External Systems tab can hold unlimited refs. This is inconsistent and confusing.

**Fix:**
- Remove the single external ref fields from the Edit form entirely (`bancId`, `bancURL`, `primaryExternalSystem`, `primaryExternalId`, `primaryExternalURL`)
- The External Systems tab is the single place to manage all external refs
- On the Bridge Overview tab (view mode), show a compact "External Systems" widget — a small table listing system name + link for each active ref — inline, not requiring a tab switch
- The External Systems tab remains the full management screen

```jsx
// On Overview tab — compact external refs widget (always visible):
<ExternalRefsWidget bridgeId={bridgeId} compact={true} maxDisplay={3} />
// Shows: BANC | NSW-001-SHB | [Open] link
//        TfNSW RAMS | SHB-1932 | [Open] link
//        [+ 1 more → View All]  ← links to External Systems tab
```

**Gap 3 — Dynamic attributes: invisible unless editing**

Any `BridgeAttributeValue` records for a bridge must be shown in the Attributes tab in view mode, not just when editing. The tab must render as a two-column key/value display by default, with [Edit All Attributes] to switch to edit mode.

---

### A2 — Consistent View/Edit Pattern for All Sections

Apply this to every section across the entire app:

```
RULE 1: View mode shows ALL fields with their current values (or '—' if empty)
RULE 2: Edit mode transforms each field into an appropriate input control
RULE 3: Required fields marked with * in both modes
RULE 4: Save and Cancel buttons appear at top AND bottom of the form
RULE 5: Unsaved changes trigger a "You have unsaved changes" warning before navigation
RULE 6: After save, return to view mode automatically
```

---

## PART B — DATA GRIDS: REPLACE ALL BASIC TABLES

Every table in the application must be a proper interactive data grid. No exceptions.

### B1 — Universal Grid Component

Build one reusable `<DataGrid>` component (React) or use an existing grid library already in the project (check `package.json` for ag-grid, tanstack/react-table, react-data-grid, sap.ui.table, etc. — if none exist, install `@tanstack/react-table` which is lightweight and MIT licensed).

```jsx
// The DataGrid must support ALL of these out of the box:
<DataGrid
  data={bridges}
  columns={bridgeColumns}
  
  // Sorting
  sortable={true}                    // Click column header to sort
  defaultSort={{ field: 'bridgeId', direction: 'asc' }}
  
  // Filtering
  globalSearch={true}               // Single search box across all text columns
  columnFilters={true}              // Per-column filter dropdowns
  filterPersist="bridge-list"       // Persist filter state in localStorage
  
  // Selection
  selectable={true}                 // Checkboxes for multi-select
  onSelectionChange={setSelected}
  
  // Pagination
  paginated={true}
  pageSize={50}
  pageSizeOptions={[25, 50, 100, 'All']}
  
  // Column management
  columnChooser={true}              // Hide/show columns via gear icon
  resizableColumns={true}
  columnOrderPersist="bridge-list-cols"  // Persist to localStorage
  
  // Export
  exportCSV={true}                  // Export visible rows to CSV
  exportFilename="bridges"
  
  // Actions
  rowActions={[
    { label: 'View',   icon: 'eye',    onClick: (row) => navigate(`/bridges/${row.bridgeId}`) },
    { label: 'Edit',   icon: 'pencil', onClick: (row) => navigate(`/bridges/${row.bridgeId}/edit`) },
    { label: 'Clone',  icon: 'copy',   onClick: handleClone },
  ]}
  bulkActions={[
    { label: 'Export Selected',     onClick: handleBulkExport },
    { label: 'Update Condition',    onClick: handleBulkConditionUpdate },
    { label: 'Mark NHVR Assessed',  onClick: handleBulkNHVR },
    { label: 'Delete Selected',     onClick: handleBulkDelete, variant: 'danger' },
  ]}
  
  // Loading states
  loading={isLoading}
  emptyMessage="No bridges match your filters"
/>
```

### B2 — Apply DataGrid to Every Table in the App

| Screen / Tab | Table | Required Grid Features |
|---|---|---|
| Bridge List (main) | All bridges | Sort, search, column filters, multi-select, bulk actions, export, pagination |
| Restrictions Tab | Bridge restrictions | Sort, status filter, type filter, date range filter, enable/disable bulk |
| Inspections Tab | Inspection orders | Sort, status filter, date filter, type filter |
| Defects Tab | Bridge defects | Sort, severity filter, status filter, NHVR-impact filter, priority sort |
| History Tab | Audit log | Sort, event-type filter, date range filter, column chooser |
| External Systems Tab | External refs | Sort, system-type filter, active toggle, verify-link bulk action |
| Attributes Tab | Dynamic attributes | Sort, data-type filter |
| Admin — Bridge Attributes | Attribute definitions | Sort, data-type filter, active toggle |
| Admin — Restriction Types | Restriction type config | Sort, active toggle |
| Admin — Vehicle Types | Vehicle class config | Sort, active toggle |
| Vehicle Classes page | Vehicle classes | Sort, search, permit-required filter |

---

## PART C — POWER-USER MASS CREATE/UPDATE

### C1 — In-App Excel-Style Grid Editor

Build a dedicated **Mass Edit** screen accessible from:
- Bridge List → [Mass Edit] button (top toolbar, admin/power-user role only)
- Admin menu → Mass Data Entry

This screen renders an editable data grid — like a spreadsheet — where users can:
- Edit multiple cells inline by clicking on them
- Add new rows at the bottom (with auto-generated bridgeId)
- Paste data from Excel/Google Sheets (clipboard paste support)
- See validation errors inline (red cell border, tooltip with error message)
- Save all changes in a single transaction

```jsx
// MassEditGrid component — key behaviours:
// 1. Load: GET /BridgeService/Bridges with state filter
// 2. Render: editable grid (ag-grid Community or react-data-grid)
// 3. Edit: cell-level editing with immediate local validation
// 4. Add row: [+ Add Row] appends a blank row with generated ID
// 5. Paste: ctrl+v from Excel populates cells in order
// 6. Validate: client-side rules before any API call
//    - Required fields highlighted
//    - Enum values validated against lookup lists
//    - Duplicate bridgeId flagged
//    - Coordinate range validated
// 7. Save: POST/PATCH each dirty row in sequence; show progress
// 8. Error handling: failed rows stay dirty with error icon; others commit

// Toolbar:
// [+ Add Row]  [📋 Paste from Clipboard]  [⬆ Import CSV]  [⬇ Export CSV]
// [✓ Save Changes (N)]  [✗ Discard]  [? Validate All]
```

**Column set for Mass Edit grid:**
Only show the most operationally important columns by default:
`bridgeId | name | state | region | condition | conditionRating | postingStatus | nhvrRouteAssessed | inspectionDate | freightRoute | scourRisk`

Users can add more columns via the column chooser.

### C2 — CSV Import/Export

Add import and export to the Mass Edit screen and the main Bridge List:

**Export:**
```javascript
// Export from current filtered view — not the entire database
// Respects current sort, filter, and column visibility
// Formats: CSV (always), XLSX (if xlsx library already present)
function exportGrid(rows, columns, filename) {
  // Only export visible columns in current column order
  // Format dates as YYYY-MM-DD
  // Format booleans as TRUE/FALSE
  // Include a header row with field names
  // First row after header: data type hints (optional, togglable)
}
```

**Import:**
```jsx
// Import panel — supports CSV and XLSX
// Step 1: Upload file
// Step 2: Column mapping (auto-map if headers match field names)
// Step 3: Preview — show first 10 rows, validation status
// Step 4: Import — with progress bar, stop-on-error or skip-error option
// Step 5: Result summary — N created, N updated, N failed (with reason per row)

<ImportPanel
  entityType="Bridge"
  templateDownloadURL="/api/templates/bridge-import-template.csv"
  onImportComplete={(results) => refreshGrid(results)}
  columnMapping={BRIDGE_COLUMN_MAP}
  validationRules={BRIDGE_VALIDATION_RULES}
  upsertKey="bridgeId"   // match on this field; PATCH if exists, POST if not
/>
```

**Downloadable import template:**
Serve a pre-formatted CSV template with header row and one example row from:
`GET /api/templates/bridge-import-template.csv`

This CAP custom endpoint generates the template dynamically so new dynamic attributes are always included.

---

## PART D — DYNAMIC ATTRIBUTE SYSTEM: FIRST-CLASS CITIZENS

Dynamic attributes added via Admin must automatically become part of:
1. Bridge detail view (Attributes tab)
2. Bridge edit form (Attributes section)
3. Bridge list filters
4. Reports
5. Mass edit grid (addable as optional column)
6. CSV export/import

### D1 — Backend: Attribute-Aware Query Engine

```javascript
// srv/bridge-service.js — enhance the READ handler for Bridges

this.on('READ', 'Bridges', async (req) => {
  const db = await cds.connect.to('db');
  const { Bridge, BridgeAttributeDefinition, BridgeAttributeValue } = db.entities('au.gov.bridges');

  // Standard query
  let bridges = await db.run(req.query);

  // For each bridge, attach its dynamic attribute values as a flat object
  // so the UI can treat them like regular fields
  const allAttrDefs = await SELECT.from(BridgeAttributeDefinition)
    .where({ active: true })
    .orderBy('displayOrder');

  const bridgeIds = bridges.map(b => b.bridgeId);
  if (bridgeIds.length > 0) {
    const attrValues = await SELECT.from(BridgeAttributeValue)
      .where({ bridge_bridgeId: { in: bridgeIds } });

    // Index by bridgeId → attributeDef_id → value
    const attrIndex = {};
    attrValues.forEach(av => {
      if (!attrIndex[av.bridge_bridgeId]) attrIndex[av.bridge_bridgeId] = {};
      const def = allAttrDefs.find(d => d.id === av.attributeDef_id);
      if (def) {
        attrIndex[av.bridge_bridgeId][def.internalName] = 
          av.valueText ?? av.valueInteger ?? av.valueDecimal ?? av.valueBoolean ?? av.valueDate;
      }
    });

    // Attach to each bridge as _attributes flat map
    bridges = bridges.map(b => ({
      ...b,
      _attributes: attrIndex[b.bridgeId] || {},
      _attributeDefs: allAttrDefs  // include defs so UI knows what to render
    }));
  }

  return bridges;
});
```

### D2 — Frontend: Dynamic Attribute Filters

When the Bridge List filter bar loads, it must call:
```
GET /BridgeService/AttributeDefinitions?$filter=active eq true&$orderby=displayOrder
```

For each attribute definition returned, automatically add a filter control appropriate to its data type:
- Text → text search input
- Integer/Decimal → range inputs (min/max)
- Boolean → toggle switch
- Date → date range picker
- Select → dropdown with the select options

```jsx
function DynamicAttributeFilters({ onFilterChange }) {
  const [attrDefs, setAttrDefs] = useState([]);
  
  useEffect(() => {
    api.get('/BridgeService/AttributeDefinitions?$filter=active eq true&$orderby=displayOrder')
      .then(res => setAttrDefs(res.value));
  }, []);
  
  return attrDefs.map(def => (
    <DynamicFilterControl
      key={def.id}
      definition={def}
      onChange={(value) => onFilterChange(def.internalName, value)}
    />
  ));
}
```

The filter query must translate dynamic attribute filters into a subquery:
```javascript
// When user filters by a dynamic attribute (e.g. floodResponseStatus = 'ACTIVE'):
// Build: SELECT bridgeId FROM BridgeAttributeValue 
//        WHERE attributeDef_id = '{def.id}' AND valueText = 'ACTIVE'
// Then filter Bridges: WHERE bridgeId IN (above subquery)
```

### D3 — Admin: Attribute Configuration Screen

The existing Admin screen manages `BridgeAttributeDefinition`. Extend it:

**For each attribute definition, add:**
- `filterEnabled` (Boolean, default true) — controls whether this attribute appears in filters
- `reportEnabled` (Boolean, default true) — controls whether this attribute appears in reports
- `massEditEnabled` (Boolean, default false) — controls whether this attribute appears as a column in the mass edit grid
- `exportEnabled` (Boolean, default true) — controls whether this attribute appears in CSV exports

**Attribute definition table must be a DataGrid (per Part B)** with:
- Inline active/inactive toggle (no dialog needed for this)
- Drag-to-reorder (sets displayOrder)
- Quick-edit of displayLabel inline
- Full edit via dialog for all other fields

---

## PART E — CONFIGURABLE RESTRICTION TYPES & VEHICLE CLASSES

### E1 — Admin: Restriction Type Configuration

Currently `restrictionType` is a hardcoded enum. Make it configurable.

**New entity: `RestrictionTypeConfig`**
```cds
entity RestrictionTypeConfig {
  key code          : String(30);    // e.g. GROSS_MASS, SEASONAL_FLOOD
      displayLabel  : String(200);   // e.g. "Gross Vehicle Mass"
      unit          : String(20);    // default unit: t / m / km/h
      valueRequired : Boolean;       // false for VEHICLE_TYPE
      description   : String(500);
      sortOrder     : Integer;
      active        : Boolean default true;
      isSystem      : Boolean default false;  // system types cannot be deleted
      createdAt     : DateTime;
      createdBy     : String(100);
}
```

Seed with the existing hardcoded types plus the `isSystem=true` flag. Admins can:
- Add new custom restriction types (e.g. EMERGENCY_CLOSURE, SEASONAL_FLOOD, BRIDGE_WORKS)
- Edit display labels and default units
- Deactivate types (hides from new restriction forms but preserves existing data)
- Cannot delete system types

The restriction form `restrictionType` dropdown must load from this entity via API, not from a hardcoded list.

### E2 — Admin: Vehicle Class Configuration

Similarly, make `vehicleClass` configurable:

**New entity: `VehicleClassConfig`**
```cds
entity VehicleClassConfig {
  key classCode       : String(20);    // e.g. GEN, HML, BD, PBS4
      displayLabel    : String(200);
      maxGVM_t        : Decimal(8,2);
      maxGCM_t        : Decimal(8,2);
      maxLength_m     : Decimal(6,2);
      maxWidth_m      : Decimal(5,2);
      maxHeight_m     : Decimal(5,2);
      permitRequired  : Boolean;
      nhvrRef         : String(1000);
      description     : String(500);
      sortOrder       : Integer;
      active          : Boolean default true;
      isSystem        : Boolean default false;
      createdAt       : DateTime;
      createdBy       : String(100);
}
```

The Vehicle Classes admin screen must use a `DataGrid` with inline editing for the dimensional limits. When a dimension limit changes, add a warning: "Changing vehicle class limits will not retroactively update existing restrictions — existing restrictions will retain their recorded values."

### E3 — Cascade Config Changes to All Filters

When a new `RestrictionTypeConfig` or `VehicleClassConfig` is added, it must automatically appear in:
- Restriction filter dropdowns (vehicle class, restriction type)
- Mass edit column filter dropdowns
- Report filters
- No code deployment required — all driven from data

---

## PART F — FILTER SYSTEM: COMPREHENSIVE & CONSISTENT

### F1 — Universal Filter Architecture

Every filter in every grid must follow this pattern:

```javascript
// FilterState is persisted to localStorage and URL params
// URL: /bridges?state=NSW&condition=POOR,FAIR&scourRisk=HIGH&page=1
// localStorage key: nhvr_bridge_filters

const BRIDGE_FILTER_SCHEMA = [
  // Static core filters
  { key: 'search',          type: 'text',        label: 'Search',           placeholder: 'Bridge ID, name, route...' },
  { key: 'state',           type: 'multiselect', label: 'State',            source: 'static', options: ['NSW','VIC','QLD','WA','SA','TAS','ACT','NT'] },
  { key: 'condition',       type: 'multiselect', label: 'Condition',        source: 'static', options: ['EXCELLENT','VERY_GOOD','GOOD','FAIR','POOR','VERY_POOR','FAILED'] },
  { key: 'postingStatus',   type: 'multiselect', label: 'Status',           source: 'static', options: ['UNRESTRICTED','RESTRICTED','WEIGHT_RESTRICTED','HEIGHT_RESTRICTED','POSTED','CLOSED'] },
  { key: 'scourRisk',       type: 'multiselect', label: 'Scour Risk',       source: 'static', options: ['LOW','MEDIUM','HIGH','CRITICAL'] },
  { key: 'nhvrRouteAssessed', type: 'toggle',    label: 'NHVR Assessed'  },
  { key: 'freightRoute',    type: 'toggle',      label: 'Freight Route'  },
  { key: 'floodImpacted',   type: 'toggle',      label: 'Flood Impacted' },
  { key: 'conditionRating', type: 'range',       label: 'Rating',           min: 1, max: 10 },
  { key: 'yearBuilt',       type: 'range',       label: 'Year Built',       min: 1800, max: new Date().getFullYear() },
  
  // Dynamic attribute filters — loaded at runtime from AttributeDefinitions API
  // { key: 'attr_floodResponseStatus', type: 'multiselect', label: 'Flood Response', source: 'dynamic', attrDefId: '...' }
];
```

**Filter bar UX:**
- Show top 4-6 filters always visible
- [+ More Filters] expands to show all filters including dynamic ones
- [Clear Filters] resets everything
- Filter pill summary: "NSW · FAIR, POOR · Scour: HIGH" shown below filter bar
- Active filter count badge on [Filters] button when collapsed

### F2 — OData Filter Translation

```javascript
// Filter state → OData $filter string
function buildODataFilter(filterState, attrDefs) {
  const clauses = [];

  if (filterState.search) {
    clauses.push(`(contains(tolower(name),'${escape(filterState.search.toLowerCase())}') or contains(bridgeId,'${escape(filterState.search)}'))`);
  }
  if (filterState.state?.length) {
    clauses.push(`state in ('${filterState.state.join("','")}')`);
  }
  if (filterState.condition?.length) {
    clauses.push(`condition in ('${filterState.condition.join("','")}')`);
  }
  if (filterState.conditionRating) {
    if (filterState.conditionRating.min) clauses.push(`conditionRating ge ${filterState.conditionRating.min}`);
    if (filterState.conditionRating.max) clauses.push(`conditionRating le ${filterState.conditionRating.max}`);
  }
  if (filterState.nhvrRouteAssessed === true)  clauses.push(`nhvrRouteAssessed eq true`);
  if (filterState.freightRoute === true)        clauses.push(`freightRoute eq true`);
  if (filterState.floodImpacted === true)       clauses.push(`floodImpacted eq true`);

  // Dynamic attribute filters — handled server-side via custom function
  const dynFilters = Object.entries(filterState)
    .filter(([k]) => k.startsWith('attr_'))
    .map(([k, v]) => ({ internalName: k.replace('attr_',''), value: v }));
  
  if (dynFilters.length > 0) {
    // Add to URL as separate param handled by custom CAP handler
  }

  return clauses.length ? clauses.join(' and ') : '';
}
```

---

## PART G — PRODUCTION QUALITY STANDARDS

### G1 — Code Organisation

```
src/
  components/
    DataGrid/
      DataGrid.jsx          ← universal grid component
      DataGrid.css          ← scoped styles only
      ColumnChooser.jsx
      BulkActions.jsx
      ExportButton.jsx
    FieldRow/
      FieldRow.jsx          ← universal view/edit field component
    ImportPanel/
      ImportPanel.jsx
      ImportPreview.jsx
      columnMappings.js
    MassEditGrid/
      MassEditGrid.jsx
      MassEditToolbar.jsx
      ClipboardPaste.js
    DynamicFilters/
      DynamicFilterControl.jsx
      filterSchemas.js
      filterTranslators.js
    ExternalRefsWidget/
      ExternalRefsWidget.jsx   ← compact (used on overview) + full (used on tab)
  pages/
    BridgeList/
    BridgeDetail/
    MassEdit/
    Admin/
      AttributeConfig/
      RestrictionTypeConfig/
      VehicleClassConfig/
  hooks/
    useFilterState.js         ← URL + localStorage sync
    useDynamicAttributes.js   ← load attr defs, build filter schema
    useDataGrid.js            ← grid state management
  utils/
    api.js                    ← safe fetch (existing)
    odata.js                  ← filter → OData translator
    csvExport.js
    xlsxImport.js
```

### G2 — Security

```javascript
// Every user-entered value that reaches an OData query must be sanitised
function sanitiseODataString(input) {
  if (typeof input !== 'string') return '';
  // Escape single quotes (OData string injection prevention)
  return input.replace(/'/g, "''").replace(/[<>]/g, '');
}

// Never build OData filters by string concatenation with raw user input
// BAD:  `name eq '${userInput}'`
// GOOD: `name eq '${sanitiseODataString(userInput)}'`

// Never expose internal IDs in error messages
// BAD:  `Error updating BridgeAttributeDefinition ${uuid}: ${rawError}`
// GOOD: `Failed to save attribute definition. Contact your administrator if this persists.`

// localStorage keys must be namespaced to avoid conflicts
const LS_PREFIX = 'nhvr_bma_v1_';  // version prefix allows cache invalidation
```

### G3 — Performance

```javascript
// Rule: Never fetch more data than is displayed
// Bridge List: always paginate — default 50, max 200 per page
// Never: GET /BridgeService/Bridges (fetches all records)
// Always: GET /BridgeService/Bridges?$top=50&$skip=0&$count=true&$select=...

// $select must always be specified on list views — never fetch all fields
const BRIDGE_LIST_SELECT = 'bridgeId,name,state,region,condition,conditionRating,postingStatus,nhvrRouteAssessed,inspectionDate,freightRoute,scourRisk,latitude,longitude';

// Dynamic attributes are only fetched on Detail view, not on list
// On list, only show dynamic attributes that are in active column config

// Rule: Debounce search inputs — 300ms delay before triggering API call
const debouncedSearch = useMemo(() => debounce(handleSearch, 300), []);

// Rule: Cache attribute definitions (they change rarely)
// Cache in memory for session; refetch on admin save
const attrDefsCache = { data: null, loadedAt: null };
function getAttrDefs() {
  const TTL = 5 * 60 * 1000; // 5 minutes
  if (attrDefsCache.data && Date.now() - attrDefsCache.loadedAt < TTL) {
    return Promise.resolve(attrDefsCache.data);
  }
  return api.get('/BridgeService/AttributeDefinitions?$filter=active eq true')
    .then(res => { attrDefsCache.data = res.value; attrDefsCache.loadedAt = Date.now(); return res.value; });
}
```

### G4 — Accessibility

```jsx
// Every grid must have:
<table
  role="grid"
  aria-label="Bridge Asset Registry"
  aria-rowcount={totalCount}
  aria-colcount={visibleColumns.length}
>

// Every filter control must have:
<label htmlFor="filter-state">State</label>
<select id="filter-state" aria-label="Filter by state" ...>

// Every action button must have:
<button aria-label={`Edit bridge ${bridge.name}`} title={`Edit ${bridge.name}`}>
  <EditIcon aria-hidden="true" />
</button>

// Sort indicators:
<th aria-sort={sortField === col.key ? sortDir : 'none'}>

// Loading states:
<div role="status" aria-live="polite" aria-label="Loading bridges...">
```

### G5 — Error Boundaries

```jsx
// Wrap every major section in an ErrorBoundary
// so a bug in Dynamic Filters doesn't crash the whole page
<ErrorBoundary fallback={<SectionError section="filters" />}>
  <FilterBar ... />
</ErrorBoundary>

<ErrorBoundary fallback={<SectionError section="grid" />}>
  <DataGrid ... />
</ErrorBoundary>

// SectionError shows a friendly message + retry button
// Not a raw stack trace
function SectionError({ section }) {
  return (
    <div role="alert" className="section-error">
      <p>The {section} section encountered an error.</p>
      <button onClick={() => window.location.reload()}>Reload page</button>
    </div>
  );
}
```

---

## PART H — IMPLEMENTATION SEQUENCE

Execute in this exact order. Each step is independently testable.

```
Phase 1 — Foundation (no visible UI changes yet)
  H1. Add RestrictionTypeConfig and VehicleClassConfig entities to CDS schema
  H2. Seed both with current hardcoded values + isSystem=true
  H3. Add filterEnabled, reportEnabled, massEditEnabled, exportEnabled to BridgeAttributeDefinition
  H4. Build the universal api.js utility (already defined in master prompt — confirm it exists)
  H5. Build the odata.js filter translator
  H6. Deploy schema: cds deploy --to sqlite && cds watch — verify no errors

Phase 2 — Universal Grid (foundational UI component)
  H7. Install grid library (check if already present; use @tanstack/react-table if not)
  H8. Build DataGrid component with sort, search, pagination (no filters yet)
  H9. Apply DataGrid to Bridge List — replace existing table
  H10. Apply DataGrid to Restrictions tab
  H11. Verify: sort works, pagination works, export CSV works

Phase 3 — View/Edit Consistency
  H12. Build FieldRow component
  H13. Audit every tab on Bridge Detail, document all gaps
  H14. Fix Condition tab — all fields visible in view mode
  H15. Fix Attributes tab — dynamic attributes visible in view mode
  H16. Fix External Systems — remove duplicate fields from Edit form;
       add compact ExternalRefsWidget to Overview tab
  H17. Apply FieldRow pattern to all remaining tabs
  H18. Add unsaved-changes warning on navigation

Phase 4 — Filter System
  H19. Build DynamicFilterControl component
  H20. Build useFilterState hook (URL + localStorage sync)
  H21. Apply full filter schema to Bridge List
  H22. Apply filters to Restrictions, Inspections, Defects tabs
  H23. Verify: filters persist across page reload; URL is shareable

Phase 5 — Dynamic Attribute First-Class
  H24. Enhance READ handler to attach _attributes to each Bridge record
  H25. Wire dynamic attributes into filter schema (auto-loaded at runtime)
  H26. Wire dynamic attributes into DataGrid column chooser
  H27. Wire dynamic attributes into CSV export
  H28. Test: add new attribute in Admin → appears in filter bar without restart

Phase 6 — Admin Config Screens
  H29. Replace Admin attribute table with DataGrid (drag-to-reorder)
  H30. Build RestrictionTypeConfig admin screen with DataGrid
  H31. Build VehicleClassConfig admin screen with DataGrid
  H32. Wire restriction form's type dropdown to RestrictionTypeConfig API
  H33. Wire restriction form's vehicle class dropdown to VehicleClassConfig API

Phase 7 — Mass Edit
  H34. Build CSV import/export utilities
  H35. Build ImportPanel component with column-mapping and preview
  H36. Build MassEditGrid with inline editing and clipboard paste
  H37. Add Mass Edit route and menu item (admin/power-user role only)
  H38. Add [Import CSV] to Bridge List toolbar

Phase 8 — QA Pass
  H39. Run full test suite: npm test
  H40. Manual test: UX audit checklist (see Part I)
  H41. Accessibility check: tab through every form, check aria labels
  H42. Performance check: Bridge List with 100+ records — grid renders under 500ms
  H43. Security check: try OData injection in search box — verify sanitisation
```

---

## PART I — QA ACCEPTANCE CHECKLIST

Work through every item. Do not mark DONE until all pass.

```
VIEW/EDIT CONSISTENCY:
  □ Every field in Bridge CDS entity is visible somewhere in view mode
  □ No data is hidden behind the Edit button
  □ Edit mode shows same fields as view mode, converted to input controls
  □ Required fields marked * in both modes
  □ Save + Cancel present at top AND bottom of all forms
  □ Navigating away with unsaved changes triggers a warning dialog
  □ External ref fields removed from Edit form (managed only in External Systems tab)
  □ Overview tab shows compact external refs widget (view only)
  □ Attributes tab shows all dynamic attribute values in view mode

GRIDS:
  □ Bridge List: sort by clicking any column header works
  □ Bridge List: global search filters as you type (debounced 300ms)
  □ Bridge List: column filters work independently
  □ Bridge List: multi-select + bulk actions work
  □ Bridge List: Export CSV exports visible rows with visible columns
  □ Bridge List: pagination works; page size options work
  □ Bridge List: column chooser persists across page reload
  □ Restrictions tab: sort, search, filter all work
  □ Inspections tab: sort, filter all work
  □ Defects tab: sort, filter, NHVR-impact filter all work
  □ History tab: sort, event-type filter, date range filter all work
  □ Admin attribute table: drag-to-reorder updates displayOrder
  □ RestrictionTypeConfig grid: inline active toggle works
  □ VehicleClassConfig grid: dimensional limits editable inline

DYNAMIC ATTRIBUTES:
  □ Add new Text attribute in Admin → appears on Bridge Attributes tab immediately
  □ Add new Select attribute → dropdown appears on Bridge Attributes edit form
  □ New attribute appears in Bridge List filter bar without page reload
  □ New attribute appears in CSV export headers
  □ New attribute with filterEnabled=false does NOT appear in filter bar
  □ Setting active=false on attribute def hides it from all forms and filters
    (but existing data is not deleted)

RESTRICTION TYPE CONFIG:
  □ Add new restriction type 'EMERGENCY_CLOSURE' in Admin
  □ Open Add Restriction dialog → new type appears in dropdown
  □ Deactivate 'WIND_SPEED' type → no longer appears in Add Restriction dropdown
  □ Existing WIND_SPEED restrictions still display correctly (data preserved)

VEHICLE CLASS CONFIG:
  □ Add new vehicle class 'DOLLY' with limits in Admin
  □ Open Add Restriction dialog → DOLLY appears in vehicle class dropdown
  □ Modify GEN maxGVM → warning shown → confirm → value saved

MASS EDIT:
  □ Mass Edit grid loads with 50 rows default, pagination works
  □ Click a cell → becomes editable inline
  □ Edit multiple cells → [Save Changes (N)] shows count of dirty rows
  □ Save → changed rows PATCH to API; unchanged rows NOT sent
  □ Validation error in one row → that row stays dirty; others save
  □ [Import CSV] → column mapping step shows → preview step shows → import runs
  □ Import with duplicate bridgeId → UPDATE (PATCH) existing record
  □ Import with new bridgeId → CREATE (POST) new record
  □ Import with validation error row → row listed in error summary; others imported

FILTER PERSISTENCE:
  □ Set state=NSW, condition=POOR in filter bar → reload page → filters restored
  □ Copy URL with filters → paste in new tab → same filters applied
  □ [Clear Filters] → all filters reset → URL cleared

SECURITY:
  □ Search box: enter "'; DROP TABLE bridges; --" → no error, graceful empty result
  □ Search box: enter "<script>alert(1)</script>" → rendered as plain text, not executed
  □ Import CSV: upload non-CSV file → friendly error, no crash
  □ Import CSV: upload CSV with 10,000 rows → server rejects with 413/400, client shows error

ACCESSIBILITY:
  □ Tab through Bridge List: every interactive element reachable by keyboard
  □ Screen reader: grid headers have aria-sort; cells have appropriate roles
  □ All filter inputs have associated labels
  □ All icon-only buttons have aria-label or title
  □ Error messages use role="alert"
```

---

## PART J — BACKEND ADDITIONS ONLY IF NOT ALREADY PRESENT

Add these to `srv/bridge-service.js` only if they don't exist:

```javascript
// Mass import action — handles the batch from ImportPanel
this.on('batchUpsertBridges', async (req) => {
  const { records } = req.data;
  if (!Array.isArray(records) || records.length === 0)
    return req.error(400, 'records array is required and must not be empty');
  if (records.length > 500)
    return req.error(400, 'Maximum 500 records per batch. Split into smaller batches.');

  const db = await cds.connect.to('db');
  const { Bridge } = db.entities('au.gov.bridges');
  const results = { created: [], updated: [], failed: [] };

  for (const record of records) {
    try {
      // Validate
      if (!record.bridgeId) throw new Error('bridgeId is required');
      if (!record.name)     throw new Error('name is required');
      if (!record.state)    throw new Error('state is required');

      const existing = await SELECT.one.from(Bridge).where({ bridgeId: record.bridgeId });
      if (existing) {
        await UPDATE(Bridge).set(record).where({ bridgeId: record.bridgeId });
        results.updated.push(record.bridgeId);
      } else {
        await INSERT.into(Bridge).entries(record);
        results.created.push(record.bridgeId);
      }
    } catch (err) {
      results.failed.push({ bridgeId: record.bridgeId, error: err.message });
    }
  }
  return results;
});

// Template generator — always includes active dynamic attributes
this.on('getBridgeImportTemplate', async () => {
  const db = await cds.connect.to('db');
  const { BridgeAttributeDefinition } = db.entities('au.gov.bridges');
  const attrDefs = await SELECT.from(BridgeAttributeDefinition)
    .where({ active: true, exportEnabled: true })
    .orderBy('displayOrder');

  const staticFields = [
    'bridgeId','name','region','state','lga','roadRoute','routeNumber',
    'assetOwner','condition','conditionRating','postingStatus','structureType',
    'material','clearanceHeightM','spanLengthM','latitude','longitude',
    'yearBuilt','nhvrRouteAssessed','freightRoute','scourRisk','remarks'
  ];
  const dynFields = attrDefs.map(d => `attr_${d.internalName}`);
  const allFields = [...staticFields, ...dynFields];

  // Return as CSV string with header row + example row
  const header = allFields.join(',');
  const example = [
    'NSW-BRG-XXX','Bridge Name','Region','NSW','LGA','Pacific Motorway','M1',
    'Transport for NSW','GOOD','7','UNRESTRICTED','BOX_GIRDER','Prestressed Concrete',
    '5.0','100.0','-33.8696','151.1897','1985','TRUE','TRUE','LOW','Add notes here',
    ...attrDefs.map(() => '')
  ].join(',');

  return { csv: `${header}\n${example}`, fields: allFields };
});
```

---

## IMPORTANT: IMPLEMENTATION PRINCIPLES

1. **Read before writing.** Understand every existing component before modifying it.

2. **One grid library, used everywhere.** Do not mix table implementations. Pick one and apply it consistently to all tables in the app.

3. **One filter state pattern, used everywhere.** `useFilterState` hook, URL sync, localStorage persist — applies to Bridge List, all tabs, all admin screens.

4. **Dynamic attributes are data, not code.** Never hardcode attribute names in filter schemas, export functions, or display logic. Always derive from the API.

5. **Batch operations are bounded.** Import/mass edit capped at 500 records per operation. Server enforces this. Client shows a clear error if exceeded.

6. **Config changes are non-destructive.** Deactivating a restriction type or vehicle class hides it from new forms. It never deletes existing data that uses that type.

7. **No inline styles.** All styling via CSS classes or the existing styling system. No `style={{...}}` on any element.

8. **No console.log in committed code.** Use a proper logger or remove debug statements before committing.

9. **Every API call goes through api.js.** No raw fetch() anywhere except in api.js itself.

10. **Test after every phase.** `npm test` must pass at the end of each phase before moving to the next.

---
*NHVR Bridge Management Application — QA, UX & Power-User Enhancement Prompt*
*App: `/Users/siddharthaampolu/21 NHVR APP`*
*Hastha Solutions Pty Ltd — ABN 11 159 623 739*
