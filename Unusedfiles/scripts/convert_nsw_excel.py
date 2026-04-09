#!/usr/bin/env python3
"""
Convert NSW_Bridge_Data_NHVR.xlsx to mass-upload CSV format
and POST to local CDS server.
Valid Bridge schema fields only — no suburb, roadRoute, etc.
"""

import openpyxl
import csv
import io
import json
import urllib.request
import urllib.error
import base64

EXCEL_PATH = "NSW_Bridge_Data_NHVR.xlsx"

BRIDGE_ENDPOINT      = "http://localhost:4004/bridge-management/massUploadBridges"
RESTRICTION_ENDPOINT = "http://localhost:4004/bridge-management/massUploadRestrictions"
CREDENTIALS = "admin:admin"

# Condition text → (condition enum, conditionRating int)
CONDITION_MAP = {
    "excellent": ("GOOD", 9),
    "good":      ("GOOD", 7),
    "fair":      ("FAIR", 5),
    "poor":      ("POOR", 3),
    "critical":  ("CRITICAL", 1),
    "very poor": ("POOR", 2),
}

# Posting status → enum
POSTING_MAP = {
    "active":   "UNRESTRICTED",
    "heritage": "POSTED",
    "posted":   "POSTED",
    "closed":   "CLOSED",
    "":         "UNRESTRICTED",
}

# Only valid Bridge entity columns (base + extend)
BRIDGE_HEADERS = [
    "bridgeId", "name", "state", "region", "lga", "assetOwner",
    "assetClass", "structureType", "material",
    "yearBuilt", "spanLengthM", "deckWidthM", "totalLengthM",
    "numberOfSpans", "numberOfLanes", "clearanceHeightM",
    "latitude", "longitude",
    "postingStatus", "condition", "conditionRating", "conditionScore",
    "nhvrRouteAssessed", "operationalStatus", "criticality",
    "inspectionDate", "aadtVehicles", "remarks",
    "maintenanceAuthority", "designLoad", "nhvrRef", "sourceRefURL",
]

# Restriction CSV columns for massUploadRestrictions
RESTRICTION_HEADERS = [
    "bridgeId", "restrictionType", "value", "unit",
    "direction", "status", "permitRequired", "notes",
]

def safe_str(v):
    if v is None:
        return ""
    return str(v).strip()

def safe_float(v):
    if v is None or str(v).strip() == "":
        return ""
    try:
        return str(float(str(v).strip()))
    except Exception:
        return ""

def safe_int(v):
    if v is None or str(v).strip() == "":
        return ""
    try:
        return str(int(float(str(v).strip())))
    except Exception:
        return ""

def safe_date(v):
    if v is None:
        return ""
    import datetime
    if isinstance(v, (datetime.datetime, datetime.date)):
        return v.strftime("%Y-%m-%d")
    s = str(v).strip()
    if not s:
        return ""
    for fmt in ("%d/%m/%Y", "%Y-%m-%d", "%m/%d/%Y"):
        try:
            return datetime.datetime.strptime(s, fmt).strftime("%Y-%m-%d")
        except Exception:
            pass
    return s

def map_condition(raw):
    if not raw:
        return ("", "")
    key = raw.strip().lower()
    return CONDITION_MAP.get(key, ("", ""))

def map_posting(raw):
    if not raw:
        return "UNRESTRICTED"
    key = raw.strip().lower()
    return POSTING_MAP.get(key, "UNRESTRICTED")

