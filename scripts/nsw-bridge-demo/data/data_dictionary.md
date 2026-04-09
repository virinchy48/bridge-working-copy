# NSW Bridge Asset Dataset — Data Dictionary

**Dataset:** NSW Bridge Assets — NHVR Permit Assessment
**Version:** 1.0
**Generated:** March 2026
**Record Count:** 150
**CRS:** WGS84 (EPSG:4326)

---

## Files

| File | Format | Description |
|------|--------|-------------|
| `bridges_model.json` | JSON Array | Source-of-truth record array |
| `nsw_bridges.csv` | CSV | Flat tabular export |
| `nsw_bridges.geojson` | GeoJSON | FeatureCollection with LineString geometry |
| `../webapp/model/bridges.json` | JSON Object | UI5 JSONModel (`{ "bridges": [...] }`) |

---

## Field Definitions

### Identity & Location

| Field | Type | Example | Description |
|-------|------|---------|-------------|
| `bridge_id` | String | `NSW_BR_0001` | Unique bridge identifier (NSW_BR + 4-digit zero-padded number) |
| `bridge_name` | String | `Sydney Harbour Bridge` | Official or common name of the bridge structure |
| `lga` | String | `City of Sydney` | NSW Local Government Area in which the bridge is located |
| `region` | String | `Sydney Metro` | Broad NSW transport planning region (see Regions table below) |
| `state` | String | `NSW` | State — always NSW in this dataset |
| `road_route` | String | `Pacific Highway` | Road or highway name on which the bridge is located |
| `route_number` | String | `A1` | Alphanumeric route designation (State Road number or Motorway identifier) |

### Ownership

| Field | Type | Example | Description |
|-------|------|---------|-------------|
| `asset_owner` | String | `Transport for NSW` | Legal owner of the bridge asset |
| `maintenance_authority` | String | `Local Council` | Organisation responsible for ongoing maintenance |

Possible values: `Transport for NSW`, `Roads and Maritime Services`, `Local Council`

### Condition

| Field | Type | Example | Description |
|-------|------|---------|-------------|
| `condition` | Enum | `Good` | Overall bridge condition category |
| `condition_rating` | Integer | `8` | Numeric condition score (1 = Critical, 10 = New/Excellent) |
| `posting_status` | Enum | `Unrestricted` | Current load posting / access restriction status |

**condition values:** `Good` (rating 7–10) · `Fair` (5–6) · `Poor` (3–4) · `Critical` (1–2)

**posting_status values:**

| Value | Description |
|-------|-------------|
| `Unrestricted` | No load restrictions — open to standard legal loads |
| `Posted` | Load posting in place — refer to bridge sign / gazette for limits |
| `Load Limited` | Reduced mass limit applies — SML assessment required |
| `Closed` | Closed to heavy vehicles |

### Physical Attributes

| Field | Type | Unit | Example | Description |
|-------|------|------|---------|-------------|
| `structure_type` | String | — | `Prestressed Concrete Girder` | Structural form of the bridge |
| `material` | Enum | — | `Concrete` | Primary construction material |
| `clearance_height_m` | Float | metres | `5.2` | Minimum vertical clearance under the bridge (critical for over-height vehicles) |
| `main_span_m` | Float | metres | `503.0` | Length of the longest single span |
| `total_length_m` | Float | metres | `1149.0` | Overall bridge length including approach spans |
| `width_m` | Float | metres | `10.5` | Carriageway width (kerb to kerb) |
| `no_of_spans` | Integer | — | `3` | Total number of spans |
| `no_of_lanes` | Integer | — | `4` | Number of traffic lanes |

**structure_type values:** `Prestressed Concrete Girder` · `Steel Truss` · `Concrete Box Girder` · `Timber Girder` · `Reinforced Concrete Arch` · `Cable Stayed` · `Suspension` · `Steel Plate Girder` · `Concrete Slab` · `Composite Girder`

**material values:** `Concrete` · `Steel` · `Timber` · `Composite` · `Masonry`

### Geospatial

| Field | Type | Example | Description |
|-------|------|---------|-------------|
| `latitude` | Float | `-33.8523` | WGS84 decimal degrees, centre of bridge (negative = south) |
| `longitude` | Float | `151.2108` | WGS84 decimal degrees, centre of bridge |

**GeoJSON geometry:** Each feature uses a `LineString` approximating the bridge span, computed from centre point ± half total_length along the predominant road orientation. This is a geometric approximation — use as indicative only; authoritative geometry available from NSW Spatial SEED.

### NHVR & Traffic

| Field | Type | Example | Description |
|-------|------|---------|-------------|
| `nhvr_route_assessed` | Boolean | `true` | Whether the bridge/route has been formally assessed under the NHVR permit framework |
| `over_mass_route` | Boolean | `true` | Whether the bridge is on a gazetted over-mass route (typically B-double / PBS) |
| `gazette_reference` | String | `NSW Gazette 2023-045` | NSW Government Gazette reference for route assessment/approval. Null if not gazetted |
| `aadt` | Integer | `45000` | Annual Average Daily Traffic (all vehicles) — sourced or estimated |
| `freight_route` | Boolean | `true` | Whether the bridge is on a designated NSW freight route |
| `flood_impacted` | Boolean | `false` | Whether the bridge approach or structure is known to be flood-impacted |
| `scour_risk` | Enum | `Medium` | Scour (waterway erosion) risk rating at the bridge site |
| `seismic_zone` | Integer | `1` | Australian seismic hazard zone per AS 1170.4 (1=low, 2=moderate, 3=high) |

