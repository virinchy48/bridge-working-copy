// ============================================================
// RISK & INVESTMENT — assessment, planning, deterioration
// ============================================================

namespace nhvr;

using { cuid, managed } from '@sap/cds/common';
using { nhvr.Bridge } from './core';
using {
    nhvr.RiskBand, nhvr.ConsequenceType, nhvr.InterventionType,
    nhvr.ProgrammeStatus, nhvr.HeadwallType, nhvr.HeritageClass,
    nhvr.BridgeUsage, nhvr.SpatialOrientation, nhvr.MoveableType,
    nhvr.ScourVulnerability
} from './types';

// ─────────────────────────────────────────────────────────────
// BRIDGE INSPECTION METRICS (denorm view)
// ─────────────────────────────────────────────────────────────
entity BridgeInspectionMetrics : managed {
    key bridge                  : Association to Bridge;
    lastPrincipalInspDate       : Date     @title: 'Last Principal Inspection';
    lastRoutineInspDate         : Date     @title: 'Last Routine Inspection';
    nextInspectionDueDate       : Date     @title: 'Next Inspection Due';
    inspectionFrequencyYrs      : Integer  @title: 'Inspection Frequency (yrs)';
    overdueFlag                 : Boolean  @title: 'Inspection Overdue';
    daysOverdue                 : Integer  @title: 'Days Overdue';
}

// ─────────────────────────────────────────────────────────────
// BRIDGE RISK ASSESSMENT
// ─────────────────────────────────────────────────────────────
entity BridgeRiskAssessment : cuid, managed {
    bridge                  : Association to Bridge;
    assessmentDate          : Date          @title: 'Assessment Date';
    assessedBy              : String(200)   @title: 'Assessed By';
    likelihoodScore         : Integer       @title: 'Likelihood (1-5)';
    consequenceScore        : Integer       @title: 'Consequence (1-5)';
    riskScore               : Integer       @title: 'Risk Score (LxC)';
    riskBand                : RiskBand      @title: 'Risk Band';
    likelihoodBasis         : String(500)   @title: 'Likelihood Basis';
    consequenceBasis        : String(500)   @title: 'Consequence Basis';
    consequenceType         : ConsequenceType @title: 'Primary Consequence Type';
    aadtAtAssessment        : Integer       @title: 'AADT at Assessment';
    detourLengthKm          : Decimal(7,1)  @title: 'Detour Length (km)';
    economicImpactPerDay    : Decimal(12,2) @title: 'Economic Impact ($/day)';
    emergencyRouteImpact    : Boolean       @title: 'Emergency Route Affected';
    priorityRank            : Integer       @title: 'Network Priority Rank';
    notes                   : LargeString;
}

// ─────────────────────────────────────────────────────────────
// BRIDGE INVESTMENT PLAN
// ─────────────────────────────────────────────────────────────
entity BridgeInvestmentPlan : cuid, managed {
    bridge                      : Association to Bridge;
    recommendedYear             : Integer       @title: 'Recommended Year';
    interventionType            : InterventionType;
    estimatedCapex              : Decimal(14,2) @title: 'Est. CAPEX ($)';
    estimatedOpex               : Decimal(12,2) @title: 'Est. Annual OPEX ($)';
    deferredMaintenanceValue    : Decimal(12,2) @title: 'Deferred Maint. Value ($)';
    currentReplacementCost      : Decimal(14,2) @title: 'Current Replacement Cost ($)';
    writtenDownValue            : Decimal(14,2) @title: 'Written Down Replacement Cost ($)';
    benefitCostRatio            : Decimal(6,2)  @title: 'BCR';
    netPresentValue             : Decimal(14,2) @title: 'NPV ($)';
    programmeStatus             : ProgrammeStatus;
    fundingSource               : String(200)   @title: 'Funding Source';
    workOrderRef                : String(100)   @title: 'SAP PM Work Order Ref';
    actualCost                  : Decimal(14,2) @title: 'Actual Cost ($)';
    completionDate              : Date;
    notes                       : LargeString;
}

