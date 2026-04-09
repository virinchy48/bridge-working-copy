/**
 * ScreenHelp.js — NHVR Screen-level help registry
 *
 * Provides contextual guide text for every screen in the application.
 * Each entry includes:
 *   title        — Screen title
 *   text         — Full screen guide (shown in Help Assistant › Screen Guide tab)
 *   trainingTips — Additional tips shown only in training/demo mode
 *
 * Used by HelpAssistantMixin.js and the HelpAssistant fragment.
 */
sap.ui.define([], function () {
    "use strict";

    var SCREENS = {

        home: {
            title: "Home Dashboard",
            text:  "The Home Dashboard is your starting point for the NHVR Bridge Asset & Restriction Management System.\n\n" +
                   "What you'll see here:\n" +
                   "• Alert Banners — Red banners for overdue inspections; orange banners for restrictions expiring within 30 days.\n" +
                   "• Network Condition Bar — Shows the distribution of bridge conditions (GOOD / FAIR / POOR / CRITICAL) across your network.\n" +
                   "• KPI Tiles — Key metrics: Total Bridges, Active Restrictions, Closed Bridges, Pending Inspections, Open Defects, Overdue Inspections.\n" +
                   "• Quick Access — Shortcuts to commonly used screens.\n" +
                   "• Role-based sections — Inspector section (Inspections, Defects) and Operator section (Permits, Vehicles, Routes) appear based on your role.\n\n" +
                   "Click any KPI tile to navigate directly to the related list screen.",
            trainingTips: "In training mode, the data shown here comes from the demo database. Try clicking a KPI tile to navigate to that list. Explore freely — no production data will be affected."
        },

        bridges: {
            title: "Bridge List",
            text:  "The Bridge List screen shows all bridge assets in the NHVR system.\n\n" +
                   "Key features:\n" +
                   "• Advanced Filter — Filter by State, Region, Condition, Posting Status, Structure Type, and dynamic attributes. Toggle AND/OR filter mode.\n" +
                   "• Saved Presets — Save your current filter as a named preset using the Presets button.\n" +
                   "• Sticky Header — Column headers stay visible as you scroll through the list.\n" +
                   "• Bridge ID Link — Click any Bridge ID to go directly to that bridge's detail record.\n" +
                   "• Condition Dots — Coloured dots next to condition values for quick visual scanning.\n" +
                   "• Export — Download the current filtered list as CSV.\n\n" +
                   "To create a new bridge, use the 'New Bridge' button in the toolbar (requires BridgeManager role).",
            trainingTips: "Try the advanced filter — apply multiple conditions and toggle between AND/OR logic. Save a preset with the Presets button and reload it later."
        },

        bridgeDetail: {
            title: "Bridge Detail",
            text:  "The Bridge Detail screen shows the complete record for a single bridge, organised into 8 tabs:\n\n" +
                   "1. Overview — Core attributes, condition score bar, posting status.\n" +
                   "2. Restrictions — All load, dimension, and speed restrictions applied to this bridge.\n" +
                   "3. Inspections — Historical inspection records.\n" +
                   "4. Inspection Orders — Planned and completed inspection work orders.\n" +
                   "5. Defects — Structural defects raised for this bridge.\n" +
                   "6. External Systems — Cross-references to BANC, VicRoads, RMS, and other external systems.\n" +
                   "7. Attributes — Custom dynamic attributes configured by administrators.\n" +
                   "8. History — Condition change history and audit log.\n\n" +
                   "The status strip at the top shows the current Condition, Posting Status, and Condition Score progress bar at a glance.\n\n" +
                   "Actions: Change Condition, Close/Reopen Bridge, Add Restriction (BridgeManager role required).",
            trainingTips: "Explore all 8 tabs on a bridge record. Try the 'Change Condition' action and notice how the condition score bar updates. The Audit Log tab shows a full history of every change."
        },

        bridgeForm: {
            title: "Bridge Form — Create / Edit",
            text:  "The Bridge Form is used to create new bridges or edit existing bridge records.\n\n" +
                   "The form is organised into sections:\n" +
                   "1. Basic Information — Bridge ID, name, state, region, LGA.\n" +
                   "2. Location — Latitude and longitude (WGS84 decimal degrees).\n" +
                   "3. Structure — Type, material, spans, dimensions, clearances.\n" +
                   "4. Condition — AS 5100.7 rating (1-10), condition label, last inspection date.\n" +
                   "5. NHVR Classification — Route, freight/over-mass status, gazette reference.\n" +
                   "6. Risk & Flags — Scour risk, flood impact, high priority flag.\n" +
                   "7. References — External IDs, source URLs.\n" +
                   "8. Notes — Free-text remarks.\n" +
                   "9. Custom Attributes — Dynamic fields configured by your administrator.\n\n" +
                   "Required fields: Bridge ID, Name, State, Asset Owner, Latitude, Longitude.",
            trainingTips: "Create a test bridge using the format 'ST-DEMO-001' as the Bridge ID. The system will validate coordinates and condition ratings in real time. Custom attributes in Section 9 are configured in Admin Config."
        },

        restrictions: {
            title: "Restrictions",
            text:  "The Restrictions screen shows all load, dimension, and speed restrictions across all bridges and routes.\n\n" +
                   "Restriction types:\n" +
                   "• GROSS_MASS / TOTAL_MASS — Maximum permissible gross vehicle mass (in tonnes).\n" +
                   "• AXLE_LOAD — Per-axle load limit.\n" +
                   "• HEIGHT — Maximum vehicle height clearance (in metres).\n" +
                   "• WIDTH — Maximum vehicle width (in metres).\n" +
                   "• SPEED — Speed restriction (in km/h).\n" +
                   "• VEHICLE_TYPE — Restriction for specific vehicle classes only.\n\n" +
                   "Temporary restrictions have a valid-from and valid-to date. They expire automatically.\n\n" +
                   "Actions: Disable Restriction, Enable Restriction, Create Temporary Restriction, Extend Temporary Restriction.",
            trainingTips: "Find a bridge with an ACTIVE restriction and try the 'Create Temporary Restriction' action. Notice how the posting status of the bridge updates automatically."
        },

        inspectionDashboard: {
            title: "Inspection Dashboard",
            text:  "The Inspection Dashboard shows all inspection work orders across the network.\n\n" +
                   "Inspection order statuses:\n" +
                   "• PLANNED — Scheduled but not yet started.\n" +
                   "• IN_PROGRESS — Inspector has commenced the inspection.\n" +
                   "• COMPLETED — Inspection completed and results recorded.\n" +
                   "• CANCELLED — Order cancelled before completion.\n\n" +
                   "Inspection types (AS 5100.7):\n" +
                   "• ROUTINE — Annual visual inspection.\n" +
                   "• PRINCIPAL — Detailed 6-yearly engineering assessment.\n" +
                   "• SPECIAL — Post-event or specific concern inspection.\n" +
                   "• UNDERWATER — For submerged bridge elements.\n\n" +
                   "Overdue inspections (past plannedDate) are highlighted in the dashboard KPI tiles.",
            trainingTips: "Create a new inspection order via the 'New Inspection' button. Assign it to a demo bridge and set a plannedDate in the past — observe how it appears in the overdue KPI on the Home dashboard."
        },

        inspectionCreate: {
            title: "Create Inspection Order",
            text:  "This form creates a new inspection work order for a specific bridge.\n\n" +
                   "Required fields:\n" +
                   "• Bridge — Select the bridge to be inspected.\n" +
                   "• Order Number — System-generated or manual reference (e.g. INS-2024-00123).\n" +
                   "• Planned Date — Scheduled inspection date.\n" +
                   "• Inspection Type — ROUTINE, PRINCIPAL, SPECIAL, UNDERWATER, POST_EVENT, or LOAD.\n\n" +
                   "Optional: Inspector name, organisation, access method, rating method, notes.\n\n" +
                   "Once created, the inspector can Start and Complete the inspection order, recording the overall condition rating and any defects found.",
            trainingTips: "Fill in all fields for a PRINCIPAL inspection type and note how the plannedDate feeds into the overdue calculation on the Home dashboard."
        },

        defects: {
            title: "Defects Register",
            text:  "The Defects screen shows all structural defects across all bridges in the system.\n\n" +
                   "Defect classification (AustRoads BIMM §4):\n" +
                   "• Categories: STRUCTURAL, SERVICEABILITY, DURABILITY, SAFETY.\n" +
                   "• Severity: LOW, MEDIUM, HIGH, CRITICAL.\n" +
                   "• Extent: LOCALISED, MODERATE, EXTENSIVE, PERVASIVE.\n" +
                   "• Structural Risk: NEGLIGIBLE, LOW, MEDIUM, HIGH, EXTREME.\n\n" +
                   "Defect statuses:\n" +
                   "• OPEN — Active defect requiring attention.\n" +
                   "• UNDER_REPAIR — Repair work in progress.\n" +
                   "• REPAIRED — Repair completed, monitoring phase.\n" +
                   "• CLOSED — Defect fully resolved.\n" +
                   "• MONITORING — Watching for progression.\n\n" +
                   "The repair estimate (AUD) feeds into the bridge investment planning module.",
            trainingTips: "Filter defects by CRITICAL severity to see which bridges have the most urgent structural issues. Open a defect and use the 'Close Defect' action to record its resolution."
        },

        massUpload: {
            title: "Mass Upload",
            text:  "The Mass Upload screen lets you import or update any data object in the NHVR system using CSV files.\n\n" +
                   "Supported entity types: Bridges, Restrictions, Routes, Vehicle Classes, Inspection Orders, Bridge Defects, Lookups.\n\n" +
                   "How to use:\n" +
                   "1. Select the data type you want to upload.\n" +
                   "2. Download the CSV template — it includes all supported columns and a sample row.\n" +
                   "3. Fill in your data using a spreadsheet tool. Save as CSV.\n" +
                   "4. Drag and drop (or browse) your completed CSV file.\n" +
                   "5. Review the Preview table — rows with errors are highlighted red.\n" +
                   "6. Click Submit Upload — only valid rows are sent. Invalid rows are skipped.\n\n" +
                   "Data integrity:\n" +
                   "• Existing records are matched by natural key and updated (UPSERT).\n" +
                   "• New records with new keys are created automatically.\n" +
                   "• All uploads are audit-logged in the Upload Log and Audit Log.",
            trainingTips: "Download the Bridges template, fill in 3-5 rows with Bridge IDs starting with 'ST-' (e.g. ST-DEMO-001), and upload it. Then check the Bridges list to see them appear."
        },

        massEdit: {
            title: "Mass Edit",
            text:  "The Mass Edit screen lets you update a specific field across multiple bridge records simultaneously.\n\n" +
                   "How to use:\n" +
                   "1. Select the bridges you want to update using the filter options.\n" +
                   "2. Choose the field to update (e.g., Asset Owner, Region, Scour Risk).\n" +
                   "3. Enter the new value.\n" +
                   "4. Click Preview — a diff dialog shows exactly what will change.\n" +
                   "5. Confirm to apply the changes.\n\n" +
                   "All mass edits are audit-logged. Use with care — bulk changes cannot be easily undone.\n\n" +
                   "Requires BridgeManager or Admin role.",
            trainingTips: "Try changing the 'scourRisk' field on 5 demo bridges from LOW to HIGH. Use the Preview dialog to review the changes before confirming."
        },

        mapView: {
            title: "Map View",
            text:  "The Map View displays all bridges on an interactive geospatial map.\n\n" +
                   "Features:\n" +
                   "• Condition Clustering — Bridge markers cluster at high zoom levels. Cluster colour indicates the worst condition in the group: red = POOR/CRITICAL, amber = FAIR, green = GOOD.\n" +
                   "• Base Map Toggle — Switch between OpenStreetMap, Satellite, Topo, and Dark base maps.\n" +
                   "• Filter Sync — Filters applied in the Bridge List sync to the Map View.\n" +
                   "• Marker Popup — Click any marker to see bridge details and a link to the full record.\n" +
                   "• Draw Tool — Draw polygons, rectangles, or circles to select bridges within an area.\n" +
                   "• Export — Export visible bridges as CSV or GeoJSON.\n\n" +
                   "Coordinates are WGS84 (EPSG:4326) and rendered using Leaflet.js.",
            trainingTips: "Zoom in on a cluster to see individual bridge markers. Click a marker to view its condition and posting status. Try the base map toggle in the toolbar."
        },

        reports: {
            title: "Reports",
            text:  "The Reports screen provides compliance and condition reports for the bridge network.\n\n" +
                   "Available reports:\n" +
                   "• Compliance Report — Bridges with condition issues, expired restrictions, or missing data.\n" +
                   "• Condition Distribution — Network condition breakdown by state, region, and structure type.\n" +
                   "• Restriction Summary — Active restrictions by type, bridge, and vehicle class.\n" +
                   "• Inspection Due Report — Bridges with overdue or upcoming inspections.\n" +
                   "• Defect Risk Report — Open defects ranked by severity and structural risk.\n\n" +
                   "All reports can be exported as CSV.",
            trainingTips: "Run the Compliance Report to see which demo bridges have data quality issues. This is a common first step when auditing a bridge register."
        },

        adminConfig: {
            title: "Admin Configuration",
            text:  "The Admin Config screen lets administrators configure the system without code changes.\n\n" +
                   "Configuration areas:\n" +
                   "• Role Configuration — Set feature and tab visibility per role (e.g. hide the 'Permits' tab for Viewers).\n" +
                   "• Attribute Definitions — Define custom dynamic fields for bridges (text, number, date, boolean, lookup).\n" +
                   "• Lookup Values — Manage dropdown options for select fields (e.g. structure types, materials).\n" +
                   "• Map Configuration — Set default map centre, zoom, base map, and overlay layers.\n\n" +
                   "Requires Admin role. Changes take effect immediately without redeployment.",
            trainingTips: "Create a new Attribute Definition of type 'BOOLEAN' named 'seismicZoneA' and add it to Bridge records. Then check the Bridge Form to see your new field appear in Section 9."
        },

        integrationHub: {
            title: "Integration Hub",
            text:  "The Integration Hub manages connections to external bridge data systems.\n\n" +
                   "Supported systems: BANC, AustRoads, RMS (NSW), VicRoads, MRWA (WA), DPTI (SA), TMR (QLD).\n\n" +
                   "Features:\n" +
                   "• Integration Config — Set up API endpoints, credentials, and sync schedules per system.\n" +
                   "• Integration Logs — View the history of data synchronisation attempts and any errors.\n" +
                   "• Manual Sync — Trigger a manual data pull from a connected system.\n\n" +
                   "Requires Admin role.",
            trainingTips: "In training mode, integration endpoints are pointed at mock services. Try adding an integration config for 'BANC' to see how the connection form works."
        },

        vehicleCombinations: {
            title: "Vehicle Combinations",
            text:  "The Vehicle Combinations screen manages NHVR heavy vehicle class definitions.\n\n" +
                   "Vehicle classes define mass and dimension limits used in restriction matching:\n" +
                   "• Code — NHVR class code (e.g. PC4, HPB5, PBS8).\n" +
                   "• Max Gross Mass (kg) — Maximum permissible gross vehicle mass.\n" +
                   "• Max Height / Width / Length — Dimensional limits in metres.\n" +
                   "• Permit Required — Whether this class always requires an NHVR permit.\n\n" +
                   "Vehicle classes are referenced in Restrictions to apply class-specific limits.",
            trainingTips: "Add a new vehicle class with code 'TRAINING-VC1' and set its mass and dimension limits. Then create a restriction that applies only to this class."
        },

        routeAssessment: {
            title: "Route Assessment",
            text:  "The Route Assessment screen checks whether a specific vehicle combination can access a named route.\n\n" +
                   "How it works:\n" +
                   "1. Select a Route (road corridor).\n" +
                   "2. Select a Vehicle Class.\n" +
                   "3. Optionally set a date/time for time-based restriction checking.\n" +
                   "4. Run the assessment — the system checks all bridges on the route against the vehicle's mass and dimension limits.\n\n" +
                   "Results show:\n" +
                   "• PASS — Vehicle can access the route.\n" +
                   "• CONDITIONAL — Route accessible with permit.\n" +
                   "• FAIL — One or more bridges cannot accommodate the vehicle.",
            trainingTips: "Select the Western Highway route and a heavy vehicle class to run a full route assessment. Examine which bridges are the bottlenecks."
        }
    };

    function getScreenHelp(key) {
        return SCREENS[key] || null;
    }

    function getAllScreenKeys() {
        return Object.keys(SCREENS);
    }

    return {
        SCREENS:       SCREENS,
        getScreenHelp: getScreenHelp,
        getAllKeys:     getAllScreenKeys
    };
});