**scour_risk values:** `Low` · `Medium` · `High`

### Metadata

| Field | Type | Example | Description |
|-------|------|---------|-------------|
| `data_source` | String | `Transport for NSW Open Data` | Primary source used for this record |
| `source_url` | String | `https://data.nsw.gov.au/...` | URL to the source dataset or record |
| `last_updated` | Date | `2024-06-15` | Date this record was last verified/updated (ISO 8601) |
| `data_confidence` | Enum | `Sourced` | Confidence level of the record's attributes |
| `notes` | String | — | Free-text notes on data provenance, caveats, or flags |

**data_confidence values:**

| Value | Meaning |
|-------|---------|
| `Sourced` | Attributes directly retrieved from an authoritative open data source |
| `Inferred` | Attributes derived from adjacent data, historical records, or engineering judgement |
| `Estimated` | Attributes estimated from similar structures — field verification recommended |

---

## Regions

| Region | Description |
|--------|-------------|
| Sydney Metro | Greater Sydney metropolitan area including all LGAs within the Sydney basin |
| Hunter | Hunter Valley, Newcastle and surrounds |
| Central Coast | Gosford and Wyong LGAs |
| New England | Northern Tablelands — Armidale, Tamworth, Gunnedah, Narrabri |
| North West | Far north-west NSW — Moree, Walgett, Lightning Ridge, Bourke |
| Western NSW | Central-west NSW — Dubbo, Broken Hill, Cobar, Nyngan |
| Riverina | Murrumbidgee / Murray river country — Wagga, Albury, Griffith |
| South East | Shoalhaven south to the Victorian border — Nowra, Batemans Bay, Eden |
| Illawarra | Wollongong and surrounding coastal strip |
| Central West | Orange, Bathurst, Forbes, Cowra, Parkes |
| North Coast | Pacific Highway corridor — Port Macquarie to Tweed Heads |
| Southern Highlands | Tablelands south of Sydney — Goulburn, Moss Vale, Yass |

---

## NHVR Permit Checker — Logic Reference

The app's permit checker applies the following rules (per NHVR Heavy Vehicle National Law):

### Mass Limit Checks

| Permit Class | Steer (t) | Drive (t) | Trailer (t) | GCM (t) |
|-------------|-----------|-----------|-------------|---------|
| Standard (SML) | 6.0 | 16.5 | 20.0 | 42.5 |
| HML | 6.0 | 17.0 | 22.5 | 68.5 |
| PBS Level 1 | 6.0 | 16.5 | 20.0 | 42.5 |
| PBS Level 2 | 6.0 | 17.0 | 22.5 | 62.5 |
| PBS Level 3 | 6.0 | 17.0 | 22.5 | 83.5 |
| PBS Level 4 | 6.0 | 17.0 | 22.5 | 100.0 |
| Oversize | 6.0 | 16.5 | 20.0 | 42.5 |
| Over-Mass | 8.0 | 22.0 | 26.0 | 160.0 |

### Height Clearance Checks

| Permit Class | Min Clearance | Safety Margin Applied |
|-------------|--------------|----------------------|
| Standard / HML / PBS 1–2 | 4.25 m | 0.30 m |
| PBS 3–4 / Oversize / Over-Mass | 4.60 m | 0.30 m |

**Result = Pass** if vehicle height ≤ (bridge clearance − 0.30 m)
**Result = Marginal** if vehicle height ≤ bridge clearance (within margin)
**Result = Fail** if vehicle height > bridge clearance

### Overall Result

| Result | Meaning |
|--------|---------|
| **Compliant** | All checks pass — vehicle can traverse under standard permit conditions |
| **Conditional** | Marginal clearance or route not fully assessed — additional assessment required |
| **Violation** | One or more checks fail — permit cannot be issued without structural assessment |

---

## Data Sources

| Source | Type | URL |
|--------|------|-----|
| Transport for NSW Open Data | Bridge register, AADT | https://data.nsw.gov.au |
| NSW Spatial SEED | Spatial geometry | https://www.seed.nsw.gov.au |
| NHVR Gazetted Routes | Route assessments, gazette references | https://www.nhvr.gov.au |
| OpenStreetMap | Geometry fallback for unregistered structures | https://www.openstreetmap.org |

---

## Limitations & Disclaimer

1. This dataset is a **demonstration dataset** generated for client demonstration purposes.
2. Clearance heights, span lengths, and condition ratings for many regional bridges are **inferred or estimated** — marked via the `data_confidence` field.
3. NHVR gazette references are representative examples only — verify against current official NSW Gazette.
4. GeoJSON LineString geometries are **approximated** from centre-point coordinates — not surveyed geometry.
5. **No operational permit decisions should be made using this dataset.** Always verify via the [NHVR Portal](https://www.nhvr.gov.au) and official TfNSW bridge records.
