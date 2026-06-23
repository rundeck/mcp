#!/bin/bash
REPO_ROOT="$(git -C "$(dirname "$0")" rev-parse --show-toplevel)"
set -a && source "$REPO_ROOT/.env" && set +a

pkill -f "dist/http.js" 2>/dev/null
sleep 1

node "$REPO_ROOT/dist/http.js" &
echo "[rundeck-mcp] Started → $RUNDECK_URL (port $MCP_HTTP_PORT)"