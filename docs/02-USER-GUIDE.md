# NHVR Bridge Asset & Restriction Management System -- User Guide

Version 4.7.4 | Last Updated: April 2026

---

## Table of Contents

1. [Getting Started](#1-getting-started)
2. [Home Screen](#2-home-screen)
3. [Bridge Asset Registry](#3-bridge-asset-registry)
4. [Bridge Detail](#4-bridge-detail)
5. [Creating and Editing Bridges](#5-creating-and-editing-bridges)
6. [Restrictions Registry](#6-restrictions-registry)
7. [Map View](#7-map-view)
8. [Reports and Analytics](#8-reports-and-analytics)
9. [Inspections](#9-inspections)
10. [Defect Register](#10-defect-register)
11. [Permits](#11-permits)
12. [Vehicle Access](#12-vehicle-access)
13. [Freight Route Corridors](#13-freight-route-corridors)
14. [Route Assessment](#14-route-assessment)
15. [Route Planner](#15-route-planner)
16. [Work Orders](#16-work-orders)
17. [Mass Upload](#17-mass-upload)
18. [Mass Edit](#18-mass-edit)
19. [Asset Command Dashboard](#19-asset-command-dashboard)
20. [Analytics Dashboard](#20-analytics-dashboard)
21. [Roles and Access Control](#21-roles-and-access-control)
22. [Step-by-Step Workflows](#22-step-by-step-workflows)
23. [Keyboard Shortcuts and Accessibility](#23-keyboard-shortcuts-and-accessibility)
24. [Frequently Asked Questions](#24-frequently-asked-questions)

---

## 1. Getting Started

### Accessing the Application

The NHVR Bridge Management System (BMS) is a web-based application built on SAP Business Technology Platform. Access it through your organisation's SAP Launchpad or via the direct URL provided by your system administrator.

Supported browsers: Google Chrome, Microsoft Edge, Mozilla Firefox, and Safari (latest two major versions).

### Logging In

Authentication is handled through your organisation's identity provider (IdP). After entering your credentials, you will be directed to the Home screen. Your assigned role determines which sections and actions are available to you.

### Navigation

- **Breadcrumbs** appear at the top of every screen, allowing you to navigate back to parent screens.
- The **Home** button on each screen returns you to the main launchpad.
- The **ShellBar** at the top provides access to notifications, user profile, role switching (in demo mode), and theme toggling.

### Theme and Display

- Click the moon/sun icon in the ShellBar to toggle between light and dark themes.
- The application supports both compact and cozy content densities, adapting to your device.

---

## 2. Home Screen

The Home screen is the main launchpad of the application. It is organised into role-adaptive sections that display tiles relevant to your assigned role.

### Sections

**Operations** -- Contains tiles for the three primary screens:
- Dashboard -- Opens the Asset Command Dashboard with portfolio-level KPIs.
- Bridges -- Opens the Bridge Asset Registry (master list of all bridges).
- Restrictions -- Opens the Restrictions Registry showing all active and scheduled restrictions.

**Analytics** -- Contains tiles for:
- Reports -- Opens the Reports and Analytics hub with 15+ report types.
- Annual Condition Report -- Statutory report aligned to AS 5100 / BIMM standards.

**Live Summary** -- Displays real-time KPI tiles showing:
- Total Bridges in the registry.
- Active Restrictions currently in effect.
- Closed Bridges requiring action.
- Permit Required bridges with active permit conditions.
- Open Defects that are unresolved.
- Overdue Inspections past their due date.

Click any KPI tile to navigate directly to the relevant screen with pre-applied filters.

**Network Condition** -- A horizontal bar chart showing the distribution of bridges across Good, Fair, Poor, and Critical condition ratings. This section loads automatically when data is available.

**Alert Strips** -- Context-sensitive banners appear when:
- Inspections are overdue across the network.
- Restrictions are expiring within the current period.

**Road Capacity and Permits** -- Links to capacity-focused reports.

**Network Tools** -- Quick-access tiles for:
- Map View -- Geographic explorer for bridge locations.
- Record Inspection -- Jump directly to the AS 5100.7 inspection form.
- Freight Corridors -- PBS/HML route corridor management.

**Inspection and Defects (Inspector role)** -- Tiles for the Inspections dashboard and Defect Register. Visible to users with the Inspector role or above.

**Operator Tools (Operator role)** -- Tiles for Permits, Vehicle Access, Route Assessment, and Route Planner. Visible to users with the Operator role.

**BMS Business Admin (Admin role)** -- Tiles for Mass Upload, Business Admin configuration, Client Licensing, Restriction Types, Mass Edit, and Vehicle Types. Visible to Admin users only.

**BMS Tech Admin (Admin/TechAdmin role)** -- Tiles for App Admin (BTP/XSUAA), Integration Hub (S/4HANA, BANC, GIS), Tech Config (jurisdiction, map, standards), and the Analytics Dashboard. Visible to Admin and TechAdmin users.

### Notifications

Click the bell icon in the ShellBar to view pending notifications. Notifications include alerts for overdue inspections, expiring restrictions, and system events.

### Role Switching (Demo/Training Mode)

In training or demo environments, a yellow "TRAINING ENVIRONMENT" banner appears at the top. The role switch button (user settings icon) in the ShellBar lets you switch between roles to preview different access levels:
- Admin
- Bridge Manager
- Inspector
- Operator
- Read Only

Select a role, then click Apply to see the Home screen adapt to that role's permissions.

---

## 3. Bridge Asset Registry

Navigate here from the Home screen by clicking the Bridges tile, or via Home > Bridges in the breadcrumbs.

### Overview

The Bridge Asset Registry is the master list of all bridge assets in the system (2,126+ bridges). It uses an ALV-style grid table with fixed columns for Bridge ID and Name.

### Filtering

**Quick Filters** (always visible in the page header):
- Search -- Free-text search across bridge ID, name, route, and other fields.
- State -- Filter by Australian state/territory (NSW, VIC, QLD, WA, SA, TAS, ACT, NT).
- Condition -- Filter by condition rating (Good, Fair, Poor, Critical).
- Status -- Filter by posting status (Unrestricted, Posted, Closed).
- Scour Risk -- Filter by scour risk level (Low, Medium, High, Critical).
- NHVR Assessed -- Filter to show only NHVR-assessed or non-assessed bridges.
- Freight Route -- Filter to bridges on designated freight routes.
- Risk Band -- Filter by risk band (Low, Medium, High, Very High, Critical).

Click **Clear Filters** to reset all quick filters.

**Advanced Filter Panel** -- Expand the "Advanced Filter" panel below the quick filters for full AND/OR query building:
1. Choose a logic mode: AND (all criteria must match) or OR (any criterion must match).
2. Click "+ Add Criteria" to add a filter row. Each row lets you select a field, an operator, and a value.
3. Click "Apply" to execute the advanced filter.
4. Click "Save as Preset" to save the current filter combination for reuse.

Saved presets appear as chips below the advanced filter panel. Click any preset chip to re-apply that filter instantly.

**Active Filter Chips** -- When filters are active, a chip bar appears above the table showing each active filter as a removable token. Click "Clear all" to remove all filters at once.

### KPI Strip

Above the table, a row of KPI badges shows at-a-glance counts:
- Total bridges matching current filters.
- Closed bridges.
- Posted bridges.
- Critical condition bridges.
- High scour risk bridges.
- NHVR assessed bridges.

### Table Features

**Columns** -- The table supports up to 47 columns organised into categories:
- Identity and Registration
- Physical and Geometric
- Load Capacity, Safety, and NHVR
- Inspection, Condition, and Health
- Risk, Criticality, and Resilience
- Financial and Investment
- Geospatial and Governance

Click the **Columns** button in the table toolbar to open the Column Picker dialog, where you can:
- Use Quick Presets to apply a named set of columns instantly (Essential, Inspection View, Load and Permits, All Columns).
- Search for specific columns by name.
- Filter columns by category.
- Show All or Hide All columns.
- Save custom column layouts as named variants for future use.

**Sorting** -- Click the **Sort** button in the toolbar to open the sort dialog. Choose a field and sort direction (ascending or descending). You can also click column headers directly.

**Variant Management** -- The Variant Management control at the top of the table lets you save and reload complete view configurations (filters, column layout, sort order).

**Exporting Data** -- The toolbar provides three export options:
- Excel -- Export the current filtered results to an .xlsx file.
- CSV -- Export to CSV format. A dialog lets you choose between visible columns only or all 47 columns, with an optional help row for templates.
- Print -- Open a print-friendly view or save as PDF.

**Pagination** -- The table uses auto-sizing to show as many rows as fit on screen. A "Load More" button at the bottom loads additional pages of data.

**Bulk Upload** -- Admin users see Upload and Template buttons in the toolbar. Click Template to download a CSV template, then Upload to import bridge records. See the Mass Upload section for details.

### Navigating to Bridge Detail

Click any row in the table to open that bridge's full detail view.

### Viewing Selected Bridges on Map

Select one or more bridges using the row checkboxes, then click "View on Map" in the toolbar to see those bridges highlighted on the Map View.

---

## 4. Bridge Detail

Navigate here by clicking a bridge row in the Bridge Asset Registry, or directly via the URL pattern BridgeDetail/{bridgeId}.

### Page Header

The header strip shows key attributes at a glance:
- Condition rating (colour-coded: green for Good, yellow for Fair, orange for Poor, red for Critical).
- Posting status.
- Region/State.
- Road route.
- Clearance height.
- Year built.

Action buttons in the title bar:
- **View in BANC** -- Opens the bridge record in the Bridge Asset National Collection (AustRoads) external system (when available).
- **View in SAP** -- Opens the bridge record in SAP S/4HANA Asset Management (when available).
- **View on Map** -- Centres the Map View on this bridge.
- **Edit Bridge** -- Opens the bridge form in edit mode.
- **Info** -- Opens the field guide for bridge detail fields.
- **Bridges** -- Returns to the Bridge Asset Registry.

### Tabs

The Bridge Detail page uses a tabbed layout with the following sections:

**Overview** -- Core bridge information organised into form groups:
- Identity (Bridge ID, name, asset class, owner, custodian).
- Location (state, LGA, road route, chainage, latitude/longitude).
- Physical characteristics (structure type, material, number of spans, total length, deck width).
- Condition summary (current condition rating, last inspection date, next inspection due).

**Capacity** -- Load capacity and structural assessment data:
- Design load standard and class.
- Load rating values.
- Capacity review dates.
- NHVR assessment status and approval class.

**Restrictions** -- All restrictions applied to this bridge, displayed in a table. Each restriction shows:
- NHVR reference number (e.g. NHVR-BRG-NSW-002-R001).
- Restriction type (mass, height, width, speed, etc.).
- Value and unit.
- Status (Active, Scheduled, Expired).
- Valid from/to dates.
- Permit requirement flag.

From this tab you can add a new restriction or edit existing ones.

**Attributes** -- Extended attribute key-value pairs for the bridge, including custom fields defined by administrators.

**Map Preview** -- An embedded map showing the bridge location with a marker and surrounding context.

**External Systems** -- Links and sync status for connected external systems (BANC, SAP S/4HANA, ESRI ArcGIS).

**Inspection Orders** -- All inspection orders associated with this bridge, with status tracking (Planned, In Progress, Pending Review, Completed).

**Inspections** -- Historical inspection records with dates, inspector names, condition ratings assigned, and findings.

**Defects** -- All defects recorded against this bridge, with severity (Critical, High, Medium, Low), status, detected date, and estimated repair cost.

**History** -- Audit trail of all changes made to the bridge record, showing who changed what and when.

**Risk Assessment** -- Risk scoring information including risk band, criticality index, and resilience factors.

**Investment Plan** -- Capital investment planning data, replacement cost estimates, and funding allocations.

**NHVR / Load** -- NHVR-specific load assessment data, heavy vehicle access classifications, and route suitability.

**Scour Assessment** -- Scour risk evaluation data including scour risk level, foundation type, waterway characteristics, and countermeasure status.

**S/4HANA** -- Integration details with SAP S/4HANA including functional location, equipment number, and sync timestamps.

---

## 5. Creating and Editing Bridges

### Creating a New Bridge

1. From the Bridge Asset Registry, click the **Add Bridge** button.
2. The Bridge Form opens with the title "Add Bridge".
3. Fill in the required fields (marked with an asterisk):
   - **Bridge ID** -- A unique identifier (e.g. BRG-NSW001-001). Leave blank for auto-generation.
   - **Bridge Name** -- Descriptive name (e.g. Hawkesbury River Bridge).
   - **State** -- The Australian state or territory.
   - **Asset Owner** -- The organisation that owns the bridge.
   - **Latitude and Longitude** -- Geographic coordinates.

4. The form is organised into expandable sections:
   - Section 1: Identity and Location.
   - Section 2: Physical and Geometric properties (structure type, material, spans, length, width).
   - Section 3: Load Capacity and Safety (design load, load rating, clearance).
   - Section 4: Inspection and Condition (condition rating, last inspection, next due date).
   - Section 5: Risk and Resilience (risk band, scour risk, flood risk).
   - Section 6: Financial and Investment (replacement cost, maintenance budget).
   - Section 7: Geospatial and Governance (LGA, custodian, road classification).

5. Click **Save Bridge** to create the record.
6. Click **Cancel** to discard changes and return to the previous screen.

### Editing an Existing Bridge

1. From the Bridge Detail page, click **Edit Bridge**.
2. The Bridge Form opens pre-populated with the bridge's current data.
3. Make your changes across any section.
4. Click **Save Bridge** to commit the changes.

### BAMS Sync

The **Sync BAMS** button (visible on the edit form) synchronises the bridge record with the Bridge Asset Management System / BANC national register. The sync status badge shows the last sync timestamp or "Never synced".

---

## 6. Restrictions Registry

Navigate here from the Home screen by clicking the Restrictions tile.

### Overview

The Restrictions Registry lists all weight, height, width, speed, and other restrictions across the entire bridge network. Each restriction has a unique NHVR reference number (e.g. NHVR-BRG-NSW-002-R001).

### Filtering

**Quick Filters** in the page header:
- Search -- Free-text search across restriction reference, bridge name, type, and value.
- Status -- Filter by Active, Scheduled, or Expired.
- Type -- Filter by restriction type (Gross Mass, Axle Load, Height, Width, Length, Speed, Wind Speed, Clearance, Combination Mass, Vehicle Type, Flood Closure).
- Permit -- Filter to show only restrictions that require a permit.
- Temporary -- Filter to Temporary Only or Permanent Only restrictions.

Click **Clear Filters** to reset.

**Quick-Filter Preset Chips** -- One-click preset filters appear below the filter bar:
- Active -- Show only active restrictions.
- Expiring This Week -- Show restrictions expiring within the current week.
- Temporary -- Show temporary restrictions only.
- Permit Required -- Show restrictions that require a permit.
- Missing Gazette Ref -- Show restrictions without a gazette reference (data quality check).
- Disabled -- Show disabled/inactive restrictions.

Click **Clear** to remove the active preset.

**Advanced Filter Panel** -- Expand the advanced filter panel for custom criteria-based filtering, similar to the Bridge Asset Registry.

### KPI Strip

Above the table, KPI badges show:
- Total restriction count.
- Active restrictions.
- Scheduled restrictions.
- Permit Required count.

### Table Columns

The restriction table shows:
- Bridge (name and ID, clickable to navigate to Bridge Detail).
- Type (restriction type such as Gross Mass, Height, etc.).
- Value (numeric value with unit, e.g. 42.5 t).
- Status (Active, Scheduled, Expired -- colour coded).
- Permit (Required or No).
- Route (route code, if applicable).
- Vehicle Class (restricted vehicle class, if applicable).
- Valid From / Valid To dates.
- Gazette Ref (gazette reference number with validation status).
- Direction (direction of travel the restriction applies to -- hidden by default).
- Actions (Edit button).

Use the **Columns** button in the toolbar to show or hide optional columns (Route, Vehicle Class, Valid From, Valid To, Gazette Ref, Direction).

### Exporting

The toolbar provides Excel, CSV, and Print export options, identical in behaviour to the Bridge Asset Registry exports.

### Adding a Restriction

1. Click the **Add Restriction** button in the table toolbar (visible to Bridge Manager and Admin roles).
2. The Restriction dialog opens.
3. Choose the restriction category: Permanent or Temporary.
   - For Temporary restrictions, additional fields appear: Temporary From Date, Temporary To Date, Temporary Reason, Approved By, and Approval Reference.
4. Search for and select the bridge to apply the restriction to.
5. Select the Restriction Type (Gross Mass Limit, Axle Load Limit, Height Limit, Width Limit, Length Limit, Speed Limit, Wind Speed Limit, Flood Closure, Vehicle Type Restriction).
6. Enter the Value and select the Unit (tonnes, kilonewtons, metres, km/h).
7. Optionally select a Vehicle Class, set the Status, enter Valid From/To dates, Gazette Reference, Approved By, Direction, Enforcement Authority, Permit Required flag, and Notes.
8. Click the **Validate** button next to the Gazette Reference field to check the format.
9. Click **Save** to create the restriction.

### Editing a Restriction

Click the Edit (pencil) icon in the Actions column of any restriction row. The same dialog opens pre-populated with the restriction's data. Make changes and click Save.

---

## 7. Map View

Navigate here from the Home screen by clicking the Map View tile, or from the Bridge Asset Registry toolbar.

### Overview

The Map View provides a geographic visualisation of all bridge assets across Australia using Leaflet.js. It supports interactive filtering, drawing tools, and multiple display modes.

### View Modes

Use the segmented button in the toolbar to switch between:
- **Map** -- Full-screen map with bridge markers.
- **Split** -- Side-by-side map and list view.
- **List** -- Full-screen list without the map.

### Layer Representation

Toggle between:
- **Points** -- Individual point markers for each bridge.
- **Lines** -- Bridge span representations as lines.
- **Zones** -- Restricted zones displayed as area overlays.

### Symbology (Colour Coding)

Use the Symbology dropdown to colour bridge markers by:
- Condition (Good = green, Fair = yellow, Poor = orange, Critical = red).
- Status (Unrestricted, Posted, Closed).
- Scour Risk.
- Other attributes.

### Filter Sidebar

A collapsible filter sidebar on the left allows filtering by:
- State.
- Condition.
- Year built range.
- Structure type.
- Scour risk.
- Posting status.
- Freight route.
- NHVR assessed.

Filters apply to both the map markers and any visible list.

### Drawing Tools

Use the drawing tools to select bridge clusters:
- **Polygon** -- Draw a custom polygon on the map. Bridges within the polygon are selected and statistics are shown in an overlay.
- **Rectangle** -- Draw a rectangle selection area.
- **Circle** -- Draw a circle selection area.

### Exporting from Map Selection

After drawing a selection area, you can export the selected bridges to CSV or GeoJSON format.

### Base Layers

Use the layer switcher to change the base map:
- OpenStreetMap.
- Satellite imagery.
- Topographic.
- Dark theme.
- Custom layers (configured by administrators).

### Reference Layers

Administrators can configure additional reference layers (WMS, GeoJSON, XYZ, ESRI services) that overlay on the map, such as road networks, flood zones, or land-use boundaries.

### Bridge Popups

Click any bridge marker to see a popup with key information (bridge ID, name, condition, status, restrictions summary). The popup includes a link to navigate to the full Bridge Detail page.

---

## 8. Reports and Analytics

Navigate here from the Home screen by clicking the Reports tile.

### Report Hub

The Reports and Analytics screen opens in Hub view, displaying report cards organised by category. Each card shows the report name, description, and an icon.

**Category Tabs** -- Filter the report catalogue by category:
- All Reports.
- Asset Health.
- Compliance.
- Inspections.
- Restrictions.
- Network.
- Trends.

**Search** -- Use the search bar to find reports by name or keyword.

**Recently Viewed** -- A row of recently accessed reports appears at the top for quick re-access.

### Available Reports

The system includes 15+ report types:

| Report | Category | Description |
|--------|----------|-------------|
| Asset Register | Asset Health | Complete register of all bridge assets with key attributes |
| Asset Summary | Asset Health | Summary statistics by state, condition, and structure type |
| Condition Distribution | Asset Health | Distribution of bridges across condition ratings |
| Restriction Summary | Restrictions | Summary of all active and scheduled restrictions |
| Inspection Status | Inspections | Status of all inspection orders across the network |
| Bridges Exceeding Capacity | Compliance | Bridges where current loads exceed rated capacity |
| Overdue Capacity Reviews | Compliance | Bridges with overdue capacity review dates |
| Route Compliance | Compliance | Compliance status of designated freight routes |
| Defect Register | Asset Health | All recorded defects with severity and status |
| Vehicle Access | Restrictions | Vehicle access allowances per bridge |
| Freight Routes | Network | Freight route corridor overview |
| Bridge History | Asset Health | Change history audit trail for bridge records |
| Network KPIs | Network | Key performance indicators across the bridge network |
| Inspection Compliance KPIs | Inspections | KPIs for inspection programme compliance |
| Defect KPIs | Asset Health | KPI metrics for defect resolution performance |
| Restriction KPIs | Restrictions | KPI metrics for restriction management |

### Running a Report

1. Click a report card in the Hub to open it.
2. The Report Output view opens with a Selection Criteria panel at the top.
3. Set your criteria:
   - **Date Range** -- Select a start and end date.
   - **State** -- Filter to a specific state (or All States).
   - **Condition Min / Max** -- Filter by condition rating range.
   - **Search** -- Free-text filter on bridge name or ID.
4. Click **Run Report** to execute.
5. Results appear in a table below the criteria panel.
6. The results count is shown in the heading (e.g. "Results (342)").

### Report Information

Click the info button to open a Report Information dialog showing:
- Purpose -- What the report is intended to measure.
- Intended Users -- Which roles typically use this report.
- Data Sources -- Where the report data comes from.
- Logic -- How the report filters and calculates its output.
- Refresh -- How frequently the underlying data is refreshed.

### Exporting Report Results

From the report output view, use the toolbar buttons to:
- Export to Excel (.xlsx).
- Export to CSV.
- Print or save as PDF.

### Returning to the Hub

Click the "Reports Hub" back button at the top of the output view to return to the report catalogue.

---

## 9. Inspections

Navigate here from the Home screen by clicking the Inspections tile (in the Inspection and Defects section).

### Inspection Dashboard

The Inspection Dashboard provides an overview of all inspection orders across the bridge network.

**KPI Strip** (pinnable header):
- Total Orders.
- Planned.
- In Progress.
- Pending Review.
- Completed.
- Inspections Due (90 days) -- Count of inspections due within the next 90 days.

**Tabs**:
- All Orders -- A table of all inspection orders with columns for order number, bridge, inspection type, status, assigned inspector, planned date, and due date.
- Overdue -- Filtered view showing only overdue inspections.
- Upcoming -- Filtered view showing inspections due within the upcoming period.

### Creating an Inspection Order

1. Click **New Inspection Order** in the page actions.
2. The Inspection Create form opens.
3. Fill in the required fields:
   - Bridge (search and select).
   - Inspection type (e.g. Routine, Principal, Special).
   - Planned date.
   - Due date.
   - Assigned inspector.
4. Add any notes or special instructions.
5. Save the order.

Alternatively, from a Bridge Detail page, click "Record Inspection" to create an inspection order pre-linked to that bridge.

### Completing an Inspection

1. Open an existing inspection order from the dashboard.
2. Update the status to "In Progress" when fieldwork begins.
3. Record findings, condition rating, and any defects discovered.
4. Upload photos or supporting documents if applicable.
5. Set the status to "Pending Review" or "Completed".

### Exporting

Click **Export Excel** to download inspection orders to a spreadsheet.

---

## 10. Defect Register

Navigate here from the Home screen by clicking the Defect Register tile (in the Inspection and Defects section).

### Overview

The Defect Register is the central view of all bridge defects recorded across the network.

**KPI Strip** (pinnable header):
- Total Defects.
- Open (unresolved defects).
- Critical severity.
- High Severity.
- Estimated Repair Cost (aggregate).

### Filtering

Use the filter controls above the table:
- **Status** -- All Statuses, Open, Under Repair, Monitoring, Repaired, Closed.
- **Severity** -- All Severities, Critical, High, Medium, Low.
- **Search** -- Free-text search.
- **State** -- Filter by state.

### Defect Table

The table displays all defects with columns for:
- Bridge (name and ID).
- Defect code.
- Severity (colour-coded: Critical = red, High = orange, Medium = yellow, Low = green).
- Status (Open, Under Repair, Monitoring, Repaired, Closed).
- Detected date.
- Closed date (if applicable).
- Estimated repair cost.
- Description.

### Recording a Defect

Defects are typically recorded during inspections from the Bridge Detail > Defects tab or during an inspection order. The defect form requires:
- Bridge selection.
- Defect code (from a standard defect classification).
- Severity level.
- Description of the defect.
- Detected date.
- Estimated repair cost (optional).
- Photos or attachments (optional).

### Exporting

Click **Export Excel** to download the defect register.

---

## 11. Permits

Navigate here from the Home screen by clicking the Permits tile (in the Operator Tools section).

### Overview

The Vehicle Permits screen manages heavy vehicle permit applications, assessments, and approvals.

**KPI Tiles** at the top show:
- Total Permits (all statuses).
- Approved (active permits).
- Pending Review (awaiting decision).
- Denied / Expired (inactive permits).

### Filtering

- **Search** -- Search by permit number, applicant, or route.
- **Status** -- All Statuses, Draft, Pending, Approved, Approved with Conditions, Denied, Expired, Cancelled.
- **Type** -- Filter by permit type (e.g. Class 1, OSOM, RAV, HML, PBS).

### Creating a New Permit Assessment

1. Click **New Permit Assessment**.
2. Fill in the permit details:
   - Applicant information.
   - Vehicle details (type, dimensions, gross mass).
   - Requested route.
   - Permit type.
   - Requested travel dates.
3. The system assesses the route against bridge restrictions and capacity limits.
4. Review the assessment results.
5. Set the permit status (Draft, Pending, Approved, Approved with Conditions, Denied).
6. Save the permit.

### Permit Statuses

| Status | Meaning |
|--------|---------|
| Draft | Permit application created but not yet submitted |
| Pending | Submitted and awaiting review |
| Approved | Permit granted without conditions |
| Approved with Conditions | Permit granted subject to specific conditions |
| Denied | Permit application rejected |
| Expired | Permit validity period has passed |
| Cancelled | Permit withdrawn |

### Exporting

Click **Export Excel** to download the permits register.

---

## 12. Vehicle Access

Navigate here from the Home screen by clicking the Vehicle Access tile (in the Operator Tools section).

### Overview

The Vehicle Access screen allows you to check which vehicle combinations are permitted on specific bridges, based on active restrictions.

### Per-Bridge Vehicle Combinations

1. Search for a bridge using the search field or select from the dropdown.
2. A summary panel shows the selected bridge's name, posting status, and condition.
3. The combinations table below shows all allowed vehicle combinations for that bridge, derived from active restrictions and capacity data.

### Route Query Tool

The lower section of the screen provides a route-based query tool:
1. Select or enter a route.
2. View all bridges along that route and the vehicle combinations permitted on each.

This is useful for planning vehicle movements along a corridor and identifying any bridges that may restrict certain vehicle types.

---

## 13. Freight Route Corridors

Navigate here from the Home screen by clicking the Freight Corridors tile.

### Overview

The Freight Route Corridors screen manages designated freight routes used for PBS (Performance-Based Standards), HML (Higher Mass Limits), B-Double, Road Train, and General Freight classifications.

### Filtering

- **Search** -- Search by route code, name, or state.
- **Class** -- Filter by route class (PBS, HML, B-Double, Road Train, General Freight).
- **State** -- Filter by state.

A record count is displayed showing the number of routes matching the current filters.

### Routes Table

The table lists all freight routes with columns for route code, route name, class, state, total bridges on the route, and status.

### Adding a Route

Click **Add Route** to create a new freight route corridor record.

### Assessing a Corridor

1. Select a route in the table.
2. Click **Assess Corridor** to run a capacity assessment across all bridges on the selected route.
3. The assessment checks structural capacity, active restrictions, height/width clearances, and condition risk for each bridge along the corridor.

### Freight Route Detail

Click a route row to navigate to the Freight Route Detail page, which shows:
- Route overview (code, name, class, state, total length).
- All bridges along the route in sequence.
- Restrictions affecting the route.
- Assessment results and risk flags.

---

## 14. Route Assessment

Navigate here from the Home screen by clicking the Route Assessment tile (in the Operator Tools section).

### Overview

The Route Assessment tool evaluates whether a specific vehicle type can safely traverse a selected route by checking all bridge assets along that route.

### Using Route Assessment

1. **Select a Route** -- Choose an approved route from the dropdown. This populates the list of bridges along that route.

2. **Select a Vehicle Type** -- Choose a vehicle type/class from the dropdown (e.g. Semi-trailer, B-Double, Road Train).

3. **Enter Vehicle Specifications**:
   - Gross Vehicle Mass (tonnes).
   - Gross Combination Mass (tonnes).
   - Vehicle height, width, and length (if checking clearances).

4. Click **Assess Route** to run the assessment.

### Assessment Results

The results table shows each bridge along the route with assessment outcomes:
- Structural capacity check (pass/fail against vehicle mass).
- Active restriction check (any restrictions that conflict with the vehicle).
- Temporary restriction check.
- Height/width clearance check.
- Speed limit compliance.
- Condition risk flag (bridges in Poor or Critical condition).

Each check is colour-coded: green for pass, red for fail, yellow for warning.

### Actions on Results

- **Export Results** -- Download the assessment to a spreadsheet.
- **Find Alternatives** -- Search for alternative routes that avoid the flagged bridges.
- **Show Map** -- Display the assessed route on the map with pass/fail colour coding per bridge.

---

## 15. Route Planner

Navigate here from the Home screen by clicking the Route Planner tile (in the Operator Tools section).

### Overview

The Route Planner provides interactive route planning with HGV-specific routing (via OpenRouteService), bridge overlay, and waypoint management. It uses MapLibre GL for map rendering.

### Planning a Route

1. **Enter Origin** -- Type an origin address or location (e.g. "Brisbane CBD, QLD"). Suggestions appear as you type.

2. **Enter Destination** -- Type a destination address (e.g. "Sydney CBD, NSW").

3. **Add Waypoints** (optional) -- Click "+ Add waypoint" to add intermediate stops. Waypoints can be reordered or removed.

4. **Set Vehicle Profile** -- Configure the vehicle dimensions and mass to ensure routing avoids unsuitable bridges and roads.

5. **Calculate Route** -- The system calculates an HGV-appropriate route, displays it on the map, and identifies all bridges along the route.

### Map Features

- The route line is drawn on the map showing the planned path.
- Bridge markers along the route are highlighted with colour-coding based on restriction status and condition.
- Click any bridge marker to see its details and any restrictions that may affect the planned vehicle.

### Route Summary

The planner shows:
- Total distance.
- Estimated travel time.
- Number of bridges on the route.
- Any restrictions or clearance issues flagged.

### Settings

Click the settings icon in the toolbar to configure the API key for the OpenRouteService routing engine.

---

## 16. Work Orders

Navigate here from the Home screen (via Network Tools or Admin sections, depending on role).

### Overview

The Work Orders screen tracks maintenance work orders associated with bridge assets.

### Filtering

- **Search** -- Search by work order number or assignee.
- **Status** -- Filter by Created, In Progress, Completed, or Cancelled.
- **Priority** -- Filter by High, Medium, or Low priority.

A record count shows the number of matching work orders.

### Work Orders Table

The table displays:
- WO Number -- The work order identifier.
- Priority (colour-coded: High = red, Medium = yellow, Low = green).
- Status.
- Bridge.
- Description.
- Assignee.
- Created date.
- Target completion date.

---

## 17. Mass Upload

Navigate here from the Home screen by clicking the Mass Upload tile (Admin role required).

### Overview

The Mass Upload screen provides a universal CSV import facility for bulk data loading. It supports seven data types:
- Bridges.
- Restrictions.
- Routes.
- Vehicle Classes.
- Inspection Orders.
- Bridge Defects.
- Lookup Values (Admin).

### Step-by-Step Upload Process

**Step 1 -- Select Data Type**

Choose the type of data you want to upload from the dropdown. A description explains the expected data and how matching works (e.g. for bridges, existing records are matched by bridgeId and updated; new bridgeIds create new records).

**Step 2 -- Download Template**

Click **Download Template CSV** to get a pre-formatted CSV file with all supported columns and a sample row. The template includes:
- Column headers matching the expected field names.
- A sample data row showing the format for each field.
- Required columns are noted (e.g. for bridges: bridgeId, name, state, assetOwner, latitude, longitude).

**Step 3 -- Upload CSV File**

Upload your completed CSV file in one of two ways:
- **Drag and drop** the file onto the drop zone area.
- **Click Browse File** to select a file from your computer.

The selected file name appears below the upload area. The system validates the file format before proceeding.

**Step 4 -- Validate**

The system parses and validates every row in the CSV:
- Checks for required fields.
- Validates data types and formats.
- Checks for duplicate keys.
- Validates referential integrity (e.g. bridge IDs in restriction uploads must exist).

A validation summary shows the result. If errors are found, a table lists each error with the row number, field name, and error message. Fix the errors in your CSV and re-upload.

**Step 5 -- Import**

Once validation passes:
- Click **Import** to create/update records.
- A progress indicator shows the import status.
- Results show counts of Created, Updated, and Failed records.

### Alternative: In-Line Bulk Upload from Bridge List

Admin users can also access a streamlined bulk upload wizard directly from the Bridge Asset Registry toolbar. This wizard follows the same four steps: Download Template, Upload File, Validate, and Import.

---

## 18. Mass Edit

Navigate here from the Home screen by clicking the Mass Edit tile (Admin role required).

### Overview

The Mass Edit screen provides an in-app editable grid for making bulk changes to multiple records at once. It supports five entity types:
- Bridges.
- Restrictions.
- Defects.
- Inspections.
- Permits.

### Using Mass Edit

1. **Select Entity Type** -- Use the segmented button at the top to choose which type of records to edit.

2. **Filter Records** -- Use the State filter (for bridges) and Search field to narrow down the records to edit.

3. **Choose Columns** -- Click the Column Picker button to select which columns appear in the editable grid.

4. **Edit Values** -- Click directly on cells in the grid to modify values. Changed cells are highlighted.

5. **Bulk Apply** -- Select multiple rows and apply a single value to a field across all selected records at once.

6. **Preview Changes** -- Before saving, a Preview/Diff view shows all pending changes with before and after values highlighted.

7. **Save** -- Click Save to commit all changes. The system validates changes before applying them.

---

## 19. Asset Command Dashboard

Navigate here from the Home screen by clicking the Dashboard tile.

### Overview

The Asset Command Dashboard is a comprehensive KPI and analytics view built as a command centre for bridge network management. It loads dynamically and presents:

- Network-wide KPI cards (total bridges, active restrictions, closed bridges, overdue inspections).
- Condition distribution charts.
- Restriction trends.
- Regional breakdowns by state.
- Risk heatmaps.
- Inspection compliance metrics.

### Interactivity

- Click on any KPI card or chart segment to drill down into the underlying data.
- Use the Refresh button to reload all dashboard data.
- The dashboard adapts based on your role -- Executive users see high-level summary views, while Managers see more detailed operational metrics.

---

## 20. Analytics Dashboard

Navigate here from the Home screen by clicking the Analytics Dashboard tile (Admin/TechAdmin section).

### Overview

The Analytics Dashboard provides advanced analytical views with configurable charts and data visualisations. It covers:

- Bridge asset health trends over time.
- Inspection programme compliance rates.
- Defect resolution timelines.
- Restriction lifecycle analysis.
- Capacity utilisation metrics.

Charts are interactive and can be filtered, zoomed, and exported.

---

## 21. Roles and Access Control

The system uses role-based access control managed through SAP XSUAA. Each user is assigned one or more roles that determine their access level.

### Role Definitions

| Role | Access Level | Key Capabilities |
|------|-------------|------------------|
| Admin | Full access | All features, system configuration, user management, mass upload, mass edit, integration hub, tech admin |
| BridgeManager | Create and edit | Create/edit bridges, restrictions, inspections; run reports; export data |
| Inspector | Inspection focused | View all data; create and manage inspection orders; record defects and condition assessments |
| Operator | Operations focused | View bridge data; manage permits; manage vehicle combinations; route assessment and planning; apply temporary restrictions |
| Executive | Read-only analytics | View dashboards, reports, and KPIs; no create/edit capabilities |
| Viewer | Read-only | Read-only access to all bridge and restriction data; no create/edit capabilities |
| TechAdmin | Technical configuration | System configuration; manage BTP environment; integration hub; GIS configuration; jurisdiction and map settings |
| Uploader | Upload permission | Permission to perform mass uploads via CSV (typically combined with another role) |

### What Each Role Can See on the Home Screen

- **All roles**: Operations section (Dashboard, Bridges, Restrictions), Analytics section, Live Summary KPIs, Road Capacity and Permits, Network Tools.
- **Inspector and above**: Inspection and Defects section.
- **Operator**: Operator Tools section (Permits, Vehicle Access, Route Assessment, Route Planner).
- **Admin**: BMS Business Admin section (Mass Upload, Admin Config, Licensing, Restriction Types, Mass Edit, Vehicle Types).
- **Admin and TechAdmin**: BMS Tech Admin section (App Admin, Integration Hub, Tech Config, Analytics Dashboard).

---

## 22. Step-by-Step Workflows

### Workflow 1: Creating a New Bridge

1. Navigate to Home > Bridges.
2. Click **Add Bridge** in the top-right actions.
3. Enter the Bridge ID (or leave blank for auto-generation).
4. Enter the Bridge Name and select the State.
5. Fill in the Asset Owner, Latitude, and Longitude (required fields).
6. Complete additional sections as needed (physical properties, load capacity, etc.).
7. Click **Save Bridge**.
8. The system creates the record and navigates to the Bridge Detail page.

### Workflow 2: Adding a Restriction to a Bridge

1. Navigate to Home > Restrictions.
2. Click **Add Restriction** in the table toolbar.
3. Choose Permanent or Temporary.
4. In the Bridge field, start typing the bridge name or ID. Select the correct bridge from the suggestions.
5. Select the Restriction Type (e.g. Gross Mass Limit).
6. Enter the Value (e.g. 42.5) and select the Unit (e.g. tonnes).
7. Set the Status to Active (or Scheduled if it takes effect in the future).
8. Enter Valid From and Valid To dates.
9. Enter the Gazette Reference and click Validate to check the format.
10. Check "Permit Required" if applicable.
11. Click **Save**.

Alternatively, you can add a restriction from the Bridge Detail > Restrictions tab.

### Workflow 3: Running an Inspection

1. Navigate to Home > Inspections.
2. Click **New Inspection Order**.
3. Search for and select the bridge to inspect.
4. Choose the inspection type (Routine, Principal, or Special).
5. Set the planned date and due date.
6. Assign an inspector.
7. Save the order (status: Planned).
8. When the inspector begins fieldwork, update the status to In Progress.
9. Record findings, assign a condition rating, and note any defects found.
10. Set the status to Completed (or Pending Review if supervisor approval is required).

### Workflow 4: Recording a Defect

1. Navigate to the Bridge Detail page for the affected bridge.
2. Select the Defects tab.
3. Click **Add Defect**.
4. Select a defect code from the standard classification list.
5. Set the severity (Critical, High, Medium, or Low).
6. Enter a description of the defect.
7. The detected date defaults to today (adjust if needed).
8. Optionally enter an estimated repair cost.
9. Save the defect.

Defects can also be recorded during an inspection (Workflow 3, step 9).

### Workflow 5: Generating a Report

1. Navigate to Home > Reports.
2. Browse the report catalogue or use the category tabs and search to find the desired report.
3. Click the report card to open it.
4. In the Selection Criteria panel, set the date range, state, condition range, and any search terms.
5. Click **Run Report**.
6. Review the results in the table.
7. Click **Export Excel**, **CSV**, or **Print** to download the report.
8. Click "Reports Hub" to return to the catalogue.

### Workflow 6: Mass Uploading Bridges via CSV

1. Navigate to Home > Mass Upload (Admin role required).
2. Select "Bridges" from the data type dropdown.
3. Click **Download Template CSV**.
4. Open the template in a spreadsheet application (Excel, Google Sheets, etc.).
5. Fill in the data rows. Required columns: bridgeId, name, state, assetOwner, latitude, longitude.
6. Save the file as CSV.
7. Return to the Mass Upload screen and drag-and-drop the CSV file onto the upload zone (or click Browse File).
8. Wait for validation to complete. Review any errors.
9. If errors exist, fix the CSV file and re-upload. If validation passes, click **Import**.
10. Review the import results (created, updated, failed counts).

### Workflow 7: Using the Map View

1. Navigate to Home > Map View.
2. The map loads showing all bridge markers across Australia.
3. Use the filter sidebar (left panel) to narrow bridges by state, condition, or other attributes.
4. Change the symbology mode to colour markers by condition, status, or scour risk.
5. Click any marker to see the bridge popup with key information.
6. Click the bridge link in the popup to navigate to the Bridge Detail page.
7. Use drawing tools (polygon, rectangle, circle) to select groups of bridges and view aggregate statistics.
8. Export selected bridges to CSV or GeoJSON as needed.
9. Toggle between Map, Split, and List views using the toolbar buttons.

### Workflow 8: Managing Permits

1. Navigate to Home > Permits (Operator or Admin role required).
2. Review the KPI tiles showing permit status distribution.
3. Click **New Permit Assessment** to create a new permit.
4. Enter the applicant details, vehicle specifications, requested route, and travel dates.
5. The system assesses the route against bridge restrictions.
6. Review the assessment outcome.
7. Set the permit status:
   - Draft (if still preparing).
   - Pending (if submitted for review).
   - Approved (if the route is clear for the specified vehicle).
   - Approved with Conditions (if conditions apply, such as escort requirements or time restrictions).
   - Denied (if the route cannot accommodate the vehicle).
8. Save the permit.
9. To review existing permits, use the search and status/type filters.
10. Export the permits register to Excel as needed.

---

## 23. Keyboard Shortcuts and Accessibility

### Accessibility

The application conforms to WCAG 2.1 Level AA standards and includes:
- Full keyboard navigation support.
- Screen reader compatibility (ARIA labels and live regions).
- High contrast theme support.
- Text resize support.
- Focus management for dialogs and navigation.

### Keyboard Navigation

- **Tab** -- Move focus between interactive elements.
- **Enter / Space** -- Activate buttons, links, and selections.
- **Arrow keys** -- Navigate within tables, lists, and dropdown menus.
- **Escape** -- Close dialogs and popups.
- **F5** -- Refresh the current view (browser standard).

### Content Density

The application supports both compact (dense, desktop-optimised) and cozy (touch-friendly, tablet-optimised) display modes. Your device type is detected automatically, or you can change the density in your user settings.

---

## 24. Frequently Asked Questions

**Q: How do I find a specific bridge?**
A: Use the Search field on the Bridge Asset Registry. You can search by bridge ID, name, route, or any other text attribute. For more precise searches, use the Advanced Filter panel with specific field criteria.

**Q: What does the condition rating mean?**
A: Condition ratings follow the AS 5100 standard:
- Good -- Bridge is in good structural condition; no significant defects.
- Fair -- Minor defects or wear; bridge is functional but may need maintenance.
- Poor -- Significant defects; bridge may have load restrictions or require repair.
- Critical -- Severe structural issues; bridge may be closed or heavily restricted.

**Q: How do I export data?**
A: Every list screen (Bridges, Restrictions, Inspections, Defects, Permits) has export buttons in the table toolbar. Choose Excel for formatted spreadsheets, CSV for data interchange, or Print for PDF output.

**Q: What is an NHVR reference number?**
A: Each restriction is assigned a unique NHVR reference in the format NHVR-BRG-{STATE}-{BRIDGE}-R{SEQ} (e.g. NHVR-BRG-NSW-002-R001). This provides a nationally consistent identifier for restriction records.

**Q: What is a gazette reference?**
A: A gazette reference links a restriction to its legal authority as published in a government gazette. The system can validate gazette reference formats. Restrictions without a gazette reference are flagged for data quality purposes.

**Q: Can I undo a change?**
A: The History tab on each bridge record shows all changes made. While there is no automatic undo feature, Bridge Managers and Admins can manually revert values by editing the record. Contact your administrator if a bulk rollback is needed.

**Q: How do I switch between roles in the demo environment?**
A: Click the user settings icon in the ShellBar at the top of the Home screen. Select a role from the dropdown and click Apply. This only works in training/demo environments.

**Q: What browsers are supported?**
A: The latest two major versions of Google Chrome, Microsoft Edge, Mozilla Firefox, and Safari are supported. The application requires JavaScript to be enabled.

**Q: Who do I contact for support?**
A: Contact your organisation's BMS system administrator or the NHVR BMS support team for technical issues, access requests, or data corrections.

---

*This document covers the NHVR Bridge Management System version 4.7.4. For technical architecture details, see the Technical Architecture document. For administrative configuration, see the Operations Manual.*
