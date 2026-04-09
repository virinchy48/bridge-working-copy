# NHVR Bridge Management — WCAG 2.1 AA Accessibility Self-Assessment

> **IMPORTANT NOTICE**
> This document is a **self-assessment** conducted through static code review and manual inspection
> of the application source. It is NOT a substitute for a formal accessibility audit. A **WCAG audit
> by an accredited accessibility specialist** (e.g., Intopia, Deque, or an AGIMO-recognised provider)
> is required before this application is deployed in a government context or made available to users
> with disabilities.

---

| Field | Value |
|-------|-------|
| Application | NHVR Bridge Asset & Restriction Management |
| Version | 3.2.1 |
| Assessment Date | 2026-03-30 |
| Standard | WCAG 2.1 Level AA |
| Assessor | Internal development team (self-assessment) |
| UI Framework | SAP UI5 1.120+ with SAP Horizon Theme |
| Scope | All 19 application views; critical user journeys: Home, Bridge List, Bridge Detail, Inspections, Map View, Admin Config |
| Assessment Method | Static code review (XML views, CSS, controllers); SAP UI5 accessibility documentation review |

---

## 1. Assessment Scope

### 1.1 Application Description
The NHVR Bridge Management application is a SAP UI5 Freestyle web application used exclusively by internal NHVR staff and authorised contractors. It is not a public-facing citizen service. However, as a government agency system, NHVR has obligations under the:
- **Disability Discrimination Act 1992 (Cth)**
- **Web Accessibility National Transition Strategy** (AGIMO)
- **Digital Service Standard** (DTAS Criterion 9: Make it accessible)

The application must meet WCAG 2.1 Level AA as a minimum.

### 1.2 Views in Scope
Home, Bridges (list), BridgeDetail (8-tab object page), InspectionDashboard, InspectionCreate, Defects, Permits, WorkOrders, Reports, ExecutiveDashboard, MapView, RouteAssessment, FreightRoutes, MassEdit, MassUpload, AdminConfig, AdminRestrictionTypes, AdminVehicleTypes, VehicleCombinations.

### 1.3 SAP UI5 Accessibility Foundation
SAP UI5 1.120+ with the **SAP Horizon theme** provides a built-in accessibility foundation:
- Controls implement WAI-ARIA 1.1 roles, states, and properties automatically
- Keyboard navigation is built into all standard controls (`sap.m`, `sap.ui.layout`, `sap.ui.comp`)
- High-contrast themes (SAP High Contrast Black, SAP High Contrast White) are available as alternate themes
- Font size scaling via browser zoom is supported
- Screen reader support tested with JAWS (Windows) and VoiceOver (macOS) by SAP

Where a criterion is rated PASS based on the SAP UI5 framework, this should be verified in a live environment with assistive technology.

---

## 2. WCAG 2.1 AA Criteria Checklist

### Principle 1 — Perceivable

#### 1.1 Text Alternatives

| Criterion | Level | Result | Evidence / Notes |
|-----------|-------|--------|-----------------|
| 1.1.1 Non-text Content | AA | PARTIAL PASS | SAP UI5 icons in `sap.ui.core.Icon` render with `aria-label` derived from the icon name by the framework. Custom `sap.m.GenericTile` tiles on Home view use `header` and `subheader` properties which are read by screen readers. **Issue**: Emoji characters used in role selector labels (🔑 Admin, 🏗 Bridge Manager, 🔍 Inspector) in `Home.controller.js` are not announced meaningfully by screen readers — see Known Issue #1. |

#### 1.2 Time-based Media

| Criterion | Level | Result | Evidence / Notes |
|-----------|-------|--------|-----------------|
| 1.2.1 Audio-only and Video-only (Prerecorded) | A | N/A | No audio or video content in the application. |
| 1.2.2 Captions (Prerecorded) | A | N/A | No video content. |
| 1.2.3 Audio Description or Media Alternative | A | N/A | No video content. |
| 1.2.4 Captions (Live) | AA | N/A | No live media. |
| 1.2.5 Audio Description (Prerecorded) | AA | N/A | No video content. |

