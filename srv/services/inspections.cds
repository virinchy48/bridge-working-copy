using nhvr from '../../db/schema';
using BridgeManagementService from '../service';

extend service BridgeManagementService with {

@restrict: [{ grant: ['READ'], to: 'authenticated-user' }]
entity BridgeHistory as projection on nhvr.BridgeConditionHistory {
    *,
    bridge.bridgeId as bridgeId @readonly,
    bridge.name     as bridgeName @readonly
};

@cds.redirection.target: true
@restrict: [
    { grant: ['READ'],                          to: 'authenticated-user' },
    { grant: ['CREATE','UPDATE'],               to: ['BridgeManager','Admin','Inspector'] },
    { grant: ['DELETE'],                        to: ['Admin'] }
]
entity InspectionRecords as projection on nhvr.InspectionRecord {
    *,
    bridge.bridgeId as bridgeId @readonly,
    bridge.name     as bridgeName @readonly
};

// ── v2 Entities ────────────────────────────────────────────

@cds.redirection.target: true
@cds.query.limit: { max: 2000, default: 100 }
@restrict: [
    { grant: ['READ'],            to: 'authenticated-user' },
    { grant: ['CREATE','UPDATE'], to: ['BridgeManager','Admin','Inspector'] },
    { grant: ['DELETE'],          to: ['Admin'] }
]
entity InspectionOrders as projection on nhvr.InspectionOrder {
    *,
    bridge.bridgeId as bridgeId @readonly,
    bridge.name     as bridgeName @readonly,
    measurementDocuments: redirected to MeasurementDocuments,
    defects         : redirected to BridgeDefects
} actions {
    @restrict: [{ to: ['BridgeManager','Admin','Inspector'] }]
    action startInspection() returns {
        status: String; message: String
    };
    @restrict: [{ to: ['BridgeManager','Admin','Inspector'] }]
    action completeInspection(
        overallConditionRating  : Integer,
        structuralAdequacy      : String,
        maintenanceUrgency      : String,
        recommendations         : LargeString,
        reportRef               : String,
        nextInspectionDue       : Date,
        notes                   : LargeString
    ) returns {
        status: String; message: String
    };
};

// ── Inspection Review / Approval (unbound — Phase 5.3) ────────
@restrict: [{ to: ['BridgeManager', 'Admin'] }]
action reviewInspection(
    inspectionOrderId : UUID,
    decision          : String,
    notes             : String
) returns {
    status   : String;
    decision : String;
    message  : String;
};

@cds.redirection.target: true
@restrict: [
    { grant: ['READ'],                          to: 'authenticated-user' },
    { grant: ['CREATE','UPDATE'],               to: ['BridgeManager','Admin','Inspector'] },
    { grant: ['DELETE'],                        to: ['Admin'] }
]
entity MeasurementDocuments as projection on nhvr.MeasurementDocument {
    *,
    bridge.bridgeId as bridgeId @readonly,
    bridge.name     as bridgeName @readonly
};

@cds.redirection.target: true
@restrict: [
    { grant: ['READ'],            to: 'authenticated-user' },
    { grant: ['CREATE','UPDATE'], to: ['BridgeManager','Admin','Inspector'] },
    { grant: ['DELETE'],          to: ['Admin'] }
]
entity BridgeDefects as projection on nhvr.BridgeDefect {
    *,
    bridge.bridgeId as bridgeId @readonly,
    bridge.name     as bridgeName @readonly
} actions {
    @restrict: [{ to: ['BridgeManager','Admin','Inspector'] }]
    action closeDefect(
        closureNotes: String
    ) returns {
        status: String; message: String
    };
};

entity WorkOrders as projection on nhvr.WorkOrder {
    key ID,
    defect.ID  as defect_ID,
    bridge.ID  as bridge_ID,
    woNumber, priority, status, plannedDate,
    assignedTo, estimatedCost, notes, createdAt, modifiedAt
};

@restrict: [{ to: ['BridgeManager','Admin','Operator'] }]
action createWorkOrder(defectId : UUID, priority : String, plannedDate : Date, assignedTo : String, notes : String) returns WorkOrders;

entity DefectClassifications as projection on nhvr.DefectClassification {
    key ID,
    defect.ID as defect_ID,
    photoUrl, aiCategory, aiConfidence, aiSeverity, aiNotes,
    classifiedAt, classifiedBy, humanReviewed, humanCategory, humanNotes, createdAt
};

@restrict: [{ to: ['Inspector','BridgeManager','Admin'] }]
action classifyDefect(defectId: UUID, photoUrl: String, notes: String) returns DefectClassifications;


entity BridgeInspections as projection on nhvr.BridgeInspection {
    key ID,
    bridge.ID   as bridge_ID,
    inspectionType, standardApplied, inspectionDate,
    inspectorName, inspectorCertNo, weatherConditions, accessMethod,
    deckRating, superstructureRating, substructureRating, bearingRating, jointRating,
    overallConditionRating, bridgeHealthIndex,
    primaryDefectCode, defectSeverity, inspectorNotes,
    followUpRequired, followUpPriority,
    estimatedRepairCost, sapNotificationNo, sapWorkOrderNo,
    nextInspectionDue, reportGenerated, reportURL,
    createdAt, createdBy
};
}
