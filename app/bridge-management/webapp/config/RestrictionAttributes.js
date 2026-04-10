// ============================================================
// NHVR Bridge Management — Restriction Attribute Registry
// SINGLE SOURCE OF TRUTH for restriction data surfaces:
//   Restriction list columns · Filter panel · CSV export · Upload template
//
// Key names match OData field names from /bridge-management/Restrictions
// ============================================================
sap.ui.define([], function () {
    "use strict";

    var T = {
        STRING: "string", INTEGER: "integer", DECIMAL: "decimal",
        BOOLEAN: "boolean", DATE: "date", ENUM: "enum", TEXT: "text"
    };
    var F = {
        MULTI: "multi-select", RANGE: "range", DATE_RANGE: "date-range",
        BOOL: "boolean-toggle", CONTAINS: "contains-search",
        EXACT: "exact-search", FULLTEXT: "fulltext-search"
    };

    var SECTIONS = [
        { key: "identity",    label: "Identity" },
        { key: "spec",        label: "Specification" },
        { key: "compliance",  label: "Dates & Compliance" }
    ];

    // ── 17-field registry ─────────────────────────────────────
    var RESTRICTION_ATTRIBUTES = [
        // ─── Identity ─────────────────────────────────────────
        {
            key: "nhvrRef", label: "Restriction Ref", shortLabel: "Restriction Ref",
            section: "identity", sectionLabel: "Identity",
            type: T.STRING, required: false, filterType: F.CONTAINS,
            defaultVisible: true, csvColumn: true, uploadable: false, editable: false,
            helpText: "NHVR human-readable restriction reference (e.g. NHVR-BRG-NSW-002-R001). Read-only.",
            placeholder: ""
        },
        {
            key: "ID", label: "System ID (UUID)", shortLabel: "UUID",
            section: "identity", sectionLabel: "Identity",
            type: T.STRING, required: false, filterType: F.EXACT,
            defaultVisible: false, csvColumn: true, uploadable: false, editable: false,
            helpText: "Unique system-generated restriction identifier (UUID). Read-only.",
            placeholder: ""
        },
        {
            key: "bridge_bridgeId", label: "Bridge ID", shortLabel: "Bridge ID",
            section: "identity", sectionLabel: "Identity",
            type: T.STRING, required: true, filterType: F.EXACT,
            defaultVisible: true, csvColumn: true, uploadable: true, editable: true,
            helpText: "Bridge ID this restriction applies to. Must match an existing bridge record.",
            placeholder: "e.g. BRG-NSW001-001"
        },
        {
            key: "bridge_name", label: "Bridge Name", shortLabel: "Bridge",
            section: "identity", sectionLabel: "Identity",
            type: T.STRING, required: false, filterType: F.CONTAINS,
            defaultVisible: true, csvColumn: true, uploadable: false, editable: false,
            helpText: "Bridge name (read-only, derived from Bridge ID).",
            placeholder: ""
        },
        {
            key: "bridge_state", label: "State", shortLabel: "State",
            section: "identity", sectionLabel: "Identity",
            type: T.ENUM, required: false, filterType: F.MULTI,
            enumValues: [],          /* loaded at runtime from Lookups(STATE) */
            defaultVisible: false, csvColumn: true, uploadable: false, editable: false,
            helpText: "State/territory (read-only, derived from bridge record).",
            placeholder: ""
        },

        // ─── Specification ────────────────────────────────────
        {
            key: "restrictionType", label: "Restriction Type", shortLabel: "Type",
            section: "spec", sectionLabel: "Specification",
            type: T.ENUM, required: true, filterType: F.MULTI,
            enumValues: [],          /* loaded at runtime from Lookups(RESTRICTION_TYPE) */
            defaultVisible: true, csvColumn: true, uploadable: true, editable: true,
            helpText: "Category of restriction. GROSS_MASS = total vehicle mass limit; AXLE_LOAD = per-axle; HEIGHT/WIDTH/LENGTH = dimensional.",
            placeholder: ""
        },
        {
            key: "value", label: "Limit Value", shortLabel: "Value",
            section: "spec", sectionLabel: "Specification",
            type: T.DECIMAL, required: true, filterType: F.RANGE,
            defaultVisible: true, csvColumn: true, uploadable: true, editable: true,
            helpText: "Numeric value of the restriction. Unit is shown in the Unit column (t, m, km/h).",
            placeholder: "e.g. 42.5"
        },
        {
            key: "unit", label: "Unit", shortLabel: "Unit",
            section: "spec", sectionLabel: "Specification",
            type: T.ENUM, required: true, filterType: F.MULTI,
            enumValues: ["t", "kN", "m", "km/h"],  /* measurement units — immutable physical constants, not domain data */
            defaultVisible: true, csvColumn: true, uploadable: true, editable: true,
            helpText: "Measurement unit for the restriction value. Auto-set based on restriction type.",
            placeholder: ""
        },
        {
            key: "vehicleClass_name", label: "Vehicle Class", shortLabel: "Vehicle Class",
            section: "spec", sectionLabel: "Specification",
            type: T.STRING, required: false, filterType: F.MULTI,
            defaultVisible: true, csvColumn: true, uploadable: true, editable: true,
            helpText: "NHVR-defined vehicle class this restriction applies to. Leave blank for all vehicles.",
            placeholder: ""
        },
        {
            key: "status", label: "Status", shortLabel: "Status",
            section: "spec", sectionLabel: "Specification",
            type: T.ENUM, required: true, filterType: F.MULTI,
            enumValues: [],          /* loaded at runtime from Lookups(RESTRICTION_STATUS) */
            defaultVisible: true, csvColumn: true, uploadable: true, editable: true,
            helpText: "Current status. ACTIVE = in force; EXPIRED = validToDate has passed; SEASONAL = date-bounded annual restriction.",
            placeholder: ""
        },
        {
            key: "isTemporary", label: "Temporary Restriction", shortLabel: "Temp.",
            section: "spec", sectionLabel: "Specification",
            type: T.BOOLEAN, required: true, filterType: F.BOOL,
            defaultVisible: true, csvColumn: true, uploadable: true, editable: true,
            helpText: "Is this restriction temporary? Temporary restrictions require validFromDate and validToDate.",
            placeholder: ""
        },
        {
            key: "permitRequired", label: "Permit Required", shortLabel: "Permit",
            section: "spec", sectionLabel: "Specification",
            type: T.BOOLEAN, required: false, filterType: F.BOOL,
            defaultVisible: true, csvColumn: true, uploadable: true, editable: true,
            helpText: "Does a vehicle exceeding this restriction require a specific NHVR permit to cross?",
            placeholder: ""
        },

        // ─── Dates & Compliance ───────────────────────────────
        {
            key: "validFromDate", label: "Valid From", shortLabel: "From",
            section: "compliance", sectionLabel: "Dates & Compliance",
            type: T.DATE, required: "conditional", filterType: F.DATE_RANGE,
            defaultVisible: true, csvColumn: true, uploadable: true, editable: true,
            helpText: "Date restriction comes into effect. Required for temporary restrictions.",
            placeholder: ""
        },
        {
            key: "validToDate", label: "Valid To", shortLabel: "To",
            section: "compliance", sectionLabel: "Dates & Compliance",
            type: T.DATE, required: "conditional", filterType: F.DATE_RANGE,
            defaultVisible: true, csvColumn: true, uploadable: true, editable: true,
            helpText: "Date restriction expires. Required for temporary restrictions.",
            placeholder: ""
        },
        {
            key: "gazetteRef", label: "NHVR Gazette Reference", shortLabel: "Gazette",
            section: "compliance", sectionLabel: "Dates & Compliance",
            type: T.STRING, required: false, filterType: F.CONTAINS,
            defaultVisible: true, csvColumn: true, uploadable: true, editable: true,
            helpText: "Gazette or legal reference authorising this restriction.",
            placeholder: "e.g. NSW Gazette 2024/123"
        },
        {
            key: "approvedBy", label: "Approved By", shortLabel: "Approved By",
            section: "compliance", sectionLabel: "Dates & Compliance",
            type: T.STRING, required: "conditional", filterType: F.CONTAINS,
            defaultVisible: false, csvColumn: true, uploadable: true, editable: true,
            helpText: "Name or role of approving authority. Required when gazetteRef is provided.",
            placeholder: "e.g. Chief Engineer, TfNSW"
        },
        {
            key: "notes", label: "Reason / Justification", shortLabel: "Reason",
            section: "compliance", sectionLabel: "Dates & Compliance",
            type: T.TEXT, required: "conditional", filterType: F.FULLTEXT,
            defaultVisible: false, csvColumn: true, uploadable: true, editable: true,
            helpText: "Technical justification or reason for this restriction.",
            placeholder: "e.g. Load rating assessment identified structural deficiency in pier cap."
        },
        {
            key: "isDisabled", label: "Disabled", shortLabel: "Disabled",
            section: "compliance", sectionLabel: "Dates & Compliance",
            type: T.BOOLEAN, required: false, filterType: F.BOOL,
            defaultVisible: false, csvColumn: true, uploadable: false, editable: true,
            helpText: "Restriction has been disabled (superseded or removed from enforcement). Kept for audit history.",
            placeholder: ""
        }
    ];

    // ── Quick-filter presets ──────────────────────────────────
    var QUICK_FILTERS = [
        { key: "active",       label: "Active",              filter: { status: ["ACTIVE"] } },
        { key: "expiringWeek", label: "Expiring This Week",  filter: { status: ["ACTIVE"], validToDate_lte: 7 } },
        { key: "temporary",    label: "Temporary",           filter: { isTemporary: true } },
        { key: "noGazette",    label: "Missing Gazette Ref", filter: { gazetteRef_empty: true } },
        { key: "permit",       label: "Permit Required",     filter: { permitRequired: true } },
        { key: "disabled",     label: "Disabled",            filter: { isDisabled: true } }
    ];

    // ── Helpers ───────────────────────────────────────────────
    function getFilterableAttributes(attrs) {
        return (attrs || RESTRICTION_ATTRIBUTES).filter(function (a) { return !!a.filterType; });
    }
    function getDefaultVisibleColumns(attrs) {
        return (attrs || RESTRICTION_ATTRIBUTES).filter(function (a) { return a.defaultVisible; });
    }
    function getCsvColumns(attrs) {
        return (attrs || RESTRICTION_ATTRIBUTES).filter(function (a) { return a.csvColumn; });
    }
    function getUploadableColumns(attrs) {
        return (attrs || RESTRICTION_ATTRIBUTES).filter(function (a) { return a.uploadable; });
    }
    function getSections(attrs) {
        var src = attrs || RESTRICTION_ATTRIBUTES;
        return SECTIONS.map(function (sec) {
            return {
                key: sec.key, label: sec.label,
                attributes: src.filter(function (a) { return a.section === sec.key; })
            };
        }).filter(function (s) { return s.attributes.length > 0; });
    }

    function enumLabel(value) {
        var MAP = {
            GROSS_MASS: "Gross Mass", AXLE_LOAD: "Axle Load", HEIGHT: "Height",
            WIDTH: "Width", LENGTH: "Length", WIND_SPEED: "Wind Speed",
            FLOOD_CLOSURE: "Flood Closure", VEHICLE_TYPE: "Vehicle Type", SPEED: "Speed",
            ACTIVE: "Active", INACTIVE: "Inactive", EXPIRED: "Expired", SEASONAL: "Seasonal"
        };
        return MAP[value] || value;
    }

    function statusClass(value) {
        var MAP = {
            ACTIVE: "nhvrStatusGreen", INACTIVE: "nhvrStatusGrey",
            EXPIRED: "nhvrStatusRed", SEASONAL: "nhvrStatusAmber"
        };
        return MAP[value] || "";
    }

    function formatValue(attr, value) {
        if (value === null || value === undefined || value === "") return "—";
        if (attr.type === T.BOOLEAN) return value ? "Yes" : "No";
        if (attr.type === T.DATE) {
            var d = new Date(value);
            if (!isNaN(d.getTime())) return d.toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" });
        }
        if (attr.type === T.ENUM) return enumLabel(value);
        if (attr.type === T.DECIMAL) {
            var n = parseFloat(value);
            return isNaN(n) ? "—" : n.toFixed(3);
        }
        return String(value);
    }

    function formatCsvValue(attr, value) {
        if (value === null || value === undefined || value === "") return "";
        if (attr.type === T.BOOLEAN) return value ? "Yes" : "No";
        if (attr.type === T.DATE) return typeof value === "string" ? value.substring(0, 10) : String(value);
        if (attr.type === T.ENUM) return enumLabel(value);
        if (attr.type === T.DECIMAL) { var n = parseFloat(value); return isNaN(n) ? "" : n.toFixed(3); }
        return String(value);
    }

    return {
        RESTRICTION_ATTRIBUTES: RESTRICTION_ATTRIBUTES,
        SECTIONS: SECTIONS,
        QUICK_FILTERS: QUICK_FILTERS,
        FilterType: F,
        DataType: T,
        getFilterableAttributes: getFilterableAttributes,
        getDefaultVisibleColumns: getDefaultVisibleColumns,
        getCsvColumns: getCsvColumns,
        getUploadableColumns: getUploadableColumns,
        getSections: getSections,
        enumLabel: enumLabel,
        statusClass: statusClass,
        formatValue: formatValue,
        formatCsvValue: formatCsvValue
    };
});