#### 1.3 Adaptable

| Criterion | Level | Result | Evidence / Notes |
|-----------|-------|--------|-----------------|
| 1.3.1 Info and Relationships | A | PASS | SAP UI5 `sap.m.Label` controls use `labelFor` property to associate labels with input fields in forms. `sap.m.Table` columns have `header` text. List items use semantic structure. Form containers use `sap.ui.layout.form.SimpleForm` and `sap.ui.layout.form.Form` with proper label bindings. |
| 1.3.2 Meaningful Sequence | A | PASS | SAP UI5 renders DOM in logical reading order matching visual order. No CSS `position: absolute` reordering of form content observed in `style.css`. |
| 1.3.3 Sensory Characteristics | A | PASS | Instructions do not rely on shape, size, visual location, or sound. Filter controls labelled by text, not colour alone. |
| 1.3.4 Orientation | AA | PASS | Application is not locked to a single orientation. SAP UI5 responsive containers (`sap.m.FlexBox`, `sap.ui.layout.Grid`) reflow for landscape/portrait. |
| 1.3.5 Identify Input Purpose | AA | PARTIAL PASS | Standard login form handled by SAP XSUAA IdP (outside application scope). Application forms do not use `autocomplete` attributes on fields — SAP UI5 `sap.m.Input` does not natively expose `autocomplete` binding in XML views at this version. |

#### 1.4 Distinguishable

