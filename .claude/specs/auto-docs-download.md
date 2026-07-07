# Spec: Automatic Rundeck Documentation Download on Install

## Problem

The MCP server serves Rundeck documentation to AI assistants via `rundeck://` URIs. Previously, the documentation had to be present on the local filesystem and pointed to via the `RUNDECK_DOCS_PATH` environment variable. On-premise clients had no clear way to obtain the docs — they had to source them separately, configure the path manually, and manage updates themselves.

## Solution

Add a `postinstall` npm script that automatically downloads the Rundeck documentation from the official public GitHub repository (`github.com/rundeck/docs`) into the `docs/` directory of the package. The `ConfigManager` already resolves `{cwd}/docs/docs` as its first candidate path, so no code changes are required beyond the download script.

## Implementation

### New file: `scripts/download-docs.mjs`

A plain ESM script (no TypeScript compilation required) that runs after `npm install`. It:

1. Evaluates skip conditions in order (exits 0 on any match):
   - `SKIP_RUNDECK_DOCS_DOWNLOAD=1` is set
   - `RUNDECK_DOCS_PATH` is set (user manages docs manually)
   - `docs/` already exists at the package root

2. Downloads the docs tarball via `curl` from GitHub:
   ```
   https://github.com/rundeck/docs/archive/refs/heads/{RUNDECK_DOCS_BRANCH}.tar.gz
   ```

3. Extracts it with `tar --strip-components=1` directly into `docs/`, producing:
   ```
   docs/
   └── docs/
       ├── manual/
       ├── learning/
       ├── administration/
       ├── api/
       ├── developer/
       └── rd-cli/
   ```

4. On failure (no internet, wrong branch, `curl`/`tar` unavailable): cleans up the empty `docs/` directory, prints a warning with remediation steps, and exits 0 so the install is not blocked.

### Changes to `package.json`

```json
"scripts": {
  "postinstall": "node scripts/download-docs.mjs",
  "docs:update": "node scripts/download-docs.mjs --force"
}
```

### Changes to `.gitignore`

`docs/` is added so downloaded documentation is never committed to the repository.

## Configuration

| Environment variable | Default | Description |
|---|---|---|
| `RUNDECK_DOCS_BRANCH` | `4.0.x` | Branch of `rundeck/docs` to download |
| `RUNDECK_DOCS_PATH` | — | If set, skips automatic download entirely |
| `SKIP_RUNDECK_DOCS_DOWNLOAD` | — | Set to `1` to skip download (useful in CI) |

## Client Installation Flow

### First install (on-premise)

```bash
git clone https://github.com/.../rundeck_mcp
npm install
# docs are downloaded automatically during postinstall
```

No environment variables required. The server starts and serves documentation immediately.

### Updating documentation

```bash
npm run docs:update
# deletes docs/ and re-downloads from GitHub
```

### Air-gapped or manual management

```bash
export RUNDECK_DOCS_PATH=/path/to/local/docs
npm install   # download is skipped
```

### Pinning a different branch

```bash
export RUNDECK_DOCS_BRANCH=5.0.x
npm install
```

## Decision log

- **Why not bundle docs in the package?** Avoids duplicating the documentation repository. Docs are maintained by Rundeck independently; bundling would require a new package release for every doc update.
- **Why `curl` + `tar` instead of a Node.js HTTP client?** Both are universally available on Linux/macOS on-premise servers. Avoids adding dependencies for the postinstall step.
- **Why exit 0 on failure?** Documentation is optional — the server starts and API tooling still works without it. Blocking `npm install` on a network failure would be a bad experience for on-premise clients.
- **Why `--strip-components=1`?** GitHub tarballs wrap content in a top-level `{repo}-{branch}/` directory. Stripping it places the repo root directly into `docs/`, resulting in `docs/docs/` which is the first path `ConfigManager.findDocsPath()` checks.