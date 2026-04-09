/**
 * HelpContent.js — NHVR Bridge Management contextual help registry
 *
 * Provides label, placeholder, helperText, and tooltip metadata for every
 * major form field across the application.  Used by FieldWithHelp fragment
 * and any controller that wants to populate helper text programmatically.
 *
 * Usage:
 *   sap.ui.define(["nhvr/bridgemanagement/util/HelpContent"], function(HelpContent) {
 *     var entry = HelpContent.getHelp("bridgeId");
 *     // entry.label, entry.placeholder, entry.helperText, entry.tooltip
 *   });
 */
sap.ui.define([], function () {
    "use strict";

    /**
     * @typedef {Object} HelpEntry
     * @property {string} label       - Field label text
     * @property {string} placeholder - Input placeholder
     * @property {string} helperText  - Short hint shown below the field
     * @property {string} tooltip     - Longer tooltip for the info icon
     */

    /** @type {Object.<string, HelpEntry>} */
    var HELP = {

        /* ── Bridge fields ──────────────────────────────────────────── */
        bridgeId: {
            label:       "Bridge ID",
            placeholder: "e.g. NSW-B-00123",
            helperText:  "NHVR unique identifier. Assigned automatically on creation.",
            tooltip:     "The NHVR system-generated bridge identifier. Format varies by state (e.g. NSW-B-00123, VIC-B-04567). Cannot be changed after creation."
        },
        bridgeName: {
            label:       "Bridge Name",
            placeholder: "e.g. Hawkesbury River Bridge",
            helperText:  "Official structure name as registered with the road authority.",
            tooltip:     "The official name of the bridge as recorded in the jurisdiction's bridge register. Use the full name including any descriptive suffix."
        },
        state: {
            label:       "State / Territory",
            placeholder: "Select state",
            helperText:  "Australian state or territory where the bridge is located.",
            tooltip:     "Select the state or territory that has jurisdiction over this bridge. This determines which road authority's standards apply."
        },
        suburb: {
            label:       "Suburb / Locality",
            placeholder: "e.g. Windsor",
            helperText:  "Nearest suburb or locality name for geolocation.",
            tooltip:     "The nearest named locality to the bridge. Used for search and reporting. Does not need to be an exact address."
        },
        roadName: {
            label:       "Road Name",
            placeholder: "e.g. Windsor Road",
            helperText:  "Name of the road the bridge carries or crosses.",
            tooltip:     "The full name of the road carried on or under this structure, as shown on official road maps."
        },
        conditionRating: {
            label:       "Condition Rating (1–10)",
            placeholder: "1 = Critical, 10 = Excellent",
            helperText:  "AS 5100.7 overall condition score. 1–3 Critical, 4–5 Poor, 6–7 Fair, 8–10 Good.",
            tooltip:     "The AS 5100.7 bridge condition rating from 1 (critical — immediate action required) to 10 (excellent — no defects). This rating drives maintenance priority and restriction decisions."
        },
        conditionScore: {
            label:       "Condition Score (0–100)",
            placeholder: "0 = worst, 100 = best",
            helperText:  "Percentage-based composite score derived from inspection measurements.",
            tooltip:     "A 0–100 numeric score used for trending and comparison. Computed from element-level condition measurements during formal AS 5100.7 inspections."
        },
        latitude: {
            label:       "Latitude",
            placeholder: "-33.8688",
            helperText:  "Decimal degrees, negative for south. e.g. -33.8688",
            tooltip:     "WGS84 decimal degrees latitude. Must be between -90 and 90. For Australian bridges, values are typically between -10 and -44."
        },
        longitude: {
            label:       "Longitude",
            placeholder: "151.2093",
            helperText:  "Decimal degrees, positive for east. e.g. 151.2093",
            tooltip:     "WGS84 decimal degrees longitude. Must be between -180 and 180. For Australian bridges, values are typically between 113 and 154."
        },
        yearBuilt: {
            label:       "Year Built",
            placeholder: "e.g. 1978",
            helperText:  "Year of original construction. Used for deterioration modelling.",
            tooltip:     "The year the bridge was originally constructed (not any major rehabilitation). Required for deterioration modelling and asset age analysis."
        },
        totalLength: {
            label:       "Total Length (m)",
            placeholder: "e.g. 142.5",
            helperText:  "Overall bridge length including approaches, in metres.",
            tooltip:     "Total structure length in metres measured between abutment back walls. Includes all spans but excludes embankments beyond the abutments."
        },
        roadwayWidth: {
            label:       "Roadway Width (m)",
            placeholder: "e.g. 8.4",
            helperText:  "Clear roadway width between kerbs or barriers, in metres.",
            tooltip:     "The clear width available for traffic between the inside faces of kerbs, barriers, or handrails. Critical for determining vehicle clearance."
        },
        verticalClearance: {
            label:       "Vertical Clearance (m)",
            placeholder: "e.g. 5.1",
            helperText:  "Minimum vertical clearance above road surface under the bridge.",
            tooltip:     "The minimum vertical clearance from the road surface to the lowest point of the bridge superstructure overhead. Enter the minimum value found on the structure."
        },
        bridgeType: {
            label:       "Bridge Type",
            placeholder: "Select bridge type",
            helperText:  "Structural type: Beam, Box Girder, Arch, Culvert, etc.",
            tooltip:     "The primary structural form of the bridge. Used for filtering, reporting and applying appropriate inspection techniques."
        },
        material: {
            label:       "Primary Material",
            placeholder: "Select material",
            helperText:  "Main construction material: Concrete, Steel, Timber, etc.",
            tooltip:     "The primary load-carrying material. Determines inspection requirements and deterioration modelling parameters."
        },

        /* ── Restriction fields ──────────────────────────────────────── */
        restrictionType: {
            label:       "Restriction Type",
            placeholder: "Select restriction type",
            helperText:  "Category: Mass, Axle, Speed, Height, Width, or Vehicle Type.",
            tooltip:     "The type of restriction being applied. Mass restrictions limit gross vehicle mass. Axle restrictions limit per-axle load. Height/Width are dimensional clearance limits."
        },
        restrictionValue: {
            label:       "Restriction Value",
            placeholder: "e.g. 42.5",
            helperText:  "Numeric limit value. Leave blank only for VEHICLE_TYPE restrictions.",
            tooltip:     "The numeric limit of the restriction. For mass restrictions enter tonnes. For speed enter km/h. For dimensions enter metres. Must be greater than zero."
        },
        restrictionUnit: {
            label:       "Unit",
            placeholder: "t / km/h / m",
            helperText:  "Unit of the restriction value (auto-filled for most types).",
            tooltip:     "The unit of measurement for the restriction value. Automatically set based on restriction type: mass = t, speed = km/h, dimensions = m."
        },
        vehicleClass: {
            label:       "Vehicle Class",
            placeholder: "Select vehicle class",
            helperText:  "NHVR heavy vehicle category this restriction applies to.",
            tooltip:     "The NHVR vehicle class or category this restriction applies to. Leave blank to apply to all vehicle classes. Specific class restrictions take precedence over general restrictions."
        },
        validFromDate: {
            label:       "Valid From",
            placeholder: "Select start date",
            helperText:  "Date restriction comes into force. Leave blank for immediate effect.",
            tooltip:     "The date from which this restriction is in force. If left blank, the restriction takes effect immediately. Must be before the Valid To date for temporary restrictions."
        },
        validToDate: {
            label:       "Valid To",
            placeholder: "Select end date (temporary restrictions only)",
            helperText:  "End date for temporary restrictions only. Leave blank for permanent.",
            tooltip:     "The expiry date for temporary restrictions. Leave blank for permanent restrictions. Must be after the Valid From date. The system will auto-expire restrictions after this date."
        },
        gazetteRef: {
            label:       "Gazette Reference",
            placeholder: "e.g. NSW Gazette 2024/456",
            helperText:  "Official gazette publication reference for legally gazetted restrictions.",
            tooltip:     "The official gazette publication reference number. Required for restrictions that have been formally gazetted under state road legislation. Format: {State} Gazette {Year}/{Number}."
        },

        /* ── Inspection fields ───────────────────────────────────────── */
        inspectionOrderNumber: {
            label:       "Order Number",
            placeholder: "e.g. INS-2024-00123",
            helperText:  "System-generated inspection order reference number.",
            tooltip:     "The unique inspection order number assigned by the system. This links the inspection to maintenance planning records and work orders."
        },
        plannedInspectionDate: {
            label:       "Planned Date",
            placeholder: "Select planned inspection date",
            helperText:  "Scheduled date for the inspection to be completed by.",
            tooltip:     "The target date by which this inspection must be completed. Inspections overdue beyond this date are flagged in the dashboard. AS 5100.7 requires principal inspections every 6 years."
        },
        inspectionType: {
            label:       "Inspection Type",
            placeholder: "Select inspection type",
            helperText:  "Routine, Principal, Special, or Underwater inspection.",
            tooltip:     "The AS 5100.7 / BIMM inspection category. Routine = visual, annual. Principal = detailed engineering assessment, 6-yearly. Special = post-event or specific concern. Underwater = for submerged elements."
        },
        inspectorName: {
            label:       "Lead Inspector",
            placeholder: "Inspector name or ID",
            helperText:  "Name or ID of the qualified engineer leading the inspection.",
            tooltip:     "The name or staff ID of the lead qualified engineer responsible for this inspection. Must hold the relevant AS 5100.7 bridge inspection qualification."
        },
        overallConditionRating: {
            label:       "Overall Condition Rating",
            placeholder: "1–10",
            helperText:  "AS 5100.7 overall rating for this inspection. Updates bridge condition.",
            tooltip:     "The overall bridge condition rating determined during this inspection, per AS 5100.7. Setting this value will update the parent bridge's condition rating and create a condition history record."
        },

        /* ── Defect fields ───────────────────────────────────────────── */
        defectCategory: {
            label:       "Defect Category",
            placeholder: "Select AustRoads BIMM category",
            helperText:  "AustRoads BIMM §4 defect classification category.",
            tooltip:     "The defect category as defined in AustRoads BIMM §4 (Bridge Inspection and Maintenance Manual). Categories include: Structural, Concrete, Steel, Timber, Scour, Drainage, etc."
        },
        defectSeverity: {
            label:       "Severity",
            placeholder: "Select severity",
            helperText:  "Defect severity: Low, Medium, High, or Critical.",
            tooltip:     "The structural or functional severity of the defect. Critical = immediate safety risk requiring bridge closure consideration. High = urgent repair within 3 months. Medium = repair within 12 months. Low = monitor."
        },
        defectDescription: {
            label:       "Description",
            placeholder: "Describe the defect in detail",
            helperText:  "Precise description including location, extent, and observed symptoms.",
            tooltip:     "A precise technical description of the defect including: exact location on the structure (span, element, face), dimensions/extent (length, area), observed symptoms, and any relevant measurements."
        },
        defectLocation: {
            label:       "Location on Structure",
            placeholder: "e.g. Span 2, north girder, soffit",
            helperText:  "Specific element location: span number, face, element type.",
            tooltip:     "Precise location on the bridge structure to allow the defect to be found again on re-inspection. Include span number, structural element name (girder, pier, abutment), face (north/south/east/west/soffit/top)."
        },
        estimatedRepairCost: {
            label:       "Estimated Repair Cost ($)",
            placeholder: "e.g. 25000",
            helperText:  "Indicative repair cost in AUD. Used for investment planning.",
            tooltip:     "The estimated cost to repair or remediate this defect, in Australian dollars. Used for investment planning and budget prioritisation. This is an indicative figure; a formal engineer's estimate is required before procurement."
        },

        /* ── Load Rating fields ──────────────────────────────────────── */
        ratingStandard: {
            label:       "Rating Standard",
            placeholder: "Select standard",
            helperText:  "AS 5100, AUSTROADS, or custom rating methodology.",
            tooltip:     "The bridge load rating standard used for this assessment. AS 5100 is the current Australian Standard. AUSTROADS guidelines may also be referenced. Select 'Custom' for jurisdiction-specific methodologies."
        },
        maxGrossMass: {
            label:       "Max Gross Mass (t)",
            placeholder: "e.g. 42.5",
            helperText:  "Maximum permissible gross vehicle mass in tonnes.",
            tooltip:     "The maximum gross vehicle mass permitted on this bridge based on the load rating assessment. This value becomes the basis for any mass restriction applied to the bridge. Must be greater than 0."
        },
        assessmentDate: {
            label:       "Assessment Date",
            placeholder: "Select date",
            helperText:  "Date the load rating assessment was performed.",
            tooltip:     "The date on which the load rating assessment was completed by a qualified structural engineer. Load ratings should be reviewed after any major inspection, significant defect, or structural intervention."
        },
        assessedBy: {
            label:       "Assessed By",
            placeholder: "Engineer name or firm",
            helperText:  "Name of the structural engineer who performed the rating.",
            tooltip:     "The name of the qualified structural engineer or engineering firm that performed the load rating assessment. This person is responsible for the technical basis of any resulting restrictions."
        },

        /* ── Permit fields ───────────────────────────────────────────── */
        permitNumber: {
            label:       "Permit Number",
            placeholder: "e.g. NHVR-P-2024-00456",
            helperText:  "NHVR permit reference number.",
            tooltip:     "The unique NHVR permit reference number. This links the permit to the NHVR permit management system and legal authorisation documents."
        },
        vehicleDescription: {
            label:       "Vehicle Description",
            placeholder: "e.g. 9-axle B-train, 68.5t GVM",
            helperText:  "Brief description of vehicle type, configuration, and mass.",
            tooltip:     "A concise description of the vehicle or combination covered by this permit, including number of axles, body type, and gross vehicle mass."
        },

        /* ── Dynamic attribute fields ────────────────────────────────── */
        attrValue: {
            label:       "Attribute Value",
            placeholder: "Enter value",
            helperText:  "Value for this custom attribute field.",
            tooltip:     "Enter the value for this bridge-specific attribute. The expected format and valid values depend on the attribute type configured by your administrator."
        }
    };

    /**
     * Retrieve a help entry by field ID.
     * Returns a default entry if the field ID is not registered.
     * @param {string} fieldId - The field identifier
     * @returns {HelpEntry}
     */
    function getHelp(fieldId) {
        return HELP[fieldId] || {
            label:       fieldId,
            placeholder: "",
            helperText:  "",
            tooltip:     ""
        };
    }

    return {
        HELP:    HELP,
        getHelp: getHelp
    };
});
