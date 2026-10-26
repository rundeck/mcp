#!/usr/bin/env bash
#
# Prepares a @rundeck/mcp release PR (release/v<VERSION> -> main) with the
# generated CHANGELOG.md section.
#
# Designed to be called either:
#   - By the RBA job "📦 Release MCP (Prepare Changelog PR)" on rdcore
#   - Directly from a local terminal as a manual fallback
#
# Once the PR opened by this script is reviewed and merged into `main`,
# `.github/workflows/release.yml` automatically tags the merge commit (`v<VERSION>`),
# creates the GitHub Release, and triggers CircleCI to publish npm + Docker.
#
# Usage:
#   ./scripts/release/prepare-release.sh <MAJOR.MINOR.PATCH> [--push | --dry-run]

set -euo pipefail

VERSION=""
MODE="--dry-run"

for arg in "$@"; do
  case "$arg" in
    --push)
      MODE="--push"
      ;;
    --dry-run)
      MODE="--dry-run"
      ;;
    --help|-h)
      echo "Usage: ./scripts/release/prepare-release.sh <MAJOR.MINOR.PATCH> [--push | --dry-run]"
      exit 0
      ;;
    -*)
      echo "Error: Unknown flag '$arg'. Expected --push or --dry-run." >&2
      exit 2
      ;;
    *)
      if [ -z "$VERSION" ]; then
        VERSION="${arg#v}"
      else
        echo "Error: Unexpected argument '$arg'." >&2
        exit 2
      fi
      ;;
  esac
done

if [ -z "$VERSION" ]; then
  echo "Error: Missing <MAJOR.MINOR.PATCH> version argument." >&2
  echo "Usage: ./scripts/release/prepare-release.sh <MAJOR.MINOR.PATCH> [--push | --dry-run]" >&2
  exit 2
fi

if ! echo "$VERSION" | grep -qE '^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$'; then
  echo "Error: Invalid version '$VERSION'. Expected MAJOR.MINOR.PATCH (e.g. 1.0.1)." >&2
  exit 2
fi

TAG="v${VERSION}"
BRANCH="release/${TAG}"

if git rev-parse -q --verify "refs/tags/${TAG}" >/dev/null 2>&1; then
  echo "Error: Tag ${TAG} already exists." >&2
  exit 1
fi

if [ "$MODE" = "--dry-run" ]; then
  echo "[release] Dry run for ${TAG} — release notes preview:"
  echo ""
  node scripts/generate-changelog.mjs --release "$VERSION" --notes "$VERSION"
  exit 0
fi

if [ -n "$(git status --porcelain)" ]; then
  echo "Error: Working tree has uncommitted changes. Commit or stash them first." >&2
  exit 1
fi

# Ensure git identity is configured (needed when running on RBA RELEASE nodes)
if [ -z "$(git config user.name || true)" ]; then
  git config user.name "rundeck-ci-build"
fi
if [ -z "$(git config user.email || true)" ]; then
  git config user.email "rundeck-ci-build@pagerduty.com"
fi

echo "[release] Fetching latest origin/main and tags..."
git fetch origin main --tags

if git rev-parse -q --verify "refs/tags/${TAG}" >/dev/null 2>&1; then
  echo "Error: Tag ${TAG} already exists on origin." >&2
  exit 1
fi

echo "[release] Creating branch ${BRANCH} from origin/main..."
git checkout -B "$BRANCH" origin/main

echo "[release] Generating CHANGELOG.md for ${TAG}..."
node scripts/generate-changelog.mjs --release "$VERSION"

NOTES_TMP="$(mktemp)"
trap 'rm -f "$NOTES_TMP"' EXIT
node scripts/generate-changelog.mjs --notes "$VERSION" > "$NOTES_TMP"

git add CHANGELOG.md
if git diff --cached --quiet; then
  echo "Error: CHANGELOG.md already contains ${TAG} with no changes." >&2
  exit 1
fi

git commit -m "[RUN-0000] Release ${TAG}"
echo "[release] Pushing ${BRANCH} to origin..."
git push --force -u origin "$BRANCH"

EXISTING_PR="$(gh pr list --head "$BRANCH" --base main --json number --jq '.[0].number // empty')"
if [ -n "$EXISTING_PR" ]; then
  echo "[release] Updating existing Release PR #${EXISTING_PR} for ${TAG}..."
  gh pr edit "$EXISTING_PR" \
    --title "[RUN-0000] Release ${TAG}" \
    --body-file "$NOTES_TMP"
else
  echo "[release] Opening Pull Request for ${TAG}..."
  gh pr create \
    --base main \
    --head "$BRANCH" \
    --title "[RUN-0000] Release ${TAG}" \
    --body-file "$NOTES_TMP"
fi

echo "[release] Release PR for ${TAG} is ready. Merging that PR into main will automatically tag ${TAG} and trigger the release."