def load_excel():
    print(f"Loading: {EXCEL_PATH}")
    wb = openpyxl.load_workbook(EXCEL_PATH, read_only=True, data_only=True)
    ws = wb.active
    rows = list(ws.iter_rows(values_only=True))
    header_row = rows[0]
    headers = [str(h).strip() if h is not None else "" for h in header_row]
    print(f"Source columns ({len(headers)}): {headers}")
    print(f"Data rows: {len(rows) - 1}")

    # Build column index map (case-insensitive, strip spaces)
    col = {}
    for i, h in enumerate(headers):
        col[h.lower()] = i

    def get(row, *names):
        for name in names:
            idx = col.get(name.lower())
            if idx is not None and idx < len(row):
                v = row[idx]
                if v is not None:
                    return v
        return None

    bridge_rows = []
    restriction_rows = []
    seen_ids = set()
    from collections import Counter
    posting_counts = Counter()
    condition_counts = Counter()

    for i, row in enumerate(rows[1:], start=2):
        bridge_id = safe_str(get(row, "Structure Number"))
        if not bridge_id:
            bridge_id = f"NSW-{i:05d}"
        if bridge_id in seen_ids:
            bridge_id = f"{bridge_id}-{i}"
        seen_ids.add(bridge_id)

        name = safe_str(get(row, "Asset Name"))
        state = "NSW"
        # Suburb Locality is the most specific location → use as region
        region = safe_str(get(row, "Suburb Locality"))
        lga = safe_str(get(row, "LGA"))
        asset_owner = safe_str(get(row, "Road Manager"))
        # Normalise all TfNSW variants → "TfNSW"
        if not asset_owner or asset_owner.lower() in (
            "transport for nsw", "tfnsw", "transport for new south wales",
            "nsw roads", "roads and maritime services", "rms"
        ):
            asset_owner = "TfNSW"

        structure_type = safe_str(get(row, "Structure Type"))
        material = safe_str(get(row, "Material Superstructure"))
        year_built = safe_int(get(row, "Year Built"))
        span_length = safe_float(get(row, "Max Span Length m"))
        deck_width = safe_float(get(row, "Deck Width m"))
        total_length = safe_float(get(row, "Overall Length m"))
        num_spans = safe_int(get(row, "Number of Spans"))
        num_lanes = safe_int(get(row, "Number of Lanes"))
        clearance = safe_float(get(row, "Vertical Clearance m"))
        lat = safe_float(get(row, "Latitude"))
        lng = safe_float(get(row, "Longitude"))

        # Asset Status = "Active"|"Heritage" maps to postingStatus
        asset_status = safe_str(get(row, "Asset Status"))
        posting_status = map_posting(asset_status)
        posting_counts[asset_status or "(blank)"] += 1

        # Condition Rating is the condition text column (only 30/961 rows filled)
        condition_raw = safe_str(get(row, "Condition Rating"))
        condition_counts[condition_raw or "(blank)"] += 1
        cond_enum, cond_rating = map_condition(condition_raw)

        # NHVR Network: "Approved Route"|"National Network" → assessed; "Off Network" → not
        nhvr_raw = safe_str(get(row, "NHVR Network"))
        nhvr_assessed = "true" if nhvr_raw.lower() in ("approved route", "national network", "yes", "true", "1") else "false"

        # HML Approved
        hml_raw = safe_str(get(row, "HML Approved"))
        if hml_raw.lower() in ("yes", "conditional"):
            over_mass = "true"
        else:
            over_mass = "false"

        inspection_date = safe_date(get(row, "Last Inspection Date"))

        # Build remarks from extra fields not in schema
        road_name      = safe_str(get(row, "Road Name"))
        road_number    = safe_str(get(row, "Road Number"))
        road_class     = safe_str(get(row, "Road Classification"))
        heritage       = safe_str(get(row, "Heritage Listed"))
        condition_cmt  = safe_str(get(row, "Condition Comments"))
        data_src       = safe_str(get(row, "Data Source"))
        assessment_tier = safe_str(get(row, "Bridge Assessment Tier"))
        speed_limit    = safe_str(get(row, "Speed Limit kmh"))
        waterway       = safe_str(get(row, "Waterway Name"))

        remarks_parts = []
        if road_name:        remarks_parts.append(f"Road: {road_name}")
        if road_number:      remarks_parts.append(f"Route No: {road_number}")
        if road_class:       remarks_parts.append(f"Class: {road_class}")
        if heritage == "Yes": remarks_parts.append("Heritage listed")
        if condition_cmt:    remarks_parts.append(condition_cmt)
        if assessment_tier:  remarks_parts.append(f"Tier: {assessment_tier}")
        if speed_limit:      remarks_parts.append(f"Speed: {speed_limit} km/h")
        if waterway:         remarks_parts.append(f"Waterway: {waterway}")
        if data_src:         remarks_parts.append(f"Source: {data_src}")
        remarks = "; ".join(remarks_parts)

        speed = safe_int(get(row, "Speed Limit kmh"))
        design_load = safe_str(get(row, "Design Load Standard"))

        bridge_rows.append({
            "bridgeId":           bridge_id,
            "name":               name if name else bridge_id,
            "state":              state,
            "region":             region,
            "lga":                lga,
            "assetOwner":         asset_owner,
            "assetClass":         "BRIDGE",
            "structureType":      structure_type,
            "material":           material,
            "yearBuilt":          year_built,
            "spanLengthM":        span_length,
            "deckWidthM":         deck_width,
            "totalLengthM":       total_length,
            "numberOfSpans":      num_spans,
            "numberOfLanes":      num_lanes,
            "clearanceHeightM":   clearance,
            "latitude":           lat,
            "longitude":          lng,
            "postingStatus":      posting_status,
            "condition":          cond_enum,
            "conditionRating":    cond_rating,
            "conditionScore":     "",
            "nhvrRouteAssessed":  nhvr_assessed,
            "operationalStatus":  "OPERATIONAL",
            "criticality":        "STANDARD",
            "inspectionDate":     inspection_date,
            "aadtVehicles":       "",
            "remarks":            remarks,
            "maintenanceAuthority": "",
            "designLoad":         design_load,
            "nhvrRef":            "",
            "sourceRefURL":       "",
        })

        # GVM restriction
        gvm = safe_float(get(row, "Load Limit GVM t"))
        if gvm:
            restriction_rows.append({
                "bridgeId":        bridge_id,
                "restrictionType": "GROSS_MASS",
                "value":           gvm,
                "unit":            "t",
                "direction":       "BOTH",
                "status":          "ACTIVE",
                "permitRequired":  "false",
                "notes":           "GVM load limit from NSW asset register",
            })

    print(f"\nConverted {len(bridge_rows)} bridges, {len(restriction_rows)} GVM restrictions")
    print("\nPosting Status distribution:")
    for k, v in posting_counts.most_common():
        print(f"  {k!r}: {v}")
    print("\nCondition distribution:")
    for k, v in condition_counts.most_common():
        print(f"  {k!r}: {v}")

    return bridge_rows, restriction_rows

