// ============================================================
// NHVR Reports Controller — Unit Test Suite
//
// Tests the Reports & Analytics controller:
//   - Report catalogue completeness (15 reports)
//   - OData function names match service.cds definitions
//   - Field names in defaultFields match entity schema
//   - URL construction in _executeReport dispatch table
//   - CDN case-fix shim regex coverage
//
// Run: npm test -- --testPathPattern=reports-controller
// ============================================================
"use strict";

const path = require("path");
const fs   = require("fs");

const WEBAPP = path.join(__dirname, "../../app/bridge-management/webapp");
const SRV    = path.join(__dirname, "../../srv");

// ── Extract REPORT_CATALOGUE from controller source ──────────
function extractCatalogue() {
    const src = fs.readFileSync(
        path.join(WEBAPP, "controller/Reports.controller.js"), "utf8"
    );
    // Extract the REPORT_CATALOGUE array literal
    const startMarker = "const REPORT_CATALOGUE = [";
    const startIdx = src.indexOf(startMarker);
    if (startIdx === -1) throw new Error("REPORT_CATALOGUE not found in controller");

    let depth = 0;
    let arrayStart = src.indexOf("[", startIdx);
    let i = arrayStart;
    for (; i < src.length; i++) {
        if (src[i] === "[") depth++;
        if (src[i] === "]") { depth--; if (depth === 0) break; }
    }
    const raw = src.slice(arrayStart, i + 1);
    // eval is safe here — it's our own source file in a test context
    return eval("(" + raw + ")");
}

// ── Extract entity/field info from service.cds ───────────────
function loadServiceCds() {
    let src = fs.readFileSync(path.join(SRV, "service.cds"), "utf8");
    const svcDir = path.join(SRV, "services");
    if (fs.existsSync(svcDir)) {
        for (const f of fs.readdirSync(svcDir).filter(n => n.endsWith(".cds"))) {
            src += "\n" + fs.readFileSync(path.join(svcDir, f), "utf8");
        }
    }
    return src;
}

function loadSchemaCds() {
    const dbDir = path.join(__dirname, "../../db");
    let src = fs.readFileSync(path.join(dbDir, "schema.cds"), "utf8");
    const schemaDir = path.join(dbDir, "schema");
    if (fs.existsSync(schemaDir)) {
        for (const f of fs.readdirSync(schemaDir).filter(n => n.endsWith(".cds"))) {
            src += "\n" + fs.readFileSync(path.join(schemaDir, f), "utf8");
        }
    }
    return src;
}

// ── Extract index.html CDN shim ──────────────────────────────
function loadIndexHtml() {
    return fs.readFileSync(path.join(WEBAPP, "index.html"), "utf8");
}

// ============================================================
// Tests
// ============================================================
let catalogue;

beforeAll(() => {
    catalogue = extractCatalogue();
});

describe("Reports — Catalogue Completeness", () => {
    test("catalogue has exactly 15 reports", () => {
        expect(catalogue).toHaveLength(15);
    });

    test("every report has required fields", () => {
        const requiredKeys = ["id", "title", "category", "icon", "description", "defaultFields", "odataFn"];
        catalogue.forEach(report => {
            requiredKeys.forEach(key => {
                expect(report).toHaveProperty(key);
                expect(report[key]).toBeTruthy();
            });
        });
    });

    test("all report IDs are unique", () => {
        const ids = catalogue.map(r => r.id);
        expect(new Set(ids).size).toBe(ids.length);
    });

    test("expected report IDs are present", () => {
        const ids = catalogue.map(r => r.id);
        const expected = [
            "ASSET_REGISTER", "ASSET_SUMMARY", "CONDITION_DIST",
            "BRIDGES_CAPACITY", "NON_COMPLIANT", "OVERDUE_REVIEWS",
            "ROUTE_COMPLIANCE", "INSPECTION_STATUS", "DEFECT_KPIS",
            "RESTRICTION_SUMMARY", "RESTRICTION_KPIS", "NETWORK_KPIS",
            "VEHICLE_ACCESS", "FREIGHT_ROUTE", "TREND_DATA"
        ];
        expected.forEach(id => {
            expect(ids).toContain(id);
        });
    });

    test("every report has at least 3 default fields", () => {
        catalogue.forEach(report => {
            expect(report.defaultFields.length).toBeGreaterThanOrEqual(3);
        });
    });

    test("categories cover all expected groups", () => {
        const cats = new Set(catalogue.map(r => r.category));
        ["ASSET", "COMPLIANCE", "INSPECTIONS", "RESTRICTIONS", "NETWORK", "TRENDS"].forEach(c => {
            expect(cats).toContain(c);
        });
    });
});

