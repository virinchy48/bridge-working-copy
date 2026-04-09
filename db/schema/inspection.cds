// ============================================================
// INSPECTION & DEFECT MANAGEMENT
// InspectionOrder, MeasurementDocument, BridgeDefect, WorkOrder,
// DefectClassification, BridgeInspection, InspectionRecord, BridgeEventLog
// ============================================================

namespace nhvr;

using { cuid, managed } from '@sap/cds/common';
using { nhvr.Bridge } from './core';
using {
    nhvr.InspectionOrderType, nhvr.InspectionOrderStatus,
    nhvr.AccessMethod, nhvr.RatingMethod, nhvr.MaintenanceUrgency,
    nhvr.ElementGroup, nhvr.MeasurementType,
    nhvr.DefectCategory, nhvr.DefectSeverity, nhvr.DefectExtent,
    nhvr.StructuralRisk, nhvr.DefectPriority, nhvr.DefectStatus,
    nhvr.WorkOrderPriority, nhvr.WorkOrderStatus
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
// INSPECTION ORDER — AS 5100.7 / AustRoads BIMM
// ─────────────────────────────────────────────────────────────
entity InspectionOrder : cuid, managed {
    bridge                  : Association to Bridge @mandatory;
    orderNumber             : String(50)  @mandatory @assert.unique;
    inspectionType          : InspectionOrderType  default 'ROUTINE';
    status                  : InspectionOrderStatus default 'PLANNED';
    plannedDate             : Date @mandatory;
    startedAt               : DateTime;
    completedAt             : DateTime;
    inspector               : String(200);
    inspectorOrg            : String(200);
    accessMethod            : AccessMethod;
    ratingMethod            : RatingMethod;
    // Results (populated on completion)
    overallConditionRating  : Integer;          // 1-10 AS 5100.7
    structuralAdequacy      : String(20);       // ADEQUATE, MARGINAL, INADEQUATE
    maintenanceUrgency      : MaintenanceUrgency;
    scourAssessment         : String(1000);
    recommendations         : LargeString;
    reportRef               : String(500);
    nextInspectionDue       : Date;
    notes                   : LargeString;
    // Navigation associations (top-level accessible entity sets)
    measurementDocuments    : Association to many MeasurementDocument on measurementDocuments.inspectionOrder = $self;
    defects                 : Association to many BridgeDefect on defects.inspectionOrder = $self;
}

// ── BIMM / AS 5100.7 extend ─────────────────────────────────
extend InspectionOrder with {
    inspectionStandard       : String(50);   // AUSTROADS_BIMM|AS5100_7|TFNSW_BIM|VICROADS_BIS|TMR_QLD|MRWA|CUSTOM
    inspectionFirm           : String(200);
    workOrderRef             : String(100);
    trafficControl           : Boolean default false;
    laneClosureRequired      : Boolean default false;
    previousConditionRating  : Integer;
    nhvrImpact               : Boolean default false;
    restrictionChangeRequired: Boolean default false;
    nextInspectionType       : String(50);
    defectsFound             : Integer default 0;
    criticalDefects          : Integer default 0;
    scourCheck               : Boolean default false;
    scourFinding             : String(50);   // NO_ISSUE|MINOR_MONITORING|SCOUR_DETECTED|CRITICAL_SCOUR
    certifiedBy              : String(200);
    certificationRef         : String(200);
    reportURL                : String(1000);
    reportSubmittedDate      : Date;
    actualStartDate          : Date;
    actualEndDate            : Date;
}

// ── Review workflow extend ───────────────────────────────────
extend InspectionOrder with {
    reviewedBy       : String(100);
    reviewedAt       : Timestamp;
    reviewNotes      : String(1000);
    reviewDecision   : String(20);  // APPROVED | REJECTED | NEEDS_REVISION
}

// ─────────────────────────────────────────────────────────────
// MEASUREMENT DOCUMENT — element-level condition measurements
// ─────────────────────────────────────────────────────────────
entity MeasurementDocument : cuid, managed {
    inspectionOrder : Association to InspectionOrder @mandatory;
    bridge          : Association to Bridge @mandatory;
    elementGroup    : ElementGroup @mandatory;
    elementName     : String(200) @mandatory;
    elementRef      : String(100);
    measurementType : MeasurementType @mandatory;
    measuredValue   : Decimal(12,4);
    unit            : String(50);
    conditionRating : Integer;      // 1-10 element-level rating
    notes           : String(1000);
    measurementDate : Date;
    measuredBy      : String(200);
}

// ── BIMM v3 extend ──────────────────────────────────────────
extend MeasurementDocument with {
    mdNumber            : String(50)    @title: 'Measurement Document No.';
    componentTOC        : String(20)    @title: 'Component TOC';
    componentRef        : String(100)   @title: 'Component Reference / Span No.';
    conditionState      : Integer       @title: 'Condition State (1-5)';
    defectCode          : String(20)    @title: 'Defect Code (Austroads BIMM)';
    defectDescription   : String(500)   @title: 'Defect Description';
    defectExtent        : Decimal(10,2) @title: 'Defect Extent';
    extentUnit          : String(20)    @title: 'Extent Unit';
    severity            : String(20)    @title: 'Severity';
    photoRef            : String(500)   @title: 'Photo Reference(s)';
    raiseDefectFlag     : Boolean       @title: 'Raise Defect from this Measurement';
    linkedDefectId      : String(30)    @title: 'Linked BridgeDefect ID';
}

// ─────────────────────────────────────────────────────────────
// BRIDGE DEFECT
// ─────────────────────────────────────────────────────────────
entity BridgeDefect : cuid, managed {
    inspectionOrder   : Association to InspectionOrder;
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
    workOrderRef                 : String(100);
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
    relatedEntityType: String(50);              // Bridge | Restriction | InspectionOrder | BridgeDefect
    relatedEntityId  : String(100);
    timestamp        : DateTime @cds.on.insert: $now;
}

// ─────────────────────────────────────────────────────────────
// WORK ORDER — remediation linked to defects
// ─────────────────────────────────────────────────────────────
entity WorkOrder : cuid, managed {
    defect        : Association to BridgeDefect;
    bridge        : Association to Bridge @mandatory;
    woNumber      : String(20) @mandatory;
    priority      : WorkOrderPriority default 'MEDIUM';
    status        : WorkOrderStatus default 'CREATED';
    plannedDate   : Date;
    assignedTo    : String(100);
    estimatedCost : Decimal(12,2);
    notes         : String(500);
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
    sapWorkOrderNo         : String(30);
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
