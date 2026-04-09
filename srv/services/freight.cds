using nhvr from '../../db/schema';
using BridgeManagementService from '../service';

extend service BridgeManagementService with {

// ── P03: Freight Route Corridor ───────────────────────────────
@restrict: [{ to: ['Viewer','Inspector','Operator','BridgeManager','Admin'] }]
entity FreightRoutes as projection on nhvr.FreightRoute {
    key ID, routeCode, name, state, routeClass, corridorMaxMass, corridorMaxHeight,
        lastAssessedAt, status, createdAt, modifiedAt
};

@restrict: [{ to: ['Viewer','Inspector','Operator','BridgeManager','Admin'] }]
entity FreightRouteBridges as projection on nhvr.FreightRouteBridge {
    key ID,
    route.ID  as route_ID,
    bridge.ID as bridge_ID,
    sequence, isCritical
};

@restrict: [{ to: ['BridgeManager','Admin','Operator'] }]
action assessCorridor(routeId : UUID) returns { corridorMaxMass : Decimal; bridgeCount : Integer; criticalBridges : Integer; };

// Full vehicle-aware freight route assessment — returns JSON string with per-bridge results
@restrict: [{ to: ['BridgeManager','Admin','Operator'] }]
action assessFreightRouteVehicle(
    routeId         : UUID,
    vehicleGVM_t    : Decimal,
    vehicleGCM_t    : Decimal,
    vehicleHeight_m : Decimal,
    vehicleWidth_m  : Decimal,
    vehicleLength_m : Decimal,
    crossingSpeed   : Integer,
    vehicleClass    : String
) returns LargeString;

// Find alternative routes — internal + OSRM external — returns JSON string
@restrict: [{ to: ['BridgeManager','Admin','Operator'] }]
action findAlternativeRoutes(
    routeId         : UUID,
    vehicleGVM_t    : Decimal,
    vehicleHeight_m : Decimal,
    vehicleWidth_m  : Decimal,
    vehicleLength_m : Decimal
) returns LargeString;

// Assess a custom geometry route (from Route Planner) for a given vehicle —
// bridges discovered by spatial proximity to route coordinates
@restrict: [{ to: ['BridgeManager','Admin','Operator'] }]
action assessRouteGeometry(
    routeCoords     : LargeString,
    vehicleGVM_t    : Decimal,
    vehicleGCM_t    : Decimal,
    vehicleHeight_m : Decimal,
    vehicleWidth_m  : Decimal,
    vehicleLength_m : Decimal,
    crossingSpeed   : Integer,
    vehicleClass    : String
) returns LargeString;

// ── Pre-Trip Route Validation API ─────────────────────────────
@Core.Description: 'Pre-trip route validation API for fleet/TMS integration'
@Core.LongDescription: 'Submit vehicle specs + route geometry, receive bridge-by-bridge assessment with verdict'
@restrict: [{ to: 'authenticated-user' }]
action validateRoute(
    routeGeometry    : LargeString,
    vehicleGVM_t     : Decimal,
    vehicleGCM_t     : Decimal,
    vehicleHeight_m  : Decimal,
    vehicleWidth_m   : Decimal,
    vehicleLength_m  : Decimal,
    crossingSpeed_kmh: Integer,
    vehicleClass     : String
) returns LargeString;

@restrict: [{ to: ['Admin'] }]
entity RoutingEngineConfigs as projection on nhvr.RoutingEngineConfig;

@restrict: [{ to: 'authenticated-user' }]
action calculateRoute(
    waypoints: LargeString,
    vehicleGVM_t: Decimal, vehicleHeight_m: Decimal, vehicleWidth_m: Decimal, vehicleLength_m: Decimal,
    engine: String
) returns LargeString;
}
