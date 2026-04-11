// ============================================================
// INSPECTION & DEFECT MANAGEMENT
// InspectionRecord (legacy), BridgeDefect, DefectClassification,
// BridgeInspection (BHI), BridgeEventLog
//
// Note: InspectionOrder, MeasurementDocument, and WorkOrder were
// removed in the cut-down BIS variant — defects can be raised
// directly against a bridge without an inspection-order parent,
// and remediation tracking lives in external systems (e.g. SAP PM).
// ============================================================

namespace nhvr;

using { cuid, managed } from '@sap/cds/common';
using { nhvr.Bridge } from './core';
using {
    nhvr.ElementGroup,
    nhvr.DefectCategory, nhvr.DefectSeverity, nhvr.DefectExtent,
    nhvr.StructuralRisk, nhvr.DefectPriority, nhvr.DefectStatus
} from './types';

// ─────────────────────────────────────────────────────────────
// INSPECTION RECORD (legacy, pre-v2)
// ─────────────────────────────────────────────────────────────
entity InspectionRecord : cuid, managed {
    bridge              : Association to Bridge @mandatory;
    inspectionDate      : Date @mandatory;
    inspectionType      : String(50) default 'ROUTINE'; // ROUTINE, SPECIAL, PRINCIPAL, UNDERWATER
    inspector           : String(100);
    conditionRatingGiven: Integer;         // 1-10 (AS 5100)
    defectsFound        : Integer default 0;
    criticalDefects     : Integer default 0;
    structuralAdequacy  : String(20);      // ADEQUATE, MARGINAL, INADEQUATE
    maintenanceRequired : Boolean default false;
    scourFinding        : String(500);
    reportRef           : String(500);
    nextInspectionDue   : Date;
    notes               : String(1000);
}

// ─────────────────────────────────────────────────────────────
// BRIDGE DEFECT
// ─────────────────────────────────────────────────────────────
entity BridgeDefect : cuid, managed {
    bridge            : Association to Bridge @mandatory;
    defectNumber      : String(50);
    elementGroup      : ElementGroup;
    elementName       : String(200);
    defectCategory    : DefectCategory @mandatory;
    severity          : DefectSeverity @mandatory;
    extent            : DefectExtent;
    structuralRisk    : StructuralRisk;
    priority          : DefectPriority;
    status            : DefectStatus default 'OPEN';
    description       : LargeString @mandatory;
    location          : String(500);
    detectedDate      : Date;
    detectedBy        : String(200);
    closedDate        : Date;
    closedBy          : String(200);
    closureNotes      : String(1000);
    photoRef          : String(500);
    repairEstimateAUD : Decimal(12,2);
    notes             : LargeString;
}

// ── AustRoads BIMM extend ───────────────────────────────────
extend BridgeDefect with {
    defectTitle                  : String(500);
    defectType                   : String(200);
    elementType                  : String(200);
    elementId                    : String(50);
    nhvrImpact                   : Boolean default false;
    immediateAction              : Boolean default false;
    engineeringAssessmentRequired: Boolean default false;
    assessedBy                   : String(200);
    assessedDate                 : Date;
    assessmentNotes              : LargeString;
    repairDescription            : LargeString;
    repairUrgency                : String(50);
    targetRepairDate             : Date;
    estimatedCost                : Decimal(12,2);
    contractorAssigned           : String(200);
    actualRepairDate             : Date;
    photoRefs                    : String(2000);
}

// ─────────────────────────────────────────────────────────────
// BRIDGE EVENT LOG — rich audit trail
// ─────────────────────────────────────────────────────────────
entity BridgeEventLog : cuid {
    bridge           : Association to Bridge @mandatory;
    eventType        : String(50) @mandatory;   // BRIDGE_CREATED, RESTRICTION_ADDED, etc.
    title            : String(500) @mandatory;
    detail           : LargeString;
    effectiveFrom    : Date;
    effectiveTo      : Date;
    statusBefore     : String(200);
    statusAfter      : String(200);
    performedBy      : String(100);
    approvalRef      : String(200);
    gazetteRef       : String(200);
    relatedEntityType: String(50);              // Bridge | Restriction | BridgeDefect
    relatedEntityId  : String(100);
    timestamp        : DateTime @cds.on.insert: $now;
}

// ─────────────────────────────────────────────────────────────
// AI DEFECT CLASSIFICATION
// ─────────────────────────────────────────────────────────────
entity DefectClassification : cuid, managed {
    defect          : Association to BridgeDefect;
    photoUrl        : String(500);
    aiCategory      : String(50);   // SPALLING, CRACKING, CORROSION, DEFORMATION, SCOUR, JOINT_FAILURE, OTHER
    aiConfidence    : Decimal(5,2); // 0-100
    aiSeverity      : String(10);   // LOW, MEDIUM, HIGH, CRITICAL
    aiNotes         : String(500);
    classifiedAt    : DateTime;
    classifiedBy    : String(50) default 'AI_MODEL_V1';
    humanReviewed   : Boolean default false;
    humanCategory   : String(50);
    humanNotes      : String(500);
}

// ─────────────────────────────────────────────────────────────
// BRIDGE INSPECTION (BHI-enabled, element-level ratings)
// ─────────────────────────────────────────────────────────────
entity BridgeInspection : cuid {
    bridge                 : Association to Bridge not null;
    inspectionType         : String(20)  not null;
    standardApplied        : String(50);
    inspectionDate         : Date        not null;
    inspectorName          : String(120) not null;
    inspectorCertNo        : String(50);
    weatherConditions      : String(20);
    accessMethod           : String(30);
    deckRating             : Integer;
    superstructureRating   : Integer;
    substructureRating     : Integer;
    bearingRating          : Integer;
    jointRating            : Integer;
    overallConditionRating : Integer;
    bridgeHealthIndex      : Decimal(5,1);
    primaryDefectCode      : String(5);
    defectSeverity         : String(15);
    inspectorNotes         : String(2000);
    followUpRequired       : Boolean default false;
    followUpPriority       : String(10);
    estimatedRepairCost    : Decimal(12,2);
    sapNotificationNo      : String(30);
    nextInspectionDue      : Date;
    reportGenerated        : Boolean default false;
    reportURL              : String(500);
    createdAt              : Timestamp @cds.on.insert: $now;
    createdBy              : String(100) @cds.on.insert: $user;
}

// ── Backlink associations on Bridge ──────────────────────────
extend Bridge with {
    inspections : Association to many InspectionRecord on inspections.bridge = $self;
    eventLog    : Association to many BridgeEventLog on eventLog.bridge = $self;
}
