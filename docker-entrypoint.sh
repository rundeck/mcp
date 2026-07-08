#!/bin/sh
set -e

DOCS_EXTRACT_DIR="/app"
DOCS_CHECK="/app/docs/docs"
DOCS_BRANCH="${RUNDECK_DOCS_BRANCH:-4.0.x}"
DOCS_URL="https://github.com/rundeck/docs/archive/refs/heads/${DOCS_BRANCH}.tar.gz"

# ── Download docs if not already present ──────────────────────────────────────
if [ -n "$RUNDECK_DOCS_PATH" ]; then
  : # external path configured — skip
elif [ -d "$DOCS_CHECK" ] && [ "$(ls -A "$DOCS_CHECK" 2>/dev/null)" ]; then
  : # already present (e.g. mounted volume) — skip
else
  # strip-components=1 removes the archive root (docs-4.0.x/) so that
  # docs/docs/manual/... lands directly under /app/docs/docs/
  if curl -fsSL "$DOCS_URL" | tar xz --strip-components=1 -C "$DOCS_EXTRACT_DIR" 2>/dev/null; then
    : # downloaded successfully
  fi
fi

# ── Start MCP server (stdio transport) ────────────────────────────────────────
exec node dist/index.js