def rows_to_csv(rows, headers):
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=headers, extrasaction='ignore', lineterminator='\n')
    writer.writeheader()
    for r in rows:
        writer.writerow(r)
    return buf.getvalue()

def post_csv(endpoint, csv_data, label):
    payload = json.dumps({"csvData": csv_data}).encode("utf-8")
    creds = base64.b64encode(CREDENTIALS.encode()).decode()
    req = urllib.request.Request(
        endpoint, data=payload,
        headers={"Content-Type": "application/json", "Authorization": f"Basic {creds}"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            body = resp.read().decode("utf-8")
            data = json.loads(body)
            print(f"  {label}: {data.get('status')} — "
                  f"{data.get('successCount',0)} created, "
                  f"{data.get('updatedCount',0)} updated, "
                  f"{data.get('failureCount',0)} failed")
            if data.get('errors'):
                # Show first 3 errors
                errs = data['errors'].split('\n')[:3]
                for e in errs:
                    if e: print(f"    ERR: {e}")
            return data.get('failureCount', 0) == 0
    except urllib.error.HTTPError as e:
        print(f"  {label}: HTTP {e.code} — {e.read().decode()[:300]}")
        return False
    except Exception as ex:
        print(f"  {label}: {ex}")
        return False

def main():
    bridge_rows, restriction_rows = load_excel()

    # Write CSVs for inspection
    bridge_csv = rows_to_csv(bridge_rows, BRIDGE_HEADERS)
    rest_csv   = rows_to_csv(restriction_rows, RESTRICTION_HEADERS)
    with open("/Users/siddharthaampolu/21 NHVR APP/scripts/nsw_bridges_upload.csv", "w") as f:
        f.write(bridge_csv)
    with open("/Users/siddharthaampolu/21 NHVR APP/scripts/nsw_restrictions_upload.csv", "w") as f:
        f.write(rest_csv)
    print(f"\nCSVs written. Bridge: {len(bridge_csv):,} chars | Restrictions: {len(rest_csv):,} chars")

    # Upload bridges in batches of 200
    BATCH = 200
    total = len(bridge_rows)
    total_created = total_updated = total_failed = 0
    print(f"\n=== Uploading {total} bridges in batches of {BATCH} ===")
    for start in range(0, total, BATCH):
        batch = bridge_rows[start:start+BATCH]
        csv_data = rows_to_csv(batch, BRIDGE_HEADERS)
        payload = json.dumps({"csvData": csv_data}).encode("utf-8")
        creds = base64.b64encode(CREDENTIALS.encode()).decode()
        req = urllib.request.Request(
            BRIDGE_ENDPOINT, data=payload,
            headers={"Content-Type": "application/json", "Authorization": f"Basic {creds}"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=120) as resp:
                data = json.loads(resp.read().decode())
                c = data.get('successCount', 0)
                u = data.get('updatedCount', 0)
                f2 = data.get('failureCount', 0)
                total_created += c; total_updated += u; total_failed += f2
                status = data.get('status', '?')
                print(f"  Batch {start//BATCH+1} ({len(batch)} rows): {status} — "
                      f"{c} created, {u} updated, {f2} failed")
                if f2 > 0 and data.get('errors'):
                    errs = data['errors'].split('\n')[:2]
                    for e in errs:
                        if e: print(f"    ERR: {e}")
        except Exception as ex:
            print(f"  Batch {start//BATCH+1}: EXCEPTION — {ex}")
            total_failed += len(batch)

    print(f"\nBridge upload complete: {total_created} created, {total_updated} updated, {total_failed} failed")

    # Upload restrictions
    if restriction_rows:
        print(f"\n=== Uploading {len(restriction_rows)} GVM restrictions ===")
        rest_csv_data = rows_to_csv(restriction_rows, RESTRICTION_HEADERS)
        post_csv(RESTRICTION_ENDPOINT, rest_csv_data, f"{len(restriction_rows)} restrictions")

    print("\nAll done!")

if __name__ == "__main__":
    main()
