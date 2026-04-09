#!/usr/bin/env node
/**
 * generate_seed_bridges.js
 * Merges two NSW bridge datasets into db/data/nhvr-Bridge.csv:
 *   1. scripts/nsw_bridges_upload.csv        (~960 records)
 *   2. scripts/NSW_Clearances_MassUpload.csv (~1152 records, vertical clearances)
 * Existing 12 hand-crafted seed records are preserved.
 * Deduplication by bridgeId.
 */
"use strict";

const fs   = require("fs");
const path = require("path");
const { randomUUID } = require("crypto");

const SEED_PATH        = path.join(__dirname, "..", "db", "data", "nhvr-Bridge.csv");
const UPLOAD_PATH      = path.join(__dirname, "nsw_bridges_upload.csv");
const CLEARANCES_PATH  = path.join(__dirname, "NSW_Clearances_MassUpload.csv");

// ── Robust CSV parser (handles quoted commas) ─────────────────────────────
function parseCSVLine(line) {
    const result = [];
    let inQuote = false, field = "";
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
            if (inQuote && line[i + 1] === '"') { field += '"'; i++; }
            else { inQuote = !inQuote; }
        } else if (ch === "," && !inQuote) {
            result.push(field.trim()); field = "";
        } else { field += ch; }
    }
    result.push(field.trim());
    return result;
}