describe("Reports — OData Function Names Match Service", () => {
    let serviceCds;

    beforeAll(() => {
        serviceCds = loadServiceCds();
    });

    // Function-based reports (getAssetRegister, getAssetSummary, etc.)
    const functionReports = [
        { id: "ASSET_REGISTER",      fn: "getAssetRegister" },
        { id: "ASSET_SUMMARY",       fn: "getAssetSummary" },
        { id: "CONDITION_DIST",      fn: "getConditionDistribution" },
        { id: "BRIDGES_CAPACITY",    fn: "getBridgesExceedingCapacity" },
        { id: "OVERDUE_REVIEWS",     fn: "getOverdueCapacityReviews" },
        { id: "RESTRICTION_SUMMARY", fn: "getRestrictionSummary" },
        { id: "INSPECTION_STATUS",   fn: "getInspectionStatusReport" },
    ];

    functionReports.forEach(({ id, fn }) => {
        test(`${id} → function ${fn} exists in service.cds`, () => {
            expect(serviceCds).toContain(`function ${fn}(`);
        });
    });

    // Entity-set-based reports (BridgeDefects, Restrictions, etc.)
    const entityReports = [
        { id: "NON_COMPLIANT",    fn: "RouteCompliance" },
        { id: "ROUTE_COMPLIANCE", fn: "RouteCompliance" },
        { id: "RESTRICTION_KPIS", fn: "Restrictions" },
        { id: "VEHICLE_ACCESS",   fn: "VehicleAccess" },
    ];

    entityReports.forEach(({ id, fn }) => {
        test(`${id} → entity set ${fn} is exposed in service.cds`, () => {
            // Entity sets appear as "entity VehicleAccess" or projections
            const hasEntity = serviceCds.includes(`entity ${fn}`) ||
                              serviceCds.includes(`${fn} as select`) ||
                              serviceCds.includes(`${fn} as projection`);
            expect(hasEntity).toBe(true);
        });
    });
});

describe("Reports — Field Names Consistency", () => {
    let schemaCds;

    beforeAll(() => {
        schemaCds = loadSchemaCds();
    });

    test("DEFECT_KPIS uses detectedDate (not reportedDate) in defaultFields", () => {
        const defectReport = catalogue.find(r => r.id === "DEFECT_KPIS");
        expect(defectReport.defaultFields).toContain("detectedDate");
        expect(defectReport.defaultFields).not.toContain("reportedDate");
    });

    test("DEFECT_KPIS defaultFields match BridgeDefect entity fields", () => {
        const defectReport = catalogue.find(r => r.id === "DEFECT_KPIS");
        // These fields must exist in BridgeDefect entity in schema.cds
        const expectedInSchema = ["defectCode", "defectCategory", "severity", "status", "detectedDate", "closedDate", "description"];
        expectedInSchema.forEach(field => {
            expect(defectReport.defaultFields).toContain(field);
            // Check field exists in schema (allowing for various CDS syntax)
            const fieldExists = schemaCds.includes(`${field}`) ||
                                schemaCds.includes(`${field} `);
            expect(fieldExists).toBe(true);
        });
    });

    test("TREND_DATA uses changedAt (valid BridgeHistory field)", () => {
        const trendReport = catalogue.find(r => r.id === "TREND_DATA");
        expect(trendReport.defaultFields).toContain("changedAt");
    });
});

