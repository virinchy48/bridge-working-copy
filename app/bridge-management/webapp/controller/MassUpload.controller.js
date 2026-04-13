// ============================================================
// NHVR Mass Upload Controller — Universal CSV Import
// Supports: Bridges, Restrictions, Routes, VehicleClasses,
//           BridgeDefects, Lookups
// ============================================================
sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageToast",
    "sap/m/MessageBox",
    "nhvr/bridgemanagement/util/HelpAssistantMixin",
    "nhvr/bridgemanagement/model/CapabilityManager",
    "nhvr/bridgemanagement/util/UserAnalytics",
    "nhvr/bridgemanagement/util/LookupService",
    "nhvr/bridgemanagement/util/ReferenceData",
    "sap/base/Log"
], function (Controller, JSONModel, MessageToast, MessageBox, HelpAssistantMixin, CapabilityManager, UserAnalytics, LookupService, ReferenceData, Log) {
    "use strict";

    const BASE = "/bridge-management";
    const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

    /** Escape HTML special characters to prevent XSS in error messages */
    function escapeHtml(str) {
        if (!str) return "";
        return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
    }

    // ── Entity Configuration ────────────────────────────────────────
    // Each entity definition drives: template headers, sample row,
    // validation rules, preview column display, and backend action.
    const ENTITY_CONFIG = {

        bridges: {
            label:       "Bridges",
            action:      "massUploadBridges",
            description: "Upload bridge asset records. Existing bridges are matched by bridgeId and updated. New bridgeIds create new records.",
            hint:        "Required: bridgeId, name, state, assetOwner, latitude, longitude. Optional: conditionRating (1-10), condition (GOOD|FAIR|POOR|CRITICAL), postingStatus (UNRESTRICTED|POSTED|CLOSED).",
            headers: [
                "bridgeId","name","region","state","lga","roadRoute","routeNumber",
                "assetOwner","maintenanceAuthority","condition","conditionRating",
                "postingStatus","structureType","material","clearanceHeightM","spanLengthM",
                "totalLengthM","widthM","numberOfSpans","numberOfLanes",
                "latitude","longitude","inspectionDate","yearBuilt","designLoad",
                "nhvrRouteAssessed","gazetteRef","nhvrRef","aadtVehicles",
                "freightRoute","overMassRoute","highPriorityAsset","floodImpacted",
                "scourRisk","sourceRefURL","openDataRef","remarks"
            ],
            sample: "BRG-SAMPLE,Sample Bridge,Central Victoria,VIC,Loddon Shire,Western Highway,A79,VicRoads,VicRoads,GOOD,7,UNRESTRICTED,BEAM,Concrete,4.5,25.0,26.5,8.5,2,2,-36.5,144.5,2023-06-01,1985,T44,TRUE,,NHVR-001,5000,TRUE,TRUE,FALSE,FALSE,LOW,https://example.com,,No known issues",
            previewCols: [
                { field: "bridgeId",     header: "Bridge ID" },
                { field: "name",         header: "Name" },
                { field: "state",        header: "State" },
                { field: "condition",    header: "Condition" },
                { field: "postingStatus",header: "Posting Status" }
            ],
            validate: function (row, errors) {
                if (!row.bridgeId)   errors.push("bridgeId required");
                if (!row.name)       errors.push("name required");
                if (!row.state)      errors.push("state required");
                if (!row.assetOwner) errors.push("assetOwner required");
                if (!row.latitude)   errors.push("latitude required");
                if (!row.longitude)  errors.push("longitude required");
                if (row.condition && !["GOOD","FAIR","POOR","CRITICAL"].includes(row.condition.toUpperCase()))
                    errors.push("condition must be GOOD|FAIR|POOR|CRITICAL");
                if (row.postingStatus && !["UNRESTRICTED","POSTED","CLOSED"].includes(row.postingStatus.toUpperCase()))
                    errors.push("postingStatus must be UNRESTRICTED|POSTED|CLOSED");
                if (row.latitude  && isNaN(parseFloat(row.latitude)))  errors.push("latitude must be numeric");
                if (row.longitude && isNaN(parseFloat(row.longitude))) errors.push("longitude must be numeric");
                if (row.conditionRating) {
                    const r = parseInt(row.conditionRating);
                    if (isNaN(r) || r < 1 || r > 10) errors.push("conditionRating must be 1-10");
                }
            }
        },

        restrictions: {
            label:       "Restrictions",
            action:      "massUploadRestrictions",
            description: "Upload restriction records. Each row creates a new restriction. Use bridgeId to link to the parent bridge.",
            hint:        "Required: bridgeId, restrictionType, value, unit. If isTemporary=true: validFromDate, validToDate, temporaryReason are also required.",
            headers: [
                "bridgeId","restrictionType","value","unit","status","isTemporary",
                "permitRequired","validFromDate","validToDate","temporaryReason",
                "temporaryApprovedBy","gazetteRef","enforcementAuthority",
                "nhvrPermitClass","signageRequired","direction","notes"
            ],
            sample: "BRG-SAMPLE,GROSS_MASS,42.5,t,ACTIVE,false,true,2024-01-01,,,,,NHVR-PC4,true,BOTH,Weight limit applies to all vehicles",
            previewCols: [
                { field: "bridgeId",       header: "Bridge ID" },
                { field: "restrictionType",header: "Type" },
                { field: "value",          header: "Value" },
                { field: "unit",           header: "Unit" },
                { field: "status",         header: "Status" }
            ],
            validate: function (row, errors) {
                if (!row.bridgeId)        errors.push("bridgeId required");
                if (!row.restrictionType) errors.push("restrictionType required");
                if (!row.value || isNaN(parseFloat(row.value))) errors.push("value must be numeric");
                if (!row.unit)            errors.push("unit required");
                const validTypes = ["WEIGHT","HEIGHT","WIDTH","AXLE_LOAD","SPEED","TOTAL_MASS","GROSS_MASS","LENGTH","LOAD","MASS","VEHICLE_TYPE"];
                if (row.restrictionType && !validTypes.includes(row.restrictionType.toUpperCase()))
                    errors.push(`restrictionType must be one of: ${validTypes.join("|")}`);
                const isTemp = row.isTemporary ? String(row.isTemporary).toLowerCase() : "";
                if (["true","1"].includes(isTemp)) {
                    if (!row.validFromDate)   errors.push("validFromDate required for temporary restrictions");
                    if (!row.validToDate)     errors.push("validToDate required for temporary restrictions");
                    if (!row.temporaryReason) errors.push("temporaryReason required for temporary restrictions");
                }
            }
        },

        routes: {
            label:       "Routes",
            action:      "massUploadRoutes",
            description: "Upload road route records. Existing routes are matched by routeCode and updated.",
            hint:        "Required: routeCode, description. Optional: region, state, isActive (true/false).",
            headers: ["routeCode","description","region","state","isActive"],
            sample: "HWY-A79,Western Highway,Western Victoria,VIC,true",
            previewCols: [
                { field: "routeCode",   header: "Route Code" },
                { field: "description", header: "Description" },
                { field: "region",      header: "Region" },
                { field: "state",       header: "State" },
                { field: "isActive",    header: "Active" }
            ],
            validate: function (row, errors) {
                if (!row.routeCode)   errors.push("routeCode required");
                if (!row.description) errors.push("description required");
            }
        },

        vehicleClasses: {
            label:       "Vehicle Classes",
            action:      "massUploadVehicleClasses",
            description: "Upload NHVR heavy vehicle class definitions. Existing classes are matched by code and updated.",
            hint:        "Required: code, name. Optional: maxMassKg, maxHeightM, maxWidthM, maxLengthM, permitRequired (true/false).",
            headers: [
                "code","name","description","maxMassKg","maxHeightM","maxWidthM",
                "maxLengthM","maxAxleLoad_t","permitRequired","nhvrRef","sortOrder","isActive"
            ],
            sample: "PC4,Performance Class 4 (PC4),NHVR Performance Class 4 vehicle,68500,4.6,2.5,36.5,9.0,true,NHVR-PC4,10,true",
            previewCols: [
                { field: "code",         header: "Code" },
                { field: "name",         header: "Name" },
                { field: "maxMassKg",    header: "Max Mass (kg)" },
                { field: "maxHeightM",   header: "Max Height (m)" },
                { field: "permitRequired",header: "Permit Req?" }
            ],
            validate: function (row, errors) {
                if (!row.code) errors.push("code required");
                if (!row.name) errors.push("name required");
                if (row.maxMassKg   && isNaN(parseFloat(row.maxMassKg)))   errors.push("maxMassKg must be numeric");
                if (row.maxHeightM  && isNaN(parseFloat(row.maxHeightM)))  errors.push("maxHeightM must be numeric");
                if (row.maxWidthM   && isNaN(parseFloat(row.maxWidthM)))   errors.push("maxWidthM must be numeric");
                if (row.maxLengthM  && isNaN(parseFloat(row.maxLengthM)))  errors.push("maxLengthM must be numeric");
            }
        },

        // inspectionOrders upload type removed in cut-down BIS variant.

        bridgeDefects: {
            label:       "Bridge Defects",
            action:      "massUploadBridgeDefects",
            description: "Upload defect records. If defectNumber is provided, existing records for that bridge are updated. Otherwise new records are created.",
            hint:        "Required: bridgeId, defectCategory (STRUCTURAL|SERVICEABILITY|DURABILITY|SAFETY), severity (LOW|MEDIUM|HIGH|CRITICAL), description.",
            headers: [
                "bridgeId","defectNumber","defectCategory","severity","extent","structuralRisk",
                "priority","status","description","location","detectedDate","detectedBy",
                "repairEstimateAUD","notes","elementGroup","elementName"
            ],
            sample: "NSW-B-00123,DEF-001,STRUCTURAL,HIGH,MODERATE,MEDIUM,HIGH,OPEN,Transverse cracking in span 2 deck soffit,Span 2 north face soffit,2024-08-01,J.Smith,25000,Monitor for progression,SUPERSTRUCTURE,Main Girder",
            previewCols: [
                { field: "bridgeId",      header: "Bridge ID" },
                { field: "defectCategory",header: "Category" },
                { field: "severity",      header: "Severity" },
                { field: "status",        header: "Status" },
                { field: "detectedDate",  header: "Detected Date" }
            ],
            validate: function (row, errors) {
                if (!row.bridgeId)       errors.push("bridgeId required");
                if (!row.defectCategory) errors.push("defectCategory required");
                if (!row.severity)       errors.push("severity required");
                if (!row.description)    errors.push("description required");
                const validSeverity  = ["LOW","MEDIUM","HIGH","CRITICAL"];
                const validCategory  = ["STRUCTURAL","SERVICEABILITY","DURABILITY","SAFETY"];
                if (row.severity       && !validSeverity.includes(row.severity.toUpperCase()))
                    errors.push(`severity must be: ${validSeverity.join("|")}`);
                if (row.defectCategory && !validCategory.includes(row.defectCategory.toUpperCase()))
                    errors.push(`defectCategory must be: ${validCategory.join("|")}`);
                if (row.repairEstimateAUD && isNaN(parseFloat(row.repairEstimateAUD)))
                    errors.push("repairEstimateAUD must be numeric");
            }
        },

        lookups: {
            label:       "Lookup Values",
            action:      "massUploadLookups",
            description: "Upload admin lookup/dropdown values. Existing entries (same category+code) are updated.",
            hint:        "Required: category, code. Optional: description, displayOrder (integer), isActive (true/false). Admin role required.",
            headers: ["category","code","description","displayOrder","isActive"],
            sample: "STRUCTURE_TYPE,ARCH,Arch Bridge,10,true",
            previewCols: [
                { field: "category",     header: "Category" },
                { field: "code",         header: "Code" },
                { field: "description",  header: "Description" },
                { field: "displayOrder", header: "Order" },
                { field: "isActive",     header: "Active" }
            ],
            validate: function (row, errors) {
                if (!row.category) errors.push("category required");
                if (!row.code)     errors.push("code required");
                if (row.displayOrder && isNaN(parseInt(row.displayOrder)))
                    errors.push("displayOrder must be an integer");
            }
        }
    };

    return Controller.extend("nhvr.bridgemanagement.controller.MassUpload", Object.assign({

        _uploadType   : "bridges",
        _parsedRows   : [],
        _showErrorsOnly: false,

        onInit: function () {
            UserAnalytics.trackView("MassUpload");
            this._model = new JSONModel({ rows: [], rowResults: [] });
            this._allRowResults = [];
            this.getView().setModel(this._model, "upload");
            window.__uploadViewId = this.getView().getId();
            // Apply initial entity config
            this._applyEntityConfig("bridges");
            // Wire up Help Assistant
            this._initHelpAssistant("massUpload");

            var self = this;
            var router = this.getOwnerComponent().getRouter();
            router.getRoute("MassUpload").attachPatternMatched(function () {
                CapabilityManager.load().then(function () {
                    CapabilityManager.guardRoute("MASS_UPLOAD", self.getOwnerComponent().getRouter());
                });
            }, this);
        },

        // ── Entity type change ─────────────────────────────────────
        onUploadTypeChange: function (e) {
            const oItem = e.getParameter("selectedItem");
            if (!oItem) return;
            const key = oItem.getKey();
            this._uploadType = key;
            this._applyEntityConfig(key);
            this.onClearUpload();
        },

        _applyEntityConfig: function (key) {
            const cfg = ENTITY_CONFIG[key];
            if (!cfg) return;

            // Update description + hint
            const desc = this.byId("typeDescription");
            if (desc) desc.setText(cfg.description);
            const hint = this.byId("templateHint");
            if (hint) { hint.setText(cfg.hint); hint.setType("Information"); }

            // Update preview column headers
            cfg.previewCols.forEach((col, i) => {
                const hdr = this.byId("colHdr" + (i + 1));
                if (hdr) hdr.setText(col.header);
            });
        },

        // ── Drag & Drop / Browse ───────────────────────────────────
        // Attach the change-listener to the hidden <input type="file">. This is
        // idempotent: it can be called from afterRendering callbacks of either
        // the drop-zone or the file-input holder, and from onBrowseFile as a
        // last-resort fallback. Without this fallback, a race between the two
        // <core:HTML> controls' afterRendering events could leave the listener
        // unattached, breaking the entire Browse File flow silently.
        _wireFileInput: function () {
            const fileInput = document.getElementById("nhvrFileInput");
            if (!fileInput) return false;
            if (fileInput._wired) return true;
            fileInput._wired = true;
            fileInput.addEventListener("change", (e) => {
                if (e.target.files && e.target.files[0]) {
                    this._processFile(e.target.files[0]);
                    // Reset value so the same file can be re-selected after a fix
                    e.target.value = "";
                }
            });
            return true;
        },

        onDropZoneRendered: function () {
            this._wireFileInput();
        },

        onFileInputRendered: function () {
            this._wireFileInput();
        },

        onBrowseFile: function () {
            // Belt-and-braces: wire the listener immediately before opening the
            // OS file picker, in case neither afterRendering callback ran first.
            this._wireFileInput();
            const fi = document.getElementById("nhvrFileInput");
            if (fi) {
                fi.click();
            } else {
                MessageToast.show("File picker is not ready yet — please try again");
            }
        },

        onFileDrop: function (e) {
            e.preventDefault();
            const files = e.dataTransfer && e.dataTransfer.files;
            if (files && files[0]) this._processFile(files[0]);
        },

        _processFile: function (file) {
            const lower = file.name.toLowerCase();
            const isCsv  = lower.endsWith(".csv");
            const isXlsx = lower.endsWith(".xlsx") || lower.endsWith(".xls");
            if (!isCsv && !isXlsx) {
                MessageToast.show("Please upload a .csv or .xlsx file");
                return;
            }
            // File size check (10 MB limit)
            if (file.size > MAX_FILE_SIZE) {
                MessageBox.error("File exceeds maximum size of 10 MB. Please split into smaller files.");
                return;
            }
            this._setText("selectedFileName", file.name);
            this._uploadedFileName = file.name;
            this._uploadedIsXlsx   = isXlsx;

            if (isXlsx) {
                // Xlsx is parsed server-side. Keep the raw bytes as base64 so
                // _doUpload can POST them to the massUploadLookups action.
                // We still build a preview client-side using a minimal xlsx
                // decoder so the user can see rows before submitting. Since
                // we don't want to bundle xlsx.js in the UI, we fall back to
                // a simple "X rows in workbook" preview for xlsx files and
                // let the server produce authoritative row results.
                const reader = new FileReader();
                reader.onload = (e) => {
                    // Convert ArrayBuffer → base64 without blowing the stack on
                    // large files.
                    const bytes = new Uint8Array(e.target.result);
                    let bin = "";
                    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
                    this._rawFileBase64 = btoa(bin);
                    this._rawCSV = null;
                    this._parsedRows = [{
                        rowNum: 1,
                        _c1: "— xlsx —",
                        _c2: `${file.name}`,
                        _c3: `${Math.round(file.size / 1024)} KB`,
                        _c4: "(server will validate row-by-row)",
                        _c5: "",
                        hasError: false,
                        error: ""
                    }];
                    this._showPreview();
                };
                reader.readAsArrayBuffer(file);
                return;
            }

            // CSV path (existing behaviour)
            const reader = new FileReader();
            reader.onload = (e) => {
                this._rawCSV = e.target.result;
                this._rawFileBase64 = null;
                // Validate CSV headers match expected template
                if (!this._validateCsvHeaders(e.target.result)) {
                    return;
                }
                this._parsedRows = this._parseCSV(e.target.result);
                this._showPreview();
            };
            reader.readAsText(file);
        },

        /** Validate that the first row of CSV headers matches the expected template */
        _validateCsvHeaders: function (csv) {
            const cfg = ENTITY_CONFIG[this._uploadType];
            const lines = csv.split(/\r?\n/).filter(function (l) { return l.trim(); });
            if (lines.length < 1) {
                MessageBox.error("CSV file is empty.");
                return false;
            }
            const fileHeaders = lines[0].split(",").map(function (h) { return h.trim().replace(/^"|"$/g, ""); });
            const expectedHeaders = cfg.headers;
            // Check that all expected headers are present
            const missing = expectedHeaders.filter(function (h) { return fileHeaders.indexOf(h) === -1; });
            if (missing.length > 0) {
                MessageBox.warning(
                    "CSV headers do not match the expected template.\n\nMissing columns: " + escapeHtml(missing.join(", ")) +
                    "\n\nExpected: " + escapeHtml(expectedHeaders.join(", ")) +
                    "\n\nUpload will continue but missing columns will be empty."
                );
            }
            return true;
        },

        // ── CSV Parsing ────────────────────────────────────────────
        _parseCSV: function (csv) {
            const cfg   = ENTITY_CONFIG[this._uploadType];
            const lines = csv.split(/\r?\n/).filter(l => l.trim());
            if (lines.length < 2) return [];
            const headers = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g, ""));
            const rows = [];

            for (let i = 1; i < lines.length; i++) {
                const vals = this._splitCSVLine(lines[i]);
                const obj  = {};
                headers.forEach((h, idx) => { obj[h] = (vals[idx] || "").trim(); });
                obj.rowNum   = i;
                obj.hasError = false;
                obj.error    = "";

                // Validate using entity-specific rules
                const errors = [];
                cfg.validate(obj, errors);
                if (errors.length) { obj.hasError = true; obj.error = escapeHtml(errors.join("; ")); }

                // Map display columns (_c1 … _c5)
                cfg.previewCols.forEach((col, idx) => {
                    obj["_c" + (idx + 1)] = obj[col.field] || "";
                });
                rows.push(obj);
            }
            return rows;
        },

        _splitCSVLine: function (line) {
            const result = [];
            let current  = "";
            let inQuotes = false;
            for (const ch of line) {
                if (ch === '"') { inQuotes = !inQuotes; }
                else if (ch === "," && !inQuotes) { result.push(current); current = ""; }
                else { current += ch; }
            }
            result.push(current);
            return result;
        },

        // ── Preview ────────────────────────────────────────────────
        _showPreview: function () {
            const validCount   = this._parsedRows.filter(r => !r.hasError).length;
            const invalidCount = this._parsedRows.filter(r => r.hasError).length;
            const total        = this._parsedRows.length;
            const typeLabel    = ENTITY_CONFIG[this._uploadType].label;

            this._setStatus("validRows",   `${validCount} Valid`,    "Success");
            this._setStatus("invalidRows", `${invalidCount} Invalid`, invalidCount > 0 ? "Error" : "Success");
            this._setStatus("totalRows",   `${total} Total`,          "None");
            this._setStatus("updateRows",  "Updates detected on submit", "Information");

            const tableTitle = this.byId("previewTitle");
            if (tableTitle) tableTitle.setText(`Preview — ${typeLabel} (${total} rows)`);

            this._model.setProperty("/rows", this._parsedRows);

            this.byId("previewSection").setVisible(true);
            this.byId("submitSection").setVisible(true);

            const result = this.byId("uploadResult");
            if (result) result.setVisible(false);
            const panel = this.byId("uploadResultPanel");
            if (panel) panel.setVisible(false);

            const warning = this.byId("submitWarning");
            if (warning) {
                if (invalidCount > 0) {
                    warning.setText(`${invalidCount} row(s) have errors and will be skipped. ${validCount} valid rows will be uploaded.`);
                    warning.setType("Warning");
                } else {
                    warning.setText(`All ${total} rows are valid and ready to upload.`);
                    warning.setType("Success");
                }
            }
        },

        onToggleErrorFilter: function (e) {
            this._showErrorsOnly = e.getSource().getPressed();
            const display = this._showErrorsOnly
                ? this._parsedRows.filter(r => r.hasError)
                : this._parsedRows;
            this._model.setProperty("/rows", display);
        },

        // ── Template Download ──────────────────────────────────────
        // For most entity types we generate a 1-row CSV stub from
        // ENTITY_CONFIG. For LOOKUPS specifically we serve a pre-built
        // .xlsx that contains every active lookup row in the database,
        // grouped by category, with column comments and a "Categories"
        // summary sheet. This gives admins a true working starter file
        // they can edit in Excel and re-upload — instead of an empty
        // template they have to populate from scratch.
        onDownloadTemplate: function () {
            if (this._uploadType === "lookups") {
                this._downloadLookupsXlsxTemplate();
                return;
            }
            const cfg      = ENTITY_CONFIG[this._uploadType];
            const filename = `${this._uploadType}_template.csv`;
            const content  = [cfg.headers.join(","), cfg.sample].join("\n");
            const blob     = new Blob([content], { type: "text/csv" });
            const url      = URL.createObjectURL(blob);
            const a        = document.createElement("a");
            a.href = url; a.download = filename; a.click();
            URL.revokeObjectURL(url);
            MessageToast.show(`Template downloaded: ${filename}`);
        },

        _downloadLookupsXlsxTemplate: function () {
            // Pre-built xlsx is generated by scripts/generate-lookups-template.py
            // and served by the CDS static-asset middleware.
            const url = "resources/templates/lookups-template.xlsx";
            fetch(url, { credentials: "same-origin" })
                .then(r => {
                    if (!r.ok) throw new Error("HTTP " + r.status);
                    return r.blob();
                })
                .then(blob => {
                    const link = document.createElement("a");
                    link.href = URL.createObjectURL(blob);
                    link.download = "lookups-template.xlsx";
                    link.click();
                    URL.revokeObjectURL(link.href);
                    MessageToast.show("Lookups Excel template downloaded — edit in Excel and re-upload via the same screen");
                })
                .catch(err => {
                    MessageBox.error(
                        "Couldn't download the lookups template (" + err.message + ").\n\n" +
                        "Run scripts/generate-lookups-template.py to (re)build it from the current Lookup table."
                    );
                });
        },

        // ── Submit Upload ──────────────────────────────────────────
        onSubmitUpload: function () {
            const valid     = this._parsedRows.filter(r => !r.hasError);
            const typeLabel = ENTITY_CONFIG[this._uploadType].label;

            if (valid.length === 0) {
                MessageToast.show("No valid rows to upload");
                return;
            }
            const invalid = this._parsedRows.length - valid.length;

            MessageBox.confirm(
                `Upload ${valid.length} ${typeLabel} record(s)?\n${invalid > 0 ? `(${invalid} invalid rows will be skipped)` : "All rows are valid."}`,
                {
                    title: "Confirm Upload",
                    onClose: (action) => {
                        if (action === MessageBox.Action.OK) this._doUpload(valid);
                    }
                }
            );
        },

        _rowsToCSV: function (rows) {
            const cfg     = ENTITY_CONFIG[this._uploadType];
            const headers = cfg.headers;
            const dataRows = rows.map(row =>
                headers.map(h => `"${String(row[h] !== undefined ? row[h] : "").replace(/"/g, '""')}"`).join(",")
            );
            return [headers.join(","), ...dataRows].join("\n");
        },

        _doUpload: function (rows) {
            UserAnalytics.trackAction("upload_csv", "MassUpload");
            const busy   = this.byId("uploadBusy");
            const btn    = this.byId("btnSubmit");
            if (busy) busy.setVisible(true);
            if (btn)  btn.setEnabled(false);

            const action  = ENTITY_CONFIG[this._uploadType].action;
            const headers = { Accept: "application/json", "Content-Type": "application/json" };

            // ── xlsx path — send the raw workbook as base64, server parses it.
            // The client-side preview is a single placeholder row; the server
            // returns authoritative per-row results.
            if (this._uploadedIsXlsx && this._rawFileBase64) {
                fetch(`${BASE}/${action}`, {
                    method: "POST",
                    headers,
                    body: JSON.stringify({
                        csvData   : "",
                        fileBase64: this._rawFileBase64,
                        fileName  : this._uploadedFileName || "upload.xlsx"
                    })
                })
                .then(r => r.json())
                .then(j => {
                    if (busy) busy.setVisible(false);
                    if (btn)  btn.setEnabled(true);
                    this._showUploadResult({
                        successCount: j.successCount || 0,
                        updatedCount: j.updatedCount || 0,
                        failureCount: j.failureCount || 0,
                        totalRecords: j.totalRecords || 0,
                        errors      : j.errors || "",
                        rowResults  : j.rowResults || "[]",
                        status      : (j.failureCount || 0) === 0 ? "SUCCESS" : "PARTIAL_SUCCESS"
                    }, j.totalRecords || 0);
                })
                .catch(err => {
                    if (busy) busy.setVisible(false);
                    if (btn)  btn.setEnabled(true);
                    MessageBox.error("Upload failed: " + err.message);
                    Log.error("[MassUpload] upload failed", err);
                });
                return;
            }

            // ── CSV path — batched for very large files (>200 rows per batch)
            const BATCH_SIZE = 200;
            const batches = [];
            for (let i = 0; i < rows.length; i += BATCH_SIZE) {
                batches.push(rows.slice(i, i + BATCH_SIZE));
            }

            const totals = {
                successCount: 0, updatedCount: 0, failureCount: 0,
                totalRecords: 0, errors: "", rowResults: "[]"
            };
            const allRowResults = [];

            const sendBatch = (idx) => {
                if (idx >= batches.length) {
                    if (busy) busy.setVisible(false);
                    if (btn)  btn.setEnabled(true);
                    totals.rowResults = JSON.stringify(allRowResults);
                    this._showUploadResult(totals, rows.length);
                    return;
                }
                const csvData = this._rowsToCSV(batches[idx]);
                fetch(`${BASE}/${action}`, {
                    method: "POST",
                    headers,
                    body: JSON.stringify({ csvData, fileBase64: "", fileName: "" })
                })
                .then(r => r.json())
                .then(j => {
                    totals.successCount += j.successCount || 0;
                    totals.updatedCount += j.updatedCount || 0;
                    totals.failureCount += j.failureCount || 0;
                    totals.totalRecords += j.totalRecords || 0;
                    if (j.errors) totals.errors += (totals.errors ? "\n" : "") + escapeHtml(j.errors);
                    if (j.rowResults) {
                        try {
                            const parsed = JSON.parse(j.rowResults);
                            if (Array.isArray(parsed)) parsed.forEach(r => allRowResults.push(r));
                        } catch (e) { /* ignore */ }
                    }
                    totals.status = totals.failureCount === 0 ? "SUCCESS" : "PARTIAL_SUCCESS";
                    sendBatch(idx + 1);
                })
                .catch(err => {
                    if (busy) busy.setVisible(false);
                    if (btn)  btn.setEnabled(true);
                    MessageBox.error("Upload failed: " + err.message);
                    Log.error("[MassUpload] batch upload failed", err);
                });
            };

            sendBatch(0);
        },

        _showUploadResult: function (j, sentCount) {
            const created   = j.successCount || 0;
            const updated   = j.updatedCount || 0;
            const failed    = j.failureCount || 0;
            const total     = j.totalRecords || sentCount;
            const errors    = j.errors || "";
            const timestamp = new Date().toLocaleString("en-AU");
            const typeLabel = ENTITY_CONFIG[this._uploadType].label;

            // ── Cache invalidation ─────────────────────────────────────
            // LookupService and ReferenceData memoise their load promise
            // for the session, so without this step the values just created
            // server-side are invisible to every other screen until the user
            // does a full page reload. Drop the affected cache so the next
            // consumer (e.g. BridgeForm state → region cascade) refetches.
            if (created + updated > 0) {
                if (this._uploadType === "lookups") {
                    LookupService.reload();
                } else if (this._uploadType === "bridges") {
                    ReferenceData.reload();
                }
            }

            const result = this.byId("uploadResult");
            if (result) {
                const msg = `${typeLabel} upload complete — Total: ${total} | Created: ${created} | Updated: ${updated} | Failed: ${failed}`;
                result.setText(msg);
                result.setType(failed > 0 ? "Warning" : "Success");
                result.setVisible(true);
            }

            const panel = this.byId("uploadResultPanel");
            if (panel) {
                panel.setVisible(true);
                const set = (id, val) => { const c = this.byId(id); if (c) c.setText(String(val)); };
                set("resultCreated", created);
                set("resultUpdated", updated);
                set("resultTotal",   total);
                const failedEl = this.byId("resultFailed");
                if (failedEl) { failedEl.setText(String(failed)); failedEl.setState(failed > 0 ? "Error" : "None"); }
                set("resultAuditInfo", `Uploaded at ${timestamp} — ${typeLabel} batch (${total} records submitted)`);
                const errorsEl = this.byId("resultErrors");
                if (errorsEl) {
                    errorsEl.setVisible(!!(errors && errors.trim()));
                    // resultErrors is a sap.m.TextArea — its API is setValue(),
                    // not setText().
                    const text = errors ? `Errors:\n${escapeHtml(errors)}` : "";
                    if (typeof errorsEl.setValue === "function") {
                        errorsEl.setValue(text);
                    } else if (typeof errorsEl.setText === "function") {
                        errorsEl.setText(text);
                    }
                }
            }

            // ── Populate the row-by-row results table ────────────────
            // The server returns a `rowResults` JSON string with one entry per
            // processed row: { row, category, code, status, message }.
            // Stored on the upload model so the <Table> binding in the view
            // (items="{upload>/rowResults}") renders it automatically.
            let rowResults = [];
            if (j.rowResults) {
                try {
                    const parsed = typeof j.rowResults === "string"
                        ? JSON.parse(j.rowResults)
                        : j.rowResults;
                    if (Array.isArray(parsed)) rowResults = parsed;
                } catch (e) { /* ignore malformed payload */ }
            }
            this._allRowResults = rowResults;
            this._model.setProperty("/rowResults", rowResults);
            // Reset the filter to "ALL" whenever a new upload lands
            const filter = this.byId("rowResultsFilter");
            if (filter && filter.setSelectedKey) filter.setSelectedKey("ALL");
        },

        onRowResultsFilter: function (e) {
            const key = e && e.getParameter && e.getParameter("item")
                ? e.getParameter("item").getKey()
                : "ALL";
            const all = this._allRowResults || [];
            const filtered = (key === "ALL") ? all : all.filter(r => r.status === key);
            this._model.setProperty("/rowResults", filtered);
        },

        onClearUpload: function () {
            this._parsedRows = [];
            this._model.setProperty("/rows", []);
            this._setText("selectedFileName", "No file selected");
            const ps = this.byId("previewSection");
            if (ps) ps.setVisible(false);
            const ss = this.byId("submitSection");
            if (ss) ss.setVisible(false);
            const fi = document.getElementById("nhvrFileInput");
            if (fi) fi.value = "";
            const result = this.byId("uploadResult");
            if (result) result.setVisible(false);
            const panel = this.byId("uploadResultPanel");
            if (panel) panel.setVisible(false);
        },

        // ── Type Help Popup ────────────────────────────────────────
        onTypeHelp: function () {
            const lines = Object.entries(ENTITY_CONFIG).map(([k, v]) =>
                `• ${v.label}: ${v.description}`
            );
            MessageBox.information(lines.join("\n\n"), { title: "Upload Types", styleClass: "nhvrWideDialog" });
        },

        // ── Navigation ─────────────────────────────────────────────
        onNavHome: function () {
            this.getOwnerComponent().getRouter().navTo("Home");
        },

        // ── Helpers ────────────────────────────────────────────────
        _setStatus: function (id, text, state) {
            const ctrl = this.byId(id);
            if (ctrl) { ctrl.setText(text); ctrl.setState(state); }
        },

        _setText: function (id, val) {
            const ctrl = this.byId(id);
            if (ctrl) ctrl.setText(String(val || ""));
        }
    }, HelpAssistantMixin));
});
