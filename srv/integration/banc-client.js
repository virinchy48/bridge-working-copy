// ============================================================
// BANC (Bridge Asset Network Condition) Integration Client
// Austroads national bridge condition database submission
//
// BANC Data Model Mapping:
//   NHVR Bridge        → BANC Structure record
//   InspectionRecord   → BANC Inspection record
//   MeasurementDoc     → BANC Element Condition record
//   BridgeDefect       → BANC Defect record
//
// BANC required fields (AustRoads BIM Manual, Ed. 4):
//   Structure: BANC_ID, state_code, road_authority, road_name,
//              road_no, struct_type, year_built, span_qty,
//              deck_width, span_len, lat, lon
//   Inspection: banc_id, insp_date, insp_type, inspector_id,
//               overall_cond (1–10), action_required
// ============================================================
'use strict';

// ── BANC State code map ──────────────────────────────────────
const STATE_CODE = {
    'NSW': 'NSW', 'VIC': 'VIC', 'QLD': 'QLD', 'SA': 'SA',
    'WA': 'WA', 'TAS': 'TAS', 'NT': 'NT', 'ACT': 'ACT',
    'New South Wales': 'NSW', 'Victoria': 'VIC', 'Queensland': 'QLD',
    'South Australia': 'SA', 'Western Australia': 'WA',
    'Tasmania': 'TAS', 'Northern Territory': 'NT',
    'Australian Capital Territory': 'ACT'
};

// ── Structure type map: NHVR → BANC code ───────────────────
const STRUCT_TYPE_CODE = {
    'BEAM'          : 'B',
    'ARCH'          : 'A',
    'TRUSS'         : 'T',
    'SUSPENSION'    : 'S',
    'CABLE_STAYED'  : 'C',
    'CULVERT'       : 'U',
    'SLAB'          : 'L',
    'FRAME'         : 'F',
    'BOX_GIRDER'    : 'G',
    'TIMBER'        : 'W'
};

// ── BANC inspection type map ─────────────────────────────────
const INSP_TYPE_CODE = {
    'ROUTINE'       : 'R',
    'PRINCIPAL'     : 'P',
    'UNDERWATER'    : 'U',
    'SPECIAL'       : 'S',
    'LOAD_TEST'     : 'L',
    'EMERGENCY'     : 'E'
};

// ── CSV column definitions for BANC Structure export ─────────
const BANC_STRUCTURE_COLS = [
    'banc_id', 'nhvr_ref', 'state_code', 'road_authority',
    'road_name', 'road_no', 'lga', 'suburb',
    'struct_type', 'year_built', 'span_qty',
    'overall_len_m', 'deck_width_m', 'max_span_len_m',
    'clearance_ht_m', 'skew_angle_deg',
    'lat', 'lon',
    'condition_rating', 'scour_risk', 'posting_status',
    'asset_owner', 'last_inspection_date',
    'gazette_ref', 'nhvr_route_assessed',
    'load_limit_t', 'height_limit_m',
    'record_created', 'record_updated'
];

// ── CSV column definitions for BANC Inspection export ────────
const BANC_INSPECTION_COLS = [
    'banc_id', 'nhvr_bridge_ref', 'insp_date', 'insp_type',
    'inspector_id', 'organisation',
    'overall_cond', 'deck_cond', 'super_cond', 'sub_cond',
    'channel_cond', 'approaches_cond',
    'action_required', 'action_description',
    'next_insp_date', 'next_insp_type',
    'remarks', 'report_ref'
];

// ── CSV column definitions for BANC Defect export ────────────
const BANC_DEFECT_COLS = [
    'banc_id', 'nhvr_bridge_ref', 'defect_ref',
    'insp_date', 'element', 'defect_type',
    'severity', 'extent_pct',
    'repair_priority', 'estimated_cost_aud',
    'description', 'repair_notes',
    'status', 'closed_date'
];

// ── Safe CSV cell value ───────────────────────────────────────
function csvCell(v) {
    if (v === null || v === undefined) return '';
    const s = String(v);
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
        return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
}

function toCSVRow(cols, obj) {
    return cols.map(c => csvCell(obj[c])).join(',');
}

