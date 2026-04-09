---
name: nhvr-debug-ui5
description: Triage a blank UI5 page, 401 error, HTTP 400 on CRUD, broken navigation, or other silent failure in the NHVR Bridge App UI. Use when the user reports "page is blank", "nothing renders", "401 on fetch", "nav doesn't work", "getting HTTP 400", "deep link broken", "stale UI after deploy", or any symptom that looks like a UI5 control trap.
---

# NHVR UI5 Triage — Silent Failures

These 11 gotchas cause symptoms with no useful error. Always check these before opening the debugger.

## Symptom: Blank white page

1. **`IconTabBar` has `overflow="Select"`** — deprecated in UI5 1.133+, renders nothing, no console error.
   ```bash
   grep -rn 'IconTabBar.*overflow' app/bridge-management/webapp/view/
   ```
   Fix: remove the attribute.

2. **Stale UI after BTP deploy** — source edited, but `app-router/resources/nhvr.bridgemanagement/` and/or `app-router/resources/webapp/` are out of sync. The PostToolUse hook should handle this automatically; if drift exists, run `npm run sync-ui:all`.

3. **Fragment missing `<items>` wrapper** around `IconTabBar` children — renders blank.

## Symptom: 401 Unauthorized on fetch

- Controller fetch call **must** use `_credOpts()` (AuthFetch wrapper). Find the call:
  ```bash
  grep -rn 'fetch(' app/bridge-management/webapp/controller/ | grep -v _credOpts
  ```
  Fix: wrap as `fetch(url, this._credOpts())`.

## Symptom: HTTP 400 on CRUD with unhelpful message

1. **Wrong field name on `BridgeDefect`** — must be `detectedDate` (NOT `reportedDate`), `closedDate`, `severity`, `defectCode`. Wrong name → 400 with no hint.
2. **Missing `key` on a CDS projection** — CDS v9 strict, v8 was lenient. `grep -n "key " srv/service.cds` around the projection.
3. **Action/annotation outside an `extend service` block** in `srv/service.cds` — invisible to OData. There are **4 blocks**:
   ```bash
   grep -n "extend service" srv/service.cds
   ```
4. **Bare CDS namespace** — `compliance.XYZ` instead of `nhvr.compliance.XYZ` fails to compile.

## Symptom: Navigation broken / "record not found" on deep link

- `navTo("BridgeDetail", { bridgeId: ... })` **must** use the business code, **never** the UUID `ID`. Same for `PermitDetail` via `permitId`.
  ```bash
  grep -rn 'navTo.*BridgeDetail\|navTo.*PermitDetail' app/bridge-management/webapp/controller/
  ```

## Symptom: JSON.parse error / "Cannot read property of undefined" on OData response

- **LargeString unwrap** — CAP returns LargeString columns as a JSON string inside the response:
  ```js
  const data = typeof resp.value === "string" ? JSON.parse(resp.value) : resp.value;
  ```

## Symptom: Map selection doesn't appear in list (or vice versa)

- `MapView` writes **two** localStorage keys: `nhvr_map_selection` (Bridges) and `nhvr_map_restriction_selection` (Restrictions). Each consumer reads **and deletes** its own key (5-min TTL). Check both the writer (MapView) and the reader (Bridges.controller.js or Restrictions.controller.js) are using the correct key.

## Symptom: UI5 console warning "multiple aggregates defined for aggregation title 0..1"

- Known pre-existing warning, not in any XML view — likely a JS-constructed `sap.m.Title`. Parked in backlog.

## Symptom: `GenericTile` / `Avatar` not rendering correctly

- `Avatar` → use `displaySize` (not `size`)
- `GenericTile` → use `<tileContent>` **aggregation**, never `tileContent=""` attribute
- Never use inline `style="flex:1"` — use CSS class `nhvrFlexGrow1`

## Symptom: ShellBar button not appearing

- Raw `<Button>` in `additionalContent` silently drops. Must be `<OverflowToolbarButton>` (implements `sap.f.IShellBar`).

## Diagnostic quickstart

```bash
# Is the mirror in sync?
npm run verify:mirror

# Does CDS compile cleanly?
npx cds compile srv/ --to sql > /dev/null

# Do unit tests still pass?
npm run test:unit

# Check BTP runtime state
cf apps
cf logs nhvr-bridge-srv --recent | tail -50
```

## References
- Full gotcha list: `CLAUDE.md` §6.1 (18 entries)
- Memory: `MEMORY.md` Critical Patterns section
