# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Quick Start (first-time setup)

After cloning the repo, run the setup skill to install dependencies, configure your Rundeck credentials, and start the MCP server:

```
/rundeck-mcp-setup
```

The skill will walk you through the full setup interactively.

### Other local-dev skills

| Skill | Use when |
|---|---|
| `/rundeck-mcp-rebuild` | You changed anything in `src/`, or ran `npm install` |
| `/rundeck-mcp-docker-build` | You changed `src/`, `Dockerfile`, or `docker-entrypoint.sh` and want a local image |
| `/rundeck-mcp-docker-setup` | You want to run the server via Docker without installing Node.js |

See [SETUP.md](./SETUP.md#local-development-skills-reference) for full details on each.

## Commands

```bash
# Install dependencies
npm install

# Build (TypeScript → dist/)
npm run build

# Development mode (TypeScript watch + nodemon auto-restart)
npm run dev

# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run a single test file
NODE_OPTIONS=--experimental-vm-modules npx jest src/__tests__/tools/api.test.ts

# Full validation (build + test + integration validations)
npm run validate

# Launch MCP Inspector for protocol testing
npm run inspect
```

## Architecture

This is a **Model Context Protocol (MCP) server** that exposes Rundeck documentation and APIs to AI assistants. The server registers three MCP feature types: **resources**, **tools**, and **prompts**.

### Entry point

`src/index.ts` is the sole entry point, communicating via stdio. It creates the MCP `Server` and registers handlers for all six MCP request types (`ListResources`, `ReadResource`, `ListTools`, `CallTool`, `ListPrompts`, `GetPrompt`) directly. All tool dispatch lives in the `CallToolRequestSchema` handler's `switch` statement.

**Guidance mode**: Tools called without their required parameters return markdown help text instead of executing. The `needsGuidance()` helper checks for missing required fields; `returnGuidanceMarkdown()` wraps the text in an MCP content response. Guidance content lives in `src/utils/guidance.ts`.

### Resources (`src/resources/`)

`src/resources/index.ts` owns the URI routing. It parses `rundeck://` URIs and dispatches to category-specific modules:

| Module | URI prefix | Content source |
|---|---|---|
| `api.ts` | `rundeck://api/*` | Static inline markdown |
| `jobs.ts` | `rundeck://jobs/*` | Static inline markdown |
| `config.ts` | `rundeck://config/*` | Static inline markdown |
| `learning.ts` | `rundeck://learn/*` | Reads from `RUNDECK_DOCS_PATH` |
| `plugins.ts` | `rundeck://plugins/*` | Reads from `RUNDECK_DOCS_PATH` |
| `manual.ts` | `rundeck://docs/manual/*` | Reads from `RUNDECK_DOCS_PATH` |
| `administration.ts` | `rundeck://docs/administration/*` | Reads from `RUNDECK_DOCS_PATH` |
| `developer.ts` | `rundeck://docs/developer/*` | Reads from `RUNDECK_DOCS_PATH` |
| `rd-cli.ts` | `rundeck://docs/rd-cli/*` | Reads from `RUNDECK_DOCS_PATH` |
| `integrations.ts` | `rundeck://docs/integrations/*` | Static inline markdown |

Resources that read from the filesystem use `configManager.getConfig().docsPath` resolved at runtime. The docs path defaults to `./docs/docs` relative to cwd but is overridable via `RUNDECK_DOCS_PATH`.

### Tools (`src/tools/`)

| File | Tools registered |
|---|---|
| `api.ts` | `api_call`, `api_list` |
| `jobs.ts` | `job_create`, `job_validate` |
| `search.ts` | `docs_search` |
| `runners.ts` | `runner_create` |
| `connect.ts` | `rundeck_connect` — only listed/reachable when `configManager.hasInstanceRegistry()` is true (i.e. `RUNDECK_INSTANCES` is set) |
| `acl.ts` | `acl_validate`, `acl_manage` |

`plugins.ts` (`plugin_create`) exists in the codebase but is **not** currently registered as an MCP tool — deliberately excluded per the Phase 1 comment at the top of `src/tools/plugins.ts`.

Each tool exports its handler function and a Zod schema. Schemas are converted to JSON Schema via `zod-to-json-schema` in `index.ts` when responding to `ListTools`.

`api_call` reads `RUNDECK_URL` and `RUNDECK_TOKEN` from `configManager` (which lazily refreshes from environment). The base URL is constructed as `{RUNDECK_URL}/api/{RUNDECK_API_VERSION}`.

### Configuration (`src/config.ts`)

`ConfigManager` is a singleton (`configManager`). It lazy-loads env vars on `getConfig()` calls when URL or token is missing. The `docsPath` is resolved once at construction and on `initialize()`, searching several candidate paths relative to cwd.

### Prompts (`src/prompts/index.ts`)

Prompts are static objects with `name`, `description`, `arguments`, optional `argumentSchema` (Zod), and a `getContent(args)` function. Argument validation and missing-required-arg checks happen in `index.ts` before calling `getContent`.

## Environment Variables

| Variable | Default | Purpose |
|---|---|---|
| `RUNDECK_URL` | — | Rundeck instance URL (required for `api_call`) |
| `RUNDECK_TOKEN` | — | API token (required for `api_call`) |
| `RUNDECK_API_VERSION` | `46` | API version appended to base URL |
| `RUNDECK_API_TIMEOUT_MS` | `30000` | Timeout for `api_call`'s underlying `fetch` (also bounds `runner_create` and `acl_manage`, which call through it). Aborts and throws a distinct timeout error past this limit. Invalid/non-positive values fall back to the default with a logged warning. |
| `RUNDECK_INSTANCES` | — | JSON registry of multiple named instances; when set, enables the `rundeck_connect` tool for mid-session switching (see `src/config.ts`'s `loadInstanceRegistry()`) |
| `RUNDECK_DOCS_PATH` | auto-detected | Path to Rundeck docs directory. Auto-detection is `process.cwd()`-relative only (see `findDocsPath()`), so it won't find docs downloaded by either mechanism below unless cwd happens to line up |
| `RUNDECK_DOCS_BRANCH` | `4.0.x` | Branch of `rundeck/docs` to download when no docs are present — read by both `scripts/download-docs.mjs` (npm `postinstall`, downloads to `<package root>/docs/docs`) and `docker-entrypoint.sh` (container startup, downloads to `/app/docs/docs`) |
| `SKIP_RUNDECK_DOCS_DOWNLOAD` | — | Set to `1` to skip `scripts/download-docs.mjs`'s npm-install-time docs download; no effect on the Docker image |
| `RUNDECK_SKIP_OPENAPI_VALIDATE` | — | Set to `1` to skip validating `api_call` params against the shipped OpenAPI spec |
| `MCP_DEBUG` | — | Set to `1` or `true` for verbose logging |

## Project conventions

- The project uses **ES modules** (`"type": "module"` in package.json). All local imports must use `.js` extensions even for `.ts` source files.
- TypeScript is compiled to `dist/` with `ES2022` target and `strict` mode enabled.
- Tests use `jest` with `ts-jest` ESM preset. The `NODE_OPTIONS=--experimental-vm-modules` flag is required.
- Coverage thresholds are enforced at 70% for branches, functions, lines, and statements.