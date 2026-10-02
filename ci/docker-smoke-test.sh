#!/bin/sh
# Smoke-tests a built rundeck-mcp Docker image: verifies the entrypoint's docs
# fetch (sparse git clone), the resulting /app/docs layout, the
# RUNDECK_DOCS_PATH bypass, `--env-file` handling, the restart/skip-fetch path,
# and that the server actually answers an MCP `initialize` request over stdio.
#
# Usage: ci/docker-smoke-test.sh [image]   (default: rundeck/mcp-ci:latest)
# Deliberately no `set -e` — failing assertions must be recorded via fail()
# and reported at the end, not abort the script early.

IMAGE="${1:-rundeck/mcp-ci:latest}"
FAILED=0

pass() { echo "  PASS: $1"; }
fail() { echo "  FAIL: $1"; FAILED=1; }

cleanup() {
  docker rm -f smoke-run >/dev/null 2>&1 || true
  rm -rf /tmp/smoke-docs
}
trap cleanup EXIT

# A regression here (e.g. reintroducing the full tarball, or an unconditional
# ls-remote round-trip) should fail loudly rather than just being "a bit slower."
# Overridable via env for slower contexts (e.g. QEMU-emulated arm64 in CI).
COLD_START_MAX_SECONDS="${COLD_START_MAX_SECONDS:-15}"

echo "== 1. Cold run: entrypoint fetches docs and starts the server =="
docker rm -f smoke-run >/dev/null 2>&1 || true
START_TIME=$(date +%s)
docker run --name smoke-run "$IMAGE" >/tmp/smoke-run.log 2>&1
EXIT_CODE=$?
END_TIME=$(date +%s)
ELAPSED=$((END_TIME - START_TIME))
[ "$EXIT_CODE" -eq 0 ] && pass "container exited 0" || fail "container exited $EXIT_CODE"
grep -q "docs fetched" /tmp/smoke-run.log && pass "entrypoint reported a successful fetch" || fail "no 'docs fetched' log line"
grep -q "running on stdio" /tmp/smoke-run.log && pass "MCP server started" || fail "server did not report startup"
if [ "$ELAPSED" -le "$COLD_START_MAX_SECONDS" ]; then
  pass "cold start took ${ELAPSED}s (<= ${COLD_START_MAX_SECONDS}s budget)"
else
  fail "cold start took ${ELAPSED}s — exceeds ${COLD_START_MAX_SECONDS}s budget (sparse-clone fetch regressed?)"
fi

echo "== 2. /app/docs layout matches expectations, media tree excluded =="
docker cp smoke-run:/app/docs /tmp/smoke-docs >/dev/null 2>&1
for d in manual api administration developer enterprise history learning rd-cli types upgrading; do
  if [ -d "/tmp/smoke-docs/$d" ] && [ "$(ls -A "/tmp/smoke-docs/$d" 2>/dev/null)" ]; then
    pass "docs/$d present and non-empty"
  else
    fail "docs/$d missing or empty"
  fi
done
[ -f /tmp/smoke-docs/index.md ] && pass "docs/index.md present" || fail "docs/index.md missing"
if [ -f /tmp/smoke-docs/.vuepress/public/files/rundeck-api.yml ]; then
  pass "docs/.vuepress/public/files/rundeck-api.yml present (OpenAPI spec carved back in for api_call validation)"
else
  fail "docs/.vuepress/public/files/rundeck-api.yml missing — api_call request validation would be silently disabled"
fi
# Only that one carved-out file should exist under .vuepress/public — anything else
# means the sparse-checkout exclusion regressed (media bloat came back). `find` on a
# missing directory prints nothing (and we discard its stderr), which would otherwise
# read as a false PASS right after the FAIL above for a missing spec file — guard for
# that explicitly instead of letting it fall through silently.
if [ ! -d /tmp/smoke-docs/.vuepress/public ]; then
  fail "docs/.vuepress/public missing entirely — can't check for media bloat"
else
  UNEXPECTED="$(find /tmp/smoke-docs/.vuepress/public -type f ! -name rundeck-api.yml 2>/dev/null | head -1)"
  if [ -z "$UNEXPECTED" ]; then
    pass "docs/.vuepress/public otherwise excluded (no media bloat)"
  else
    fail "docs/.vuepress/public contains unexpected files (media bloat regressed), e.g.: $UNEXPECTED"
  fi
fi

