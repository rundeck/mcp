#!/bin/sh
set -e

DOCS_DIR="/app/docs"
DOCS_BRANCH="${RUNDECK_DOCS_BRANCH:-4.0.x}"
DOCS_REPO="https://github.com/rundeck/docs.git"

log() {
  echo "[entrypoint $(date -u +%H:%M:%S)] $*" >&2
}

# ── Fetch docs via a sparse partial clone (skips the media-heavy .vuepress/public
# tree, so it's ~4s / ~2MB instead of ~35s / ~200MB for the full tarball) ──────
fetch_docs() {
  log "fetching docs (branch ${DOCS_BRANCH})"
  tmp_dir="$(mktemp -d)"
  if git clone --quiet --depth 1 --filter=blob:none --sparse --branch "$DOCS_BRANCH" "$DOCS_REPO" "$tmp_dir" \
      && (cd "$tmp_dir" && git sparse-checkout set --no-cone '/docs/**' '!/docs/.vuepress/public/**'); then
    # clear contents rather than removing $DOCS_DIR itself — it may be a mount point
    mkdir -p "$DOCS_DIR"
    find "$DOCS_DIR" -mindepth 1 -maxdepth 1 -exec rm -rf {} +
    cp -r "$tmp_dir/docs/." "$DOCS_DIR/"
    log "docs fetched"
  else
    log "docs fetch failed — starting without docs"
  fi
  rm -rf "$tmp_dir"
}

if [ -n "$RUNDECK_DOCS_PATH" ]; then
  log "RUNDECK_DOCS_PATH set — skipping docs fetch"
elif [ -d "$DOCS_DIR" ] && [ "$(ls -A "$DOCS_DIR" 2>/dev/null)" ]; then
  log "docs already present at $DOCS_DIR — skipping fetch"
else
  fetch_docs
fi

log "starting MCP server"
# ── Start MCP server (stdio transport) ────────────────────────────────────────
exec node dist/index.js