function toCSV(cols, rows) {
    const header = cols.join(',');
    const body   = rows.map(r => toCSVRow(cols, r)).join('\r\n');
    return '\uFEFF' + header + '\r\n' + body;
}

// ── Map bridge entity → BANC structure row ───────────────────
function bridgeToBancStructure(bridge, lastInspection, restrictions) {
    const state = STATE_CODE[bridge.state] || bridge.state || '';

    // Derive load/height limits from active restrictions
    let loadLimit = '', heightLimit = '';
    if (Array.isArray(restrictions)) {
        const loadR   = restrictions.find(r => r.restrictionType === 'LOAD_LIMIT' && r.isActive);
        const heightR = restrictions.find(r => r.restrictionType === 'HEIGHT_LIMIT' && r.isActive);
        if (loadR)   loadLimit   = loadR.value;
        if (heightR) heightLimit = heightR.value;
    }

    return {
        banc_id              : bridge.bancId || bridge.bridgeId,
        nhvr_ref             : bridge.bridgeId,
        state_code           : state,
        road_authority       : bridge.maintenanceAuthority || bridge.assetOwner || '',
        road_name            : bridge.routeName || bridge.name || '',
        road_no              : bridge.nhvrRef || '',
        lga                  : bridge.lga || '',
        suburb               : bridge.region || '',
        struct_type          : STRUCT_TYPE_CODE[bridge.structureType] || bridge.structureType || '',
        year_built           : bridge.yearBuilt || '',
        span_qty             : bridge.numberOfSpans || '',
        overall_len_m        : bridge.spanLengthM || '',
        deck_width_m         : bridge.deckWidthM || '',
        max_span_len_m       : bridge.spanLengthM || '',
        clearance_ht_m       : bridge.clearanceHeightM || '',
        skew_angle_deg       : bridge.skewAngle || '',
        lat                  : bridge.latitude  != null ? Number(bridge.latitude).toFixed(8)  : '',
        lon                  : bridge.longitude != null ? Number(bridge.longitude).toFixed(8) : '',
        condition_rating     : bridge.conditionRating || '',
        scour_risk           : bridge.scourRisk || '',
        posting_status       : bridge.postingStatus || '',
        asset_owner          : bridge.assetOwner || '',
        last_inspection_date : lastInspection?.inspectionDate || '',
        gazette_ref          : bridge.gazetteRef || '',
        nhvr_route_assessed  : bridge.nhvrRouteAssessed ? 'Y' : 'N',
        load_limit_t         : loadLimit,
        height_limit_m       : heightLimit,
        record_created       : bridge.createdAt ? bridge.createdAt.toISOString?.().slice(0,10) : '',
        record_updated       : bridge.modifiedAt ? bridge.modifiedAt.toISOString?.().slice(0,10) : ''
    };
}

// ── Map InspectionRecord → BANC inspection row ───────────────
function inspectionToBanc(insp, bridge) {
    return {
        banc_id            : bridge?.bancId || bridge?.bridgeId || '',
        nhvr_bridge_ref    : bridge?.bridgeId || '',
        insp_date          : insp.inspectionDate || '',
        insp_type          : INSP_TYPE_CODE[insp.inspectionType] || insp.inspectionType || 'R',
        inspector_id       : insp.inspector || '',
        organisation       : insp.organisation || 'NHVR',
        overall_cond       : insp.conditionScore != null
                               ? Math.round(insp.conditionScore / 10)   // 0–100 → 1–10
                               : (insp.conditionRating || ''),
        deck_cond          : insp.deckCondition || '',
        super_cond         : insp.superstructureCondition || '',
        sub_cond           : insp.substructureCondition || '',
        channel_cond       : insp.channelCondition || '',
        approaches_cond    : insp.approachesCondition || '',
        action_required    : insp.recommendedActions ? 'Y' : 'N',
        action_description : insp.recommendedActions || '',
        next_insp_date     : insp.nextInspectionDate || '',
        next_insp_type     : 'R',
        remarks            : insp.notes || '',
        report_ref         : insp.reportRef || insp.orderNumber || ''
    };
}

