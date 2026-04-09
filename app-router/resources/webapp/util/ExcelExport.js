// ============================================================
// NHVR Excel Export Utility — sap.ui.export.Spreadsheet
// Shared module for all report screens.
// Usage:
//   ExcelExport.export({ fileName: "Bridges", columns: [...], data: [...] });
// ============================================================
sap.ui.define([
    "sap/ui/export/Spreadsheet",
    "sap/ui/export/library",
    "sap/m/MessageToast",
    "sap/m/MessageBox"
], function (Spreadsheet, exportLibrary, MessageToast, MessageBox) {
    "use strict";

    var EdmType = exportLibrary.EdmType;

    /**
     * @param {object}   cfg
     * @param {string}   cfg.fileName   - Filename without extension (e.g. "NHVR_Bridges")
     * @param {Array}    cfg.columns    - Column definitions [{label, property, type?, width?, scale?}]
     * @param {Array}    cfg.data       - Array of plain JS objects
     * @param {string}   [cfg.sheetName] - Excel sheet name (defaults to fileName)
     * @returns {Promise}
     */
    function doExport(cfg) {
        if (!cfg || !cfg.columns || !cfg.data) {
            MessageToast.show("Export configuration missing");
            return Promise.reject("Bad config");
        }
        if (cfg.data.length === 0) {
            MessageToast.show("No data to export");
            return Promise.resolve();
        }

        const settings = {
            workbook: {
                columns : cfg.columns.map(col => ({
                    label    : col.label,
                    property : col.property,
                    type     : col.type || EdmType.String,
                    scale    : col.scale,
                    width    : col.width || 20,
                    wrap     : false
                })),
                hierarchyLevel: "Level"
            },
            dataSource: cfg.data,
            fileName   : cfg.fileName + ".xlsx",
            worker     : false   // synchronous for reliability in BTP trial environment
        };

        const oSheet = new Spreadsheet(settings);
        return oSheet.build()
            .then(() => {
                MessageToast.show(`Exported ${cfg.data.length} records to ${cfg.fileName}.xlsx`);
            })
            .catch(err => {
                console.error("Excel export failed", err);
                MessageBox.error("Export failed. Please try again.\n" + (err.message || err));
            })
            .finally(() => {
                oSheet.destroy();
            });
    }

    // ── Pre-built column sets for each entity ─────────────────

    const BridgeColumns = [
        { label: "Bridge ID",         property: "bridgeId",          width: 14 },
        { label: "Name",              property: "name",               width: 30 },
        { label: "Region",            property: "region",             width: 22 },
        { label: "State",             property: "state",              width: 8  },
        { label: "Condition",         property: "condition",          width: 12 },
        { label: "Condition Rating",  property: "conditionRating",    width: 16, type: "Edm.Int32" },
        { label: "Posting Status",    property: "postingStatus",      width: 16 },
        { label: "Structure Type",    property: "structureType",      width: 20 },
        { label: "Clearance (m)",     property: "clearanceHeightM",   width: 14, type: "Edm.Decimal", scale: 2 },
        { label: "Width (m)",         property: "widthM",             width: 12, type: "Edm.Decimal", scale: 2 },
        { label: "Year Built",        property: "yearBuilt",          width: 12, type: "Edm.Int32" },
        { label: "Inspection Date",   property: "inspectionDate",     width: 16 },
        { label: "NHVR Assessed",     property: "nhvrRouteAssessed",  width: 14 },
        { label: "Scour Risk",        property: "scourRisk",          width: 14 },
        { label: "Freight Route",     property: "freightRoute",       width: 14 },
        { label: "Risk Band",         property: "currentRiskBand",    width: 14 },
        { label: "Asset Owner",       property: "assetOwner",         width: 25 },
        { label: "LGA",               property: "lga",                width: 20 },
        { label: "Road Route",        property: "roadRoute",          width: 20 },
        { label: "Route Number",      property: "routeNumber",        width: 14 }
    ];

    const RestrictionColumns = [
        { label: "Bridge ID",         property: "bridgeId",           width: 14 },
        { label: "Bridge Name",       property: "bridgeName",         width: 30 },
        { label: "Restriction Type",  property: "restrictionType",    width: 20 },
        { label: "Value",             property: "value",              width: 10, type: "Edm.Decimal", scale: 2 },
        { label: "Unit",              property: "unit",               width: 8  },
        { label: "Status",            property: "status",             width: 12 },
        { label: "Permit Required",   property: "permitRequired",     width: 14 },
        { label: "Route Code",        property: "routeCode",          width: 14 },
        { label: "Vehicle Class",     property: "vehicleClass",       width: 20 },
        { label: "Valid From",        property: "validFrom",          width: 14 },
        { label: "Valid To",          property: "validTo",            width: 14 },
        { label: "Gazette Ref",       property: "gazetteRef",         width: 20 },
        { label: "Direction",         property: "directionApplied",   width: 14 },
        { label: "Temporary",         property: "isTemporary",        width: 12 },
        { label: "Enforcement Auth.", property: "enforcementAuthority", width: 25 }
    ];

    const DefectColumns = [
        { label: "Defect No.",        property: "defectNumber",       width: 16 },
        { label: "Bridge ID",         property: "bridgeId",           width: 14 },
        { label: "Bridge Name",       property: "bridgeName",         width: 30 },
        { label: "Category",          property: "defectCategory",     width: 16 },
        { label: "Severity",          property: "severity",           width: 14 },
        { label: "Priority",          property: "priority",           width: 14 },
        { label: "Status",            property: "status",             width: 14 },
        { label: "Element Group",     property: "elementGroup",       width: 20 },
        { label: "Location",          property: "location",           width: 25 },
        { label: "Detected Date",     property: "detectedDate",       width: 16 },
        { label: "Repair Est. (AUD)", property: "repairEstimateAUD",  width: 18, type: "Edm.Decimal", scale: 2 },
        { label: "Notes",             property: "notes",              width: 40 }
    ];

    const InspectionColumns = [
        { label: "Order No.",         property: "orderNumber",        width: 16 },
        { label: "Bridge ID",         property: "bridgeId",           width: 14 },
        { label: "Bridge Name",       property: "bridgeName",         width: 30 },
        { label: "Inspection Type",   property: "inspectionType",     width: 18 },
        { label: "Status",            property: "status",             width: 16 },
        { label: "Planned Date",      property: "plannedDate",        width: 16 },
        { label: "Inspector",         property: "inspector",          width: 25 },
        { label: "Condition Rating",  property: "overallConditionRating", width: 16, type: "Edm.Int32" },
        { label: "Struct. Adequacy",  property: "structuralAdequacy", width: 18 },
        { label: "Next Due",          property: "nextInspectionDue",  width: 16 },
        { label: "Firm",              property: "inspectionFirm",     width: 25 },
        { label: "Report Ref",        property: "reportRef",          width: 20 }
    ];

    const PermitColumns = [
        { label: "Permit ID",         property: "permitId",           width: 16 },
        { label: "Bridge ID",         property: "bridgeId",           width: 14 },
        { label: "Bridge Name",       property: "bridgeName",         width: 30 },
        { label: "Vehicle Type",      property: "vehicleTypeName",    width: 25 },
        { label: "Permit Type",       property: "permitType",         width: 16 },
        { label: "Status",            property: "permitStatus",       width: 16 },
        { label: "Assessed GVM (t)",  property: "assessedGVM_t",      width: 16, type: "Edm.Decimal", scale: 2 },
        { label: "Height (m)",        property: "assessedHeight_m",   width: 14, type: "Edm.Decimal", scale: 2 },
        { label: "Width (m)",         property: "assessedWidth_m",    width: 14, type: "Edm.Decimal", scale: 2 },
        { label: "All Checks Passed", property: "allChecksPassed",    width: 16 },
        { label: "Effective From",    property: "effectiveFrom",      width: 16 },
        { label: "Expiry Date",       property: "expiryDate",         width: 16 },
        { label: "Assessed By",       property: "assessedBy",         width: 25 },
        { label: "Conditions",        property: "conditions",         width: 40 }
    ];

    return {
        export        : doExport,
        BridgeColumns : BridgeColumns,
        RestrictionColumns: RestrictionColumns,
        DefectColumns : DefectColumns,
        InspectionColumns: InspectionColumns,
        PermitColumns : PermitColumns
    };
});
