# Local Development Setup Guide

> Looking to use the published server as an MCP client? See the "Using with MCP Clients" section in [README.md](./README.md) — no clone or build required.

## Prerequisites

- Node.js 24+ (matches the version CI and the Docker image build against)
- npm or yarn
- TypeScript 5.5+

## Local Development

> **PagerDuty employees**: `npm install`/`npm ci` authenticate against PagerDuty's private Cloudsmith npm mirror (see the committed `.npmrc`). You'll need a `CLOUDSMITH_NPM_TOKEN` — set it as an environment variable before installing.
>
> **External contributors**: you don't have Cloudsmith access, so delete `.npmrc` and `package-lock.json` first (both point at the private mirror) and let `npm install` regenerate a lockfile against the public registry:
> ```bash
> rm .npmrc package-lock.json
> ```

1. Install dependencies:
```bash
npm install
```

2. Build the project:
```bash
npm run build
```

3. See available commands:
   - For the full list of npm scripts, see the `"scripts"` block in `package.json`
   - Quick reference: `npm run build`, `npm start`, `npm run dev`, `npm test`, `npm run validate`

### Building the Internal Docker Image (`rundeck/mcp-ci`)

**PagerDuty employees**: to build the same image CircleCI publishes (the one Runlayer pulls as `rundeck/mcp-ci:latest` to run the MCP server internally), build locally with:

```bash
docker build --secret id=cloudsmith_token,env=CLOUDSMITH_NPM_TOKEN \
  -t rundeck/mcp-ci:latest -t rundeck/mcp-ci:$(date +%Y%m%d) .
```

`CLOUDSMITH_NPM_TOKEN` must be set in your shell — it's forwarded in as a build secret (not a build-arg) so it never lands in the image's layer history.

## Configuration

The server supports the following environment variables:

### Available Environment Variables

- **`RUNDECK_URL`** (optional): Rundeck instance URL for **live** API calls (`api_call` only)
  - Not required for documentation, `docs_search`, `api_list` (endpoint discovery from local docs), prompts, or resources
  - Example: `https://your-rundeck-instance.com`

- **`RUNDECK_TOKEN`** (optional): Rundeck API authentication token
  - Required for **`api_call`** only (can be generated from your Rundeck user profile)
  - Example: `your-api-token-here`

- **`RUNDECK_API_VERSION`** (optional): Rundeck API version
  - Default: `46`
  - Should match your Rundeck instance API version
  - Example: `46`

- **`RUNDECK_API_TIMEOUT_MS`** (optional): Timeout in milliseconds for `api_call`'s underlying HTTP request (also bounds `runner_create` and `acl_manage`, which call through it).
  - Default: `30000` (30 seconds)
  - Past this limit the request is aborted and a distinct timeout error is returned instead of hanging indefinitely.
  - Invalid or non-positive values fall back to the default with a logged warning.
  - Example: `60000`

- **`RUNDECK_INSTANCES`** (optional): JSON registry of multiple named Rundeck instances, for switching between them (e.g. prod/staging) mid-session without restarting the server. Most users only ever talk to one Rundeck instance and don't need this — see [Multiple Rundeck Instances](#multiple-rundeck-instances-optional) below if you do.

