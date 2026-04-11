// ============================================================
// TENANT METADATA
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
    tenantCode   : String(50)  @mandatory;
    displayName  : String(200) @mandatory;
    shortName    : String(50);
    jurisdiction : String(20);
    contactEmail : String(200);
    contactName  : String(200);
    notes        : String(1000);
    isActive     : Boolean default true;
    deploymentMode : String(20) default 'FULL';
}

// ── Annotations ──────────────────────────────────────────────
annotate Tenant with { tenantCode @assert.unique; };

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
