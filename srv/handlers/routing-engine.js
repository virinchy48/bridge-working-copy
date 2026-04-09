// ============================================================
// PHASE D17 — Routing Engine Abstraction
// Supports OSRM, Valhalla; extensible for ORS, Google, Esri
// ============================================================
'use strict';

module.exports = function registerRoutingEngineHandlers(srv, _helpers) {
    const cds = require('@sap/cds');

    srv.on('calculateRoute', async (req) => {
        const db = await cds.connect.to('db');
        const { waypoints, vehicleGVM_t, vehicleHeight_m, vehicleWidth_m, vehicleLength_m, engine } = req.data;

        if (!waypoints) return req.reject(400, 'waypoints required (JSON array of {lat,lng})');

        let points;
        try { points = JSON.parse(waypoints); } catch (e) { return req.reject(400, 'Invalid waypoints JSON'); }
        if (!Array.isArray(points) || points.length < 2) return req.reject(400, 'At least 2 waypoints required');

        // Load engine config
        let config;
        if (engine) {
            config = await db.run(SELECT.one.from('nhvr.RoutingEngineConfig').where({ engine: engine, isActive: true }));
        }
        if (!config) {
            config = await db.run(SELECT.one.from('nhvr.RoutingEngineConfig').where({ isDefault: true, isActive: true }));
        }
        if (!config) return req.reject(503, 'No routing engine configured');

        if (points.length > (config.maxWaypoints || 25)) {
            return req.reject(400, 'Too many waypoints (max ' + (config.maxWaypoints || 25) + ')');
        }

        // Build routing request based on engine type
        let result;
        try {
            if (config.engine === 'osrm') {
                result = await _routeOSRM(config, points);
            } else if (config.engine === 'valhalla') {
                result = await _routeValhalla(config, points, { vehicleGVM_t, vehicleHeight_m, vehicleWidth_m, vehicleLength_m });
            } else {
                result = [{ error: 'Engine ' + config.engine + ' not yet implemented server-side' }];
            }
        } catch (e) {
            return req.reject(503, 'Routing engine error: ' + e.message);
        }

        return JSON.stringify({ engine: config.engine, routes: result });
    });

    // ── OSRM adapter ──────────────────────────────────────────
    async function _routeOSRM(config, points) {
        var coords = points.map(function(p) { return p.lng + ',' + p.lat; }).join(';');
        var url = config.baseUrl + '/' + coords + '?overview=full&geometries=geojson&alternatives=true';
        var resp = await fetch(url, { signal: AbortSignal.timeout(10000) });
        var routingResult = await resp.json();
        return (routingResult.routes || []).map(function(route) {
            return {
                distance_km: Math.round(route.distance / 1000 * 10) / 10,
                duration_min: Math.round(route.duration / 60 * 10) / 10,
                geometry: route.geometry,
                source: 'osrm'
            };
        });
    }

    // ── Valhalla adapter ──────────────────────────────────────
    async function _routeValhalla(config, points, dims) {
        var locations = points.map(function(p) { return { lat: p.lat, lon: p.lng }; });
        var body = { locations: locations, costing: 'truck', alternates: 2, costing_options: { truck: {} } };
        if (dims.vehicleGVM_t)    body.costing_options.truck.weight = dims.vehicleGVM_t;
        if (dims.vehicleHeight_m) body.costing_options.truck.height = dims.vehicleHeight_m;
        if (dims.vehicleWidth_m)  body.costing_options.truck.width  = dims.vehicleWidth_m;
        if (dims.vehicleLength_m) body.costing_options.truck.length = dims.vehicleLength_m;
        var resp = await fetch(config.baseUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(10000)
        });
        var valhallaResult = await resp.json();
        return valhallaResult.trip ? [{
            distance_km: Math.round((valhallaResult.trip.summary.length || 0) * 10) / 10,
            duration_min: Math.round((valhallaResult.trip.summary.time || 0) / 60 * 10) / 10,
            geometry: null,
            source: 'valhalla'
        }] : [];
    }
};
