#!/bin/bash
# ============================================================
# Build script for NHVR Bridge Lite
# Copies webapp files from main app to app-lite/webapp,
# excluding removed features (Inspections, Defects, WorkOrders,
# Permits, RouteAssessment), then overlays lite-specific overrides.
# ============================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SOURCE="$ROOT/app/bridge-management/webapp"
DEST="$ROOT/app-lite/webapp"

echo "============================================================"
echo " Building NHVR Bridge Lite"
echo " Source : $SOURCE"
echo " Dest   : $DEST"
echo "============================================================"

# ── Create required directories ──────────────────────────────
mkdir -p "$DEST/controller"
mkdir -p "$DEST/view"
mkdir -p "$DEST/model"
mkdir -p "$DEST/util"
mkdir -p "$DEST/config"
mkdir -p "$DEST/ext"
mkdir -p "$DEST/css"
mkdir -p "$DEST/i18n"

# ── Sync all files except removed-feature controllers/views ──
rsync -av "$SOURCE/" "$DEST/" \
  --exclude="controller/Defects.controller.js" \
  --exclude="controller/InspectionDashboard.controller.js" \
  --exclude="controller/InspectionCreate.controller.js" \
  --exclude="controller/WorkOrders.controller.js" \
  --exclude="controller/Permits.controller.js" \
  --exclude="controller/RouteAssessment.controller.js" \
  --exclude="view/Defects.view.xml" \
  --exclude="view/InspectionDashboard.view.xml" \
  --exclude="view/InspectionCreate.view.xml" \
  --exclude="view/WorkOrders.view.xml" \
  --exclude="view/Permits.view.xml" \
  --exclude="view/RouteAssessment.view.xml" \
  --exclude="test/" \
  --exclude="manifest.json" \
  --exclude="i18n/i18n.properties"

# ── Overlay lite-specific manifest, Home view, and i18n ──────
echo ""
echo "Overlaying lite-specific files..."

cp "$ROOT/app-lite/webapp/manifest.json"        "$DEST/manifest.json"
cp "$ROOT/app-lite/webapp/view/Home.view.xml"   "$DEST/view/Home.view.xml"
cp "$ROOT/app-lite/webapp/i18n/i18n.properties" "$DEST/i18n/i18n.properties"

echo ""
echo "============================================================"
echo " Lite build complete!"
echo " Output: $DEST"
echo "============================================================"
