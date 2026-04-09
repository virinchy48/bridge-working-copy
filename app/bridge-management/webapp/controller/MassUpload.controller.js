// ============================================================
// NHVR Mass Upload Controller — Universal CSV Import
// Supports: Bridges, Restrictions, Routes, VehicleClasses,
//           InspectionOrders, BridgeDefects, Lookups
// ============================================================
sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageToast",
    "sap/m/MessageBox",
    "nhvr/bridgemanagement/util/HelpAssistantMixin",
    "nhvr/bridgemanagement/model/CapabilityManager",
    "nhvr/bridgemanagement/util/UserAnalytics"
], function (Controller, JSONModel, MessageToast, MessageBox, HelpAssistantMixin, CapabilityManager, UserAnalytics) {
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

        inspectionOrders: {
            label:       "Inspection Orders",
            action:      "massUploadInspectionOrders",
            description: "Upload inspection work orders. Existing orders are matched by orderNumber and updated.",
            hint:        "Required: bridgeId, orderNumber, plannedDate. Optional: inspectionType (ROUTINE|SPECIAL|PRINCIPAL|UNDERWATER|POST_EVENT|LOAD), inspector, inspectorOrg.",
            headers: [
                "bridgeId","orderNumber","inspectionType","status","plannedDate",
                "inspector","inspectorOrg","accessMethod","ratingMethod",
                "overallConditionRating","structuralAdequacy","maintenanceUrgency",
                "reportRef","nextInspectionDue","notes"
            ],
            sample: "NSW-B-00123,INS-2024-00123,ROUTINE,PLANNED,2024-09-15,J.Smith,NSW Roads,WALK,VISUAL,,,,,2030-09-15,Annual routine inspection",
            previewCols: [
                { field: "bridgeId",      header: "Bridge ID" },
                { field: "orderNumber",   header: "Order Number" },
                { field: "inspectionType",header: "Type" },
                { field: "status",        header: "Status" },
                { field: "plannedDate",   header: "Planned Date" }
            ],
            validate: function (row, errors) {
                if (!row.bridgeId)    errors.push("bridgeId required");
                if (!row.orderNumber) errors.push("orderNumber required");
                if (!row.plannedDate) errors.push("plannedDate required");
                const validTypes = ["ROUTINE","SPECIAL","PRINCIPAL","UNDERWATER","POST_EVENT","LOAD"];
                if (row.inspectionType && !validTypes.includes(row.inspectionType.toUpperCase()))
                    errors.push(`inspectionType must be: ${validTypes.join("|")}`);
                const validStatus = ["PLANNED","IN_PROGRESS","COMPLETED","CANCELLED"];
                if (row.status && !validStatus.includes(row.status.toUpperCase()))
                    errors.push(`status must be: ${validStatus.join("|")}`);
                if (row.overallConditionRating) {
                    const r = parseInt(row.overallConditionRating);
                    if (isNaN(r) || r < 1 || r > 10) errors.push("overallConditionRating must be 1-10");
                }
            }
        },

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
            this._model = new JSONModel({ rows: [] });
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
            const key = e.getParameter("selectedItem").getKey();
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
        onDropZoneRendered: function () {
            const fileInput = document.getElementById("nhvrFileInput");
            if (fileInput && !fileInput._wired) {
                fileInput._wired = true;
                fileInput.addEventListener("change", (e) => {
                    if (e.target.files && e.target.files[0]) this._processFile(e.target.files[0]);
                });
            }
        },

        onBrowseFile: function () {
            const fi = document.getElementById("nhvrFileInput");
            if (fi) fi.click();
        },

        onFileDrop: function (e) {
            e.preventDefault();
            const files = e.dataTransfer && e.dataTransfer.files;
            if (files && files[0]) this._processFile(files[0]);
        },

        _processFile: function (file) {
            // Extension check
            if (!file.name.toLowerCase().endsWith(".csv")) {
                MessageToast.show("Please upload a .csv file");
                return;
            }
            // File size check (10 MB limit)
            if (file.size > MAX_FILE_SIZE) {
                MessageBox.error("File exceeds maximum size of 10 MB. Please split into smaller files.");
                return;
            }
            // MIME type check
            if (file.type && file.type !== "text/csv" && file.type !== "application/vnd.ms-excel" && file.type !== "text/plain") {
                MessageBox.error("Invalid file type (" + escapeHtml(file.type) + "). Please upload a CSV file.");
                return;
            }
            this._setText("selectedFileName", file.name);
            const reader = new FileReader();
            reader.onload = (e) => {
                this._rawCSV = e.target.result;
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
        onDownloadTemplate: function () {
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

            const action    = ENTITY_CONFIG[this._uploadType].action;
            const BATCH_SIZE = 200;
            const headers    = { Accept: "application/json", "Content-Type": "application/json" };

            const batches = [];
            for (let i = 0; i < rows.length; i += BATCH_SIZE) {
                batches.push(rows.slice(i, i + BATCH_SIZE));
            }

            const totals = { successCount: 0, updatedCount: 0, failureCount: 0, totalRecords: 0, errors: "" };

            const sendBatch = (idx) => {
                if (idx >= batches.length) {
                    if (busy) busy.setVisible(false);
                    if (btn)  btn.setEnabled(true);
                    this._showUploadResult(totals, rows.length);
                    return;
                }
                const csvData = this._rowsToCSV(batches[idx]);
                fetch(`${BASE}/${action}`, {
                    method: "POST",
                    headers,
                    body: JSON.stringify({ csvData })
                })
                .then(r => r.json())
                .then(j => {
                    totals.successCount += j.successCount || 0;
                    totals.updatedCount += j.updatedCount || 0;
                    totals.failureCount += j.failureCount || 0;
                    totals.totalRecords += j.totalRecords || 0;
                    if (j.errors) totals.errors += (totals.errors ? "\n" : "") + escapeHtml(j.errors);
                    totals.status = totals.failureCount === 0 ? "SUCCESS" : "PARTIAL_SUCCESS";
                    sendBatch(idx + 1);
                })
                .catch(err => {
                    if (busy) busy.setVisible(false);
                    if (btn)  btn.setEnabled(true);
                    MessageToast.show("Upload failed — check console for details");
                    console.error(err);
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
                    errorsEl.setText(errors ? `Errors:\n${escapeHtml(errors)}` : "");
                }
            }
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
