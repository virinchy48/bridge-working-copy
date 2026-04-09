// ============================================================
// NHVR Bridge Management — CSV Export Utility
// Registry-driven: all columns from BridgeAttributes / RestrictionAttributes
//
// Usage:
//   CsvExport.exportBridges(bridges, { visibleKeys, includeHelpRow, stateFilter })
//   CsvExport.exportRestrictions(restrictions, { visibleKeys, includeHelpRow })
//   CsvExport.download(csvString, filename)
// ============================================================
sap.ui.define([
    "nhvr/bridgemanagement/config/BridgeAttributes",
    "nhvr/bridgemanagement/config/RestrictionAttributes"
], function (BridgeAttrs, RestrictionAttrs) {
    "use strict";

    // ── Internal helpers ──────────────────────────────────────

    /** Sanitize a CSV cell value to prevent formula injection (=, +, -, @, tab, cr) */
    function sanitizeCsvCell(value) {
        if (value == null) return "";
        var s = String(value);
        if (s.length > 0 && /^[=+\-@\t\r]/.test(s)) {
            s = "'" + s;  // Excel-safe prefix
        }
        return s;
    }

    /** Escape a CSV cell value (wrap in quotes if contains comma/newline/quote) */
    function escapeCell(value) {
        var s = sanitizeCsvCell(value);
        if (s.indexOf(",") !== -1 || s.indexOf('"') !== -1 || s.indexOf("\n") !== -1) {
            return '"' + s.replace(/"/g, '""') + '"';
        }
        return s;
    }

    /** Convert array of arrays to CSV string */
    function rowsToCsv(rows) {
        return rows.map(function (row) {
            return row.map(escapeCell).join(",");
        }).join("\r\n");
    }

    /** Trigger browser download of a CSV string */
    function download(csvString, filename) {
        var BOM = "\uFEFF"; // UTF-8 BOM — ensures Excel opens with correct encoding
        var blob = new Blob([BOM + csvString], { type: "text/csv;charset=utf-8;" });
        var url = URL.createObjectURL(blob);
        var a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        setTimeout(function () {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 100);
    }

    /** Build today's date string YYYY-MM-DD */
    function today() {
        return new Date().toISOString().substring(0, 10);
    }

    // ── Core export builder ───────────────────────────────────
    /**
     * Build CSV rows from a list of attribute definitions + data records.
     * @param {AttributeDef[]} attrs     - filtered attribute list
     * @param {object[]}       records   - data rows (OData values)
     * @param {function}       fmtFn     - formatCsvValue(attr, value) function
     * @param {boolean}        helpRow   - include Row 2 with helpText
     * @returns {string[][]}  rows array (header + optional help + data)
     */
    function buildRows(attrs, records, fmtFn, helpRow) {
        var rows = [];

        // Row 1: human-readable column headers
        rows.push(attrs.map(function (a) { return a.label; }));

        // Row 2 (optional): help text per column
        if (helpRow) {
            rows.push(attrs.map(function (a) { return "# " + a.helpText; }));
        }

        // Data rows
        records.forEach(function (rec) {
            rows.push(attrs.map(function (a) {
                var raw = rec[a.key];
                return fmtFn(a, raw);
            }));
        });

        return rows;
    }

    // ── Public API ────────────────────────────────────────────

    /**
     * Export bridges to CSV and trigger download.
     * @param {object[]} bridges        - array of bridge OData records
     * @param {object}   [options]
     *   @param {string[]} [options.visibleKeys]   - restrict to these field keys; null = all csvColumn fields
     *   @param {boolean}  [options.includeHelpRow] - include help text row 2 (default false)
     *   @param {string}   [options.stateFilter]    - append state to filename
     */
    function exportBridges(bridges, options) {
        options = options || {};
        var allAttrs = BridgeAttrs.getCsvColumns();

        var attrs = options.visibleKeys
            ? allAttrs.filter(function (a) { return options.visibleKeys.indexOf(a.key) !== -1; })
            : allAttrs;

        var rows = buildRows(attrs, bridges || [], BridgeAttrs.formatCsvValue, !!options.includeHelpRow);
        var csv = rowsToCsv(rows);

        var statepart = options.stateFilter ? "-" + options.stateFilter : "";
        var filename = "NHVR-Bridges" + statepart + "-" + today() + ".csv";
        download(csv, filename);

        return { cols: attrs.length, rows: (bridges || []).length };
    }

    /**
     * Export restrictions to CSV and trigger download.
     * @param {object[]} restrictions
     * @param {object}   [options]
     *   @param {string[]} [options.visibleKeys]
     *   @param {boolean}  [options.includeHelpRow]
     */
    function exportRestrictions(restrictions, options) {
        options = options || {};
        var allAttrs = RestrictionAttrs.getCsvColumns();

        var attrs = options.visibleKeys
            ? allAttrs.filter(function (a) { return options.visibleKeys.indexOf(a.key) !== -1; })
            : allAttrs;

        var rows = buildRows(attrs, restrictions || [], RestrictionAttrs.formatCsvValue, !!options.includeHelpRow);
        var csv = rowsToCsv(rows);
        download(csv, "NHVR-Restrictions-" + today() + ".csv");

        return { cols: attrs.length, rows: (restrictions || []).length };
    }

    /**
     * Low-level download helper (exported for tests + manual use).
     */
    function downloadCsv(csvString, filename) {
        download(csvString, filename || "export-" + today() + ".csv");
    }

    /**
     * Return CSV string for bridges without triggering download (for testing).
     */
    function buildBridgesCsv(bridges, options) {
        options = options || {};
        var allAttrs = BridgeAttrs.getCsvColumns();
        var attrs = options.visibleKeys
            ? allAttrs.filter(function (a) { return options.visibleKeys.indexOf(a.key) !== -1; })
            : allAttrs;
        return rowsToCsv(buildRows(attrs, bridges || [], BridgeAttrs.formatCsvValue, !!options.includeHelpRow));
    }

    /**
     * Return CSV string for restrictions without triggering download.
     */
    function buildRestrictionsCsv(restrictions, options) {
        options = options || {};
        var allAttrs = RestrictionAttrs.getCsvColumns();
        var attrs = options.visibleKeys
            ? allAttrs.filter(function (a) { return options.visibleKeys.indexOf(a.key) !== -1; })
            : allAttrs;
        return rowsToCsv(buildRows(attrs, restrictions || [], RestrictionAttrs.formatCsvValue, !!options.includeHelpRow));
    }

    return {
        exportBridges: exportBridges,
        exportRestrictions: exportRestrictions,
        downloadCsv: downloadCsv,
        buildBridgesCsv: buildBridgesCsv,
        buildRestrictionsCsv: buildRestrictionsCsv
    };
});
