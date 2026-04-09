// ============================================================
// NHVR Data Consistency Layer — Regression Test Suite (PART 7)
//
// CONSISTENCY CONTRACT:
//   What you can edit = What you see in lists = What you can filter
//                     = What you download = What you upload.
//
// These tests FAIL if the contract is broken.
// Run: npm test -- --testPathPattern=data-consistency
// ============================================================
"use strict";

const path = require("path");
const fs   = require("fs");

// ── Path helpers ──────────────────────────────────────────────
const WEBAPP = path.join(__dirname, "../app/bridge-management/webapp");
const SRV    = path.join(__dirname, "../srv");
const DB     = path.join(__dirname, "../db");

// ── Lightweight AMD module loader (extracts module return value) ──
function loadAMD(filePath, resolvedDeps) {
    const src = fs.readFileSync(filePath, "utf8");
    let result = null;
    // Replace sap.ui.define with a plain function call
    const patched = src
        .replace(/sap\.ui\.define\s*\(/, "global.__amd__(")
        .replace(/^(\/\/.*\n)*/m, "");
    global.__amd__ = function (deps, factory) {
        // Use provided resolved deps map (keyed by dep path suffix) or empty stubs
        const stubs = (deps || []).map(dep => {
            if (resolvedDeps) {
                // Match by last segment of module path
                const key = Object.keys(resolvedDeps).find(k => dep.endsWith(k) || dep === k);
                if (key) return resolvedDeps[key];
            }
            return {};
        });
        result = factory.apply(null, stubs);
    };
    try {
        new Function("global", patched)(global);
    } catch (e) {
        // ignore UI5 runtime errors — we only care about the module return value
    }
    delete global.__amd__;
    return result;
}

// ── Load registries ───────────────────────────────────────────
let BridgeAttrs, RestrictionAttrs;
let BRIDGE_ATTRIBUTES, RESTRICTION_ATTRIBUTES;
let getCsvColumns, getUploadableColumns, getFilterableAttributes, getDefaultVisibleColumns;

beforeAll(() => {
    BridgeAttrs = loadAMD(path.join(WEBAPP, "config/BridgeAttributes.js"));
    RestrictionAttrs = loadAMD(path.join(WEBAPP, "config/RestrictionAttributes.js"));

    expect(BridgeAttrs).not.toBeNull();
    expect(RestrictionAttrs).not.toBeNull();

    BRIDGE_ATTRIBUTES      = BridgeAttrs.BRIDGE_ATTRIBUTES;
    RESTRICTION_ATTRIBUTES = RestrictionAttrs.RESTRICTION_ATTRIBUTES;

    getCsvColumns        = BridgeAttrs.getCsvColumns;
    getUploadableColumns = BridgeAttrs.getUploadableColumns;
    getFilterableAttributes = BridgeAttrs.getFilterableAttributes;
    getDefaultVisibleColumns = BridgeAttrs.getDefaultVisibleColumns;
});

// ─────────────────────────────────────────────────────────────
// PART 1: Registry structural tests
// ─────────────────────────────────────────────────────────────
describe("PART 1 — Attribute Registry Structure", () => {

    test("BRIDGE registry has exactly 47 fields", () => {
        expect(BRIDGE_ATTRIBUTES).toHaveLength(47);
    });

    test("RESTRICTION registry has exactly 18 fields", () => {
        expect(RESTRICTION_ATTRIBUTES).toHaveLength(18);
    });

    test("every bridge attribute has required metadata", () => {
        BRIDGE_ATTRIBUTES.forEach(attr => {
            if (!attr.key) throw new Error(attr.key + " missing key"); expect(attr.key).toBeTruthy();
            if (!attr.label) throw new Error(attr.key + " missing label"); expect(attr.label).toBeTruthy();
            if (!attr.section) throw new Error(attr.key + " missing section"); expect(attr.section).toBeTruthy();
            if (!attr.sectionLabel) throw new Error(attr.key + " missing sectionLabel"); expect(attr.sectionLabel).toBeTruthy();
            if (!attr.type) throw new Error(attr.key + " missing type"); expect(attr.type).toBeTruthy();
            if (!attr.helpText) throw new Error(attr.key + " missing helpText"); expect(attr.helpText).toBeTruthy();
            expect(typeof attr.defaultVisible).toBe("boolean");
            expect(typeof attr.csvColumn).toBe("boolean");
            expect(typeof attr.uploadable).toBe("boolean");
            expect(typeof attr.editable).toBe("boolean");
        });
    });

    test("every restriction attribute has required metadata", () => {
        RESTRICTION_ATTRIBUTES.forEach(attr => {
            expect(attr.key).toBeTruthy();
            expect(attr.label).toBeTruthy();
            expect(attr.section).toBeTruthy();
            expect(attr.type).toBeTruthy();
            expect(attr.helpText).toBeTruthy();
        });
    });

    test("no duplicate keys in bridge registry", () => {
        const keys = BRIDGE_ATTRIBUTES.map(a => a.key);
        const unique = new Set(keys);
        expect(unique.size).toBe(keys.length);
    });

    test("no duplicate keys in restriction registry", () => {
        const keys = RESTRICTION_ATTRIBUTES.map(a => a.key);
        expect(new Set(keys).size).toBe(keys.length);
    });

    test("all 7 bridge sections are covered", () => {
        const secs = new Set(BRIDGE_ATTRIBUTES.map(a => a.section));
        ["A", "B", "C", "D", "E", "F", "G"].forEach(s => {
            if (!secs.has(s)) throw new Error(`Section ${s} missing from registry`);
            expect(secs.has(s)).toBe(true);
        });
    });

    test("enum attributes have enumValues array", () => {
        BRIDGE_ATTRIBUTES
            .filter(a => a.type === "enum")
            .forEach(a => {
                if (!Array.isArray(a.enumValues)) throw new Error(a.key + ": enum missing enumValues"); expect(Array.isArray(a.enumValues)).toBe(true);
                expect(a.enumValues.length).toBeGreaterThan(0);
            });
    });

    test("helper functions return non-empty subsets", () => {
        expect(getCsvColumns().length).toBeGreaterThan(40);
        expect(getUploadableColumns().length).toBeGreaterThan(40);
        expect(getFilterableAttributes().length).toBeGreaterThan(35);
        expect(getDefaultVisibleColumns().length).toBeGreaterThan(5);
        expect(getDefaultVisibleColumns().length).toBeLessThan(20); // not too many
    });
});

// ─────────────────────────────────────────────────────────────
// PART 2: CSV Export consistency
// ─────────────────────────────────────────────────────────────
describe("PART 4 — CSV Export: registry-driven columns", () => {

    let CsvExport;

    beforeAll(() => {
        CsvExport = loadAMD(path.join(WEBAPP, "util/CsvExport.js"), {
            "config/BridgeAttributes": BridgeAttrs,
            "config/RestrictionAttributes": RestrictionAttrs
        });
    });

    test("CsvExport module loads", () => {
        expect(CsvExport).not.toBeNull();
        expect(typeof CsvExport.buildBridgesCsv).toBe("function");
        expect(typeof CsvExport.buildRestrictionsCsv).toBe("function");
    });

    test("bridge CSV export includes all csvColumn fields", () => {
        const expectedCols = getCsvColumns().map(a => a.label);
        const csv = CsvExport.buildBridgesCsv([]);
        const headerLine = csv.split("\r\n")[0];
        const headers = headerLine.split(",");

        expectedCols.forEach(col => {
            const found = headers.some(h => h.replace(/"/g, "") === col);
            if (!found) throw new Error(`CSV missing column: "${col}"`);
            expect(found).toBe(true);
        });
    });

    test("bridge CSV header count matches getCsvColumns()", () => {
        const csv = CsvExport.buildBridgesCsv([]);
        const headers = csv.split("\r\n")[0].split(",");
        expect(headers.length).toBe(getCsvColumns().length);
    });

    test("bridge CSV includes key fields: scourRisk, nhvrRouteAssessed, aadtVehicles", () => {
        const csv = CsvExport.buildBridgesCsv([]);
        const headerLine = csv.split("\r\n")[0];
        expect(headerLine).toContain("Scour Risk");
        expect(headerLine).toContain("NHVR Route Assessed");
        expect(headerLine).toContain("AADT");
    });

    test("bridge CSV boolean values render as Yes/No not true/false", () => {
        const bridge = {
            bridgeId: "TEST-001", name: "Test Bridge", state: "NSW",
            nhvrRouteAssessed: true, freightRoute: false, hmlApproved: true
        };
        const csv = CsvExport.buildBridgesCsv([bridge]);
        const rows = csv.split("\r\n");
        const dataRow = rows[1] || "";
        expect(dataRow).not.toContain("true");
        expect(dataRow).not.toContain("false");
        expect(dataRow).toContain("Yes");
        expect(dataRow).toContain("No");
    });

    test("bridge CSV null values render as empty (not 'null')", () => {
        const bridge = {
            bridgeId: "TEST-002", name: "Test", state: "VIC",
            loadRating: null, currentReplacementCost: null, yearBuilt: null
        };
        const csv = CsvExport.buildBridgesCsv([bridge]);
        expect(csv).not.toContain("null");
        expect(csv).not.toContain("undefined");
    });

    test("CSV help row is included when includeHelpRow=true", () => {
        const csv = CsvExport.buildBridgesCsv([], { includeHelpRow: true });
        const rows = csv.split("\r\n");
        // Row 0 = headers, Row 1 = help row
        expect(rows[1]).toContain("# ");
    });

    test("restriction CSV includes all 17 column labels", () => {
        const RestrictionAttrs2 = loadAMD(path.join(WEBAPP, "config/RestrictionAttributes.js"));
        const CsvExport2 = loadAMD(path.join(WEBAPP, "util/CsvExport.js"), {
            "config/BridgeAttributes": BridgeAttrs,
            "config/RestrictionAttributes": RestrictionAttrs2
        });
        const expected = RestrictionAttrs2.getCsvColumns().map(a => a.label);
        const csv = CsvExport2.buildRestrictionsCsv([]);
        const headers = csv.split("\r\n")[0];
        expected.forEach(col => {
            expect(headers).toContain(col);
        });
    });
});

// ─────────────────────────────────────────────────────────────
// PART 3: Upload Template consistency
// ─────────────────────────────────────────────────────────────
describe("PART 5 — Upload Template: registry-driven columns", () => {

    let CsvTemplate;

    beforeAll(() => {
        CsvTemplate = loadAMD(path.join(WEBAPP, "util/CsvTemplate.js"), {
            "config/BridgeAttributes": BridgeAttrs,
            "config/RestrictionAttributes": RestrictionAttrs
        });
    });

    test("CsvTemplate module loads", () => {
        expect(CsvTemplate).not.toBeNull();
        expect(typeof CsvTemplate.validateBridgeRow).toBe("function");
        expect(typeof CsvTemplate.coerceBridgeRow).toBe("function");
        expect(typeof CsvTemplate.parseCsvWithHeaders).toBe("function");
        expect(typeof CsvTemplate.mapBridgeRow).toBe("function");
    });

    test("parseCsvWithHeaders correctly splits header and data rows", () => {
        const csv = "Bridge ID,Name,State\r\nBRG-001,Test Bridge,NSW\r\nBRG-002,Another,VIC";
        const { headers, rows } = CsvTemplate.parseCsvWithHeaders(csv);
        expect(headers).toEqual(["Bridge ID", "Name", "State"]);
        expect(rows.length).toBe(2);
        expect(rows[0][0]).toBe("BRG-001");
        expect(rows[1][2]).toBe("VIC");
    });

    test("parseCsvWithHeaders handles quoted fields with commas", () => {
        const csv = `Bridge ID,Name,Remarks\r\nBRG-001,"Bridge, old",Test`;
        const { rows } = CsvTemplate.parseCsvWithHeaders(csv);
        expect(rows[0][1]).toBe("Bridge, old");
    });

    test("validateBridgeRow: catches missing required fields", () => {
        const { valid, errors } = CsvTemplate.validateBridgeRow({ bridgeId: "  ", name: "Test", state: "NSW" });
        expect(valid).toBe(false);
        expect(errors.some(e => e.field === "bridgeId")).toBe(true);
    });

    test("validateBridgeRow: catches invalid enum values", () => {
        const { valid, errors } = CsvTemplate.validateBridgeRow({
            bridgeId: "BRG-001", name: "Test", state: "INVALID_STATE"
        });
        expect(valid).toBe(false);
        expect(errors.some(e => e.field === "state")).toBe(true);
    });

    test("validateBridgeRow: catches out-of-range conditionRating", () => {
        const { valid, errors } = CsvTemplate.validateBridgeRow({
            bridgeId: "BRG-001", name: "Test", state: "NSW", conditionRating: "15"
        });
        expect(valid).toBe(false);
        expect(errors.some(e => e.field === "conditionRating")).toBe(true);
    });

    test("validateBridgeRow: catches invalid date format", () => {
        const { valid, errors } = CsvTemplate.validateBridgeRow({
            bridgeId: "BRG-001", name: "Test", state: "NSW",
            inspectionDate: "15/03/2024" // wrong format
        });
        expect(valid).toBe(false);
        expect(errors.some(e => e.field === "inspectionDate")).toBe(true);
    });

    test("validateBridgeRow: catches invalid boolean", () => {
        const { valid, errors } = CsvTemplate.validateBridgeRow({
            bridgeId: "BRG-001", name: "Test", state: "NSW",
            nhvrRouteAssessed: "maybe"
        });
        expect(valid).toBe(false);
        expect(errors.some(e => e.field === "nhvrRouteAssessed")).toBe(true);
    });

    test("validateBridgeRow: valid row passes with no errors", () => {
        const { valid, errors } = CsvTemplate.validateBridgeRow({
            bridgeId: "BRG-NSW001-001", name: "Hawkesbury River Bridge",
            state: "NSW", assetOwner: "Transport for NSW",
            nhvrRouteAssessed: "Yes", freightRoute: "No",
            conditionRating: "7", inspectionDate: "2024-03-15",
            postingStatus: "UNRESTRICTED", latitude: "-33.5678", longitude: "150.9012"
        });
        expect(valid).toBe(true);
        expect(errors).toHaveLength(0);
    });

    test("validateBridgeRow: catches out-of-range latitude", () => {
        const { valid, errors } = CsvTemplate.validateBridgeRow({
            bridgeId: "BRG-001", name: "Test", state: "NSW",
            latitude: "-95.0"
        });
        expect(valid).toBe(false);
        expect(errors.some(e => e.field === "latitude")).toBe(true);
    });

    test("coerceBridgeRow converts string values to correct types", () => {
        const result = CsvTemplate.coerceBridgeRow({
            bridgeId: "BRG-001", name: "Test", state: "NSW",
            nhvrRouteAssessed: "Yes", conditionRating: "7",
            loadRating: "42.5", yearBuilt: "1965",
            postingStatus: "unrestricted"
        });
        expect(result.nhvrRouteAssessed).toBe(true);
        expect(result.conditionRating).toBe(7);
        expect(result.loadRating).toBe(42.5);
        expect(result.yearBuilt).toBe(1965);
        expect(result.postingStatus).toBe("UNRESTRICTED");
    });

    test("mapBridgeRow maps human-readable headers to field keys", () => {
        const headers = ["Bridge ID", "Bridge Name", "State/Territory", "NHVR Route Assessed"];
        const values  = ["BRG-001", "Test Bridge", "NSW", "Yes"];
        const mapped = CsvTemplate.mapBridgeRow(headers, values);
        expect(mapped.bridgeId).toBe("BRG-001");
        expect(mapped.name).toBe("Test Bridge");
        expect(mapped.state).toBe("NSW");
        expect(mapped.nhvrRouteAssessed).toBe("Yes");
    });
});

// ─────────────────────────────────────────────────────────────
// PART 4: Registry-driven format helpers
// ─────────────────────────────────────────────────────────────
describe("PART 1b — Registry formatValue helpers", () => {

    test("formatValue renders boolean as Yes/No", () => {
        const attr = BRIDGE_ATTRIBUTES.find(a => a.key === "nhvrRouteAssessed");
        expect(BridgeAttrs.formatValue(attr, true)).toBe("Yes");
        expect(BridgeAttrs.formatValue(attr, false)).toBe("No");
    });

    test("formatValue renders null as dash", () => {
        const attr = BRIDGE_ATTRIBUTES.find(a => a.key === "loadRating");
        expect(BridgeAttrs.formatValue(attr, null)).toBe("—");
        expect(BridgeAttrs.formatValue(attr, undefined)).toBe("—");
    });

    test("formatValue renders decimal with unit", () => {
        const attr = BRIDGE_ATTRIBUTES.find(a => a.key === "loadRating");
        expect(BridgeAttrs.formatValue(attr, 42.5)).toBe("42.50\u00a0t");
    });

    test("formatValue renders enum with human label", () => {
        const attr = BRIDGE_ATTRIBUTES.find(a => a.key === "postingStatus");
        expect(BridgeAttrs.formatValue(attr, "WEIGHT_RESTRICTED")).toBe("Weight Restricted");
    });

    test("formatValue renders condition enum", () => {
        const attr = BRIDGE_ATTRIBUTES.find(a => a.key === "condition");
        expect(BridgeAttrs.formatValue(attr, "VERY_GOOD")).toBe("Very Good");
    });

    test("postingStatusClass returns correct CSS for CLOSED", () => {
        expect(BridgeAttrs.postingStatusClass("CLOSED")).toBe("nhvrStatusRed");
    });

    test("conditionClass returns correct CSS", () => {
        expect(BridgeAttrs.conditionClass("VERY_POOR")).toBe("nhvrCondRed");
        expect(BridgeAttrs.conditionClass("GOOD")).toBe("nhvrCondTeal");
    });

    test("formatCsvValue renders boolean as Yes/No", () => {
        const attr = BRIDGE_ATTRIBUTES.find(a => a.key === "freightRoute");
        expect(BridgeAttrs.formatCsvValue(attr, true)).toBe("Yes");
        expect(BridgeAttrs.formatCsvValue(attr, false)).toBe("No");
    });

    test("formatCsvValue renders date as ISO string", () => {
        const attr = BRIDGE_ATTRIBUTES.find(a => a.key === "inspectionDate");
        expect(BridgeAttrs.formatCsvValue(attr, "2024-03-15T00:00:00Z")).toBe("2024-03-15");
    });
});

// ─────────────────────────────────────────────────────────────
// PART 5: BridgesController source — no hardcoded column lists
// ─────────────────────────────────────────────────────────────
describe("PART 2 — BridgesController: no hardcoded column lists", () => {

    const CTRL_PATH = path.join(WEBAPP, "controller/Bridges.controller.js");
    let src;

    beforeAll(() => {
        src = fs.readFileSync(CTRL_PATH, "utf8");
    });

    test("controller imports BridgeAttributes config", () => {
        expect(src).toContain("nhvr/bridgemanagement/config/BridgeAttributes");
    });

    test("controller imports CsvExport utility", () => {
        expect(src).toContain("nhvr/bridgemanagement/util/CsvExport");
    });

    test("controller imports CsvTemplate utility", () => {
        expect(src).toContain("nhvr/bridgemanagement/util/CsvTemplate");
    });

    test("controller uses BridgeAttrs.BRIDGE_ATTRIBUTES for $select", () => {
        expect(src).toContain("BridgeAttrs.BRIDGE_ATTRIBUTES");
    });

    test("controller has _buildBridgeColumns method", () => {
        expect(src).toContain("_buildBridgeColumns");
    });

    test("controller has registry-based filter application", () => {
        expect(src).toContain("_registryFilters");
    });

    test("controller has bulk upload handler (onOpenBulkUpload)", () => {
        expect(src).toContain("onOpenBulkUpload");
    });

    test("controller has CSV export dialog handler", () => {
        expect(src).toContain("onExportCsvOpen");
    });

    test("controller has template download handler", () => {
        expect(src).toContain("onDownloadBridgeTemplate");
    });
});

// ─────────────────────────────────────────────────────────────
// PART 6: Schema consistency
// ─────────────────────────────────────────────────────────────
describe("PART 7 — Schema consistency: registry fields in schema.cds", () => {

    let schemaSrc;

    beforeAll(() => {
        // Read barrel + all sub-files under db/schema/
        schemaSrc = fs.readFileSync(path.join(DB, "schema.cds"), "utf8");
        const schemaDir = path.join(DB, "schema");
        if (fs.existsSync(schemaDir)) {
            for (const f of fs.readdirSync(schemaDir).filter(n => n.endsWith(".cds"))) {
                schemaSrc += "\n" + fs.readFileSync(path.join(schemaDir, f), "utf8");
            }
        }
    });

    // Fields that are genuinely in the Bridge entity (including extends)
    const SCHEMA_EXPECTED_FIELDS = [
        "bridgeId", "name", "state", "routeNumber", "lga", "region", "assetOwner",
        "bancId", "totalLengthM", "widthM", "numberOfSpans", "maxSpanLengthM",
        "clearanceHeightM", "numberOfLanes", "structureType", "material",
        "yearBuilt", "designStandard", "postingStatus", "loadRating",
        "nhvrRouteAssessed", "nhvrRouteApprovalClass", "hmlApproved", "bdoubleApproved",
        "freightRoute", "gazetteRef", "importanceLevel", "conditionRating",
        "structuralAdequacyRating", "inspectionDate", "nextInspectionDueDate",
        "highPriorityAsset", "asBuiltDrawingRef", "scourDepthLastMeasuredM",
        "scourRisk", "floodImpacted", "floodImmunityARI", "aadtVehicles",
        "heavyVehiclePct", "currentReplacementCost", "remainingUsefulLifeYrs",
        "designLife", "latitude", "longitude", "remarks", "dataSource"
    ];

    SCHEMA_EXPECTED_FIELDS.forEach(field => {
        test(`schema.cds contains Bridge field: ${field}`, () => {
            expect(schemaSrc).toContain(field);
        });
    });

    test("schema contains hmlApproved boolean field (data-consistency extension)", () => {
        expect(schemaSrc).toContain("hmlApproved");
        expect(schemaSrc).toContain("Boolean");
    });

    test("schema contains bdoubleApproved boolean field (data-consistency extension)", () => {
        expect(schemaSrc).toContain("bdoubleApproved");
    });
});

// ─────────────────────────────────────────────────────────────
// PART 7: Service layer consistency
// ─────────────────────────────────────────────────────────────
describe("PART 7b — Service consistency: batch import actions defined", () => {

    let serviceCdsSrc, uploadHandlerSrc;

    beforeAll(() => {
        // Read barrel + all sub-files under srv/services/
        serviceCdsSrc = fs.readFileSync(path.join(SRV, "service.cds"), "utf8");
        const svcDir = path.join(SRV, "services");
        if (fs.existsSync(svcDir)) {
            for (const f of fs.readdirSync(svcDir).filter(n => n.endsWith(".cds"))) {
                serviceCdsSrc += "\n" + fs.readFileSync(path.join(svcDir, f), "utf8");
            }
        }
        uploadHandlerSrc = fs.readFileSync(path.join(SRV, "handlers", "upload.js"), "utf8");
    });

    test("service.cds defines importBridgesBatch action", () => {
        expect(serviceCdsSrc).toContain("importBridgesBatch");
    });

    test("service.cds defines importRestrictionsBatch action", () => {
        expect(serviceCdsSrc).toContain("importRestrictionsBatch");
    });

    test("service.js handles importBridgesBatch", () => {
        expect(uploadHandlerSrc).toContain("srv.on('importBridgesBatch'");
    });

    test("service.js handles importRestrictionsBatch", () => {
        expect(uploadHandlerSrc).toContain("srv.on('importRestrictionsBatch'");
    });

    test("importBridgesBatch handler validates max 500 rows", () => {
        expect(uploadHandlerSrc).toContain("500");
        expect(uploadHandlerSrc).toContain("Maximum 500 rows");
    });

    test("importBridgesBatch writes to AuditLog", () => {
        expect(uploadHandlerSrc).toContain("BULK_IMPORT");
    });
});

// ─────────────────────────────────────────────────────────────
// PART 8: Restriction registry consistency
// ─────────────────────────────────────────────────────────────
describe("PART 3 — Restriction registry helpers", () => {

    test("restriction getCsvColumns returns all 18 fields", () => {
        expect(RestrictionAttrs.getCsvColumns().length).toBe(18);
    });

    test("restriction getFilterableAttributes returns filterable subset", () => {
        const filterable = RestrictionAttrs.getFilterableAttributes();
        expect(filterable.length).toBeGreaterThan(10);
        expect(filterable.every(a => !!a.filterType)).toBe(true);
    });

    test("restriction QUICK_FILTERS has 6 presets", () => {
        expect(RestrictionAttrs.QUICK_FILTERS).toHaveLength(6);
    });

    test("restriction quick filter keys match expected presets", () => {
        const keys = RestrictionAttrs.QUICK_FILTERS.map(f => f.key);
        expect(keys).toContain("active");
        expect(keys).toContain("temporary");
        expect(keys).toContain("permit");
        expect(keys).toContain("noGazette");
        expect(keys).toContain("disabled");
    });

    test("restriction enumLabel returns human-readable strings", () => {
        expect(RestrictionAttrs.enumLabel("GROSS_MASS")).toBe("Gross Mass");
        expect(RestrictionAttrs.enumLabel("FLOOD_CLOSURE")).toBe("Flood Closure");
    });

    test("restriction statusClass returns correct CSS", () => {
        expect(RestrictionAttrs.statusClass("ACTIVE")).toBe("nhvrStatusGreen");
        expect(RestrictionAttrs.statusClass("EXPIRED")).toBe("nhvrStatusRed");
    });

    test("restriction formatCsvValue renders boolean as Yes/No", () => {
        const attr = RESTRICTION_ATTRIBUTES.find(a => a.key === "isTemporary");
        expect(RestrictionAttrs.formatCsvValue(attr, true)).toBe("Yes");
        expect(RestrictionAttrs.formatCsvValue(attr, false)).toBe("No");
    });
});

// ─────────────────────────────────────────────────────────────
// PART 9: BridgeForm view consistency
// ─────────────────────────────────────────────────────────────
describe("PART 6 — BridgeForm view: critical fields present", () => {

    let formViewSrc;

    beforeAll(() => {
        formViewSrc = fs.readFileSync(
            path.join(WEBAPP, "view/BridgeForm.view.xml"), "utf8"
        );
    });

    // Test that key fields (by their expected input IDs) are in the form view
    const EXPECTED_FORM_IDS = [
        "fBridgeId", "fName", "fState", "fAssetOwner", "fLga", "fRegion",
        "fLatitude", "fLongitude", "fPostingStatus", "fConditionStandard",
        "fInspectionDate", "fScourRisk"
    ];

    EXPECTED_FORM_IDS.forEach(id => {
        test(`BridgeForm.view.xml contains field id="${id}"`, () => {
            expect(formViewSrc).toContain(`id="${id}"`);
        });
    });

    test("BridgeForm view contains Section F (Financial)", () => {
        // Should have either 'Financial' or 'currentReplacementCost' related field
        const hasFinancial = formViewSrc.includes("Financial") || formViewSrc.includes("Replacement") || formViewSrc.includes("fReplacementCost") || formViewSrc.includes("fCurrentReplacement");
        expect(hasFinancial).toBe(true);
    });

    test("BridgeForm view contains HML Approved field", () => {
        const hasHml = formViewSrc.includes("fHmlApproved") || formViewSrc.includes("HML Approved");
        expect(hasHml).toBe(true);
    });

    test("BridgeForm controller handles save with all key fields", () => {
        const ctrlSrc = fs.readFileSync(
            path.join(WEBAPP, "controller/BridgeForm.controller.js"), "utf8"
        );
        // Controller should reference these fields in its save/payload logic
        expect(ctrlSrc).toContain("assetOwner");
        expect(ctrlSrc).toContain("conditionRating");
        expect(ctrlSrc).toContain("postingStatus");
    });
});