function esc(val) {
    if (val === null || val === undefined) return "";
    const s = String(val).trim();
    if (s.includes(",") || s.includes('"') || s.includes("\n"))
        return '"' + s.replace(/"/g, '""') + '"';
    return s;
}

function bool(v) { return (v === "true" || v === "TRUE" || v === "1") ? "true" : "false"; }

function deriveScourRisk(condition, floodImpacted, existing) {
    if (existing) return existing;
    if (condition === "CRITICAL") return "CRITICAL";
    if (condition === "POOR" && floodImpacted) return "HIGH";
    if (condition === "POOR")  return "MEDIUM";
    if (floodImpacted)         return "MEDIUM";
    return "LOW";
}

function nextInspDate(inspDate) {
    if (!inspDate) return "";
    const d = new Date(inspDate);
    if (isNaN(d)) return "";
    d.setFullYear(d.getFullYear() + 2);
    return d.toISOString().slice(0, 10);
}

// ── Read existing seed ────────────────────────────────────────────────────
const existingRaw    = fs.readFileSync(SEED_PATH, "utf8").trim().split("\n");
const existingHeader = existingRaw[0];
const existingRows   = existingRaw.slice(1).filter(l => l.trim());
const seenIds = new Set(existingRows.map(l => parseCSVLine(l)[1]));

console.log(`📋  Existing seed rows : ${existingRows.length}`);

// ── Helper: build a seed row array ────────────────────────────────────────
function buildRow(p) {
    // p = plain object with named fields
    const cond       = (p.condition || "FAIR").toUpperCase();
    const posting    = (p.postingStatus || "UNRESTRICTED").toUpperCase();
    const nhvr       = bool(p.nhvrRouteAssessed);
    const flood      = bool(p.floodImpacted);
    const scour      = deriveScourRisk(cond, flood === "true", p.scourRisk || "");

    return [
        randomUUID(),
        p.bridgeId,
        p.name        || "",
        p.region      || "NSW",
        p.state       || "NSW",
        p.structureType || "",
        p.material    || "",
        p.latitude    || "",
        p.longitude   || "",
        "",                              // route_ID
        "",                              // routeKm
        cond,
        p.conditionScore || "",
        p.inspectionDate || "",
        p.yearBuilt   || "",
        p.spanLengthM || "",
        p.deckWidthM  || "",
        p.clearanceHeightM || "",
        posting,
        "true",                          // isActive
        p.lga         || "",
        p.assetOwner  || "TfNSW",
        p.maintenanceAuthority || "TfNSW",
        p.conditionRating || "",
        p.numberOfSpans || "",
        p.numberOfLanes || "",
        p.totalLengthM || "",
        p.widthM      || p.deckWidthM || "",
        p.designLoad  || "T44",
        nhvr,
        p.gazetteRef  || "",
        bool(p.freightRoute),
        bool(p.overMassRoute),
        bool(p.highPriorityAsset),
        flood,
        scour,
        p.aadtVehicles || "",
        p.sourceRefURL || "https://opendata.transport.nsw.gov.au",
        p.nhvrRef     || "",
        p.openDataRef || "",
        p.remarks     || "",
        p.roadRoute   || "",
        p.routeNumber || "",
        "",                              // designStandard
        "",                              // conditionStandard
        "",                              // seismicZone
        nextInspDate(p.inspectionDate),
        "TfNSW Open Data",
        "",                              // bancId
        "",                              // bancURL
        "",                              // primaryExternalSystem
        "",                              // primaryExternalId
        "",                              // primaryExternalURL
    ].map(esc).join(",");
}

// ── Process nsw_bridges_upload.csv ───────────────────────────────────────
const uRaw  = fs.readFileSync(UPLOAD_PATH, "utf8").trim().split("\n");
const uHdr  = parseCSVLine(uRaw[0]);
const uData = uRaw.slice(1).filter(l => l.trim());

const uIdx = {}; uHdr.forEach((h, i) => { uIdx[h.trim()] = i; });

const rows1 = [];
uData.forEach((line, n) => {
    const f = parseCSVLine(line);
    const bridgeId = f[uIdx["bridgeId"]] || "";
    if (!bridgeId || seenIds.has(bridgeId)) return;
    seenIds.add(bridgeId);

    const remarks = f[uIdx["remarks"]] || "";
    const roadMatch  = remarks.match(/Road:\s*([^;]+)/);
    const routeMatch = remarks.match(/Route No:\s*([^;]+)/);

    rows1.push(buildRow({
        bridgeId,
        name              : f[uIdx["name"]],
        region            : f[uIdx["region"]],
        state             : f[uIdx["state"]],
        lga               : f[uIdx["lga"]],
        assetOwner        : f[uIdx["assetOwner"]],
        maintenanceAuthority: f[uIdx["maintenanceAuthority"]],
        structureType     : f[uIdx["structureType"]],
        material          : f[uIdx["material"]],
        yearBuilt         : f[uIdx["yearBuilt"]],
        spanLengthM       : f[uIdx["spanLengthM"]],
        deckWidthM        : f[uIdx["deckWidthM"]],
        totalLengthM      : f[uIdx["totalLengthM"]],
        numberOfSpans     : f[uIdx["numberOfSpans"]],
        numberOfLanes     : f[uIdx["numberOfLanes"]],
        clearanceHeightM  : f[uIdx["clearanceHeightM"]],
        latitude          : f[uIdx["latitude"]],
        longitude         : f[uIdx["longitude"]],
        postingStatus     : f[uIdx["postingStatus"]],
        condition         : f[uIdx["condition"]],
        conditionRating   : f[uIdx["conditionRating"]],
        conditionScore    : f[uIdx["conditionScore"]],
        nhvrRouteAssessed : f[uIdx["nhvrRouteAssessed"]],
        inspectionDate    : f[uIdx["inspectionDate"]],
        aadtVehicles      : f[uIdx["aadtVehicles"]],
        designLoad        : f[uIdx["designLoad"]],
        nhvrRef           : f[uIdx["nhvrRef"]],
        sourceRefURL      : f[uIdx["sourceRefURL"]],
        remarks,
        roadRoute         : roadMatch  ? roadMatch[1].trim()  : "",
        routeNumber       : routeMatch ? routeMatch[1].trim() : "",
    }));
});
console.log(`📥  nsw_bridges_upload rows added  : ${rows1.length}`);

// ── Process NSW_Clearances_MassUpload.csv ────────────────────────────────
const cRaw  = fs.readFileSync(CLEARANCES_PATH, "utf8").trim().split("\n");
const cHdr  = parseCSVLine(cRaw[0]);
const cData = cRaw.slice(1).filter(l => l.trim());

const cIdx = {}; cHdr.forEach((h, i) => { cIdx[h.trim()] = i; });

const rows2 = [];
cData.forEach((line, n) => {
    const f = parseCSVLine(line);
    const bridgeId = f[cIdx["bridgeId"]] || "";
    if (!bridgeId || seenIds.has(bridgeId)) return;
    seenIds.add(bridgeId);

    rows2.push(buildRow({
        bridgeId,
        name              : f[cIdx["name"]],
        region            : f[cIdx["region"]],
        state             : f[cIdx["state"]],
        lga               : f[cIdx["lga"]],
        assetOwner        : f[cIdx["assetOwner"]],
        maintenanceAuthority: f[cIdx["maintenanceAuthority"]],
        structureType     : f[cIdx["structureType"]],
        material          : f[cIdx["material"]],
        yearBuilt         : f[cIdx["yearBuilt"]],
        spanLengthM       : f[cIdx["spanLengthM"]],
        deckWidthM        : f[cIdx["widthM"]],
        totalLengthM      : f[cIdx["totalLengthM"]],
        numberOfSpans     : f[cIdx["numberOfSpans"]],
        numberOfLanes     : f[cIdx["numberOfLanes"]],
        clearanceHeightM  : f[cIdx["clearanceHeightM"]],
        latitude          : f[cIdx["latitude"]],
        longitude         : f[cIdx["longitude"]],
        postingStatus     : f[cIdx["postingStatus"]],
        condition         : f[cIdx["condition"]],
        conditionRating   : f[cIdx["conditionRating"]],
        conditionScore    : "",
        nhvrRouteAssessed : f[cIdx["nhvrRouteAssessed"]],
        inspectionDate    : f[cIdx["inspectionDate"]],
        aadtVehicles      : f[cIdx["aadtVehicles"]],
        designLoad        : f[cIdx["designLoad"]],
        nhvrRef           : f[cIdx["nhvrRef"]],
        sourceRefURL      : f[cIdx["sourceRefURL"]],
        openDataRef       : f[cIdx["openDataRef"]],
        gazetteRef        : f[cIdx["gazetteRef"]],
        freightRoute      : f[cIdx["freightRoute"]],
        overMassRoute     : f[cIdx["overMassRoute"]],
        highPriorityAsset : f[cIdx["highPriorityAsset"]],
        floodImpacted     : f[cIdx["floodImpacted"]],
        scourRisk         : f[cIdx["scourRisk"]],
        roadRoute         : f[cIdx["roadRoute"]],
        routeNumber       : f[cIdx["routeNumber"]],
        remarks           : f[cIdx["remarks"]],
        widthM            : f[cIdx["widthM"]],
    }));
});
console.log(`📥  NSW_Clearances rows added      : ${rows2.length}`);

// ── Write combined seed file ───────────────────────────────────────────────
const output = [existingHeader, ...existingRows, ...rows1, ...rows2].join("\n") + "\n";
fs.writeFileSync(SEED_PATH, output, "utf8");

const total = existingRows.length + rows1.length + rows2.length;
console.log(`\n✅  nhvr-Bridge.csv written — ${total} bridges total`);
console.log(`   ${existingRows.length} existing + ${rows1.length} upload + ${rows2.length} clearances`);
console.log(`   Path: ${SEED_PATH}`);
