using nhvr from '../../db/schema';
using BridgeManagementService from '../service';

extend service BridgeManagementService with {

// ── Tenant CRUD (Admin only) ──────────────────────────────
@restrict: [
    { grant: 'READ',                    to: 'authenticated-user' },
    { grant: ['CREATE','UPDATE','DELETE'], to: ['BridgeManager','Admin'] }
]
entity Tenants as projection on nhvr.Tenant {
    *,
    features         : redirected to TenantFeatures,
    roleCapabilities : redirected to TenantRoleCapabilities
};

// ── Tenant Features (licensed capabilities per tenant) ───
@restrict: [
    { grant: 'READ',                    to: 'authenticated-user' },
    { grant: ['CREATE','UPDATE','DELETE'], to: ['BridgeManager','Admin'] }
]
entity TenantFeatures as projection on nhvr.TenantFeature {
    *,
    tenant.tenantCode        as tenantCode   @Core.Immutable,
    tenant.displayName       as tenantName,
    featureCatalog.displayName as featureDisplayName,
    featureCatalog.category    as featureCategory
};

// ── Tenant Role Capabilities ─────────────────────────────
@restrict: [
    { grant: 'READ',                    to: 'authenticated-user' },
    { grant: ['CREATE','UPDATE','DELETE'], to: ['BridgeManager','Admin'] }
]
entity TenantRoleCapabilities as projection on nhvr.TenantRoleCapability {
    *,
    tenant.tenantCode  as tenantCode  @Core.Immutable,
    tenant.displayName as tenantName
};

// ── Feature Catalog (read-only for all authenticated) ────
@readonly
@restrict: [{ grant: 'READ', to: 'authenticated-user' }]
entity FeatureCatalog as projection on nhvr.FeatureCatalog;

// ── getCapabilityProfile ─────────────────────────────────
// Called once at UI boot by CapabilityManager.js.
// Returns merged capability profile for caller's tenant+role.
@restrict: [{ to: 'authenticated-user' }]
function getCapabilityProfile() returns array of {
    capabilityCode : String;
    displayName    : String;
    category       : String;
    canView        : Boolean;
    canEdit        : Boolean;
    canAdmin       : Boolean;
    isEnabled      : Boolean;
    isCoreFeature  : Boolean;
};

// ── assignTenantCapabilities ─────────────────────────────
// Bulk-upserts TenantFeature + TenantRoleCapability rows.
@restrict: [{ to: ['BridgeManager','Admin'] }]
action assignTenantCapabilities(
    tenantId     : UUID,
    capabilities : array of {
        capabilityCode : String;
        isEnabled      : Boolean;
        roleOverrides  : array of {
            role     : String;
            canView  : Boolean;
            canEdit  : Boolean;
            canAdmin : Boolean;
        };
    }
) returns { status: String; count: Integer };
}
