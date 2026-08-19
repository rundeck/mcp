#!/bin/sh
set -e

DOCS_DIR="/app/docs"
DOCS_BRANCH="${RUNDECK_DOCS_BRANCH:-4.0.x}"
DOCS_REPO="https://github.com/rundeck/docs.git"

log() {
  # `|| true`: this is called as a bare top-level statement in several places
  # (including right before `exec node`) — under `set -e`, a broken/closed
  # stderr making this echo fail would otherwise abort the whole entrypoint.
  echo "[entrypoint $(date -u +%H:%M:%S)] $*" >&2 || true
}

# ── Fetch docs via a sparse partial clone (skips the media-heavy .vuepress/public
# tree, so it's ~4s / ~2MB instead of ~35s / ~200MB for the full tarball), except
# for rundeck-api.yml — the OpenAPI spec api_call validates requests against —
# which is carved back in explicitly since it lives under that excluded tree. ──
fetch_docs() {
  log "fetching docs (branch ${DOCS_BRANCH})"
  # Under `set -e`, any standalone (non-conditional) command's failure aborts
  # the whole script — including this whole function's caller — so every
  # command below must be wired into an if/||  so a docs-fetch problem can
  # never prevent the MCP server from starting.
  tmp_dir="$(mktemp -d)" || { log "docs fetch failed — starting without docs"; return 0; }

  # Run the actual clone in the background so we can poll it and log a
  # heads-up if it's taking unusually long (e.g. a slow/blocked network path
  # to github.com) instead of leaving the MCP client staring at a silent
  # stdio handshake with no indication of what's happening or why.
  # mkdir + find (clearing $DOCS_DIR's contents rather than removing the
  # directory itself, since it may be a mount point) + cp are part of this
  # same && chain (the if's condition) deliberately — only the condition of
  # an if is exempt from set -e's abort-on-failure, so a failing command
  # inside the `then` body would NOT be exempt.
  (
    if git clone --quiet --depth 1 --filter=blob:none --sparse --branch "$DOCS_BRANCH" "$DOCS_REPO" "$tmp_dir" \
        && (cd "$tmp_dir" && git sparse-checkout set --no-cone '/docs/**' '!/docs/.vuepress/public/**' '/docs/.vuepress/public/files/rundeck-api.yml') \
        && mkdir -p "$DOCS_DIR" \
        && find "$DOCS_DIR" -mindepth 1 -maxdepth 1 -exec rm -rf {} + \
        && cp -r "$tmp_dir/docs/." "$DOCS_DIR/"; then
      exit 0
    else
      exit 1
    fi
  ) &
  clone_pid=$!

  waited=0
  slow_warn_seconds=10
  while kill -0 "$clone_pid" 2>/dev/null; do
    sleep 1
    waited=$((waited + 1))
    if [ "$waited" -eq "$slow_warn_seconds" ]; then
      log "docs fetch is taking longer than ${slow_warn_seconds}s — check network connectivity to github.com; the MCP server will start once it finishes (or fails)"
    fi
  done

  if wait "$clone_pid"; then
    log "docs fetched"
  else
    log "docs fetch failed — starting without docs"
  fi
  rm -rf "$tmp_dir" || true
}

if [ -n "$RUNDECK_DOCS_PATH" ]; then
  log "RUNDECK_DOCS_PATH set — skipping docs fetch"
elif [ -d "$DOCS_DIR" ] && [ "$(ls -A "$DOCS_DIR" 2>/dev/null)" ]; then
  log "docs already present at $DOCS_DIR — skipping fetch"
else
  # `|| true`: fetch_docs is written to always return 0 itself, but this is
  # cheap insurance against a future edit inside it reintroducing a path that
  # doesn't — this call must never be what aborts the entrypoint.
  fetch_docs || true
fi

log "starting MCP server"
# ── Start MCP server (stdio transport) ────────────────────────────────────────
exec node dist/index.js
