# NSW Bridge Asset & NHVR Permit Assessment — Demo Application

A complete client-demo application for government and transport agency presentations.
Demonstrates real-world bridge asset management and NHVR heavy vehicle permit route checking over NSW.

---

## Quick Start

### Prerequisites
- Node.js 18+ (for generating output files)
- Any static web server (for running the UI5 app)

### 1. Generate data files

```bash
cd scripts/nsw-bridge-demo
node scripts/generate_outputs.js
```

This creates:
- `webapp/model/bridges.json` — UI5 app data model
- `data/nsw_bridges.geojson` — GeoJSON FeatureCollection
- `data/nsw_bridges.csv` — flat CSV export

### 2. Run the UI5 app

**Option A — Using the SAP CAP server (from project root):**
```bash
# From the project root (21 NHVR APP)
npx cds serve
# Then open: http://localhost:4004/bridge-management/index.html
```

**Option B — Standalone static server:**
```bash
cd scripts/nsw-bridge-demo/webapp
npx serve .
# Opens at http://localhost:3000
```

**Option C — Python (no install):**
```bash
cd scripts/nsw-bridge-demo/webapp
python3 -m http.server 8080
# Opens at http://localhost:8080
```

**Option D — VS Code Live Server:**
Right-click `webapp/index.html` → Open with Live Server

---

## Application Features

### Map View
- Interactive Leaflet.js map centered on NSW
- All 150 bridges plotted as colour-coded markers
- Marker size scales with bridge length
- **Click any marker** to open popup + detail panel
- **Colour coding:**
  - Grey — unassessed / no permit check run
  - Green — compliant after permit check
  - Yellow — conditional (marginal clearance or route check required)
  - Red — violation or bridge closed / load limited

**Filters:** Region · Posting Status · Freight Routes Only

### Bridge List
- Sortable, filterable table of all 150 bridges
- Search by bridge ID, name, LGA, or road route
- Filter by Region, Condition, Posting Status
- **Click any row** → switches to Map View and zooms to bridge
- **Export CSV** button downloads current filtered view

### NHVR Permit Checker
Simulates the NHVR permit assessment for a specified vehicle across all NSW bridges.

**Inputs:**
- Permit Class (Standard, HML, PBS 1–4, Oversize, Over-Mass)
- Gross Vehicle Mass
- Vehicle height, width, length
- Axle group loads (steer, drive, trailer)
- Region and NHVR-assessed route filters

**Output per bridge:**
- Height check (Pass / Marginal / Fail)
- Mass check (Pass / Fail) with axle-level detail
- Route check (Approved / SML Only / Unassessed / Blocked)
- Overall result (Compliant / Conditional / Violation)
- Summary badge counts

After running a check, map markers update to show the permit result colours.

---

## Project Structure

```
scripts/nsw-bridge-demo/
├── data/
│   ├── bridges_model.json        ← Source of truth (150 bridge records)
│   ├── nsw_bridges.csv           ← Generated flat CSV
│   ├── nsw_bridges.geojson       ← Generated GeoJSON FeatureCollection
│   └── data_dictionary.md        ← Full field definitions
├── scripts/
│   └── generate_outputs.js       ← Node.js generator script
└── webapp/                       ← SAP UI5 application
    ├── index.html                ← Entry point
    ├── manifest.json             ← App descriptor
    ├── Component.js              ← UI5 Component
    ├── controller/
    │   └── App.controller.js     ← All app logic (map, table, permit checker)
    ├── view/
    │   └── App.view.xml          ← Full UI layout (3-tab: Map, List, Permit)
    ├── model/
    │   └── bridges.json          ← Generated UI5 JSONModel data
    └── i18n/
        └── i18n.properties       ← Internationalisation strings
```

---

## Dataset Summary (150 NSW Bridges)

| Metric | Value |
|--------|-------|
| Total bridges | 150 |
| Regions covered | 12 |
| NHVR assessed | 112 (75%) |
| On freight routes | 97 (65%) |
| Unrestricted | 120 (80%) |
| Posted / Load Limited | 29 (19%) |
| Closed | 1 (1%) |
| Condition: Good | 98 (65%) |
| Condition: Fair | 43 (29%) |
| Condition: Poor/Critical | 9 (6%) |

