// ============================================================
// MULTI-TENANCY & LICENSING
// Tenant, FeatureCatalog, TenantFeature, TenantRoleCapability
// + tenant association extends on core entities
// ============================================================

namespace nhvr;

using { cuid, managed } from '@sap/cds/common';
using { nhvr.Bridge, nhvr.Route } from './core';
using { nhvr.Restriction } from './restrictions';
using { nhvr.FreightRoute } from './freight';
using { nhvr.VehiclePermit } from './capacity-permits';

// ─────────────────────────────────────────────────────────────
// TENANT — client organisation
// ─────────────────────────────────────────────────────────────
entity Tenant : cuid, managed {
    tenantCode       : String(50)  @mandatory;
    displayName      : String(200) @mandatory;
    shortName        : String(50);
    jurisdiction     : String(20);
    contactEmail     : String(200);
    contactName      : String(200);
    licenseStartDate : Date;
    licenseEndDate   : Date;
    licenseStatus    : String(20) default 'ACTIVE';
    maxUsers         : Integer;
    notes            : String(1000);
    isActive         : Boolean default true;
    features         : Composition of many TenantFeature         on features.tenant = $self;
    roleCapabilities : Composition of many TenantRoleCapability  on roleCapabilities.tenant = $self;
}

// ── Deployment Mode extend ───────────────────────────────────
extend Tenant with {
    deploymentMode : String(20) default 'FULL';
}

// ─────────────────────────────────────────────────────────────
// FEATURE CATALOG — system-wide master list
// ─────────────────────────────────────────────────────────────
entity FeatureCatalog : cuid {
    capabilityCode  : String(50)  @mandatory;
    displayName     : String(200) @mandatory;
    description     : String(500);
    category        : String(50);
    isCoreFeature   : Boolean default false;
    defaultEnabled  : Boolean default false;
    sortOrder       : Integer default 0;
    iconUri         : String(200);
    minRoleRequired : String(50);
    isActive        : Boolean default true;
    dependsOn       : String(500);
}

// ─────────────────────────────────────────────────────────────
// TENANT FEATURE — licensed capabilities per tenant
// ─────────────────────────────────────────────────────────────
entity TenantFeature : cuid, managed {
    tenant         : Association to Tenant       @mandatory;
    capabilityCode : String(50)                  @mandatory;
    featureCatalog : Association to FeatureCatalog;
    isEnabled      : Boolean default true;
    validFrom      : Date;
    validTo        : Date;
    licenseNote    : String(500);
}

// ─────────────────────────────────────────────────────────────
// TENANT ROLE CAPABILITY — per-tenant, per-role access
// ─────────────────────────────────────────────────────────────
entity TenantRoleCapability : cuid, managed {
    tenant         : Association to Tenant  @mandatory;
    capabilityCode : String(50)             @mandatory;
    role           : String(50)             @mandatory;
    canView        : Boolean default true;
    canEdit        : Boolean default false;
    canAdmin       : Boolean default false;
    notes          : String(500);
}

// ── Annotations ──────────────────────────────────────────────
annotate FeatureCatalog with { capabilityCode @assert.unique; };

// ── Tenant association extends on core entities ──────────────
extend Bridge with {
    tenant : Association to Tenant;
}

extend Route with {
    tenant : Association to Tenant;
}

extend Restriction with {
    tenant : Association to Tenant;
}

extend FreightRoute with {
    tenant : Association to Tenant;
}

extend VehiclePermit with {
    tenant : Association to Tenant;
}
