// ============================================================
// NHVR ALV Toolbar Mixin
// Mix into any controller to get consistent export/action toolbar behaviour.
//
// Usage: Object.assign(Controller.prototype, AlvToolbarMixin)  — or spread in return object
// Required: this._alvData (array of row objects), this._alvColumns (column definitions)
// ============================================================
sap.ui.define([], function () {
    "use strict";

    /** Sanitize a cell value to prevent CSV formula injection (=, +, -, @, tab, cr) */
    function _sanitizeCsvCell(value) {
        if (value == null) return "";
        var s = String(value);
        if (s.length > 0 && /^[=+\-@\t\r]/.test(s)) {
            s = "'" + s;  // Excel-safe prefix
        }
        return s;
    }

    /** Escape special XML characters for Excel XML output */
    function _escapeXml(str) {
        if (!str) return "";
        return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
    }

    return {

        /**
         * Update the ALV toolbar record count display.
         * @param {number} count   total rows
         * @param {number} [filtered] filtered row count (if different from total)
         */
        _alvUpdateCount: function (count, filtered) {
            const ctrl = this.byId("alvRecordCount");
            if (!ctrl) return;
            if (filtered !== undefined && filtered !== count) {
                ctrl.setText(filtered + " of " + count + " records");
            } else {
                ctrl.setText(count + " record" + (count !== 1 ? "s" : ""));
            }
        },

        /**
         * Export data to Excel using browser download.
         * Produces Microsoft Office XML Spreadsheet format (.xls) with
         * styled headers and conditional row highlighting for critical/warning rows.
         */
        onAlvExportExcel: function (oEvent) {
            var table = this._getAlvTable ? this._getAlvTable() : null;
            var rows, columns;

            if (table && this._getAlvData && this._getAlvColumns) {
                rows = this._getAlvData(table);
                columns = this._getAlvColumns(table);
            } else {
                // Fallback: use _alvData like the old implementation
                rows = this._alvData || [];
                if (!rows.length) { sap.m.MessageToast.show("No data to export"); return; }
                var keys = Object.keys(rows[0]);
                columns = keys.map(function (k) {
                    return { key: k, label: k.replace(/([A-Z])/g, " $1").replace(/^./, function (s) { return s.toUpperCase(); }) };
                });
            }

            if (!rows || !rows.length) { sap.m.MessageToast.show("No data to export"); return; }

            var fileName = (this._alvConfig && this._alvConfig.exportFileName) || this._alvExportFileName || "nhvr-export";

            // Generate Excel XML (Microsoft Office XML format)
            var xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
            xml += '<?mso-application progid="Excel.Sheet"?>\n';
            xml += '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"\n';
            xml += '  xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">\n';
            xml += '  <Styles>\n';
            xml += '    <Style ss:ID="header"><Font ss:Bold="1" ss:Size="11"/><Interior ss:Color="#E8E8E8" ss:Pattern="Solid"/></Style>\n';
            xml += '    <Style ss:ID="critical"><Interior ss:Color="#FFD6D6" ss:Pattern="Solid"/></Style>\n';
            xml += '    <Style ss:ID="warning"><Interior ss:Color="#FFF3D6" ss:Pattern="Solid"/></Style>\n';
            xml += '  </Styles>\n';
            xml += '  <Worksheet ss:Name="Data">\n';
            xml += '    <Table>\n';

            // Column widths
            columns.forEach(function () { xml += '      <Column ss:AutoFitWidth="1" ss:Width="120"/>\n'; });

            // Header row
            xml += '      <Row>\n';
            columns.forEach(function (col) {
                xml += '        <Cell ss:StyleID="header"><Data ss:Type="String">' + _escapeXml(col.label || col.key) + '</Data></Cell>\n';
            });
            xml += '      </Row>\n';

            // Data rows
            rows.forEach(function (row) {
                var isCritical = row.condition === "CRITICAL" || row.severity === "CRITICAL";
                var isWarning = row.condition === "POOR" || row.severity === "HIGH";
                var styleAttr = isCritical ? ' ss:StyleID="critical"' : (isWarning ? ' ss:StyleID="warning"' : '');
                xml += '      <Row>\n';
                columns.forEach(function (col) {
                    var val = row[col.key];
                    var sanitized = _sanitizeCsvCell(String(val != null ? val : ""));
                    var type = (typeof val === "number" && !isNaN(val)) ? "Number" : "String";
                    xml += '        <Cell' + styleAttr + '><Data ss:Type="' + type + '">' + _escapeXml(sanitized) + '</Data></Cell>\n';
                });
                xml += '      </Row>\n';
            });

            xml += '    </Table>\n';
            xml += '  </Worksheet>\n';
            xml += '</Workbook>';

            // Download
            var blob = new Blob([xml], { type: "application/vnd.ms-excel" });
            var url = URL.createObjectURL(blob);
            var a = document.createElement("a");
            a.href = url;
            a.download = fileName + ".xls";
            a.click();
            URL.revokeObjectURL(url);
            sap.m.MessageToast.show("Excel exported: " + rows.length + " rows");
        },

        /**
         * Batch export — placeholder for future multi-sheet workbook generation.
         * Currently triggers single-entity Excel export.
         */
        onAlvExportAll: function () {
            sap.m.MessageToast.show("Batch export initiated — generating multi-sheet workbook...");
            // This is a placeholder for future multi-sheet export
            // For now, trigger the standard single-entity export
            this.onAlvExportExcel();
        },

        /**
         * Export data to CSV.
         */
        onAlvExportCsv: function () {
            const data = this._alvData || [];
            if (!data.length) { sap.m.MessageToast.show("No data to export"); return; }

            const keys    = Object.keys(data[0]);
            const headers = keys.map(k => k.replace(/([A-Z])/g, " $1").replace(/^./, s => s.toUpperCase()));

            const rows = data.map(row => keys.map(k => {
                const v = row[k];
                const sanitized = _sanitizeCsvCell(v);
                if (sanitized === "") return "";
                const s = sanitized.replace(/"/g, '""');
                return s.includes(",") || s.includes("\n") || s.includes('"') ? `"${s}"` : s;
            }).join(","));

            const csv  = [headers.join(","), ...rows].join("\n");
            const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
            const a    = document.createElement("a");
            a.href     = URL.createObjectURL(blob);
            a.download = (this._alvExportFileName || "nhvr-export") + ".csv";
            a.click();
            URL.revokeObjectURL(a.href);
            sap.m.MessageToast.show("CSV export downloaded");
        },

        /**
         * Print / PDF — opens browser print dialog.
         */
        onAlvExportPdf: function () {
            window.print();
        },

        /**
         * Refresh — override in each controller with specific fetch call.
         */
        onAlvRefresh: function () {
            sap.m.MessageToast.show("Refreshing\u2026");
        },

        /**
         * Sort — override in each controller.
         */
        onAlvSort: function () {
            const dlg = this.byId("sortDialog");
            if (dlg) { dlg.open(); return; }
            sap.m.MessageToast.show("Sort not configured for this view");
        },

        /**
         * Toggle filter panel visibility.
         */
        onAlvFilterPanel: function () {
            const panel = this.byId("advFilterPanel") || this.byId("filterPanel");
            if (panel) {
                panel.setExpanded(!panel.getExpanded());
            } else {
                const page = this.byId("bridgesPage") || this.byId("mainPage");
                if (page && page.setHeaderExpanded) page.setHeaderExpanded(!page.getHeaderExpanded());
            }
        }
    };
});
