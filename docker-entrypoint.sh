#!/bin/sh
set -e

DOCS_DEST="/app/docs/docs"
DOCS_BRANCH="${RUNDECK_DOCS_BRANCH:-4.0.x}"
DOCS_URL="https://github.com/rundeck/docs/archive/refs/heads/${DOCS_BRANCH}.tar.gz"

# ── Download docs if not already present ──────────────────────────────────────
if [ -n "$SKIP_RUNDECK_DOCS_DOWNLOAD" ]; then
  : # skip silently
elif [ -n "$RUNDECK_DOCS_PATH" ]; then
  : # external path configured — skip
elif [ -d "$DOCS_DEST" ] && [ "$(ls -A "$DOCS_DEST" 2>/dev/null)" ]; then
  : # already present (e.g. mounted volume) — skip
else
  mkdir -p "$DOCS_DEST"
  if curl -fsSL "$DOCS_URL" | tar xz --strip-components=1 -C "$DOCS_DEST" 2>/dev/null; then
    : # downloaded successfully
  else
    rmdir "$DOCS_DEST" 2>/dev/null || true
  fi
fi

# ── Start MCP server (stdio transport) ────────────────────────────────────────
exec node dist/index.js