// ─────────────────────────────────────────────────────────────
// BRIDGE CULVERT ASSESSMENT
// ─────────────────────────────────────────────────────────────
entity BridgeCulvertAssessment : cuid, managed {
    bridge                  : Association to Bridge;
    assessmentDate          : Date;
    invertLevelAHD          : Decimal(8,3)  @title: 'Invert Level (m AHD)';
    coverDepthM             : Decimal(5,2)  @title: 'Cover Depth (m)';
    sedimentationPct        : Decimal(5,1)  @title: 'Sedimentation (%)';
    inletConditionRating    : Integer       @title: 'Inlet Condition (1-5)';
    outletConditionRating   : Integer       @title: 'Outlet Condition (1-5)';
    jointConditionRating    : Integer       @title: 'Joint Condition (1-5)';
    hydraulicPerfRating     : Integer       @title: 'Hydraulic Performance (1-5)';
    headwallType            : HeadwallType;
    headwallCondition       : Integer;
    lastCctvDate            : Date          @title: 'Last CCTV Inspection Date';
    cctvReportRef           : String(256)   @title: 'CCTV Report Reference';
    blockageHistory         : LargeString   @title: 'Blockage History';
    scourProtectionStatus   : String(64)    @title: 'Scour Protection Status';
    notes                   : LargeString;
}

// ─────────────────────────────────────────────────────────────
// BRIDGE CHANGE LOG — field-level change history
// ─────────────────────────────────────────────────────────────
entity BridgeChangeLog : cuid {
    bridge          : Association to Bridge;
    entityName      : String(100);
    fieldName       : String(100);
    oldValue        : String(1000);
    newValue        : String(1000);
    changedAt       : DateTime @cds.on.insert: $now;
    changedBy       : String(100);
    changeReason    : String(500);
}

// ─────────────────────────────────────────────────────────────
// BRIDGE CONDITION HISTORY
// ─────────────────────────────────────────────────────────────
entity BridgeConditionHistory : cuid {
    bridge        : Association to Bridge @mandatory;
    changedAt     : DateTime @cds.on.insert: $now;
    oldCondition  : String(20);
    newCondition  : String(20);
    conditionScore: Integer;
    changedBy     : String(100);
    notes         : String(500);
}

// ─────────────────────────────────────────────────────────────
// BRIDGE DETERIORATION PROFILE
// ─────────────────────────────────────────────────────────────
entity BridgeDeteriorationProfile : cuid, managed {
    bridge            : Association to Bridge;
    material          : String(20);
    ageBand           : String(20);
    currentScore      : Decimal(5,2);
    projectedScore5y  : Decimal(5,2);
    projectedScore10y : Decimal(5,2);
    annualDeclineRate : Decimal(5,3);
    priorityScore     : Decimal(5,2);
    priorityBand      : String(10);
    serviceLifeYears  : Integer;
    computedAt        : DateTime;
}

// ─────────────────────────────────────────────────────────────
// SCOUR ASSESSMENT
// ─────────────────────────────────────────────────────────────
entity ScourAssessment : cuid, managed {
    bridge           : Association to Bridge;
    watercourseName  : String(200);
    crossingType     : String(30);
    floodFrequency   : Integer;
    scourDepth_m     : Decimal(6,2);
    velocityRating   : String(10);
    sedimentRating   : String(10);
    foundationType   : String(30);
    scourRiskScore   : Integer;
    scourRiskLevel   : String(10);
    assessedBy       : String(100);
    assessmentDate   : Date;
    mitigationStatus : String(20) default 'NONE';
    notes            : String(500);
}

