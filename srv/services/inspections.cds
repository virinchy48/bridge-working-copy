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
    { grant: ['CREATE','UPDATE'],               to: ['BridgeManager','Admin'] },
    { grant: ['DELETE'],                        to: ['BridgeManager','Admin'] }
]
entity InspectionRecords as projection on nhvr.InspectionRecord {
    *,
    bridge.bridgeId as bridgeId @readonly,
    bridge.name     as bridgeName @readonly
};

// InspectionOrders, MeasurementDocuments and WorkOrders projections were
// removed in the cut-down BIS variant. Defects and inspections are still
// supported via BridgeDefects and BridgeInspections below.

@cds.redirection.target: true
@restrict: [
    { grant: ['READ'],            to: 'authenticated-user' },
    { grant: ['CREATE','UPDATE'], to: ['BridgeManager','Admin'] },
    { grant: ['DELETE'],          to: ['BridgeManager','Admin'] }
]
entity BridgeDefects as projection on nhvr.BridgeDefect {
    *,
    bridge.bridgeId as bridgeId @readonly,
    bridge.name     as bridgeName @readonly
} actions {
    @restrict: [{ to: ['BridgeManager','Admin'] }]
    action closeDefect(
        closureNotes: String
    ) returns {
        status: String; message: String
    };
};

@restrict: [
    { grant: ['READ'],                     to: 'authenticated-user' },
    { grant: ['CREATE','UPDATE','DELETE'], to: ['BridgeManager','Admin'] }
]
entity DefectClassifications as projection on nhvr.DefectClassification {
    key ID,
    defect.ID as defect_ID,
    photoUrl, aiCategory, aiConfidence, aiSeverity, aiNotes,
    classifiedAt, classifiedBy, humanReviewed, humanCategory, humanNotes, createdAt
};

@restrict: [{ to: ['BridgeManager','Admin'] }]
action classifyDefect(defectId: UUID, photoUrl: String, notes: String) returns DefectClassifications;


@restrict: [
    { grant: ['READ'],                     to: 'authenticated-user' },
    { grant: ['CREATE','UPDATE','DELETE'], to: ['BridgeManager','Admin'] }
]
entity BridgeInspections as projection on nhvr.BridgeInspection {
    key ID,
    bridge.ID   as bridge_ID,
    inspectionType, standardApplied, inspectionDate,
    inspectorName, inspectorCertNo, weatherConditions, accessMethod,
    deckRating, superstructureRating, substructureRating, bearingRating, jointRating,
    overallConditionRating, bridgeHealthIndex,
    primaryDefectCode, defectSeverity, inspectorNotes,
    followUpRequired, followUpPriority,
    estimatedRepairCost, sapNotificationNo,
    nextInspectionDue, reportGenerated, reportURL,
    createdAt, createdBy
};
}
