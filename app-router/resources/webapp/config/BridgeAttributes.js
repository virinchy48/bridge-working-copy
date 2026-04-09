// ============================================================
// NHVR Bridge Management — Bridge Attribute Registry
// SINGLE SOURCE OF TRUTH for all bridge data surfaces:
//   Bridge list columns · Filter panel · CSV export · Upload template · Edit form
//
// THE CONSISTENCY CONTRACT:
//   What you can edit = What you see in lists = What you can filter
//                     = What you download = What you upload.
//
// Key names match OData field names returned by /bridge-management/Bridges
// ============================================================
sap.ui.define([], function () {
    "use strict";

    // ── Type constants ────────────────────────────────────────
    var T = {
        STRING: "string", INTEGER: "integer", DECIMAL: "decimal",
        BOOLEAN: "boolean", DATE: "date", ENUM: "enum", TEXT: "text"
    };
    var F = {
        MULTI: "multi-select", RANGE: "range", DATE_RANGE: "date-range",
        BOOL: "boolean-toggle", CONTAINS: "contains-search",
        EXACT: "exact-search", FULLTEXT: "fulltext-search", BBOX: "map-bbox"
    };

    // ── Section definitions ───────────────────────────────────
    var SECTIONS = [
        { key: "A", label: "Identity & Registration" },
        { key: "B", label: "Physical & Geometric" },
        { key: "C", label: "Load Capacity, Safety & NHVR" },
        { key: "D", label: "Inspection, Condition & Health" },
        { key: "E", label: "Risk, Criticality & Resilience" },
        { key: "F", label: "Financial & Investment" },
        { key: "G", label: "Geospatial & Governance" }
    ];

    // ── 47-field registry ─────────────────────────────────────
    // Each field: key (= OData property name), label, shortLabel, section, sectionLabel,
    //   type, enumValues, unit, required, filterType, defaultVisible, csvColumn,
    //   uploadable, editable, helpText, placeholder
    var BRIDGE_ATTRIBUTES = [
        // ─── Section A — Identity & Registration ──────────────
        {
            key: "bridgeId", label: "Bridge ID", shortLabel: "ID",
            section: "A", sectionLabel: "Identity & Registration",
            type: T.STRING, required: true, filterType: F.EXACT,
            defaultVisible: true, csvColumn: true, uploadable: true, editable: true,
            helpText: "Unique bridge identifier in format BRG-{STATE}{REGION}-{NNN}. Auto-generated if left blank.",
            placeholder: "BRG-NSW001-001"
        },
        {
            key: "name", label: "Bridge Name", shortLabel: "Name",
            section: "A", sectionLabel: "Identity & Registration",
            type: T.STRING, required: true, filterType: F.CONTAINS,
            defaultVisible: true, csvColumn: true, uploadable: true, editable: true,
            helpText: "Official bridge name as registered in the state bridge register.",
            placeholder: "e.g. Hawkesbury River Bridge"
        },
        {
            key: "state", label: "State/Territory", shortLabel: "State",
            section: "A", sectionLabel: "Identity & Registration",
            type: T.ENUM, required: true, filterType: F.MULTI,
            enumValues: ["NSW", "VIC", "QLD", "WA", "SA", "TAS", "ACT", "NT"],
            defaultVisible: true, csvColumn: true, uploadable: true, editable: true,
            helpText: "Australian state or territory where the bridge is located.",
            placeholder: "e.g. NSW"
        },
        {
            key: "routeNumber", label: "Route Number", shortLabel: "Route No.",
            section: "A", sectionLabel: "Identity & Registration",
            type: T.STRING, required: false, filterType: F.CONTAINS,
            defaultVisible: false, csvColumn: true, uploadable: true, editable: true,
            helpText: "State road route number (e.g. A1, B52, MR529).",
            placeholder: "e.g. A32"
        },
        {
            key: "lga", label: "Local Government Area", shortLabel: "LGA",
            section: "A", sectionLabel: "Identity & Registration",
            type: T.STRING, required: false, filterType: F.CONTAINS,
            defaultVisible: false, csvColumn: true, uploadable: true, editable: true,
            helpText: "Local Government Area responsible for this bridge.",
            placeholder: "e.g. Penrith City Council"
        },
        {
            key: "region", label: "Region", shortLabel: "Region",
            section: "A", sectionLabel: "Identity & Registration",
            type: T.STRING, required: false, filterType: F.MULTI,
            defaultVisible: true, csvColumn: true, uploadable: true, editable: true,
            helpText: "Geographic or administrative region (e.g. Western NSW, South East QLD).",
            placeholder: "e.g. Western NSW"
        },
        {
            key: "assetOwner", label: "Asset Owner", shortLabel: "Owner",
            section: "A", sectionLabel: "Identity & Registration",
            type: T.STRING, required: true, filterType: F.MULTI,
            defaultVisible: false, csvColumn: true, uploadable: true, editable: true,
            helpText: "Organisation that owns this bridge asset (e.g. Transport for NSW, VicRoads).",
            placeholder: "e.g. Transport for NSW"
        },
        {
            key: "bancId", label: "BANC ID / RMS Structure No.", shortLabel: "BANC ID",
            section: "A", sectionLabel: "Identity & Registration",
            type: T.STRING, required: false, filterType: F.EXACT,
            defaultVisible: false, csvColumn: true, uploadable: true, editable: true,
            helpText: "Bridge Asset National Catalogue (BANC) ID or state register structure number.",
            placeholder: "e.g. NSW-12345"
        },

        // ─── Section B — Physical & Geometric ─────────────────
        {
            key: "totalLengthM", label: "Total Length (m)", shortLabel: "Length",
            section: "B", sectionLabel: "Physical & Geometric",
            type: T.DECIMAL, unit: "m", required: false, filterType: F.RANGE,
            defaultVisible: false, csvColumn: true, uploadable: true, editable: true,
            helpText: "Total bridge length in metres, measured end-to-end of the structure.",
            placeholder: "e.g. 45.0"
        },
        {
            key: "widthM", label: "Width (m)", shortLabel: "Width",
            section: "B", sectionLabel: "Physical & Geometric",
            type: T.DECIMAL, unit: "m", required: false, filterType: F.RANGE,
            defaultVisible: false, csvColumn: true, uploadable: true, editable: true,
            helpText: "Bridge deck width in metres (kerb to kerb or rail to rail).",
            placeholder: "e.g. 8.5"
        },
        {
            key: "numberOfSpans", label: "Number of Spans", shortLabel: "Spans",
            section: "B", sectionLabel: "Physical & Geometric",
            type: T.INTEGER, required: false, filterType: F.RANGE,
            defaultVisible: false, csvColumn: true, uploadable: true, editable: true,
            helpText: "Total number of structural spans in the bridge.",
            placeholder: "e.g. 3"
        },
        {
            key: "maxSpanLengthM", label: "Max Span Length (m)", shortLabel: "Max Span",
            section: "B", sectionLabel: "Physical & Geometric",
            type: T.DECIMAL, unit: "m", required: false, filterType: F.RANGE,
            defaultVisible: false, csvColumn: true, uploadable: true, editable: true,
            helpText: "Length of the longest single span in metres.",
            placeholder: "e.g. 30.0"
        },
        {
            key: "clearanceHeightM", label: "Vertical Clearance (m)", shortLabel: "Clearance",
            section: "B", sectionLabel: "Physical & Geometric",
            type: T.DECIMAL, unit: "m", required: false, filterType: F.RANGE,
            defaultVisible: true, csvColumn: true, uploadable: true, editable: true,
            helpText: "Minimum vertical clearance below the bridge structure in metres.",
            placeholder: "e.g. 4.60"
        },
        {
            key: "numberOfLanes", label: "Number of Lanes", shortLabel: "Lanes",
            section: "B", sectionLabel: "Physical & Geometric",
            type: T.INTEGER, required: false, filterType: F.RANGE,
            defaultVisible: false, csvColumn: true, uploadable: true, editable: true,
            helpText: "Number of traffic lanes on the bridge.",
            placeholder: "e.g. 2"
        },
        {
            key: "structureType", label: "Structure Type", shortLabel: "Type",
            section: "B", sectionLabel: "Physical & Geometric",
            type: T.ENUM, required: false, filterType: F.MULTI,
            enumValues: ["BEAM", "BOX_GIRDER", "ARCH", "TRUSS", "CABLE_STAYED", "SUSPENSION", "CULVERT", "PONTOON", "OTHER"],
            defaultVisible: true, csvColumn: true, uploadable: true, editable: true,
            helpText: "Primary structural type per AustRoads BIMM classification.",
            placeholder: ""
        },
        {
            key: "material", label: "Primary Material", shortLabel: "Material",
            section: "B", sectionLabel: "Physical & Geometric",
            type: T.STRING, required: false, filterType: F.MULTI,
            defaultVisible: false, csvColumn: true, uploadable: true, editable: true,
            helpText: "Primary construction material (e.g. Concrete, Steel, Timber, Composite).",
            placeholder: "e.g. Prestressed Concrete"
        },
        {
            key: "yearBuilt", label: "Year Built", shortLabel: "Built",
            section: "B", sectionLabel: "Physical & Geometric",
            type: T.INTEGER, required: false, filterType: F.RANGE,
            rangeMin: 1800, rangeMax: new Date().getFullYear(),
            defaultVisible: false, csvColumn: true, uploadable: true, editable: true,
            helpText: "Year the bridge was constructed or opened to traffic.",
            placeholder: "e.g. 1965"
        },
        {
            key: "designStandard", label: "Design Standard", shortLabel: "Std",
            section: "B", sectionLabel: "Physical & Geometric",
            type: T.STRING, required: false, filterType: F.MULTI,
            defaultVisible: false, csvColumn: true, uploadable: true, editable: true,
            helpText: "Design code applied (e.g. AS 5100, AUSTROADS, T44, SM1600).",
            placeholder: "e.g. AS 5100"
        },

        // ─── Section C — Load Capacity, Safety & NHVR ─────────
        {
            key: "postingStatus", label: "Posting Status", shortLabel: "Status",
            section: "C", sectionLabel: "Load Capacity, Safety & NHVR",
            type: T.ENUM, required: true, filterType: F.MULTI,
            enumValues: ["UNRESTRICTED", "RESTRICTED", "WEIGHT_RESTRICTED", "HEIGHT_RESTRICTED", "POSTED", "CLOSED"],
            defaultVisible: true, csvColumn: true, uploadable: true, editable: true,
            helpText: "Current traffic/load posting status. CLOSED = bridge closed to all traffic.",
            placeholder: ""
        },
        {
            key: "loadRating", label: "Load Rating (t)", shortLabel: "Load (t)",
            section: "C", sectionLabel: "Load Capacity, Safety & NHVR",
            type: T.DECIMAL, unit: "t", required: false, filterType: F.RANGE,
            defaultVisible: false, csvColumn: true, uploadable: true, editable: true,
            helpText: "Assessed load rating in tonnes (gross vehicle mass limit).",
            placeholder: "e.g. 42.5"
        },
        {
            key: "nhvrRouteAssessed", label: "NHVR Route Assessed", shortLabel: "NHVR",
            section: "C", sectionLabel: "Load Capacity, Safety & NHVR",
            type: T.BOOLEAN, required: false, filterType: F.BOOL,
            defaultVisible: true, csvColumn: true, uploadable: true, editable: true,
            helpText: "Has this bridge been formally assessed by NHVR for heavy vehicle route approval?",
            placeholder: ""
        },
        {
            key: "nhvrRouteApprovalClass", label: "NHVR PBS Approval Class", shortLabel: "PBS Class",
            section: "C", sectionLabel: "Load Capacity, Safety & NHVR",
            type: T.ENUM, required: false, filterType: F.MULTI,
            enumValues: ["CLASS1", "CLASS2", "CLASS3", "CLASS4", "HML", "B_DOUBLE", "B_TRIPLE", "NONE"],
            defaultVisible: false, csvColumn: true, uploadable: true, editable: true,
            helpText: "Highest NHVR Performance Based Standards (PBS) approval class for this bridge.",
            placeholder: ""
        },
        {
            key: "hmlApproved", label: "HML Approved", shortLabel: "HML",
            section: "C", sectionLabel: "Load Capacity, Safety & NHVR",
            type: T.BOOLEAN, required: false, filterType: F.BOOL,
            defaultVisible: false, csvColumn: true, uploadable: true, editable: true,
            helpText: "Has NHVR Higher Mass Limits (HML) approval been granted for this bridge?",
            placeholder: ""
        },
        {
            key: "bdoubleApproved", label: "B-Double Approved", shortLabel: "B-Dbl",
            section: "C", sectionLabel: "Load Capacity, Safety & NHVR",
            type: T.BOOLEAN, required: false, filterType: F.BOOL,
            defaultVisible: false, csvColumn: true, uploadable: true, editable: true,
            helpText: "Are B-double combination vehicles approved to cross this bridge?",
            placeholder: ""
        },
        {
            key: "freightRoute", label: "On Freight Route", shortLabel: "Freight",
            section: "C", sectionLabel: "Load Capacity, Safety & NHVR",
            type: T.BOOLEAN, required: false, filterType: F.BOOL,
            defaultVisible: true, csvColumn: true, uploadable: true, editable: true,
            helpText: "Is this bridge located on a designated NHVR freight route network?",
            placeholder: ""
        },
        {
            key: "gazetteRef", label: "Gazette Reference", shortLabel: "Gazette",
            section: "C", sectionLabel: "Load Capacity, Safety & NHVR",
            type: T.STRING, required: false, filterType: F.CONTAINS,
            defaultVisible: false, csvColumn: true, uploadable: true, editable: true,
            helpText: "State or Commonwealth Gazette reference for posted restrictions or approvals.",
            placeholder: "e.g. NSW Gazette 2024/123"
        },
        {
            key: "importanceLevel", label: "Importance Level (AS 1170)", shortLabel: "Imp. Level",
            section: "C", sectionLabel: "Load Capacity, Safety & NHVR",
            type: T.INTEGER, required: false, filterType: F.RANGE,
            rangeMin: 1, rangeMax: 4,
            defaultVisible: false, csvColumn: true, uploadable: true, editable: true,
            helpText: "AS 1170.1 structural importance level (1=low consequence, 4=exceptional). Affects design loads.",
            placeholder: "e.g. 2"
        },

        // ─── Section D — Inspection, Condition & Health ────────
        {
            key: "conditionRating", label: "Condition Rating (1–10)", shortLabel: "Rating",
            section: "D", sectionLabel: "Inspection, Condition & Health",
            type: T.INTEGER, required: false, filterType: F.RANGE,
            rangeMin: 1, rangeMax: 10,
            defaultVisible: true, csvColumn: true, uploadable: true, editable: true,
            helpText: "AS 5100.7 condition rating: 1=Failed, 10=Excellent. Drives maintenance prioritisation.",
            placeholder: "e.g. 7"
        },
        {
            key: "condition", label: "Condition Band", shortLabel: "Condition",
            section: "D", sectionLabel: "Inspection, Condition & Health",
            type: T.ENUM, required: false, filterType: F.MULTI,
            enumValues: ["EXCELLENT", "VERY_GOOD", "GOOD", "FAIR", "POOR", "VERY_POOR", "FAILED"],
            defaultVisible: false, csvColumn: true, uploadable: true, editable: true,
            helpText: "Condition band derived from condition rating. Indicates overall structural health.",
            placeholder: ""
        },
        {
            key: "structuralAdequacyRating", label: "Structural Adequacy", shortLabel: "Struct. Adq.",
            section: "D", sectionLabel: "Inspection, Condition & Health",
            type: T.INTEGER, required: false, filterType: F.RANGE,
            rangeMin: 1, rangeMax: 10,
            defaultVisible: false, csvColumn: true, uploadable: true, editable: true,
            helpText: "AustRoads BIMM structural adequacy sub-rating (1–10). Component of overall condition rating.",
            placeholder: "e.g. 6"
        },
        {
            key: "inspectionDate", label: "Last Inspection Date", shortLabel: "Inspected",
            section: "D", sectionLabel: "Inspection, Condition & Health",
            type: T.DATE, required: false, filterType: F.DATE_RANGE,
            defaultVisible: true, csvColumn: true, uploadable: true, editable: true,
            helpText: "Date of most recent formal bridge inspection.",
            placeholder: ""
        },
        {
            key: "nextInspectionDueDate", label: "Next Inspection Due", shortLabel: "Next Insp.",
            section: "D", sectionLabel: "Inspection, Condition & Health",
            type: T.DATE, required: false, filterType: F.DATE_RANGE,
            defaultVisible: false, csvColumn: true, uploadable: true, editable: true,
            helpText: "Scheduled date for next inspection per AustRoads recommended inspection intervals.",
            placeholder: ""
        },
        {
            key: "highPriorityAsset", label: "High Priority Asset", shortLabel: "Priority",
            section: "D", sectionLabel: "Inspection, Condition & Health",
            type: T.BOOLEAN, required: false, filterType: F.BOOL,
            defaultVisible: false, csvColumn: true, uploadable: true, editable: true,
            helpText: "Flagged for priority maintenance or inspection scheduling.",
            placeholder: ""
        },
        {
            key: "asBuiltDrawingRef", label: "As-Built Drawing Reference", shortLabel: "Drawing Ref",
            section: "D", sectionLabel: "Inspection, Condition & Health",
            type: T.STRING, required: false, filterType: F.CONTAINS,
            defaultVisible: false, csvColumn: true, uploadable: true, editable: true,
            helpText: "Drawing register reference number for as-built bridge drawings.",
            placeholder: "e.g. TfNSW-DRG-2024-0042"
        },
        {
            key: "scourDepthLastMeasuredM", label: "Scour Depth Last Measured (m)", shortLabel: "Scour Depth",
            section: "D", sectionLabel: "Inspection, Condition & Health",
            type: T.DECIMAL, unit: "m", required: false, filterType: F.RANGE,
            defaultVisible: false, csvColumn: true, uploadable: true, editable: true,
            helpText: "Scour hole depth in metres measured at last scour inspection.",
            placeholder: "e.g. 0.8"
        },

        // ─── Section E — Risk, Criticality & Resilience ────────
        {
            key: "scourRisk", label: "Scour Risk", shortLabel: "Scour",
            section: "E", sectionLabel: "Risk, Criticality & Resilience",
            type: T.ENUM, required: false, filterType: F.MULTI,
            enumValues: ["LOW", "MEDIUM", "HIGH", "CRITICAL"],
            defaultVisible: true, csvColumn: true, uploadable: true, editable: true,
            helpText: "Assessed scour risk level per AustRoads BIMM scour vulnerability assessment.",
            placeholder: ""
        },
        {
            key: "floodImpacted", label: "Flood Impacted", shortLabel: "Flood",
            section: "E", sectionLabel: "Risk, Criticality & Resilience",
            type: T.BOOLEAN, required: false, filterType: F.BOOL,
            defaultVisible: false, csvColumn: true, uploadable: true, editable: true,
            helpText: "Bridge has been subject to flood impacts affecting its condition or access.",
            placeholder: ""
        },
        {
            key: "floodImmunityARI", label: "Flood Immunity ARI (yrs)", shortLabel: "Flood ARI",
            section: "E", sectionLabel: "Risk, Criticality & Resilience",
            type: T.INTEGER, unit: "yrs", required: false, filterType: F.RANGE,
            defaultVisible: false, csvColumn: true, uploadable: true, editable: true,
            helpText: "Annual Recurrence Interval (ARI) design flood immunity in years (e.g. 100 = 1% AEP).",
            placeholder: "e.g. 100"
        },
        {
            key: "aadtVehicles", label: "AADT (veh/day)", shortLabel: "AADT",
            section: "E", sectionLabel: "Risk, Criticality & Resilience",
            type: T.INTEGER, unit: "veh/day", required: false, filterType: F.RANGE,
            defaultVisible: false, csvColumn: true, uploadable: true, editable: true,
            helpText: "Annual Average Daily Traffic count (all vehicles). Used for criticality assessment.",
            placeholder: "e.g. 12000"
        },
        {
            key: "heavyVehiclePct", label: "Heavy Vehicle % of AADT", shortLabel: "HV%",
            section: "E", sectionLabel: "Risk, Criticality & Resilience",
            type: T.DECIMAL, unit: "%", required: false, filterType: F.RANGE,
            defaultVisible: false, csvColumn: true, uploadable: true, editable: true,
            helpText: "Percentage of AADT that are heavy vehicles (GVM > 4.5t).",
            placeholder: "e.g. 12.5"
        },

        // ─── Section F — Financial & Investment ───────────────
        {
            key: "currentReplacementCost", label: "Replacement Cost ($)", shortLabel: "Replacement $",
            section: "F", sectionLabel: "Financial & Investment",
            type: T.DECIMAL, unit: "AUD", required: false, filterType: F.RANGE,
            defaultVisible: false, csvColumn: true, uploadable: true, editable: true,
            helpText: "Current estimated cost to replace this bridge with an equivalent new structure (AUD).",
            placeholder: "e.g. 2500000"
        },
        {
            key: "remainingUsefulLifeYrs", label: "Remaining Useful Life (yr)", shortLabel: "Rem. Life",
            section: "F", sectionLabel: "Financial & Investment",
            type: T.INTEGER, unit: "yrs", required: false, filterType: F.RANGE,
            defaultVisible: false, csvColumn: true, uploadable: true, editable: true,
            helpText: "Estimated remaining useful service life in years before replacement is required.",
            placeholder: "e.g. 25"
        },
        {
            key: "designLife", label: "Design Life (yr)", shortLabel: "Design Life",
            section: "F", sectionLabel: "Financial & Investment",
            type: T.INTEGER, unit: "yrs", required: false, filterType: F.RANGE,
            defaultVisible: false, csvColumn: true, uploadable: true, editable: true,
            helpText: "Intended design service life in years per AS 5100 (typically 100 years for new bridges).",
            placeholder: "e.g. 100"
        },

        // ─── Section G — Geospatial & Governance ──────────────
        {
            key: "latitude", label: "Latitude (GDA2020)", shortLabel: "Lat",
            section: "G", sectionLabel: "Geospatial & Governance",
            type: T.DECIMAL, required: true, filterType: F.BBOX,
            defaultVisible: false, csvColumn: true, uploadable: true, editable: true,
            helpText: "Decimal degrees latitude in GDA2020 datum. Range: -90 to 90 (Australia: approx -10 to -44).",
            placeholder: "e.g. -33.8688"
        },
        {
            key: "longitude", label: "Longitude (GDA2020)", shortLabel: "Lon",
            section: "G", sectionLabel: "Geospatial & Governance",
            type: T.DECIMAL, required: true, filterType: F.BBOX,
            defaultVisible: false, csvColumn: true, uploadable: true, editable: true,
            helpText: "Decimal degrees longitude in GDA2020 datum. Range: -180 to 180 (Australia: approx 113 to 154).",
            placeholder: "e.g. 151.2093"
        },
        {
            key: "remarks", label: "Remarks / Notes", shortLabel: "Remarks",
            section: "G", sectionLabel: "Geospatial & Governance",
            type: T.TEXT, required: false, filterType: F.FULLTEXT,
            defaultVisible: false, csvColumn: true, uploadable: true, editable: true,
            helpText: "Free-text remarks, condition notes, or supplementary information about this bridge.",
            placeholder: "Any additional notes or condition remarks..."
        },
        {
            key: "dataSource", label: "Data Source", shortLabel: "Source",
            section: "G", sectionLabel: "Geospatial & Governance",
            type: T.STRING, required: false, filterType: F.MULTI,
            defaultVisible: false, csvColumn: true, uploadable: true, editable: true,
            helpText: "Origin of this bridge record (e.g. TfNSW Open Data, VicRoads BRAMS, NHVR manual entry).",
            placeholder: "e.g. TfNSW Open Data Portal"
        }
    ];

    // ── Helper functions ──────────────────────────────────────

    /** Returns attributes where filterType is not null and not map-bbox */
    function getFilterableAttributes(attrs) {
        return (attrs || BRIDGE_ATTRIBUTES).filter(function (a) {
            return a.filterType && a.filterType !== "map-bbox";
        });
    }

    /** Returns attributes where defaultVisible = true */
    function getDefaultVisibleColumns(attrs) {
        return (attrs || BRIDGE_ATTRIBUTES).filter(function (a) { return a.defaultVisible; });
    }

    /** Returns attributes where csvColumn = true */
    function getCsvColumns(attrs) {
        return (attrs || BRIDGE_ATTRIBUTES).filter(function (a) { return a.csvColumn; });
    }

    /** Returns attributes where uploadable = true */
    function getUploadableColumns(attrs) {
        return (attrs || BRIDGE_ATTRIBUTES).filter(function (a) { return a.uploadable; });
    }

    /** Returns sections with their attributes grouped */
    function getSections(attrs) {
        var src = attrs || BRIDGE_ATTRIBUTES;
        return SECTIONS.map(function (sec) {
            return {
                key: sec.key,
                label: sec.label,
                attributes: src.filter(function (a) { return a.section === sec.key; })
            };
        }).filter(function (s) { return s.attributes.length > 0; });
    }

    /** Returns a human-readable display label for an enum value */
    function enumLabel(value) {
        var MAP = {
            UNRESTRICTED: "Unrestricted", RESTRICTED: "Restricted",
            WEIGHT_RESTRICTED: "Weight Restricted", HEIGHT_RESTRICTED: "Height Restricted",
            POSTED: "Posted", CLOSED: "Closed",
            EXCELLENT: "Excellent", VERY_GOOD: "Very Good", GOOD: "Good",
            FAIR: "Fair", POOR: "Poor", VERY_POOR: "Very Poor", FAILED: "Failed",
            LOW: "Low", MEDIUM: "Medium", HIGH: "High", CRITICAL: "Critical",
            BEAM: "Beam", BOX_GIRDER: "Box Girder", ARCH: "Arch", TRUSS: "Truss",
            CABLE_STAYED: "Cable Stayed", SUSPENSION: "Suspension",
            CULVERT: "Culvert", PONTOON: "Pontoon", OTHER: "Other",
            NSW: "NSW", VIC: "VIC", QLD: "QLD", WA: "WA",
            SA: "SA", TAS: "TAS", ACT: "ACT", NT: "NT",
            CLASS1: "Class 1", CLASS2: "Class 2", CLASS3: "Class 3", CLASS4: "Class 4",
            HML: "HML", B_DOUBLE: "B-Double", B_TRIPLE: "B-Triple", NONE: "None"
        };
        return MAP[value] || value;
    }

    /** Status badge CSS class for postingStatus */
    function postingStatusClass(value) {
        var MAP = {
            UNRESTRICTED: "nhvrStatusGreen", RESTRICTED: "nhvrStatusAmber",
            WEIGHT_RESTRICTED: "nhvrStatusOrange", HEIGHT_RESTRICTED: "nhvrStatusBlue",
            POSTED: "nhvrStatusAmber", CLOSED: "nhvrStatusRed"
        };
        return MAP[value] || "";
    }

    /** Condition badge CSS class */
    function conditionClass(value) {
        var MAP = {
            EXCELLENT: "nhvrCondGreen", VERY_GOOD: "nhvrCondGreen",
            GOOD: "nhvrCondTeal", FAIR: "nhvrCondAmber",
            POOR: "nhvrCondOrange", VERY_POOR: "nhvrCondRed", FAILED: "nhvrCondRed"
        };
        return MAP[value] || "";
    }

    /** Scour risk CSS class */
    function scourRiskClass(value) {
        var MAP = { LOW: "nhvrStatusGreen", MEDIUM: "nhvrStatusAmber", HIGH: "nhvrStatusOrange", CRITICAL: "nhvrStatusRed" };
        return MAP[value] || "";
    }

    /** Format a cell value for display per field type */
    function formatValue(attr, value) {
        if (value === null || value === undefined || value === "") return "—";
        switch (attr.type) {
            case T.BOOLEAN:
                return value ? "Yes" : "No";
            case T.DECIMAL:
                var num = parseFloat(value);
                if (isNaN(num)) return "—";
                return attr.unit ? num.toFixed(2) + "\u00a0" + attr.unit : num.toFixed(2);
            case T.DATE:
                var d = new Date(value);
                if (isNaN(d.getTime())) return value;
                return d.toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" });
            case T.ENUM:
                return enumLabel(value);
            default:
                return String(value);
        }
    }

    /** Format a cell value for CSV output (Excel-safe) */
    function formatCsvValue(attr, value) {
        if (value === null || value === undefined || value === "") return "";
        switch (attr.type) {
            case T.BOOLEAN:
                return value ? "Yes" : "No";
            case T.DATE:
                // ISO date string prevents Excel date mangling
                return typeof value === "string" ? value.substring(0, 10) : value;
            case T.DECIMAL:
                var n = parseFloat(value);
                return isNaN(n) ? "" : n.toFixed(2);
            case T.ENUM:
                return enumLabel(value);
            default:
                return String(value);
        }
    }

    return {
        BRIDGE_ATTRIBUTES: BRIDGE_ATTRIBUTES,
        SECTIONS: SECTIONS,
        FilterType: F,
        DataType: T,
        getFilterableAttributes: getFilterableAttributes,
        getDefaultVisibleColumns: getDefaultVisibleColumns,
        getCsvColumns: getCsvColumns,
        getUploadableColumns: getUploadableColumns,
        getSections: getSections,
        enumLabel: enumLabel,
        postingStatusClass: postingStatusClass,
        conditionClass: conditionClass,
        scourRiskClass: scourRiskClass,
        formatValue: formatValue,
        formatCsvValue: formatCsvValue
    };
});
