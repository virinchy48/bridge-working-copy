// ============================================================
// NHVR Bridge Management — CSV Upload Template Generator
// Generates structured templates for bulk bridge / restriction import.
//
// Template structure (6 header rows + data rows):
//   Row 1 — Column label (human-readable)
//   Row 2 — Data type (Text / Number / Date / Enum: A|B|C)
//   Row 3 — Required status (Required / Optional / Conditional: ...)
//   Row 4 — Help text
//   Row 5 — Example value
//   Row 6 — (blank separator)
//   Row 7+ — Empty data rows
//
// Usage:
//   CsvTemplate.downloadBridgeTemplate({ requiredOnly: false })
//   CsvTemplate.downloadRestrictionTemplate()
//   CsvTemplate.parseCsvWithHeaders(csvText) → { headers, rows }
//   CsvTemplate.validateBridgeRow(row, registry) → { valid, errors }
// ============================================================
sap.ui.define([
    "nhvr/bridgemanagement/config/BridgeAttributes",
    "nhvr/bridgemanagement/config/RestrictionAttributes"
], function (BridgeAttrs, RestrictionAttrs) {
    "use strict";

    // ── Examples ──────────────────────────────────────────────
    var BRIDGE_EXAMPLES = {
        bridgeId: "BRG-NSW001-001", name: "Hawkesbury River Bridge",
        state: "NSW", routeNumber: "A32", lga: "Penrith City Council",
        region: "Western NSW", assetOwner: "Transport for NSW",
        bancId: "NSW-12345", totalLengthM: "45.0", widthM: "8.5",
        numberOfSpans: "3", maxSpanLengthM: "15.0", clearanceHeightM: "4.60",
        numberOfLanes: "2", structureType: "BEAM", material: "Prestressed Concrete",
        yearBuilt: "1965", designStandard: "AS 5100",
        postingStatus: "UNRESTRICTED", loadRating: "42.5",
        nhvrRouteAssessed: "Yes", nhvrRouteApprovalClass: "B_DOUBLE",
        hmlApproved: "No", bdoubleApproved: "Yes", freightRoute: "Yes",
        gazetteRef: "NSW Gazette 2024/123", importanceLevel: "2",
        conditionRating: "7", condition: "GOOD", structuralAdequacyRating: "6",
        inspectionDate: "2024-03-15", nextInspectionDueDate: "2026-03-15",
        highPriorityAsset: "No", asBuiltDrawingRef: "TfNSW-DRG-2024-0042",
        scourDepthLastMeasuredM: "0.8", scourRisk: "MEDIUM",
        floodImpacted: "No", floodImmunityARI: "100", aadtVehicles: "12000",
        heavyVehiclePct: "12.5", currentReplacementCost: "2500000",
        remainingUsefulLifeYrs: "25", designLife: "100",
        latitude: "-33.5678", longitude: "150.9012",
        remarks: "Scour monitoring required during flood events.",
        dataSource: "TfNSW Open Data Portal"
    };

    var RESTRICTION_EXAMPLES = {
        bridge_bridgeId: "BRG-NSW001-001", restrictionType: "GROSS_MASS",
        value: "42.5", unit: "t", vehicleClass_name: "Class 2",
        status: "ACTIVE", isTemporary: "No", permitRequired: "No",
        validFromDate: "", validToDate: "", gazetteRef: "NSW Gazette 2024/123",
        approvedBy: "Chief Engineer, TfNSW",
        notes: "Load rating assessment identified reduced capacity.",
        isDisabled: "No"
    };

    // ── Type label helper ─────────────────────────────────────
    function typeLabel(attr) {
        if (attr.type === "enum") {
            return "Enum: " + (attr.enumValues || []).join(" | ");
        }
        var MAP = {
            string: "Text", integer: "Number (integer)", decimal: "Number (decimal)",
            boolean: "Yes or No", date: "Date (YYYY-MM-DD)", text: "Text (long)"
        };
        return MAP[attr.type] || "Text";
    }

    function requiredLabel(attr) {
        if (attr.required === true)        return "Required";
        if (attr.required === "conditional") return "Conditional: see help row";
        return "Optional";
    }

    // ── CSV cell escaping ─────────────────────────────────────
    function esc(v) {
        var s = v === null || v === undefined ? "" : String(v);
        return (s.indexOf(",") !== -1 || s.indexOf('"') !== -1 || s.indexOf("\n") !== -1)
            ? '"' + s.replace(/"/g, '""') + '"' : s;
    }
    function rowToCsv(row) { return row.map(esc).join(","); }

    function today() { return new Date().toISOString().substring(0, 10); }

    // ── Download helper ───────────────────────────────────────
    function download(csvString, filename) {
        var BOM = "\uFEFF";
        var blob = new Blob([BOM + csvString], { type: "text/csv;charset=utf-8;" });
        var url = URL.createObjectURL(blob);
        var a = document.createElement("a");
        a.href = url; a.download = filename;
        document.body.appendChild(a); a.click();
        setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
    }

    // ── Core template builder ─────────────────────────────────
    function buildTemplate(attrs, examples, extraNotes) {
        var rows = [];

        // Row 1 — human-readable headers
        rows.push(attrs.map(function (a) { return a.label; }));
        // Row 2 — data types
        rows.push(attrs.map(typeLabel));
        // Row 3 — required status
        rows.push(attrs.map(requiredLabel));
        // Row 4 — help text
        rows.push(attrs.map(function (a) { return a.helpText; }));
        // Row 5 — example values
        rows.push(attrs.map(function (a) { return examples[a.key] !== undefined ? examples[a.key] : ""; }));
        // Row 6 — blank separator
        rows.push([]);

        // 5 empty data rows
        for (var i = 0; i < 5; i++) {
            rows.push(attrs.map(function () { return ""; }));
        }

        return rows.map(rowToCsv).join("\r\n");
    }

    // ── Public API ────────────────────────────────────────────

    /**
     * Download the bridge upload template CSV.
     * @param {object} [options]
     *   @param {boolean} [options.requiredOnly=false] - include only required/conditional fields
     */
    function downloadBridgeTemplate(options) {
        options = options || {};
        var attrs = BridgeAttrs.getUploadableColumns();
        if (options.requiredOnly) {
            attrs = attrs.filter(function (a) { return a.required === true || a.required === "conditional"; });
        }
        var csv = buildTemplate(attrs, BRIDGE_EXAMPLES);
        download(csv, "NHVR-Bridge-Upload-Template-" + today() + ".csv");
        return { cols: attrs.length };
    }

    /**
     * Download the restriction upload template CSV.
     * Includes a 'BRIDGE_ID_LOOKUP' helper column (not imported).
     */
    function downloadRestrictionTemplate(options) {
        options = options || {};
        var attrs = RestrictionAttrs.getUploadableColumns();

        // Build CSV manually to add helper column
        var headerRow = attrs.map(function (a) { return a.label; }).concat(["BRIDGE_ID_LOOKUP (helper — do not import)"]);
        var typeRow   = attrs.map(typeLabel).concat(["Helper column — enter bridge name to look up ID"]);
        var reqRow    = attrs.map(requiredLabel).concat(["Helper — not imported"]);
        var helpRow   = attrs.map(function (a) { return a.helpText; }).concat(["Type bridge name here to find its Bridge ID. Not imported."]);
        var exRow     = attrs.map(function (a) { return RESTRICTION_EXAMPLES[a.key] || ""; }).concat(["Hawkesbury River Bridge"]);

        var rows = [headerRow, typeRow, reqRow, helpRow, exRow, []];
        for (var i = 0; i < 5; i++) {
            rows.push(attrs.map(function () { return ""; }).concat([""]));
        }

        var csv = rows.map(rowToCsv).join("\r\n");
        download(csv, "NHVR-Restriction-Upload-Template-" + today() + ".csv");
        return { cols: attrs.length };
    }

    /**
     * Parse a CSV string into { headers (row 0), rows (rows 1+) }
     * Simple parser — handles quoted fields with commas.
     */
    function parseCsvWithHeaders(csvText) {
        var lines = csvText.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
        var result = [];
        lines.forEach(function (line) {
            var row = [];
            var inQuote = false, cell = "";
            for (var i = 0; i < line.length; i++) {
                var c = line[i];
                if (c === '"') {
                    if (inQuote && line[i + 1] === '"') { cell += '"'; i++; }
                    else { inQuote = !inQuote; }
                } else if (c === "," && !inQuote) {
                    row.push(cell); cell = "";
                } else {
                    cell += c;
                }
            }
            row.push(cell);
            result.push(row);
        });
        if (!result.length) return { headers: [], rows: [] };
        return { headers: result[0], rows: result.slice(1) };
    }

    /**
     * Map a parsed CSV row (using column headers) to a bridge object.
     * Supports both human-readable headers (label) and camelCase keys.
     * @param {string[]}      headers    - header row
     * @param {string[]}      rowValues  - data row
     * @returns {object}                 - key→value mapped to schema field keys
     */
    function mapBridgeRow(headers, rowValues) {
        var attrs = BridgeAttrs.BRIDGE_ATTRIBUTES;
        var labelMap = {};
        var keyMap = {};
        attrs.forEach(function (a) {
            labelMap[a.label.toLowerCase()] = a.key;
            keyMap[a.key.toLowerCase()]     = a.key;
        });

        var obj = {};
        headers.forEach(function (h, i) {
            var lh = h.trim().toLowerCase();
            var fieldKey = labelMap[lh] || keyMap[lh];
            if (fieldKey) obj[fieldKey] = (rowValues[i] || "").trim();
        });
        return obj;
    }

    /**
     * Validate a single mapped bridge row against the attribute registry.
     * @param {object} row       - key→value bridge object (string values from CSV)
     * @returns {{ valid: boolean, errors: {field, value, message}[] }}
     */
    function validateBridgeRow(row) {
        var attrs = BridgeAttrs.BRIDGE_ATTRIBUTES;
        var errors = [];

        attrs.forEach(function (attr) {
            var raw = row[attr.key];
            var isEmpty = raw === undefined || raw === null || raw.trim() === "";

            // Required check
            if (attr.required === true && isEmpty) {
                errors.push({ field: attr.key, value: raw, message: attr.label + " is required." });
                return;
            }
            if (isEmpty) return; // optional empty = ok

            // Enum validation
            if (attr.type === "enum" && attr.enumValues) {
                if (attr.enumValues.indexOf(raw.trim().toUpperCase()) === -1 &&
                    attr.enumValues.indexOf(raw.trim()) === -1) {
                    errors.push({ field: attr.key, value: raw,
                        message: attr.label + ': invalid value "' + raw + '". Valid: ' + attr.enumValues.join(", ") });
                }
            }

            // Range validation (integers/decimals)
            if (attr.type === "integer" || attr.type === "decimal") {
                var n = parseFloat(raw);
                if (isNaN(n)) {
                    errors.push({ field: attr.key, value: raw, message: attr.label + " must be a number." });
                } else {
                    if (attr.rangeMin !== undefined && n < attr.rangeMin) {
                        errors.push({ field: attr.key, value: raw, message: attr.label + " must be ≥ " + attr.rangeMin });
                    }
                    if (attr.rangeMax !== undefined && n > attr.rangeMax) {
                        errors.push({ field: attr.key, value: raw, message: attr.label + " must be ≤ " + attr.rangeMax });
                    }
                }
            }

            // Date validation
            if (attr.type === "date") {
                var d = new Date(raw);
                if (isNaN(d.getTime())) {
                    errors.push({ field: attr.key, value: raw, message: attr.label + ": invalid date format. Use YYYY-MM-DD." });
                }
            }

            // Boolean validation
            if (attr.type === "boolean") {
                var lv = raw.trim().toLowerCase();
                if (lv !== "yes" && lv !== "no" && lv !== "true" && lv !== "false" && lv !== "1" && lv !== "0") {
                    errors.push({ field: attr.key, value: raw, message: attr.label + ': use "Yes" or "No".' });
                }
            }
        });

        // Lat/lon range check
        if (row.latitude !== undefined && row.latitude.trim() !== "") {
            var lat = parseFloat(row.latitude);
            if (!isNaN(lat) && (lat < -90 || lat > 90)) {
                errors.push({ field: "latitude", value: row.latitude, message: "Latitude must be between -90 and 90." });
            }
        }
        if (row.longitude !== undefined && row.longitude.trim() !== "") {
            var lon = parseFloat(row.longitude);
            if (!isNaN(lon) && (lon < -180 || lon > 180)) {
                errors.push({ field: "longitude", value: row.longitude, message: "Longitude must be between -180 and 180." });
            }
        }

        return { valid: errors.length === 0, errors: errors };
    }

    /**
     * Coerce a mapped CSV bridge row's string values to proper types.
     * Produces a ready-to-POST OData record.
     */
    function coerceBridgeRow(row) {
        var attrs = BridgeAttrs.BRIDGE_ATTRIBUTES;
        var out = {};
        attrs.forEach(function (attr) {
            var raw = (row[attr.key] || "").trim();
            if (raw === "") { out[attr.key] = null; return; }

            switch (attr.type) {
                case "boolean":
                    out[attr.key] = ["yes", "true", "1"].indexOf(raw.toLowerCase()) !== -1;
                    break;
                case "integer":
                    out[attr.key] = parseInt(raw, 10);
                    break;
                case "decimal":
                    out[attr.key] = parseFloat(raw);
                    break;
                case "enum":
                    out[attr.key] = raw.toUpperCase();
                    break;
                default:
                    out[attr.key] = raw;
            }
        });
        return out;
    }

    return {
        downloadBridgeTemplate: downloadBridgeTemplate,
        downloadRestrictionTemplate: downloadRestrictionTemplate,
        parseCsvWithHeaders: parseCsvWithHeaders,
        mapBridgeRow: mapBridgeRow,
        validateBridgeRow: validateBridgeRow,
        coerceBridgeRow: coerceBridgeRow,
        BRIDGE_EXAMPLES: BRIDGE_EXAMPLES,
        RESTRICTION_EXAMPLES: RESTRICTION_EXAMPLES
    };
});