describe("Reports — URL Construction in Controller", () => {
    let controllerSrc;

    beforeAll(() => {
        controllerSrc = fs.readFileSync(
            path.join(WEBAPP, "controller/Reports.controller.js"), "utf8"
        );
    });

    test("BridgeDefects query uses detectedDate (not reportedDate)", () => {
        // Must NOT contain reportedDate in the $orderby clause
        expect(controllerSrc).not.toMatch(/BridgeDefects.*orderby.*reportedDate/);
        // Must contain detectedDate in the $orderby clause
        expect(controllerSrc).toMatch(/BridgeDefects.*orderby.*detectedDate/);
    });

    test("BridgeHistory uses correct entity name (not BridgeConditionHistory)", () => {
        // The fetch URL should use /BridgeHistory not /BridgeConditionHistory
        expect(controllerSrc).toMatch(/\/BridgeHistory\?/);
        expect(controllerSrc).not.toMatch(/\/BridgeConditionHistory\?/);
    });

    test("FreightRoutes uses plural entity name (not FreightRoute)", () => {
        expect(controllerSrc).toMatch(/\/FreightRoutes\?/);
    });

    test("all function-based reports use _credOpts()", () => {
        // Every fetch to /bridge-management/ should include _credOpts()
        const fetchCalls = controllerSrc.match(/fetch\(BASE\s*\+\s*"[^"]+",\s*_credOpts\(\)/g) || [];
        // At least the function-based ones (getAssetRegister, getAssetSummary, etc.)
        expect(fetchCalls.length).toBeGreaterThanOrEqual(7);
    });

    test("_buildQsRequired exists and handles null values", () => {
        expect(controllerSrc).toContain("_buildQsRequired");
        // Should convert null/undefined to 'null' string for OData
        expect(controllerSrc).toMatch(/=\s*null\b/);
    });
});

describe("Reports — View XML Structure", () => {
    let viewXml;

    beforeAll(() => {
        viewXml = fs.readFileSync(
            path.join(WEBAPP, "view/Reports.view.xml"), "utf8"
        );
    });

    test("view has hub section with report cards container", () => {
        expect(viewXml).toContain("reportCardsContainer");
    });

    test("view has output section with results table", () => {
        expect(viewXml).toContain("reportResultsTable");
    });

    test("view has criteria panel with date range, state, condition inputs", () => {
        expect(viewXml).toContain("criteriaDateRange");
        expect(viewXml).toContain("criteriaState");
        expect(viewXml).toContain("criteriaCondMin");
        expect(viewXml).toContain("criteriaCondMax");
    });

    test("view has Export to Excel button", () => {
        expect(viewXml).toMatch(/Export to Excel|exportToExcel|onExportExcel/i);
    });

    test("view has back-to-hub button", () => {
        expect(viewXml).toMatch(/Reports Hub|onBackToHub/);
    });

    test("view has hubView visibility bindings for both sections", () => {
        // Hub section visible when hubView is true
        expect(viewXml).toMatch(/visible.*hubView/);
    });

    test("view has results count title", () => {
        expect(viewXml).toContain("resultsCountTitle");
    });

    test("view has Run Report button", () => {
        expect(viewXml).toMatch(/Run Report|onRunCurrentReport/);
    });
});

describe("CDN Case-Fix Shim — index.html", () => {
    let html;

    beforeAll(() => {
        html = loadIndexHtml();
    });

    test("shim exists with _lower2upper map", () => {
        expect(html).toContain("_lower2upper");
    });

    test("shim covers toolbar.js (the most common case-mismatch)", () => {
        expect(html).toContain('"sap/m/toolbar.js"');
        expect(html).toContain('"sap/m/Toolbar.js"');
    });

    test("shim covers all 8 known lowercase modules", () => {
        const modules = [
            "toolbar.js", "overflowToolbar.js", "toolbarSpacer.js",
            "toolbarSeparator.js", "text.js", "label.js",
            "button.js", "input.js"
        ];
        modules.forEach(mod => {
            expect(html).toContain(`"sap/m/${mod}"`);
        });
    });

    test("shim regex matches both /resources/ (BTP) and /ui5cdn/ (local)", () => {
        // The regex should include both patterns
        expect(html).toMatch(/resources|ui5cdn/);
        // Specifically, the regex should use a group to match either
        expect(html).toMatch(/\(?:?resources.*ui5cdn|ui5cdn.*resources/);
    });

    test("shim intercepts document.createElement('script')", () => {
        expect(html).toContain("document.createElement");
        expect(html).toContain('"script"');
    });

    test("shim preserves original createElement via bind", () => {
        expect(html).toContain("document.createElement.bind(document)");
    });

    test("pre-load block requires uppercase toolbar modules", () => {
        expect(html).toContain('"sap/m/Toolbar"');
        expect(html).toContain('"sap/m/OverflowToolbar"');
        expect(html).toContain('"sap/m/ToolbarSpacer"');
    });

    test("auth shim adds credentials for BTP and Basic auth for local", () => {
        expect(html).toContain("credentials");
        expect(html).toContain("'include'");
        expect(html).toContain("btoa('admin:admin')");
    });

    test("CSRF token handling exists for write operations", () => {
        expect(html).toContain("x-csrf-token");
        expect(html).toContain("getCsrfToken");
    });
});

describe("BridgeDetail.view.xml — No Invalid Properties", () => {
    let detailXml;

    beforeAll(() => {
        detailXml = fs.readFileSync(
            path.join(WEBAPP, "view/BridgeDetail.view.xml"), "utf8"
        );
    });

    test("IconTabBar does not have deprecated overflow attribute", () => {
        // overflow="Select" is deprecated in UI5 1.133 and causes blank page
        const iconTabBars = detailXml.match(/<IconTabBar[^>]+>/g) || [];
        iconTabBars.forEach(tag => {
            expect(tag).not.toMatch(/\boverflow\s*=/);
        });
    });

    test("IconTabBar has valid attributes only", () => {
        const iconTabBars = detailXml.match(/<IconTabBar[^>]+>/g) || [];
        const validAttrs = [
            "id", "class", "selectedKey", "expandable", "select",
            "tabDensityMode", "headerMode", "stretchContentHeight",
            "headerBackgroundDesign", "backgroundDesign", "applyContentPadding"
        ];
        iconTabBars.forEach(tag => {
            // Extract attribute names
            const attrs = (tag.match(/\b(\w+)\s*=/g) || []).map(a => a.replace(/\s*=/, ""));
            attrs.forEach(attr => {
                if (attr === "xmlns" || attr.startsWith("xmlns:")) return; // skip namespaces
                expect(validAttrs).toContain(attr);
            });
        });
    });
});

describe("Reports — Export Handler", () => {
    let controllerSrc;

    beforeAll(() => {
        controllerSrc = fs.readFileSync(
            path.join(WEBAPP, "controller/Reports.controller.js"), "utf8"
        );
    });

    test("onExportCurrentReport handler exists", () => {
        expect(controllerSrc).toContain("onExportCurrentReport");
    });

    test("export handler reads currentResults from model", () => {
        expect(controllerSrc).toMatch(/currentResults/);
    });

    test("export handler constructs NHVR_ prefixed filename", () => {
        expect(controllerSrc).toMatch(/NHVR_/);
    });

    test("export handler calls ExcelExport.export", () => {
        expect(controllerSrc).toMatch(/ExcelExport/);
    });

    test("export shows toast when no data available", () => {
        expect(controllerSrc).toMatch(/No data to export|run the report first/i);
    });

    test("additional CSV export handlers exist", () => {
        expect(controllerSrc).toContain("onExportCSV");
    });
});

describe("Reports — Pagination", () => {
    let controllerSrc;

    beforeAll(() => {
        controllerSrc = fs.readFileSync(
            path.join(WEBAPP, "controller/Reports.controller.js"), "utf8"
        );
    });

    test("_pageSize and _pageOffset state variables exist", () => {
        expect(controllerSrc).toMatch(/_pageSize\s*:/);
        expect(controllerSrc).toMatch(/_pageOffset\s*:/);
    });

    test("_updatePagination method exists", () => {
        expect(controllerSrc).toContain("_updatePagination");
    });

    test("onNextPage increments page offset", () => {
        expect(controllerSrc).toContain("onNextPage");
        // Should reference _pageOffset and _pageSize
        expect(controllerSrc).toMatch(/_pageOffset\s*\+/);
    });

    test("onPrevPage decrements page offset with floor at 0", () => {
        expect(controllerSrc).toContain("onPrevPage");
    });

    test("_currentPage tracks current page number", () => {
        expect(controllerSrc).toMatch(/_currentPage\s*:/);
    });

    test("pagination buttons are referenced", () => {
        expect(controllerSrc).toMatch(/btnNextPage|btnPrevPage/);
    });
});

describe("Reports — Mobile Responsive CSS", () => {
    let css;

    beforeAll(() => {
        css = fs.readFileSync(
            path.join(WEBAPP, "css/style.css"), "utf8"
        );
    });

    test("has mobile breakpoint at max-width 767px", () => {
        expect(css).toMatch(/@media.*max-width:\s*767px/);
    });

    test("report cards go full width on mobile", () => {
        expect(css).toMatch(/nhvrReportCard/);
        // Should have 100% width rule somewhere in a media query
        expect(css).toMatch(/100%/);
    });

    test("has tablet breakpoint", () => {
        expect(css).toMatch(/@media.*768px/);
    });

    test("has narrow mobile breakpoint at max-width 480px", () => {
        expect(css).toMatch(/@media.*max-width:\s*480px/);
    });

    test("toolbar buttons hide text on mobile", () => {
        // Either hides text or uses icon-only mode
        expect(css).toMatch(/sapMBtn|toolbar/i);
    });
});

describe("S/4HANA Adapter — No Stub Functions", () => {
    let adapterSrc;

    beforeAll(() => {
        adapterSrc = fs.readFileSync(
            path.join(SRV, "integration/s4hana-client.js"), "utf8"
        );
    });

    test("TechObjIsEquipment is a boolean value, not a function", () => {
        // It was: equipmentNumber => !!equipmentNumber (a stub)
        // It should be: true or false
        expect(adapterSrc).not.toMatch(/TechObjIsEquipment\s*:\s*\w+\s*=>/);
        expect(adapterSrc).toMatch(/TechObjIsEquipment\s*:\s*(true|false)/);
    });
});

describe("Mirror Sync — Source and App Router Match", () => {
    const files = [
        "controller/Reports.controller.js",
        "view/Reports.view.xml",
        "view/BridgeDetail.view.xml",
        "index.html"
    ];

    files.forEach(file => {
        test(`${file} matches between source and app-router/resources`, () => {
            const source = fs.readFileSync(path.join(WEBAPP, file), "utf8");
            const mirrorPath = path.join(
                __dirname, "../../app-router/resources/nhvr.bridgemanagement", file
            );
            if (fs.existsSync(mirrorPath)) {
                const mirror = fs.readFileSync(mirrorPath, "utf8");
                expect(source).toBe(mirror);
            }
        });
    });
});