// ── Bridge extend: v3 fields + risk/investment associations ──
extend Bridge with {
    // ── Identification ────────────────────────────────────────
    rmsStructureNumber          : String(50)    @title: 'RMS Structure Number';
    technicalObjectCode         : String(50)    @title: 'SAP PM Technical Object Code';
    heritageInventoryNumber     : String(50)    @title: 'Heritage Inventory Number';
    heritageClassification      : HeritageClass @title: 'Heritage Classification';
    lgaBridgeId                 : String(50)    @title: 'LGA Bridge ID';
    // ── Physical / Geometric ─────────────────────────────────
    deckAreaM2                  : Decimal(10,2) @title: 'Deck Area (m²)';
    skewAngleDeg                : Decimal(5,1)  @title: 'Skew Angle (°)';
    maxSpanLengthM              : Decimal(8,2)  @title: 'Max Span Length (m)';
    footpathPresent             : Boolean       @title: 'Footpath Present';
    cyclewayPresent             : Boolean       @title: 'Cycleway Present';
    bridgeUsage                 : BridgeUsage   @title: 'Bridge Usage';
    spatialOrientation          : SpatialOrientation @title: 'Spatial Orientation';
    moveable                    : MoveableType  @title: 'Moveable Type';
    utilitiesSupported          : String(200)   @title: 'Utilities Supported';
    waterwayHorizontalClearanceM : Decimal(7,2) @title: 'Waterway Horizontal Clearance (m)';
    yearLastMajorRehab          : Integer       @title: 'Year of Last Major Rehab';
    // ── Load / Safety ─────────────────────────────────────────
    loadRating                  : Decimal(8,2)  @title: 'Load Rating (t)';
    vehicularGrossWeightLimitT  : Decimal(8,2)  @title: 'GVM Limit (t)';
    nhvrRouteApprovalClass      : String(50)    @title: 'NHVR Route Approval Class';
    pbsLevelApproved            : nhvr.PBSLevel @title: 'PBS Level Approved';
    emergencyAccessRoute        : Boolean       @title: 'Emergency Access Route';
    postedSpeedLimitKmh         : Integer       @title: 'Posted Speed Limit (km/h)';
    screenElectricalSafetyRequired : Boolean   @title: 'Electrical Safety Screen Required';
    screenProtectionRequired    : Boolean       @title: 'Protection Screen Required';
    safetyWalkwayFitted         : Boolean       @title: 'Safety Walkway Fitted';
    safetyRefugeCount           : Integer       @title: 'Safety Refuge Count';
    suicidePreventionScreen     : Boolean       @title: 'Suicide Prevention Screen';
    importanceLevel             : Integer       @title: 'Importance Level (AS 1170)';
    // ── Inspection / Condition ────────────────────────────────
    bridgeHealthIndex           : Decimal(5,1)  @title: 'Bridge Health Index (0-100)';
    structuralAdequacyRating    : Integer       @title: 'Structural Adequacy Rating';
    safetySubRating             : Integer       @title: 'Safety Sub-Rating';
    durabilitySubRating         : Integer       @title: 'Durability Sub-Rating';
    lastPrincipalInspDate       : Date          @title: 'Last Principal Inspection Date';
    lastRoutineInspDate         : Date          @title: 'Last Routine Inspection Date';
    nextInspectionDueDate       : Date          @title: 'Next Inspection Due Date';
    inspectionFrequencyYrs      : Integer       @title: 'Inspection Frequency (yrs)';
    monitoringRequirement       : String(200)   @title: 'Monitoring Requirement';
    structuralDeficiencyFlag    : Boolean       @title: 'Structurally Deficient';
    functionallyObsoleteFlag    : Boolean       @title: 'Functionally Obsolete';
    lastLoadTestDate            : Date          @title: 'Last Load Test Date';
    fatigueLifeAssessmentDate   : Date          @title: 'Fatigue Life Assessment Date';
    lastCoatingDate             : Date          @title: 'Last Coating Date';
    scourDepthLastMeasuredM     : Decimal(6,2)  @title: 'Scour Depth Last Measured (m)';
    lastScourInspDate           : Date          @title: 'Last Scour Inspection Date';
    asBuiltDrawingRef           : String(256)   @title: 'As-Built Drawing Reference';
    bimDigitalTwinRef           : String(256)   @title: 'BIM / Digital Twin Reference';
    designLife                  : Integer       @title: 'Design Life (yrs)';
    // ── Risk / Financial Denorm ───────────────────────────────
    currentRiskScore            : Integer       @title: 'Current Risk Score';
    currentRiskBand             : RiskBand      @title: 'Current Risk Band';
    priorityRank                : Integer       @title: 'Network Priority Rank';
    heavyVehiclePct             : Decimal(5,1)  @title: 'Heavy Vehicle Percentage';
    detourLengthKm              : Decimal(7,1)  @title: 'Detour Length (km)';
    floodImmunityARI            : Integer       @title: 'Flood Immunity ARI (yrs)';
    climateVulnerabilityClass   : String(50)    @title: 'Climate Vulnerability Class';
    scourVulnerabilityRating    : ScourVulnerability @title: 'Scour Vulnerability';
    currentReplacementCost      : Decimal(14,2) @title: 'Current Replacement Cost ($)';
    writtenDownValue            : Decimal(14,2) @title: 'Written Down Value ($)';
    deferredMaintenanceValue    : Decimal(12,2) @title: 'Deferred Maintenance Value ($)';
    remainingUsefulLifeYrs      : Integer       @title: 'Remaining Useful Life (yrs)';
    // ── New Associations ──────────────────────────────────────
    riskAssessments             : Association to many BridgeRiskAssessment on riskAssessments.bridge = $self;
    investmentPlans             : Association to many BridgeInvestmentPlan on investmentPlans.bridge = $self;
    culvertAssessments          : Association to many BridgeCulvertAssessment on culvertAssessments.bridge = $self;
    changeLogs                  : Association to many BridgeChangeLog on changeLogs.bridge = $self;
    inspectionMetrics           : Association to BridgeInspectionMetrics on inspectionMetrics.bridge = $self;
}