### Regional Distribution
| Region | Bridges |
|--------|---------|
| Central West | 23 |
| Riverina | 20 |
| Sydney Metro | 19 |
| South East | 19 |
| Hunter | 17 |
| North Coast | 15 |
| New England | 10 |
| North West | 9 |
| Western NSW | 9 |
| Central Coast | 4 |
| Southern Highlands | 3 |
| Illawarra | 2 |

---

## Key Bridges Included (Sourced)

| Bridge | Road | Length | Clearance | Notable |
|--------|------|--------|-----------|---------|
| Sydney Harbour Bridge | Bradfield Hwy (A8) | 1149 m | 5.0 m | Heritage; 503 m main span |
| Anzac Bridge | Western Distributor (A3) | 805 m | 5.8 m | Cable-stayed; 345 m span |
| Grafton Bridge | Pacific Hwy (A1) | 338 m | 5.5 m | Steel truss; Clarence River |
| Mooney Mooney Creek Bridge | M1 Pacific Motorway | 292 m | 5.5 m | High viaduct |
| Nowra Bridge | Princes Hwy (A1) | 280 m | 5.2 m | Shoalhaven River |
| Batemans Bay Bridge | Kings Hwy / Princes Hwy | 856 m | 5.8 m | New 2023 structure |
| Wagga Wagga Bridge | Olympic Hwy | 165 m | 5.3 m | Murrumbidgee River |
| Albury Bridge | Hume Hwy (A23) | 290 m | 5.5 m | Murray River |
| Pheasants Nest Bridge | M1 Hume Motorway | 268 m | 5.5 m | Major motorway viaduct |

---

## Data Sources & Confidence

| Source | Records | Confidence |
|--------|---------|------------|
| Transport for NSW Open Data | ~30 | Sourced |
| NSW Spatial SEED | ~25 | Sourced |
| NHVR Gazetted Routes | ~20 | Sourced |
| Inferred from engineering standards | ~55 | Inferred |
| Estimated (similar structures) | ~20 | Estimated |

**Key URLs:**
- TfNSW Open Data: https://data.nsw.gov.au
- NSW Spatial SEED: https://www.seed.nsw.gov.au
- NHVR Portal: https://www.nhvr.gov.au
- Digital Twin NSW: https://www.digitaltwin.nsw.gov.au

---

## NHVR Permit Logic

The permit checker implements HVNL-compliant assessment:

1. **Height validation** — vehicle height vs bridge clearance with 300 mm safety margin
2. **Mass validation** — per axle group against SML / HML / PBS limits
3. **Route check** — posting status + NHVR gazetting + over-mass route flag
4. **Overall determination** — Compliant / Conditional / Violation

See `data/data_dictionary.md` for full logic tables.

---

## Assumptions & Limitations

1. **Clearance heights** for bridges not in the TfNSW open dataset are estimated based on road classification and construction era (typically 4.5–5.5 m for post-1990 arterial bridges, 4.25–4.8 m for older structures).
2. **Coordinates** are accurate to within ~200 m for all named bridges; rural bridges use town-centre offsets.
3. **GeoJSON LineStrings** are geometric approximations (centre ± half-length along road axis) — not surveyed alignments.
4. **AADT figures** for regional bridges are estimates derived from TfNSW traffic count stations on adjacent road sections.
5. **Gazette references** follow real NSW Gazette numbering conventions but are representative examples.
6. **Seismic zones** follow AS 1170.4 — zone 1 for most of NSW, zone 2 for parts of the Illawarra and Hunter.
7. This application is for **demonstration purposes only**. Operational NHVR permit decisions must use the official NHVR Portal and current TfNSW bridge records.

---

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Frontend framework | SAP UI5 1.120 (Horizon theme) |
| Map library | Leaflet.js 1.9.4 |
| Map tiles | OpenStreetMap |
| Data model | SAP UI5 JSONModel |
| Permit logic | Pure JavaScript |
| Data generation | Node.js 18 |
| No build step required | ✔ |

---

*Built for NHVR client demonstration — Transport for NSW · March 2026*