| Criterion | Level | Result | Evidence / Notes |
|-----------|-------|--------|-----------------|
| 1.4.1 Use of Color | A | PASS | Status indicators (bridge condition, restriction status) use both colour and text label. E.g., `sap.m.ObjectStatus` renders both a colour state and a text value. No information conveyed by colour alone was identified. |
| 1.4.2 Audio Control | A | N/A | No audio content. |
| 1.4.3 Contrast (Minimum) | AA | PASS (framework) | SAP Horizon theme is designed to meet WCAG 4.5:1 contrast ratio for normal text and 3:1 for large text. Custom `style.css` uses white text (`#fff`) on the Home header gradient (`#0070F2` to `#0040B0`). Calculated contrast ratio of white (#FFFFFF) on #0070F2 (SAP brand blue) is approximately 4.6:1 — passes AA. Custom CSS `rgba(255,255,255,0.85)` on the same blue gradient yields approximately 4.0:1 — marginally borderline; **flag for formal audit**. |
| 1.4.4 Resize Text | AA | PASS | SAP UI5 uses relative font units (`rem`, `em`). Custom CSS in `style.css` uses `rem` and `em` units for font sizes. Browser zoom up to 200% is supported. No `font-size` set in `px` that would prevent scaling observed in the first 50 lines of `style.css`. |
| 1.4.5 Images of Text | AA | PASS | No images of text identified. All text is rendered as DOM text or SAP icon font. |
| 1.4.10 Reflow | AA | PASS | `style.css` includes a `@media (max-width: 767px)` responsive block (v3.2.0 mobile enhancement). SAP UI5 responsive containers handle reflow at 320px width. |
| 1.4.11 Non-text Contrast | AA | PASS (framework) | SAP Horizon theme provides 3:1 contrast for UI component boundaries (buttons, inputs, focus indicators). Custom tile styles use solid background colours with sufficient contrast. |
| 1.4.12 Text Spacing | AA | PASS | Application does not override line-height, letter-spacing, or word-spacing in ways that would prevent user stylesheet overrides. |
| 1.4.13 Content on Hover or Focus | AA | PASS | Tooltip content via `sap.m.Button` `tooltip` property is dismissable and persistent on hover. No custom hover-only content identified that would trap users. |

---

### Principle 2 — Operable

#### 2.1 Keyboard Accessible

| Criterion | Level | Result | Evidence / Notes |
|-----------|-------|--------|-----------------|
| 2.1.1 Keyboard | A | PARTIAL PASS | All SAP UI5 standard controls are fully keyboard-navigable (Tab, Arrow keys, Enter, Space, Escape). **Known Issue**: The Leaflet map in `MapView.view.xml` is a `<HBox>` containing a plain `<div id="nhvr-map">` rendered by Leaflet.js. Leaflet map controls (zoom buttons, layer selector) are partially keyboard-accessible, but individual bridge markers and clustering controls cannot be accessed via keyboard. No keyboard-accessible alternative view (e.g., a data table of mapped bridges) is provided. See Known Issue #3. |
| 2.1.2 No Keyboard Trap | A | PASS | Modal dialogs (`sap.m.Dialog`) in SAP UI5 manage focus correctly — focus is trapped within the dialog and released on close. No infinite keyboard traps observed. |
| 2.1.3 Keyboard (No Exception) | AAA | NOT TESTED | Out of scope for AA assessment. |
| 2.1.4 Character Key Shortcuts | A | PASS | No single-character keyboard shortcuts implemented. |

#### 2.2 Enough Time

| Criterion | Level | Result | Evidence / Notes |
|-----------|-------|--------|-----------------|
| 2.2.1 Timing Adjustable | A | PARTIAL PASS | Application session timeout is 15 minutes (xs-app.json). SAP App Router does not provide a warning before session expiry — the user is redirected to the XSUAA login page without notification. WCAG 2.2.1 requires the user to be warned at least 20 seconds before a timed session ends. **Issue**: No session expiry warning dialog implemented. |
| 2.2.2 Pause, Stop, Hide | A | PASS | No auto-updating content (carousels, auto-advancing tabs). KPI tiles refresh on page load only. |

#### 2.3 Seizures and Physical Reactions

| Criterion | Level | Result | Evidence / Notes |
|-----------|-------|--------|-----------------|
| 2.3.1 Three Flashes or Below Threshold | A | PASS | No flashing or animation content identified. CSS transitions are limited to subtle hover effects. |

#### 2.4 Navigable

| Criterion | Level | Result | Evidence / Notes |
|-----------|-------|--------|-----------------|
| 2.4.1 Bypass Blocks | A | FAIL | No skip navigation link is present on any view. On the Home view, a keyboard user must Tab through all header controls (theme toggle, role selector, notification bell) before reaching the main tile content. SAP UI5 `sap.m.Shell` provides a built-in skip-navigation mechanism but the application uses a custom `sap.m.Page` layout without a skip link. See Known Issue #2. |
| 2.4.2 Page Titled | A | PASS | The browser tab title reflects the application name via `sap.m.Shell` or the `title` property of the root `sap.m.App`. Each view sets a meaningful page title via `sap.m.Page title` property. |
| 2.4.3 Focus Order | A | PASS | SAP UI5 renders controls in DOM order matching visual layout. Tab order follows a logical top-left to bottom-right sequence. Dialogs receive focus on open and return focus to the triggering element on close. |
| 2.4.4 Link Purpose (In Context) | A | PASS | `sap.m.Link` controls in the Bridges list (Bridge ID deep-link) include the bridge ID as link text, which is meaningful in context. |
| 2.4.5 Multiple Ways | AA | PASS | The application provides: a Home launchpad for top-level navigation, a breadcrumb trail within the bridge detail page, and direct URL navigation via App Router routes. |
| 2.4.6 Headings and Labels | AA | PASS | Views use `sap.m.Title` and `sap.m.Label` controls with descriptive text. Form groups in `BridgeDetail.view.xml` use `sap.ui.layout.form.FormContainer title` properties to create labelled sections. |
| 2.4.7 Focus Visible | AA | PASS | SAP Horizon theme provides a visible focus ring (blue outline) on all focusable controls, meeting the 3:1 contrast requirement. |

#### 2.5 Input Modalities

| Criterion | Level | Result | Evidence / Notes |
|-----------|-------|--------|-----------------|
| 2.5.1 Pointer Gestures | A | PASS | No multipoint or path-based gestures required. All map interactions (zoom, pan) have single-pointer alternatives (zoom buttons). |
| 2.5.2 Pointer Cancellation | A | PASS | SAP UI5 button actions fire on `mouseup`/`pointerup`, not `mousedown`. Click-away cancellation is supported. |
| 2.5.3 Label in Name | A | PASS | Visible button labels match or are contained within the accessible name. Icon-only buttons include `tooltip` properties for accessible name. |
| 2.5.4 Motion Actuation | A | PASS | No device motion or shake gestures used. |

---

### Principle 3 — Understandable

#### 3.1 Readable

| Criterion | Level | Result | Evidence / Notes |
|-----------|-------|--------|-----------------|
| 3.1.1 Language of Page | A | PASS | `manifest.json` sets `"language": "en"`. The root HTML rendered by SAP UI5 includes `lang="en"`. |
| 3.1.2 Language of Parts | AA | PASS | Application is English-only. No mixed-language content. |

#### 3.2 Predictable

| Criterion | Level | Result | Evidence / Notes |
|-----------|-------|--------|-----------------|
| 3.2.1 On Focus | A | PASS | No context changes triggered on focus. |
| 3.2.2 On Input | A | PASS | Form submission requires explicit user action (Save/Submit button). No auto-submit on field change. |
| 3.2.3 Consistent Navigation | AA | PASS | The Home launchpad provides consistent top-level navigation. Navigation controls appear in the same location across views (toolbar at top). |
| 3.2.4 Consistent Identification | AA | PASS | Icons and controls with the same function use consistent labels and icons across views (e.g., the filter button always uses `sap-icon://filter`). |

#### 3.3 Input Assistance

| Criterion | Level | Result | Evidence / Notes |
|-----------|-------|--------|-----------------|
| 3.3.1 Error Identification | A | PASS | SAP UI5 `sap.m.Input` with `valueState="Error"` and `valueStateText` displays inline error messages in red with descriptive text. CAP backend validation errors are surfaced via `sap.m.MessageBox.error()`. |
| 3.3.2 Labels or Instructions | A | PASS | All form fields in bridge creation, restriction, and inspection forms are associated with `sap.m.Label` controls via `labelFor`. Mandatory fields are marked with `required="true"` which renders a visual asterisk. |
| 3.3.3 Error Suggestion | AA | PASS | Validation error messages in service.js (e.g., "Condition score must be between 0 and 100") provide corrective guidance. These are displayed to the user via MessageBox. |
| 3.3.4 Error Prevention (Legal, Financial, Binding) | AA | PARTIAL PASS | Bridge closure and restriction operations display confirmation dialogs before committing. **Issue**: The MassEdit batch commit does not have a confirmed preview-and-diff step for all code paths (the preview fragment exists but coverage of all field types was not verified). |

---

### Principle 4 — Robust

#### 4.1 Compatible

| Criterion | Level | Result | Evidence / Notes |
|-----------|-------|--------|-----------------|
| 4.1.1 Parsing | A | PASS | XML views are processed by SAP UI5 and rendered as valid HTML. No manual DOM manipulation that could produce malformed HTML was identified. |
| 4.1.2 Name, Role, Value | A | PASS (framework) | SAP UI5 controls automatically set appropriate ARIA roles, states, and properties. `sap.m.Table` renders as `role="grid"`. `sap.m.Button` renders as `role="button"`. `sap.m.Input` renders as `role="textbox"` with `aria-required` and `aria-invalid` attributes bound to `required` and `valueState` properties respectively. Custom `sap.m.GenericTile` tiles expose title and subtitle text to screen readers. |
| 4.1.3 Status Messages | AA | PARTIAL PASS | Success messages after save operations are displayed via `sap.m.MessageToast`, which renders as a `role="status"` live region in SAP UI5 1.120+. Error messages use `sap.m.MessageBox` (modal dialog — announced by screen readers). However, async loading indicators (`sap.m.BusyIndicator`) do not always announce completion to screen reader users. |

---

## 3. Known Issues

### Issue #1 — Emoji Characters in Role Selector (WCAG 1.1.1 — FAIL)
**Location**: `Home.controller.js` — role selector SegmentedButton items; `RoleManager.js` fallback config labels.
**Description**: Role labels displayed in the UI include emoji characters (e.g., `🔑 Admin`, `🏗 Bridge Manager`, `🔍 Inspector`, `👁 Viewer`, `📊 Executive`, `🔧 Operator`). Screen readers (NVDA, JAWS, VoiceOver) announce emoji as their Unicode description (e.g., "key emoji", "building construction emoji"), which is confusing and not meaningful in this context.
**Impact**: Users of screen readers receive misleading announcements for role selection controls.
**Severity**: MODERATE — Affects role selection, which is an optional UI filter in the header; the underlying XSUAA role is authoritative.
**Recommended Fix**: Remove emoji from role labels. Use SAP UI5 icons with `tooltip` as visual decoration if needed, keeping the label text clean (e.g., "Admin", "Bridge Manager"). Alternatively, wrap emoji in `aria-hidden="true"` spans — this is not directly possible in SAP UI5 XML view item text properties without custom rendering.
**Target**: Resolved before government accessibility certification.

### Issue #2 — No Skip Navigation Link (WCAG 2.4.1 — FAIL)
**Location**: All views — `Home.view.xml` and all navigable pages.
**Description**: Keyboard users must Tab through all header controls (theme toggle button, role selector SegmentedButton with 6 items, notification bell button) before reaching the main page content area on every page load. There is no "Skip to main content" link.
**Impact**: Users of keyboard navigation (including screen reader users) experience significant tab-stop overhead on every page transition.
**Severity**: MODERATE — WCAG 2.4.1 is Level A; this is a compliance failure.
**Recommended Fix**: Add a visually hidden `<a href="#nhvr-main-content">Skip to main content</a>` link as the first focusable element on each view, revealed on focus. In SAP UI5, this can be implemented by adding a `sap.m.Link` with `class="nhvrSkipNav"` as the first child of the Shell or Page, with CSS `position: absolute; left: -9999px` hidden state and `left: 0; top: 0` on `:focus`.
**Target**: Resolved before government accessibility certification.

### Issue #3 — Leaflet Map Has No Keyboard-Accessible Alternative (WCAG 2.1.1 — FAIL)
**Location**: `MapView.view.xml` and `MapView.controller.js`.
**Description**: The interactive map (Leaflet.js, rendered in a plain `<div>`) allows users to view all bridges geospatially, filter by condition, and click bridge markers to view detail. While Leaflet provides partial keyboard support for map panning, individual bridge markers within Leaflet.markercluster are not keyboard-reachable. Users cannot navigate to a specific bridge marker or activate a cluster via Tab/Arrow/Enter keys.
**Impact**: Keyboard-only users and screen reader users cannot access the spatial bridge data presented in the Map view.
**Severity**: HIGH — WCAG 2.1.1 is Level A; map functionality is a core feature for engineers and planners.
**Recommended Fix**:
  1. Provide a "List View" toggle within the Map view that surfaces the same set of filtered bridges in a keyboard-accessible `sap.m.Table`. The Bridges list view already provides this; a deep-link or shared state mechanism could be used to pre-filter the Bridges list with the current map selection.
  2. Alternatively, implement ARIA attributes on Leaflet markers (`L.DivIcon` with `tabindex="0"`, `role="button"`, `aria-label="Bridge: [bridgeId] — [condition]"`).
  3. The `nhvr_map_selection` localStorage handoff (already implemented) can support option 1.
**Target**: Resolved or mitigated before government deployment.

### Issue #4 — Session Expiry No Warning (WCAG 2.2.1 — FAIL)
**Location**: `xs-app.json` session timeout (15 minutes); no application-level warning timer.
**Description**: When the 15-minute idle session times out, the SAP App Router redirects the user to the XSUAA login page without warning. Any unsaved data in forms (e.g., a partially completed bridge inspection) is lost.
**Impact**: Users are not warned before losing their session. WCAG 2.2.1 requires a warning at least 20 seconds before timeout with the ability to extend.
**Severity**: MODERATE — Affects all users, particularly those with motor or cognitive disabilities who may work more slowly.
**Recommended Fix**: Implement a client-side session warning dialog triggered at 14 minutes (1 minute before timeout) using `sap.m.Dialog` with options to "Stay Logged In" (triggering a keepalive ping) or "Log Out". Timeout can be detected by tracking last activity timestamp in JavaScript.
**Target**: Resolved before government deployment.

---

## 4. SAP UI5 Accessibility Notes

### 4.1 Framework-Provided Accessibility
SAP UI5 1.120 with the SAP Horizon theme provides the following accessibility capabilities that are inherited by this application with no additional code:
- ARIA roles on all standard controls (`sap.m.*`, `sap.ui.layout.*`, `sap.ui.comp.*`)
- Keyboard navigation within tables (Arrow keys), dialogs (Tab/Escape), and tab containers (Arrow keys)
- High contrast themes: SAP High Contrast Black and SAP High Contrast White (selectable via SAP UI5 Theming API)
- Screen reader announcements for live regions (`sap.m.MessageToast`, `sap.m.BusyIndicator`)
- Focus management on modal dialog open/close

### 4.2 SAP-Tested Screen Reader Combinations
Per SAP UI5 release notes for 1.120:
- JAWS 2023 + Chrome (Windows) — Primary support
- NVDA 2023 + Chrome (Windows) — Secondary support
- VoiceOver + Safari (macOS) — Secondary support
- VoiceOver + Safari (iOS) — Mobile support (limited)

### 4.3 Accessibility Theme Activation
Users can switch to high-contrast or large-text themes by appending `?sap-theme=sap_horizon_hcb` (High Contrast Black) or `?sap-theme=sap_horizon_hcw` (High Contrast White) to the application URL. This mechanism is available but **not surfaced to users via a UI control** in the current version. Recommend adding a theme selector to the header alongside the existing dark/light toggle.

---

## 5. Remediation Priority List

| # | Issue | WCAG Criterion | Level | Priority | Estimated Effort |
|---|-------|---------------|-------|----------|-----------------|
| 1 | No skip navigation link | 2.4.1 | A | HIGH | 0.5 days |
| 2 | Session expiry no warning | 2.2.1 | A | HIGH | 1–2 days |
| 3 | Leaflet map no keyboard alternative | 2.1.1 | A | HIGH | 2–3 days (list-view toggle) |
| 4 | Emoji in role labels | 1.1.1 | A | MEDIUM | 0.5 days |
| 5 | Subtitle text contrast on Home header (rgba 0.85) | 1.4.3 | AA | MEDIUM | 0.5 days |
| 6 | High-contrast theme not surfaced in UI | (Usability) | — | LOW | 0.5 days |
| 7 | MassEdit preview — full field coverage | 3.3.4 | AA | LOW | 1 day |
| 8 | autocomplete attributes on form inputs | 1.3.5 | AA | LOW | 1 day |

### Total estimated remediation effort: 7–11 business days

---

## 6. Accessibility Testing Checklist

Before commissioning a formal audit, the development team should complete the following self-tests:

- [ ] Tab through all 19 views using keyboard only — verify no keyboard traps
- [ ] Test with NVDA + Chrome: confirm role selector, Bridge list, BridgeDetail tabs, and filter dialog are fully announced
- [ ] Test with VoiceOver + Safari on macOS: confirm form labels, mandatory fields, and error messages are read
- [ ] Verify all `sap.m.Button` icon-only buttons have `tooltip` set (search, filter toggle, refresh, export)
- [ ] Test Map view with keyboard: confirm zoom +/- buttons are reachable; document limitations of marker navigation
- [ ] Test browser zoom at 200%: confirm no horizontal scroll on Home, Bridges, and BridgeDetail views
- [ ] Validate HTML structure with axe-core browser extension on at least 5 critical views
- [ ] Confirm high-contrast theme renders correctly at `?sap-theme=sap_horizon_hcb`

---

*Document prepared by: NHVR Bridge App Development Team*
*Standard: WCAG 2.1 Level AA (W3C Recommendation, 5 June 2018)*
*Next formal review: Prior to government deployment; then annually*
*Formal audit required: Yes — commission before go-live*
