#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "Usage: $0 <X.Y.Z> [--push|--dry-run]" >&2
  exit 2
}

[[ $# -ge 1 && $# -le 2 ]] || usage
VERSION="${1#v}"
MODE="${2:-}"
[[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || usage
[[ -z "$MODE" || "$MODE" == "--push" || "$MODE" == "--dry-run" ]] || usage

TAG="v${VERSION}"
BRANCH="release/${TAG}"
REPOSITORY="${RELEASE_REPOSITORY:-${GITHUB_REPOSITORY:-}}"
if [[ -z "$REPOSITORY" ]]; then
  REPOSITORY="$(gh repo view --json nameWithOwner --jq .nameWithOwner)"
fi

git fetch origin main --tags
if git rev-parse --verify --quiet "refs/tags/${TAG}" >/dev/null; then
  echo "Tag ${TAG} already exists." >&2
  exit 1
fi

BASE_SHA="$(git rev-parse origin/main)"
PREVIOUS_TAG="$(git describe --tags --abbrev=0 "$BASE_SHA" 2>/dev/null || true)"
API_ARGS=(
  --method POST
  "repos/${REPOSITORY}/releases/generate-notes"
  -f "tag_name=${TAG}"
  -f "target_commitish=${BASE_SHA}"
)
if [[ -n "$PREVIOUS_TAG" ]]; then
  API_ARGS+=(-f "previous_tag_name=${PREVIOUS_TAG}")
fi

if [[ "$MODE" == "--dry-run" ]]; then
  gh api "${API_ARGS[@]}" --jq .body
  exit 0
fi

if [[ -n "$(git status --porcelain --untracked-files=no)" ]]; then
  echo "Tracked changes must be committed or stashed first." >&2
  exit 1
fi
if git show-ref --verify --quiet "refs/heads/${BRANCH}" ||
   git ls-remote --exit-code --heads origin "$BRANCH" >/dev/null 2>&1; then
  echo "Release branch ${BRANCH} already exists." >&2
  exit 1
fi

git switch --create "$BRANCH" "$BASE_SHA"
NOTES_FILE="release-notes/${TAG}.md"
mkdir -p release-notes
gh api "${API_ARGS[@]}" --jq .body >"$NOTES_FILE"
[[ -s "$NOTES_FILE" ]] || {
  echo "GitHub generated empty release notes." >&2
  exit 1
}

if grep -Fq "(release-notes/${TAG}.md)" CHANGELOG.md; then
  echo "${TAG} is already listed in CHANGELOG.md." >&2
  exit 1
fi
CHANGELOG_TMP="$(mktemp)"
trap 'rm -f "$CHANGELOG_TMP"' EXIT
awk -v entry="- [${TAG}](release-notes/${TAG}.md)" '
  !inserted && /^- \[v[0-9]/ { print entry; inserted=1 }
  { print }
  END { if (!inserted) print entry }
' CHANGELOG.md >"$CHANGELOG_TMP"
mv "$CHANGELOG_TMP" CHANGELOG.md

git add CHANGELOG.md "$NOTES_FILE"
git commit -m "Prepare release ${TAG}"

if [[ "$MODE" == "--push" ]]; then
  git push --set-upstream origin "$BRANCH"
  gh pr create \
    --repo "$REPOSITORY" \
    --base main \
    --head "$BRANCH" \
    --title "Prepare release ${TAG}" \
    --body "Reviews the exact notes that will be published for ${TAG}. Merging this PR creates the tag and starts the release pipelines."
else
  echo "Prepared ${BRANCH} locally. Review it, then push and open a PR."
fi
