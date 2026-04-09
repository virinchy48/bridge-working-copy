# webapp/controller — UI5 controllers

One controller per view. View files live in `../view/<Name>.view.xml`.

> **Mirror sync reminder**: after editing any file in `app/bridge-management/webapp/`, both `app-router/resources/nhvr.bridgemanagement/` and `app-router/resources/webapp/` MUST stay in sync. Run `npm run sync-ui:all` after any UI edits.

## Controller → backend handler map

| Controller | View | Primary entity | Backend handler |
|---|---|---|---|
| `Home` | `Home.view.xml` | (dashboard aggregate) | `bridges.js`, `reports.js`, `notifications.js` |
| `Dashboard` | `Dashboard.view.xml` | (KPI tiles) | `reports.js` |
| `Bridges` | `Bridges.view.xml` | `Bridge` | `bridges.js` |
| `BridgeDetail` | `BridgeDetail.view.xml` | `Bridge` | `bridges.js` |
| `BridgeForm` | `BridgeForm.view.xml` | `Bridge`, `BridgeAttribute` | `bridges.js`, `attributes.js` |
| `Restrictions` | `Restrictions.view.xml` | `Restriction` | `restrictions.js`, `restriction-feed.js` |
| `InspectionDashboard` | `InspectionDashboard.view.xml` | `InspectionOrder` | `inspections.js` |
| `InspectionCreate` | `InspectionCreate.view.xml` | `InspectionRecord` | `inspections.js` |
| `Defects` | `Defects.view.xml` | `BridgeDefect` | `bridges.js` |
| `WorkOrders` | `WorkOrders.view.xml` | `BridgeDefect` | `bridges.js` |
| `Permits` | `Permits.view.xml` | `Permit` | `bridges.js` |
| `PermitRegisterReport` | `PermitRegisterReport.view.xml` | `Permit` | `reports.js` |
| `FreightRoutes` | `FreightRoutes.view.xml` | `FreightRoute` | `routing-engine.js` |
| `FreightRouteDetail` | `FreightRouteDetail.view.xml` | `FreightRoute` | `routing-engine.js` |
| `RouteAssessment` | `RouteAssessment.view.xml` | `ApprovedRoute` | `routing-engine.js`, `geo.js` |
| `RoutePlanner` | `RoutePlanner.view.xml` | `ApprovedRoute` | `routing-engine.js` |
| `VehicleCombinations` | `VehicleCombinations.view.xml` | `VehicleClass`, `VehicleCombination` | `bridges.js` |
| `MapView` | `MapView.view.xml` | Bridges + Restrictions | `geo.js` |
| `MassUpload` | `MassUpload.view.xml` | `Bridge`, `UploadLog` | `upload.js` |
| `MassEdit` | `MassEdit.view.xml` | `Bridge` | `bridges.js` |
| `Reports` | `Reports.view.xml` | (report projections) | `reports.js` |
| `AnalyticsDashboard` | `AnalyticsDashboard.view.xml` | (analytics) | `analytics-report.js` |
| `AnnualConditionReport` | `AnnualConditionReport.view.xml` | `Bridge` | `reports.js` |
| `DataQuality` | `DataQuality.view.xml` | (DQ checks) | `data-quality.js` |
| `AdminConfig` | `AdminConfig.view.xml` | `AttributeDefinition`, `RoleConfig`, `Lookup` | `attributes.js`, `system.js` |
| `AdminRestrictionTypes` | `AdminRestrictionTypes.view.xml` | `RestrictionTypeConfig` | `system.js` |
| `AdminVehicleTypes` | `AdminVehicleTypes.view.xml` | `VehicleType` | `system.js` |
| `AppAdmin` | `AppAdmin.view.xml` | `RoleConfig` + system | `system.js` |
| `BmsTechAdmin` | `BmsTechAdmin.view.xml` | System config | `system.js` |
| `LicenseConfig` | `LicenseConfig.view.xml` | License metadata | `system.js` |
| `IntegrationHub` | `IntegrationHub.view.xml` | — | `srv/integration/handlers.js` |

## Controller conventions

- **onInit()** — bind models, register event handlers, apply `RoleManager.applyFields(view, "ScreenKey")`.
- **Auth-aware fetch** — every `fetch()` must use `_credOpts()` (from `util/AuthFetch.js`) or it will 401.
- **Nav** — use named routes: `this.getOwnerComponent().getRouter().navTo("BridgeDetail", { bridgeId: obj.bridgeId })`. Never pass UUID.
- **Reusable dialogs** — check `view/fragments/*` before writing new: `ConfirmDialog`, `EmptyState`, `StatCard`, `FieldWithHelp`, `ScreenGuide`, `HelpAssistant`.
- **Mixins** — compose with `HelpAssistantMixin`, `AnalyticsMixin`, `AlvToolbarMixin` instead of copy-paste.
- **i18n** — all user-visible strings via `this.getResourceBundle().getText("key")`.
- **Exports** — use `util/CsvExport.js` / `ExcelExport.js`, never roll your own.
- **Saved views** — use `util/NamedViews.js` for cross-module saved filter presets.

## Adding a new screen

1. Create `view/<Name>.view.xml` + `controller/<Name>.controller.js`
2. Register route in `webapp/manifest.json` (routes + targets)
3. Add i18n keys to `webapp/i18n/i18n.properties`
4. Add role entry to `RoleManager` fallback if access-gated
5. Add row to the table above
6. Mirror sync (automatic via hook, or `npm run sync-ui`)
