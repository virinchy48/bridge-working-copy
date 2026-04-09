// ============================================================
// RoleFallback.js — declarative feature access matrix
//
// Used by RoleManager when the /me() endpoint is unreachable.
// Admins can tweak feature access WITHOUT touching RoleManager.js
// by editing this file.
//
// Schema:
//   features[featureKey] = {
//     visible:    [...roles],   // roles that see the feature
//     editable:   [...roles],   // roles that can mutate (subset of visible)
//     enabled:    [...roles]    // roles for which the feature is switched on
//   }
//
// Role keys:
//   ADMIN, BRIDGE_MANAGER, INSPECTOR, OPERATOR, TECH_ADMIN, READ_ONLY
//
// Shortcuts used below:
//   "all"      → every role
//   "mgr+"     → ADMIN + BRIDGE_MANAGER
//   "insp+"    → ADMIN + BRIDGE_MANAGER + INSPECTOR
//   "tech+"    → ADMIN + TECH_ADMIN
//   "op+mgr"   → ADMIN + BRIDGE_MANAGER + OPERATOR
// ============================================================
sap.ui.define([], function () {
    "use strict";

    const ALL       = ["ADMIN","BRIDGE_MANAGER","INSPECTOR","OPERATOR","TECH_ADMIN","READ_ONLY"];
    const MGR_PLUS  = ["ADMIN","BRIDGE_MANAGER"];
    const INSP_PLUS = ["ADMIN","BRIDGE_MANAGER","INSPECTOR"];
    const TECH_PLUS = ["ADMIN","TECH_ADMIN"];
    const OP_MGR    = ["ADMIN","BRIDGE_MANAGER","OPERATOR"];
    const ADMIN_ONLY= ["ADMIN"];
    const NONE      = [];

    const FEATURES = {
        // ── Home tiles ─────────────────────────────────────────
        dashboard:        { visible: ALL,      editable: ALL,      enabled: ALL },
        bridges:          { visible: ALL,      editable: MGR_PLUS, enabled: ALL },
        restrictions:     { visible: ALL,      editable: MGR_PLUS, enabled: ALL },
        mapview:          { visible: ALL,      editable: NONE,     enabled: ALL },
        reports:          { visible: ALL,      editable: NONE,     enabled: ALL },
        vehicleaccess:    { visible: ALL,      editable: OP_MGR,   enabled: ALL },
        routeassessment:  { visible: ALL,      editable: OP_MGR,   enabled: ALL },
        analyticsMap:     { visible: ALL,      editable: NONE,     enabled: ALL },

        // ── Admin tiles ────────────────────────────────────────
        massupload:       { visible: MGR_PLUS,   editable: MGR_PLUS,   enabled: MGR_PLUS },
        adminconfig:      { visible: ADMIN_ONLY, editable: ADMIN_ONLY, enabled: ADMIN_ONLY },
        techAdmin:        { visible: TECH_PLUS,  editable: TECH_PLUS,  enabled: TECH_PLUS },
        inspections:      { visible: INSP_PLUS,  editable: INSP_PLUS,  enabled: INSP_PLUS },
        defects:          { visible: INSP_PLUS,  editable: INSP_PLUS,  enabled: INSP_PLUS },
        restrictionTypes: { visible: ADMIN_ONLY, editable: ADMIN_ONLY, enabled: ADMIN_ONLY },
        massedit:         { visible: MGR_PLUS,   editable: MGR_PLUS,   enabled: MGR_PLUS },
        vehicletypes:     { visible: ADMIN_ONLY, editable: ADMIN_ONLY, enabled: ADMIN_ONLY },
        integrationHub:   { visible: ADMIN_ONLY, editable: ADMIN_ONLY, enabled: ADMIN_ONLY },
        licenseConfig:    { visible: ADMIN_ONLY, editable: ADMIN_ONLY, enabled: ADMIN_ONLY },
        routePlanner:     { visible: OP_MGR,     editable: OP_MGR,     enabled: OP_MGR },

        // ── Bridge detail tabs ─────────────────────────────────
        "overview-tab":         { visible: ALL,      editable: MGR_PLUS, enabled: ALL },
        "capacity-tab":         { visible: ALL,      editable: MGR_PLUS, enabled: ALL },
        "restrictions-tab":     { visible: ALL,      editable: MGR_PLUS, enabled: ALL },
        "attributes-tab":       { visible: ALL,      editable: MGR_PLUS, enabled: ALL },
        "mappreview-tab":       { visible: ALL,      editable: NONE,     enabled: ALL },
        "externalSystems-tab":  { visible: ALL,      editable: MGR_PLUS, enabled: ALL },
        "history-tab":          { visible: ALL,      editable: NONE,     enabled: ALL },
        "nhvrload-tab":         { visible: ALL,      editable: MGR_PLUS, enabled: ALL },
        "inspectionOrders-tab": { visible: MGR_PLUS, editable: MGR_PLUS, enabled: MGR_PLUS },
        "inspections-tab":      { visible: MGR_PLUS, editable: MGR_PLUS, enabled: MGR_PLUS },
        "defects-tab":          { visible: MGR_PLUS, editable: MGR_PLUS, enabled: MGR_PLUS },
        "risk-tab":             { visible: MGR_PLUS, editable: MGR_PLUS, enabled: MGR_PLUS },
        "investment-tab":       { visible: MGR_PLUS, editable: MGR_PLUS, enabled: MGR_PLUS },
        "documents-tab":        { visible: ALL,      editable: MGR_PLUS, enabled: ALL },

        // ── Bridge detail actions ──────────────────────────────
        addRestriction:     { visible: MGR_PLUS,  editable: MGR_PLUS,  enabled: MGR_PLUS },
        closeBridge:        { visible: MGR_PLUS,  editable: MGR_PLUS,  enabled: MGR_PLUS },
        reopenBridge:       { visible: MGR_PLUS,  editable: MGR_PLUS,  enabled: MGR_PLUS },
        changeCondition:    { visible: MGR_PLUS,  editable: MGR_PLUS,  enabled: MGR_PLUS },
        editBridge:         { visible: MGR_PLUS,  editable: MGR_PLUS,  enabled: MGR_PLUS },
        addBridge:          { visible: MGR_PLUS,  editable: MGR_PLUS,  enabled: MGR_PLUS },
        exportBridges:      { visible: ALL,       editable: ALL,       enabled: ALL },
        newInspectionOrder: { visible: INSP_PLUS, editable: INSP_PLUS, enabled: INSP_PLUS },
        raiseDefect:        { visible: INSP_PLUS, editable: INSP_PLUS, enabled: INSP_PLUS },
        permits:            { visible: ALL,       editable: OP_MGR,    enabled: ALL },

        // ── Home sections ──────────────────────────────────────
        vehiclePermits:     { visible: OP_MGR,   editable: OP_MGR,   enabled: OP_MGR },
        capacityReports:    { visible: MGR_PLUS, editable: NONE,     enabled: MGR_PLUS },
        bridgeMap:          { visible: ALL,      editable: NONE,     enabled: ALL },
        recordInspection:   { visible: INSP_PLUS, editable: INSP_PLUS, enabled: INSP_PLUS },
        freightCorridors:   { visible: MGR_PLUS, editable: NONE,     enabled: MGR_PLUS }
    };

    /**
     * Resolve the feature map for a given role.
     * Returns { featureKey: { visible, editable, featureEnabled } } booleans.
     */
    function buildFallback(role) {
        const out = {};
        Object.keys(FEATURES).forEach((key) => {
            const f = FEATURES[key];
            out[key] = {
                visible:        f.visible.includes(role),
                editable:       f.editable.includes(role),
                featureEnabled: f.enabled.includes(role)
            };
        });
        return out;
    }

    return {
        FEATURES: FEATURES,
        buildFallback: buildFallback
    };
});
