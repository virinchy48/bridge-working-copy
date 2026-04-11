using nhvr from '../../db/schema';
using BridgeManagementService from '../service';

extend service BridgeManagementService with {

// ── P08: Gazette Validation ───────────────────────────────────
@restrict: [{ to: ['Viewer','BridgeManager','Admin'] }]
entity GazetteValidations as projection on nhvr.GazetteValidation {
    key ID,
    restriction.ID as restriction_ID,
    gazetteRef, validationStatus, validatedAt, validatedBy, expiryDate, notes
};

@restrict: [{ to: ['BridgeManager','Admin'] }]
action validateGazette(
    restrictionId : UUID,
    gazetteRef    : String
) returns { status: String; message: String; expiryDate: String; };

// ── GAP 2: Gazette Notice Register ───────────────────────────
@restrict: [{ to: ['Viewer','BridgeManager','Admin'] }]
entity GazetteNotices as projection on nhvr.GazetteNotice {
    key ID, gazetteRef, state, restrictionType,
    issuedDate, expiryDate, description, isActive, nhvrUrl, createdAt
};

@restrict: [{ to: ['BridgeManager','Admin'] }]
entity RestrictionFeedSources as projection on nhvr.RestrictionFeedSource;

@restrict: [{ to: ['BridgeManager','Admin'] }]
action pollRestrictionFeed(sourceCode: String) returns LargeString;
}