echo "== 3. Restarting the same container skips the fetch =="
docker start smoke-run >/dev/null
# `timeout` isn't available on stock macOS (only GNU coreutils/Linux) — use it
# when present so a regression that hangs the server can't hang CI forever,
# but degrade to a plain (unbounded) wait for local runs rather than failing.
if command -v timeout >/dev/null 2>&1; then
  timeout 60 docker wait smoke-run >/dev/null || fail "docker wait timed out after 60s — container may be hanging"
else
  docker wait smoke-run >/dev/null
fi
docker logs smoke-run 2>&1 | grep -c "fetching docs" | grep -q '^1$' \
  && pass "docs fetched exactly once across both runs" \
  || fail "docs were fetched more than once, or not skipped on restart"
docker logs smoke-run 2>&1 | grep -q "docs already present" \
  && pass "second run logged the skip" \
  || fail "second run did not log a skip"

echo "== 4. RUNDECK_DOCS_PATH bypasses the fetch entirely =="
docker rm -f smoke-run >/dev/null 2>&1
docker run --name smoke-run -e RUNDECK_DOCS_PATH=/tmp/external-docs "$IMAGE" >/tmp/smoke-bypass.log 2>&1 || true
if grep -q "skipping docs fetch" /tmp/smoke-bypass.log && ! grep -q "fetching docs" /tmp/smoke-bypass.log; then
  pass "RUNDECK_DOCS_PATH skipped the fetch"
else
  fail "RUNDECK_DOCS_PATH did not skip the fetch"
fi

echo "== 5. Server answers a real MCP initialize request =="
docker rm -f smoke-run >/dev/null 2>&1
RESPONSE="$(echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"smoke-test","version":"0.0.1"}}}' \
  | docker run -i --rm "$IMAGE" 2>/dev/null | head -1)"
case "$RESPONSE" in
  *'"result"'*'"rundeck-docs"'*) pass "initialize returned a valid result" ;;
  *) fail "initialize did not return expected result: $RESPONSE" ;;
esac

echo "== 6. --env-file reaches the container exactly like -e =="
ENV_FILE="$(mktemp)"
# Quoted URL + CRLF on purpose: `docker run --env-file` keeps both verbatim,
# and the server is expected to cope (src/config.ts's cleanEnvValue).
printf 'RUNDECK_URL="https://rundeck.example.com/"\r\nRUNDECK_TOKEN=smoke-token\r\nRUNDECK_DOCS_PATH=/tmp/external-docs\r\n' > "$ENV_FILE"
docker rm -f smoke-run >/dev/null 2>&1
docker run --name smoke-run --env-file "$ENV_FILE" "$IMAGE" >/tmp/smoke-envfile.log 2>&1 || true
if grep -q "skipping docs fetch" /tmp/smoke-envfile.log && ! grep -q "fetching docs" /tmp/smoke-envfile.log; then
  pass "variable supplied via --env-file was seen by the entrypoint"
else
  fail "--env-file variable was not seen by the entrypoint"
fi
RESPONSE="$(echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"smoke-test","version":"0.0.1"}}}' \
  | docker run -i --rm --env-file "$ENV_FILE" "$IMAGE" 2>/dev/null | head -1)"
case "$RESPONSE" in
  *'"result"'*'"rundeck-docs"'*) pass "initialize returned a valid result with --env-file" ;;
  *) fail "initialize with --env-file did not return expected result: $RESPONSE" ;;
esac

# RUNDECK_DOCS_BRANCH is read by the entrypoint, not by cleanEnvValue: a CR from
# a CRLF env file must not reach `git clone --branch`.
printf 'RUNDECK_DOCS_BRANCH=4.0.x\r\n' > "$ENV_FILE"
docker rm -f smoke-run >/dev/null 2>&1
docker run --name smoke-run -i --env-file "$ENV_FILE" -e RUNDECK_DOCS_PATH= "$IMAGE" </dev/null >/tmp/smoke-envfile-branch.log 2>&1 || true
if grep -q "fetching docs (branch 4.0.x)" /tmp/smoke-envfile-branch.log; then
  pass "CRLF in RUNDECK_DOCS_BRANCH is stripped by the entrypoint"
else
  fail "CRLF in RUNDECK_DOCS_BRANCH reached the entrypoint's git clone: $(cat /tmp/smoke-envfile-branch.log)"
fi
rm -f "$ENV_FILE"

echo
if [ "$FAILED" -eq 0 ]; then
  echo "All smoke tests passed."
  exit 0
else
  echo "One or more smoke tests failed."
  exit 1
fi