- **`RUNDECK_DOCS_PATH`** (optional): Path to a Rundeck documentation directory on disk.
  - Auto-detection (`./docs/docs`, `../docs/docs`, `./docs`, `../docs` relative to the process's working directory) only works when the server is launched *from inside the repo* — e.g. `npm start`/`npm run dev`.
  - Docs are also downloaded automatically, independent of `RUNDECK_DOCS_PATH`/auto-detection, in two places: as an npm `postinstall` step (`scripts/download-docs.mjs`, runs on `npm install`, downloads into `<package root>/docs/docs`), and at Docker container startup (`docker-entrypoint.sh`, downloads into `/app/docs/docs` if not already present). See `RUNDECK_DOCS_BRANCH` and `SKIP_RUNDECK_DOCS_DOWNLOAD` below for controlling that download.
  - **Important:** the npm `postinstall` download lands relative to the *installed package's own directory*, not the process's working directory at runtime — so when an MCP client (Claude Desktop, Cursor, VS Code, etc.) spawns the server from its own working directory, cwd-relative auto-detection will **not** find those downloaded docs. Set `RUNDECK_DOCS_PATH` explicitly in that client's `env` config in this case (see [README.md](./README.md#using-with-mcp-clients) for client config examples; for local dev, point at your locally built `dist/index.js` or the `rundeck/mcp-ci:latest` image instead of the published package/image).
  - Example: `/path/to/rundeck/docs`

- **`RUNDECK_DOCS_BRANCH`** (optional): Branch of [rundeck/docs](https://github.com/rundeck/docs) to download, when no docs are already present. Applies to both the npm `postinstall` download and the Docker container-startup download.
  - Default: `4.0.x`
  - Has no effect if `RUNDECK_DOCS_PATH` is set, or if a docs checkout already exists (e.g. via a mounted volume, or a previous download).

- **`SKIP_RUNDECK_DOCS_DOWNLOAD`** (optional, npm install only): Set to `1` to skip the automatic docs download during `npm install`/`npm ci` (e.g. for a CI job that doesn't need docs, or an offline install). Has no effect on the Docker image's startup download.

- **`RUNDECK_SKIP_OPENAPI_VALIDATE`** (optional): When set to `1`, disables pre-request validation of `api_call` query keys and JSON body top-level keys against the OpenAPI file shipped with the docs tree (`RUNDECK_DOCS_PATH/.vuepress/public/files/rundeck-api.yml`). Useful if you intentionally send parameters not yet documented in that spec.

- **`MCP_DEBUG`** (optional): Set to `1` or `true` for verbose server-side logging.

### Configuration Methods

#### Option 1: MCP Settings (Recommended)

Configure environment variables in your MCP client settings (e.g., Claude Desktop configuration). This is the recommended approach as it keeps configuration centralized in your MCP settings file.

See [README.md](./README.md#using-with-mcp-clients) for client config examples. For local dev, point `args` at your locally built `dist/index.js` instead of the published npm package — or, if you're running via Docker, use the `rundeck/mcp-ci:latest` tag built above instead of the published `rundeck/mcp:latest` image.

#### Option 2: Shell Environment Variables

Alternatively, you can set environment variables in your shell before starting the server:

```bash
export RUNDECK_URL=https://your-rundeck-instance.com
export RUNDECK_TOKEN=your-api-token
export RUNDECK_API_VERSION=59
```

Note: When running via MCP client, shell environment variables may not be available. Use MCP settings instead.

## Multiple Rundeck Instances (optional)

Everything above assumes the common case: one Rundeck instance, configured via `RUNDECK_URL`/`RUNDECK_TOKEN`. If that's you, there's nothing else to do.

If you need to switch between more than one Rundeck instance (e.g. prod and staging) in the same session, without quitting and reconfiguring the server, set `RUNDECK_INSTANCES` instead of `RUNDECK_URL`/`RUNDECK_TOKEN` to a JSON registry:

```json
{
  "default": "prod",
  "instances": {
    "prod":    { "url": "https://rundeck-prod.example.com",    "token": "prod-token" },
    "staging": { "url": "https://rundeck-staging.example.com", "token": "staging-token" }
  }
}
```

- `default` is which instance the server connects to on startup.
- Every entry needs both `url` and `token`.
- Once `RUNDECK_INSTANCES` is set, an extra tool, `rundeck_connect`, becomes available — ask your assistant to "use staging" and every subsequent `api_call`/`job_create`/etc. call uses that instance's URL and token.
- The registry is only read once, at process start. To rotate a token or add an instance, edit the JSON and relaunch.

Setting `RUNDECK_INSTANCES` isn't just a matter of writing the JSON file — the file itself doesn't do anything until its contents actually land in the `RUNDECK_INSTANCES` environment variable of the process that starts `claude`. Save the JSON above to a file (e.g. `~/.rundeck-mcp/instances.json`, `chmod 600` since it holds live tokens), then get it into the environment one of two ways:

**Option A — the wrapper script:**

```bash
./scripts/rundeck-connect.sh ~/.rundeck-mcp/instances.json
```

This validates the file's shape, exports its contents as `RUNDECK_INSTANCES`, and execs `claude`, so however the MCP server ends up running it inherits that env var. Requires `node` on your `PATH` for the shape validation step (it warns and exports as-is if `node` isn't found).

**Option B — export it yourself:**

```bash
export RUNDECK_INSTANCES=$(cat ~/.rundeck-mcp/instances.json)
claude
```

No shape validation here, so double-check your JSON is well-formed. If you do this regularly, consider a shell alias, e.g.:

```bash
alias rundeck-claude='RUNDECK_INSTANCES=$(cat ~/.rundeck-mcp/instances.json) claude'
```

Either way, the end state is the same: `RUNDECK_INSTANCES` is present in the environment *before* `claude` starts.

## Day-to-day Loop

- Changed anything in `src/`? Rebuild — see `/rundeck-mcp-rebuild` below.
- Changed credentials? Edit the `env` block in `.mcp.json` directly and reload Claude Code — there's no separate process to restart.
- The `/rundeck-mcp-setup` skill automates first-time setup end-to-end (installs deps, builds, prompts for credentials, writes `.mcp.json`).

## Local Development Skills Reference

These Claude Code skills (`.claude/skills/`) wrap the day-to-day local dev loop. Invoke with `/<skill-name>`:

| Skill | Use when | What it does |
|---|---|---|
| `/rundeck-mcp-setup` | First time cloning the repo, or the server shows as disconnected in `claude mcp list` | Installs deps, builds, prompts for Rundeck credentials, writes `.mcp.json` (stdio) |
| `/rundeck-mcp-rebuild` | You changed anything in `src/`, or ran `npm install` | Runs `npm install` and `npm run build` |
| `/rundeck-mcp-docker-build` | You changed `src/`, `Dockerfile`, or `docker-entrypoint.sh` and want a local image | Multi-stage Docker build producing a production-ready `rundeck-mcp` image |
| `/rundeck-mcp-docker-setup` | You want to run the server via Docker without installing Node.js | Pulls the published image, collects credentials, wires it into `.mcp.json` over stdio |

Rule of thumb: **`src/` change → `/rundeck-mcp-rebuild`**, **Docker-related file change → `/rundeck-mcp-docker-build`**.

## Troubleshooting

### Docs Not Found

If you get "Resource not found" errors, verify:
1. The docs directory exists at the expected location
2. The `RUNDECK_DOCS_PATH` environment variable is set correctly
3. The docs directory contains the expected markdown files

### API Calls Failing

If API calls fail:
1. Verify Rundeck URL is correct and accessible
2. Check that API token is valid and has proper permissions
3. Ensure API version matches your Rundeck instance version

### TypeScript Errors

If you see TypeScript errors:
1. Run `npm install` to ensure all dependencies are installed
2. Check that TypeScript version matches requirements
3. Run `npm run build` to see detailed error messages


