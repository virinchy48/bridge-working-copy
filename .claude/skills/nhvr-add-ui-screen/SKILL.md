---
name: nhvr-add-ui-screen
description: Add a new UI5 screen (view + controller) to the NHVR app. Use when the user asks to add a new page, screen, dashboard, list view, detail view, or route. Covers view/controller pair, manifest route+target, i18n keys, fragment reuse, role-based visibility, and the silent UI5 traps that cause blank pages.
---

# Add a UI5 Screen

## Files you touch

| File | Purpose |
|---|---|
| `app/bridge-management/webapp/view/<Name>.view.xml` | View definition |
| `app/bridge-management/webapp/controller/<Name>.controller.js` | Logic |
| `app/bridge-management/webapp/manifest.json` | Route + target entry |
| `app/bridge-management/webapp/i18n/i18n.properties` | All user-visible strings — **never hardcode** |

Mirror sync to `app-router/resources/nhvr.bridgemanagement/` and `app-router/resources/webapp/` is **automatic** via the PostToolUse hook (`scripts/sync-ui-mirror.sh`). Do not manually copy.

## Controller skeleton

```js
sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "nhvr/bridgemanagement/model/RoleManager",
  "nhvr/bridgemanagement/util/AuthFetch"
], function (Controller, RoleManager, AuthFetch) {
  "use strict";
  return Controller.extend("nhvr.bridgemanagement.controller.<Name>", {
    onInit: function () {
      // bind model, register events
    },
    _credOpts: function () { return AuthFetch.credOpts(); }
  });
});
```

Every `fetch()` **must** use `_credOpts()` (AuthFetch wrapper) or it gets 401 on auth-required endpoints.

## Navigation

- To BridgeDetail: `this.getOwnerComponent().getRouter().navTo("BridgeDetail", { bridgeId: obj.bridgeId })` — use **business code**, never the UUID `ID`.
- To PermitDetail: same pattern via `permitId`.

## Role-based visibility

Never inline `if (isAdmin) {...}`. Use:
```js
RoleManager.applyFields(dialogOrView, "<DialogOrViewId>");
```
Field-level RBAC config lives in `RoleConfig` rows (via AdminConfig UI) and fallback in `webapp/config/RoleFallback.js`.

## Silent-failure traps (all cause blank white page or runtime errors with no stacktrace)

1. **`IconTabBar overflow="Select"`** — deprecated in UI5 1.133+, causes a **blank white page with no console error**. Do not set it.
2. **`Avatar size="..."`** — wrong property. Use `displaySize`.
3. **`GenericTile tileContent=""`** as attribute — wrong. Use the `<tileContent>` aggregation:
   ```xml
   <GenericTile ...>
     <tileContent>
       <TileContent>...</TileContent>
     </tileContent>
   </GenericTile>
   ```
4. **Fragments with `IconTabBar` children** — need an explicit `<items>` aggregation wrapper.
5. **Inline `style="flex:1"`** — not supported. Use CSS class `nhvrFlexGrow1` (already in `webapp/css/style.css`).
6. **Raw `<Button>` in ShellBar `additionalContent`** — must be `<OverflowToolbarButton>` (implements `sap.f.IShellBar`).

## Reuse before you write

Check `webapp/view/fragments/` for `ConfirmDialog`, `EmptyState`, `StatCard`, `FieldWithHelp`, `ScreenGuide`, `HelpAssistant` — use these, don't roll your own dialog/empty-state/tile.

For export, use `webapp/util/CsvExport.js` or `ExcelExport.js`. For offline drafts: `DraftManager.js`. For saved filter views: `NamedViews.js`.

## i18n

Key style: `<screen>.<element>.<purpose>`, e.g. `bridges.filter.applyBtn`. One property per string. Never concatenate user-visible strings in JS.

## Test

Add `test/unit/<name>-controller.unit.test.js`. At minimum cover `onInit`, route params, and any auth-fetch calls.

## References
- Module map: `CLAUDE.md` §4.1, §4.3
- Silent-failure patterns: `CLAUDE.md` §6.1
- Controller index: `app/bridge-management/webapp/controller/README.md`
