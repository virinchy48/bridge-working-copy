sap.ui.define([], function () {
    "use strict";

    var RoutingService = {
        /**
         * Calculate route between points.
         * @param {object} origin - {lat, lng}
         * @param {object} destination - {lat, lng}
         * @param {Array} waypoints - [{lat, lng}]
         * @param {object} vehicleProfile - {gvm_t, height_m, width_m, length_m, axleLoad_t}
         * @param {string} provider - "osrm" | "ors" | "valhalla" | "google" | "esri"
         * @param {object} [config] - { apiKey, alternatives }
         * @returns {Promise<Array<RouteResult>>}
         */
        route: function (origin, destination, waypoints, vehicleProfile, provider, config) {
            provider = provider || "osrm";
            config = config || {};
            var alternatives = config.alternatives !== undefined ? config.alternatives : 2;

            if (provider === "osrm") {
                return this._routeOSRM(origin, destination, waypoints, alternatives);
            }
            if (provider === "ors") {
                return this._routeORS(origin, destination, waypoints, vehicleProfile, config.apiKey, alternatives);
            }
            if (provider === "valhalla") {
                return this._routeValhalla(origin, destination, waypoints, vehicleProfile, alternatives);
            }
            if (provider === "google") {
                return this._routeGoogle(origin, destination, waypoints, vehicleProfile);
            }
            if (provider === "esri") {
                return this._routeEsri(origin, destination, waypoints, config.apiKey);
            }

            return Promise.resolve([]);
        },

        _routeOSRM: function (origin, dest, waypoints, alts) {
            var coords = [origin].concat(waypoints || []).concat([dest]).map(function (p) { return p.lng + "," + p.lat; }).join(";");
            var url = "https://router.project-osrm.org/route/v1/driving/" + coords + "?overview=full&geometries=geojson&alternatives=" + (alts > 0 ? "true" : "false");
            return fetch(url).then(function (r) { return r.json(); }).then(function (j) {
                return (j.routes || []).map(function (route) {
                    return {
                        geometry: route.geometry,
                        distance_km: Math.round(route.distance / 1000 * 10) / 10,
                        duration_min: Math.round(route.duration / 60 * 10) / 10,
                        source: "osrm"
                    };
                });
            });
        },

        _routeORS: function (origin, dest, waypoints, vehicle, apiKey, alts) {
            if (!apiKey) return this._routeOSRM(origin, dest, waypoints, alts); // fallback
            var coords = [origin].concat(waypoints || []).concat([dest]).map(function (p) { return [p.lng, p.lat]; });
            var body = {
                coordinates: coords
            };
            if (alts > 0) {
                body.alternative_routes = { share_factor: 0.6, target_count: alts };
            }
            if (vehicle) {
                body.options = { vehicle_type: "hgv" };
                if (vehicle.gvm_t) body.options.weight = vehicle.gvm_t;
                if (vehicle.height_m) body.options.height = vehicle.height_m;
                if (vehicle.width_m) body.options.width = vehicle.width_m;
                if (vehicle.length_m) body.options.length = vehicle.length_m;
                if (vehicle.axleLoad_t) body.options.axleload = vehicle.axleLoad_t;
            }
            var self = this;
            return fetch("https://api.openrouteservice.org/v2/directions/driving-hgv/geojson", {
                method: "POST",
                headers: { "Content-Type": "application/json", "Authorization": apiKey },
                body: JSON.stringify(body)
            }).then(function (r) { return r.json(); }).then(function (j) {
                if (j.features) {
                    return j.features.map(function (f) {
                        return {
                            geometry: f.geometry,
                            distance_km: Math.round((f.properties.summary && f.properties.summary.distance || 0) / 1000 * 10) / 10,
                            duration_min: Math.round((f.properties.summary && f.properties.summary.duration || 0) / 60 * 10) / 10,
                            source: "ors"
                        };
                    });
                }
                return [];
            }).catch(function () { return self._routeOSRM(origin, dest, waypoints, alts); });
        },

        _routeValhalla: function (origin, dest, waypoints, vehicle, alts) {
            var locations = [origin].concat(waypoints || []).concat([dest]).map(function (p) { return { lat: p.lat, lon: p.lng }; });
            var body = {
                locations: locations,
                costing: "truck",
                alternates: alts,
                directions_options: { units: "kilometers" },
                costing_options: { truck: {} }
            };
            if (vehicle) {
                if (vehicle.gvm_t) body.costing_options.truck.weight = vehicle.gvm_t;
                if (vehicle.height_m) body.costing_options.truck.height = vehicle.height_m;
                if (vehicle.width_m) body.costing_options.truck.width = vehicle.width_m;
                if (vehicle.length_m) body.costing_options.truck.length = vehicle.length_m;
            }
            return fetch("https://valhalla.openstreetmap.de/route", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
                signal: AbortSignal.timeout(10000)
            }).then(function (r) { return r.json(); }).then(function (j) {
                if (j.trip && j.trip.legs) {
                    return [{
                        geometry: { type: "LineString", coordinates: j.trip.legs[0].shape ? _decodeValhallaShape(j.trip.legs[0].shape) : [] },
                        distance_km: Math.round((j.trip.summary && j.trip.summary.length || 0) * 10) / 10,
                        duration_min: Math.round((j.trip.summary && j.trip.summary.time || 0) / 60 * 10) / 10,
                        source: "valhalla"
                    }];
                }
                return [];
            }).catch(function () { return []; });
        },

        _routeGoogle: function (origin, dest, waypoints, vehicle) {
            if (!window.google || !google.maps) return Promise.resolve([]);
            return new Promise(function (resolve) {
                var service = new google.maps.DirectionsService();
                var request = {
                    origin: { lat: origin.lat, lng: origin.lng },
                    destination: { lat: dest.lat, lng: dest.lng },
                    travelMode: "DRIVING",
                    provideRouteAlternatives: true
                };
                if (waypoints && waypoints.length) {
                    request.waypoints = waypoints.map(function (w) { return { location: { lat: w.lat, lng: w.lng }, stopover: true }; });
                }
                service.route(request, function (result, status) {
                    if (status === "OK") {
                        resolve(result.routes.map(function (route) {
                            var leg = route.legs[0];
                            return {
                                geometry: { type: "LineString", coordinates: google.maps.geometry.encoding.decodePath(route.overview_polyline).map(function (p) { return [p.lng(), p.lat()]; }) },
                                distance_km: Math.round(leg.distance.value / 1000 * 10) / 10,
                                duration_min: Math.round(leg.duration.value / 60 * 10) / 10,
                                source: "google"
                            };
                        }));
                    } else { resolve([]); }
                });
            });
        },

        _routeEsri: function (origin, dest, waypoints, apiKey) {
            // Esri routing via REST API
            var stops = [origin].concat(waypoints || []).concat([dest]).map(function (p) { return p.lng + "," + p.lat; }).join(";");
            var url = "https://route-api.arcgis.com/arcgis/rest/services/World/Route/NAServer/Route_World/solve?f=json&stops=" + stops + "&returnRoutes=true&returnDirections=false";
            if (apiKey) url += "&token=" + encodeURIComponent(apiKey);
            return fetch(url).then(function (r) { return r.json(); }).then(function (j) {
                if (j.routes && j.routes.features) {
                    return j.routes.features.map(function (f) {
                        return {
                            geometry: f.geometry,
                            distance_km: Math.round((f.attributes.Total_Kilometers || 0) * 10) / 10,
                            duration_min: Math.round((f.attributes.Total_TravelTime || 0) * 10) / 10,
                            source: "esri"
                        };
                    });
                }
                return [];
            }).catch(function () { return []; });
        }
    };

    // Valhalla shape decoder (encoded polyline, precision 6)
    function _decodeValhallaShape(encoded) {
        var coords = [], index = 0, lat = 0, lng = 0;
        while (index < encoded.length) {
            var b, shift = 0, result = 0;
            do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
            lat += ((result & 1) ? ~(result >> 1) : (result >> 1));
            shift = 0; result = 0;
            do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
            lng += ((result & 1) ? ~(result >> 1) : (result >> 1));
            coords.push([lng / 1e6, lat / 1e6]);
        }
        return coords;
    }

    return RoutingService;
});
