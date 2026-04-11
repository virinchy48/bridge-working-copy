using nhvr from '../../db/schema';
using BridgeManagementService from '../service';

extend service BridgeManagementService with {

// Polymorphic attribute values for Restriction, Defect, Permit, Route, InspectionOrder
@restrict: [
    { grant: ['READ'],                          to: 'authenticated-user' },
    { grant: ['CREATE','UPDATE','DELETE'],       to: ['BridgeManager','Admin'] }
]
entity EntityAttributes as projection on nhvr.EntityAttribute;

// Admin-only: manage dynamic attribute schema
@restrict: [
    { grant: ['READ'],                    to: 'authenticated-user' },
    { grant: ['CREATE','UPDATE','DELETE'], to: ['BridgeManager','Admin'] }
]
entity AttributeDefinitions as projection on nhvr.AttributeDefinition {
    *,
    validValues: redirected to AttributeValidValues
};

@restrict: [{ grant: ['READ'], to: 'authenticated-user' }]
entity UploadLogs as projection on nhvr.UploadLog;

@cds.query.limit: { max: 10000, default: 500 }
@restrict: [{ grant: ['READ'], to: 'authenticated-user' }]
entity AuditLogs as projection on nhvr.AuditLog;

// ── Lookup Values (admin-configurable dropdowns) ────────────
@cds.redirection.target: true
@restrict: [
    { grant: ['READ'],                    to: 'authenticated-user' },
    { grant: ['CREATE','UPDATE','DELETE'], to: ['BridgeManager','Admin'] }
]
entity Lookups as projection on nhvr.Lookup;

// ── Restriction Type Config (admin-configurable) ──────────
@cds.redirection.target: true
@restrict: [
    { grant: ['READ'],                    to: 'authenticated-user' },
    { grant: ['CREATE','UPDATE','DELETE'], to: ['BridgeManager','Admin'] }
]
entity RestrictionTypeConfigs as projection on nhvr.RestrictionTypeConfig;

// ── Attribute Valid Values (sub-entity of AttributeDefinitions) ──
@cds.redirection.target: true
@restrict: [
    { grant: ['READ'],                    to: 'authenticated-user' },
    { grant: ['CREATE','UPDATE','DELETE'], to: ['BridgeManager','Admin'] }
]
entity AttributeValidValues as projection on nhvr.AttributeValidValue;

@cds.redirection.target: true
@restrict: [
    { grant: ['READ'],                          to: 'authenticated-user' },
    { grant: ['CREATE','UPDATE','DELETE'],       to: 'authenticated-user' }
]
entity RoleConfigs as projection on nhvr.RoleConfig;

@restrict: [{ to: 'authenticated-user' }]
action saveRoleConfig(configs: array of {
    role: String; featureKey: String; featureType: String; visible: Boolean; editable: Boolean
}) returns { status: String; count: Integer };

// ── Map Configuration ─────────────────────────────────────
@cds.redirection.target: true
@restrict: [
    { grant: ['READ'],                      to: 'authenticated-user' },
    { grant: ['CREATE','UPDATE','DELETE'],   to: ['BridgeManager','Admin'] }
]
entity MapConfigs as projection on nhvr.MapConfig;

// ── v3 New Entity Projections ──────────────────────────────

entity JurisdictionAccesses as projection on nhvr.JurisdictionAccess {
    key ID, userRef, jurisdiction, accessLevel, grantedBy, expiresAt, createdAt
};

@restrict: [{ to: ['BridgeManager','Admin'] }]
action grantJurisdictionAccess(userRef: String, jurisdiction: String, accessLevel: String, expiresAt: DateTime) returns JurisdictionAccesses;

@restrict: [{ to: ['BridgeManager','Admin'] }]
action revokeJurisdictionAccess(accessId: UUID) returns Boolean;

// ── Phase 1.3: New Entity Projections ─────────────────────────
@requires: ['BridgeManager','Admin']
entity AssessmentThresholds as projection on nhvr.AssessmentThreshold;

@requires: ['BridgeManager','Admin']
entity KPIThresholds as projection on nhvr.KPIThreshold;

@requires: ['BridgeManager','Admin']
entity MapProviderConfigs as projection on nhvr.MapProviderConfig;

@requires: ['BridgeManager','Admin']
entity ReportSchedules as projection on nhvr.ReportSchedule;

// ── Phase 6.4: Scheduled Report Execution ─────────────────
@restrict: [{ to: ['BridgeManager','Admin'] }]
action executeScheduledReport(scheduleId: UUID) returns LargeString;

@restrict: [
    { grant: 'READ',                      to: 'authenticated-user' },
    { grant: ['CREATE','UPDATE','DELETE'],  to: ['BridgeManager','Admin'] }
]
entity DataQualityScores as projection on nhvr.DataQualityScore;

@restrict: [{ to: ['Admin','BridgeManager'] }]
action calculateDataQuality(bridgeId: UUID) returns LargeString;

@restrict: [{ to: ['BridgeManager','Admin'] }]
action calculateAllDataQuality() returns LargeString;

}
