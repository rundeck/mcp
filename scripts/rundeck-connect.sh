#!/bin/sh
# Loads a Rundeck multi-instance registry into RUNDECK_INSTANCES and launches
# Claude Code so the MCP server (however it's spawned — local process, Docker,
# or `uvx runlayer run ...`) inherits it as an ambient env var. Nobody has to
# hand-type or escape JSON into an add-json payload; the registry stays a
# normal file the user edits directly.
#
# Usage:
#   ./scripts/rundeck-connect.sh ~/.rundeck-mcp/instances.json [-- claude args...]
#
# Registry file shape:
#   {
#     "default": "prod",
#     "instances": {
#       "prod":    { "url": "https://rundeck-prod.example.com",    "token": "prod-token" },
#       "staging": { "url": "https://rundeck-staging.example.com", "token": "staging-token" }
#     }
#   }
set -e

INSTANCES_FILE="$1"
if [ -z "$INSTANCES_FILE" ]; then
  echo "Usage: $0 <instances.json> [claude args...]" >&2
  exit 1
fi
shift

if [ ! -f "$INSTANCES_FILE" ]; then
  echo "No such file: $INSTANCES_FILE" >&2
  exit 1
fi

# Warn (don't block) if the registry is readable by anyone other than its
# owner — it holds live API tokens. `stat` flags differ between BSD/macOS
# and GNU/Linux, so try both instead of assuming one.
PERM_BITS="$(stat -f '%Lp' "$INSTANCES_FILE" 2>/dev/null || stat -c '%a' "$INSTANCES_FILE" 2>/dev/null || true)"
case "$PERM_BITS" in
  # 3 digits (e.g. 644) or 4 (e.g. 4755, when setuid/setgid/sticky bits are set).
  [0-7][0-7][0-7] | [0-7][0-7][0-7][0-7])
    GROUP_OTHER="$(printf '%s' "$PERM_BITS" | tail -c 2)"
    if [ "$GROUP_OTHER" != "00" ]; then
      echo "Warning: $INSTANCES_FILE is readable by group/other (mode $PERM_BITS)." >&2
      echo "It contains live API tokens — consider: chmod 600 $INSTANCES_FILE" >&2
    fi
    ;;
esac

# Validate shape before exporting anything, and print the registered instance
# names (only names — never url/token values) on success so the notice below
# can report how many tokens are about to be bundled into one env var.
if command -v node >/dev/null 2>&1; then
  NAMES_LIST="$(node --input-type=module -e '
    import { readFileSync } from "fs";
    const path = process.argv[1];
    let registry;
    try {
      registry = JSON.parse(readFileSync(path, "utf8"));
    } catch {
      // Deliberately not printing the parser error message: it can quote a
      // fragment of the malformed input, which may contain a token.
      console.error(`Invalid JSON in ${path}.`);
      process.exit(1);
    }
    if (typeof registry !== "object" || registry === null || Array.isArray(registry)) {
      console.error(`${path} must contain a JSON object with "default" and "instances".`);
      process.exit(1);
    }
    const { default: def, instances } = registry;
    if (!instances || typeof instances !== "object") {
      console.error(`${path} is missing an "instances" object.`);
      process.exit(1);
    }
    const names = Object.keys(instances);
    if (names.length === 0) {
      console.error(`${path} has no instances defined under "instances".`);
      process.exit(1);
    }
    for (const name of names) {
      const entry = instances[name];
      if (!entry || !entry.url || !entry.token) {
        console.error(`Instance "${name}" is missing "url" or "token".`);
        process.exit(1);
      }
    }
    if (def !== undefined && !names.includes(def)) {
      console.error(`"default": "${def}" does not match any registered instance (${names.join(", ")}).`);
      process.exit(1);
    }
    console.log(names.join(","));
  ' "$INSTANCES_FILE")" || exit 1

  NAME_COUNT="$(printf '%s' "$NAMES_LIST" | tr ',' '\n' | grep -c .)"
  if [ "$NAME_COUNT" -gt 1 ]; then
    echo "Note: $INSTANCES_FILE bundles $NAME_COUNT instances into one token blob ($NAMES_LIST)." >&2
    echo "A single leak of RUNDECK_INSTANCES (e.g. via 'docker inspect' or process env) exposes all $NAME_COUNT tokens at once, not just one — keep only instances you're comfortable bundling that way in this file." >&2
  fi
else
  echo "Warning: 'node' not found on PATH — skipping shape validation of $INSTANCES_FILE." >&2
  echo "The file will be exported to RUNDECK_INSTANCES as-is; a malformed registry will only surface as an error once Claude connects." >&2
fi

# Content only ever lands in this shell's exported env, never printed,
# never echoed — it's inherited by `claude` and whatever it spawns.
RUNDECK_INSTANCES="$(cat "$INSTANCES_FILE")"
export RUNDECK_INSTANCES

if ! command -v claude >/dev/null 2>&1; then
  echo "claude CLI not found on PATH — install it first, then re-run this script." >&2
  exit 1
fi

exec claude "$@"
