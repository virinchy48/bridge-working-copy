// ============================================================
// FREIGHT ROUTES — PBS/HML corridor management
// ============================================================

namespace nhvr;

using { cuid, managed } from '@sap/cds/common';
using { nhvr.Bridge } from './core';
using { nhvr.FreightRouteClass } from './types';

// ─────────────────────────────────────────────────────────────
// FREIGHT ROUTE
// ─────────────────────────────────────────────────────────────
entity FreightRoute : cuid, managed {
    routeCode         : String(20) @mandatory;
    name              : String(200);
    state             : String(3);
    routeClass        : FreightRouteClass default 'GENERAL';
    corridorMaxMass   : Decimal(10,2);
    corridorMaxHeight : Decimal(5,2);
    lastAssessedAt    : DateTime;
    status            : String(20) default 'ACTIVE';
    bridges           : Composition of many FreightRouteBridge on bridges.route = $self;
}

entity FreightRouteBridge : cuid {
    route      : Association to FreightRoute;
    bridge     : Association to Bridge;
    sequence   : Integer;
    isCritical : Boolean default false;
}

// ─────────────────────────────────────────────────────────────
// BRIDGE ROUTE ASSIGNMENT — links bridges to freight corridors
// ─────────────────────────────────────────────────────────────
entity BridgeRouteAssignment : cuid {
    bridge     : Association to Bridge       not null;
    route      : Association to FreightRoute not null;
    sequenceNo : Integer;
    isLimiter  : Boolean default false;
    notes      : String(200);
    createdAt  : Timestamp @cds.on.insert: $now;
}

// ── Annotations ──────────────────────────────────────────────
annotate FreightRoute with { routeCode @assert.unique; };
annotate FreightRouteBridge with { route @mandatory; };
