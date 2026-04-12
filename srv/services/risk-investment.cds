using nhvr from '../../db/schema';
using BridgeManagementService from '../service';

extend service BridgeManagementService with {

@cds.redirection.target: true
@restrict: [
    { grant: ['READ'],                          to: 'authenticated-user' },
    { grant: ['CREATE','UPDATE','DELETE'],       to: 'authenticated-user' }
]
entity BridgeRiskAssessments as projection on nhvr.BridgeRiskAssessment {
    *,
    bridge.bridgeId as bridgeId,
    bridge.name     as bridgeName
};

@cds.redirection.target: true
@restrict: [
    { grant: ['READ'],                          to: 'authenticated-user' },
    { grant: ['CREATE','UPDATE','DELETE'],       to: 'authenticated-user' }
]
entity BridgeInvestmentPlans as projection on nhvr.BridgeInvestmentPlan {
    *,
    bridge.bridgeId as bridgeId,
    bridge.name     as bridgeName
};

@cds.redirection.target: true
@restrict: [
    { grant: ['READ'],                          to: 'authenticated-user' },
    { grant: ['CREATE','UPDATE','DELETE'],       to: 'authenticated-user' }
]
entity BridgeCulvertAssessments as projection on nhvr.BridgeCulvertAssessment {
    *,
    bridge.bridgeId as bridgeId,
    bridge.name     as bridgeName
};

@cds.redirection.target: true
@restrict: [
    { grant: ['READ'],                          to: 'authenticated-user' },
    { grant: ['CREATE','UPDATE','DELETE'],       to: 'authenticated-user' }
]
entity BridgeInspectionMetrics as projection on nhvr.BridgeInspectionMetrics {
    *,
    bridge.bridgeId as bridgeId,
    bridge.name     as bridgeName
};

@restrict: [{ grant: ['READ'], to: 'authenticated-user' }]
entity BridgeChangeLogs as projection on nhvr.BridgeChangeLog {
    *,
    bridge.bridgeId as bridgeId,
    bridge.name     as bridgeName
};

// ── v3 Global actions ──────────────────────────────────────

@restrict: [{ to: 'authenticated-user' }]
action computeRiskScore(bridgeId: String) returns {
    ID          : UUID;
    bridge_ID   : UUID;
    riskScore   : Integer;
    riskBand    : String;
    assessmentDate: Date;
    notes       : LargeString;
};

@restrict: [{ to: 'authenticated-user' }]
action raiseDefectFromMeasurement(measurementDocId: UUID) returns {
    ID          : UUID;
    bridge_ID   : UUID;
    defectTitle : String;
    severity    : String;
    status      : String;
};


@restrict: [
    { grant: ['READ'],                     to: 'authenticated-user' },
    { grant: ['CREATE','UPDATE','DELETE'], to: ['BridgeManager','Admin'] }
]
entity ScourAssessments as projection on nhvr.ScourAssessment {
    key ID,
    bridge.ID as bridge_ID,
    watercourseName, crossingType, floodFrequency, scourDepth_m,
    velocityRating, sedimentRating, foundationType, scourRiskScore, scourRiskLevel,
    assessedBy, assessmentDate, mitigationStatus, notes, createdAt, modifiedAt
};

@restrict: [{ to: ['BridgeManager','Admin'] }]
action assessScourRisk(
    bridgeId        : UUID,
    floodFrequency  : Integer,
    scourDepth_m    : Decimal,
    velocityRating  : Integer,
    sedimentRating  : Integer,
    foundationType  : String,
    watercourseName : String,
    assessedBy      : String
) returns ScourAssessments;

@restrict: [{ to: ['Viewer','BridgeManager','Admin'] }]
entity BridgeDeteriorationProfiles as projection on nhvr.BridgeDeteriorationProfile {
    key ID,
    bridge.ID as bridge_ID,
    material, ageBand, currentScore, projectedScore5y, projectedScore10y,
    annualDeclineRate, priorityScore, priorityBand, serviceLifeYears, computedAt
};

@restrict: [{ to: ['BridgeManager','Admin'] }]
action computeDeteriorationProfile(bridgeId: UUID) returns BridgeDeteriorationProfiles;

@restrict: [{ to: ['Viewer','BridgeManager','Admin'] }]
function getMaintenancePriorityList(state: String, priorityBand: String) returns array of BridgeDeteriorationProfiles;
}
