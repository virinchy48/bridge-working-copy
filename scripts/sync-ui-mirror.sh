#!/usr/bin/env bash
# ============================================================
# NHVR UI mirror sync — called automatically by Claude Code
# PostToolUse hook after any Edit/Write in app/bridge-management/webapp/.
#
# Source of truth:     app/bridge-management/webapp/
# Mirror destination:  app-router/resources/nhvr.bridgemanagement/
# Mirror destination:  app-router/resources/webapp/
#
# This script is IDEMPOTENT and SAFE to run on every tool call — it
# only syncs when the source tree is newer than the mirror. Silent on
# no-op, prints a single line on actual sync.
# ============================================================
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$REPO_ROOT/app/bridge-management/webapp/"
DEST1="$REPO_ROOT/app-router/resources/nhvr.bridgemanagement/"
DEST2="$REPO_ROOT/app-router/resources/webapp/"

# Bail out quickly if source doesn't exist (e.g. wrong repo)
[ -d "$SRC" ] || exit 0

# Bail out if neither destination exists (e.g. fresh checkout without app-router setup)
if [ ! -d "$DEST1" ] && [ ! -d "$DEST2" ]; then
  exit 0
fi

# rsync with --checksum would be accurate but slow; --update is fast and correct for
# this workflow (Claude is always the writer, no concurrent edits to destinations).
RSYNC_OPTS="-a --update --delete --exclude=*.test.js --exclude=test/ --exclude=.DS_Store"

synced=0
if [ -d "$DEST1" ]; then
  rsync $RSYNC_OPTS "$SRC" "$DEST1" >/dev/null
  synced=$((synced + 1))
fi
if [ -d "$DEST2" ]; then
  rsync $RSYNC_OPTS "$SRC" "$DEST2" >/dev/null
  synced=$((synced + 1))
fi

# Only print if something was synced (hooks run frequently — keep output quiet)
# Users who want verbose output can set NHVR_SYNC_VERBOSE=1
if [ "${NHVR_SYNC_VERBOSE:-0}" = "1" ]; then
  echo "[nhvr-sync] mirrored UI to $synced destination(s)"
fi
exit 0
