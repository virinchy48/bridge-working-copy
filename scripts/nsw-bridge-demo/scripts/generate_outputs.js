#!/usr/bin/env node
/**
 * NSW Bridge Demo — Output Generator
 * Generates:
 *   1. webapp/model/bridges.json  (UI5 JSONModel)
 *   2. data/nsw_bridges.geojson   (GeoJSON FeatureCollection)
 *   3. data/nsw_bridges.csv       (flat CSV)
 *
 * Usage: node scripts/generate_outputs.js
 */
const fs   = require("fs");
const path = require("path");

const ROOT     = path.resolve(__dirname, "..");
const SRC      = path.join(ROOT, "data", "bridges_model.json");
const MODEL    = path.join(ROOT, "webapp", "model", "bridges.json");
const GEOJSON  = path.join(ROOT, "data", "nsw_bridges.geojson");
const CSV_OUT  = path.join(ROOT, "data", "nsw_bridges.csv");

const bridges = JSON.parse(fs.readFileSync(SRC, "utf8"));
console.log(`Loaded ${bridges.length} bridges from model.`);

// ─── 1. UI5 JSONModel ─────────────────────────────────────────────────────
fs.mkdirSync(path.join(ROOT, "webapp", "model"), { recursive: true });
fs.writeFileSync(MODEL, JSON.stringify({ bridges }, null, 2), "utf8");
console.log(`✔  Written: ${MODEL}`);

// ─── 2. GeoJSON FeatureCollection ─────────────────────────────────────────
function bridgeToFeature(b) {
  // Generate LineString approximating bridge span
  // Direction heuristic: E-W for most bridges, N-S for river crossings
  const halfLen = (b.total_length_m || 50) / 2;
  const metersPerDegLat = 111320;
  const metersPerDegLng = 111320 * Math.cos(b.latitude * Math.PI / 180);

  // Use road route to determine predominant orientation
  const nsRoutes = /(pacific|princes|new england|newell|north|princes|hume)/i;
  const isNS = nsRoutes.test(b.road_route);

  let coordinates;
  if (isNS) {
    const dLat = (halfLen / metersPerDegLat);
    coordinates = [
      [b.longitude, b.latitude - dLat],
      [b.longitude, b.latitude + dLat]
    ];
  } else {
    const dLng = (halfLen / metersPerDegLng);
    coordinates = [
      [b.longitude - dLng, b.latitude],
      [b.longitude + dLng, b.latitude]
    ];
  }

  return {
    type: "Feature",
    geometry: {
      type: "LineString",
      coordinates
    },
    properties: {
      bridge_id:          b.bridge_id,
      bridge_name:        b.bridge_name,
      lga:                b.lga,
      region:             b.region,
      state:              b.state,
      road_route:         b.road_route,
      route_number:       b.route_number,
      asset_owner:        b.asset_owner,
      maintenance_authority: b.maintenance_authority,
      condition:          b.condition,
      condition_rating:   b.condition_rating,
      posting_status:     b.posting_status,
      structure_type:     b.structure_type,
      material:           b.material,
      clearance_height_m: b.clearance_height_m,
      main_span_m:        b.main_span_m,
      total_length_m:     b.total_length_m,
      width_m:            b.width_m,
      no_of_spans:        b.no_of_spans,
      no_of_lanes:        b.no_of_lanes,
      center_lat:         b.latitude,
      center_lng:         b.longitude,
      nhvr_route_assessed: b.nhvr_route_assessed,
      over_mass_route:    b.over_mass_route,
      gazette_reference:  b.gazette_reference,
      aadt:               b.aadt,
      freight_route:      b.freight_route,
      flood_impacted:     b.flood_impacted,
      scour_risk:         b.scour_risk,
      seismic_zone:       b.seismic_zone,
      data_source:        b.data_source,
      source_url:         b.source_url,
      last_updated:       b.last_updated,
      data_confidence:    b.data_confidence,
      notes:              b.notes
    }
  };
}

const geojson = {
  type: "FeatureCollection",
  name: "NSW Bridge Assets — NHVR Permit Assessment Dataset",
  crs: {
    type: "name",
    properties: { name: "urn:ogc:def:crs:OGC:1.3:CRS84" }
  },
  metadata: {
    title:       "NSW Bridge Asset Register — NHVR Permit Assessment",
    description: "150 NSW bridge assets with NHVR-relevant attributes for permit route assessment",
    generated:   new Date().toISOString(),
    recordCount: bridges.length,
    sources:     ["Transport for NSW Open Data", "NSW Spatial SEED", "NHVR Gazetted Routes", "OpenStreetMap"],
    crs:         "WGS84 (EPSG:4326)",
    disclaimer:  "Demonstration dataset. Not for operational permit decisions. Verify via official NHVR channels."
  },
  features: bridges.map(bridgeToFeature)
};

fs.writeFileSync(GEOJSON, JSON.stringify(geojson, null, 2), "utf8");
console.log(`✔  Written: ${GEOJSON}`);

// ─── 3. CSV ───────────────────────────────────────────────────────────────
const headers = [
  "bridge_id","bridge_name","lga","region","state","road_route","route_number",
  "asset_owner","maintenance_authority","condition","condition_rating","posting_status",
  "structure_type","material","clearance_height_m","main_span_m","total_length_m",
  "width_m","no_of_spans","no_of_lanes","latitude","longitude",
  "nhvr_route_assessed","over_mass_route","gazette_reference","aadt","freight_route",
  "flood_impacted","scour_risk","seismic_zone","data_source","source_url",
  "last_updated","data_confidence","notes"
];

function escapeCSV(val) {
  if (val === null || val === undefined) return "";
  const s = String(val);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

const rows = bridges.map(b => headers.map(h => escapeCSV(b[h])).join(","));
const csv  = [headers.join(","), ...rows].join("\n");
fs.writeFileSync(CSV_OUT, csv, "utf8");
console.log(`✔  Written: ${CSV_OUT}`);

// ─── Summary stats ─────────────────────────────────────────────────────────
const byRegion = {};
const byPosting = {};
const byCondition = {};
bridges.forEach(b => {
  byRegion[b.region]          = (byRegion[b.region] || 0) + 1;
  byPosting[b.posting_status] = (byPosting[b.posting_status] || 0) + 1;
  byCondition[b.condition]    = (byCondition[b.condition] || 0) + 1;
});

console.log("\n── Dataset Summary ─────────────────────────────────");
console.log("By Region:");
Object.entries(byRegion).sort((a,b) => b[1]-a[1]).forEach(([k,v]) => console.log(`  ${k.padEnd(20)} ${v}`));
console.log("\nBy Posting Status:");
Object.entries(byPosting).forEach(([k,v]) => console.log(`  ${k.padEnd(20)} ${v}`));
console.log("\nBy Condition:");
Object.entries(byCondition).forEach(([k,v]) => console.log(`  ${k.padEnd(20)} ${v}`));

const nhvrCount = bridges.filter(b => b.nhvr_route_assessed).length;
const freightCount = bridges.filter(b => b.freight_route).length;
console.log(`\nNHVR Assessed:   ${nhvrCount} / ${bridges.length}`);
console.log(`Freight Routes:  ${freightCount} / ${bridges.length}`);
console.log("──────────────────────────────────────────────────\n");
console.log("All outputs generated successfully.");