// ── Map BridgeDefect → BANC defect row ───────────────────────
function defectToBanc(defect, bridge) {
    return {
        banc_id            : bridge?.bancId || bridge?.bridgeId || '',
        nhvr_bridge_ref    : bridge?.bridgeId || '',
        defect_ref         : defect.defectRef || defect.ID || '',
        insp_date          : defect.detectedDate || '',
        element            : defect.element || defect.defectCategory || '',
        defect_type        : defect.defectType || defect.defectCategory || '',
        severity           : defect.severity || '',
        extent_pct         : defect.extentPct || '',
        repair_priority    : defect.repairPriority || defect.severity || '',
        estimated_cost_aud : defect.estimatedCost || '',
        description        : (defect.description || '').slice(0, 200),
        repair_notes       : defect.repairNotes || '',
        status             : defect.status || '',
        closed_date        : defect.closureDate || ''
    };
}

// ── Validate a bridge record for BANC completeness ───────────
function validateBancRecord(bridge) {
    const errors   = [];
    const warnings = [];

    // Required fields
    if (!bridge.bridgeId)       errors.push('Missing: bridgeId (BANC primary key)');
    if (!bridge.state)          errors.push('Missing: state (state_code required)');
    if (!bridge.latitude)       errors.push('Missing: latitude');
    if (!bridge.longitude)      errors.push('Missing: longitude');
    if (!bridge.structureType)  warnings.push('Recommended: structureType');
    if (!bridge.yearBuilt)      warnings.push('Recommended: yearBuilt');
    if (!bridge.conditionRating) warnings.push('Recommended: conditionRating');
    if (!bridge.deckWidthM)     warnings.push('Recommended: deckWidthM');
    if (!bridge.spanLengthM)    warnings.push('Recommended: spanLengthM');
    if (!bridge.bancId)         warnings.push('Info: bancId not set — will use bridgeId as BANC_ID');

    // Range checks
    if (bridge.conditionRating && (bridge.conditionRating < 1 || bridge.conditionRating > 10)) {
        errors.push('conditionRating must be 1–10');
    }
    if (bridge.latitude  && (bridge.latitude  < -44 || bridge.latitude  > -10)) {
        warnings.push('latitude outside mainland Australia range (-44 to -10)');
    }
    if (bridge.longitude && (bridge.longitude < 112 || bridge.longitude > 154)) {
        warnings.push('longitude outside mainland Australia range (112 to 154)');
    }

    return { valid: errors.length === 0, errors, warnings };
}

// ── Build full BANC export package ───────────────────────────
function buildBancExport(bridges, inspections, defects) {
    const structRows = bridges.map(b => {
        const lastInsp  = (inspections || [])
            .filter(i => i.bridge_ID === b.ID)
            .sort((a, z) => (z.inspectionDate || '') > (a.inspectionDate || '') ? 1 : -1)[0];
        return bridgeToBancStructure(b, lastInsp, b._restrictions);
    });

    const inspRows = (inspections || []).map(insp => {
        const bridge = bridges.find(b => b.ID === insp.bridge_ID);
        return inspectionToBanc(insp, bridge);
    });

    const defectRows = (defects || []).map(def => {
        const bridge = bridges.find(b => b.ID === def.bridge_ID);
        return defectToBanc(def, bridge);
    });

    const validation = bridges.map(b => ({
        bridgeId : b.bridgeId,
        ...validateBancRecord(b)
    }));

    const validCount   = validation.filter(v => v.valid).length;
    const invalidCount = validation.filter(v => !v.valid).length;

    return {
        structures : { csv: toCSV(BANC_STRUCTURE_COLS,  structRows), count: structRows.length },
        inspections: { csv: toCSV(BANC_INSPECTION_COLS, inspRows),   count: inspRows.length  },
        defects    : { csv: toCSV(BANC_DEFECT_COLS,     defectRows), count: defectRows.length },
        validation : { records: validation, validCount, invalidCount },
        exportedAt : new Date().toISOString(),
        format     : 'BANC_CSV_v4'
    };
}

module.exports = {
    buildBancExport,
    validateBancRecord,
    bridgeToBancStructure,
    inspectionToBanc,
    defectToBanc,
    BANC_STRUCTURE_COLS,
    BANC_INSPECTION_COLS,
    BANC_DEFECT_COLS,
    STATE_CODE,
    STRUCT_TYPE_CODE
};
