# Setup Guide

## Prerequisites

- Node.js 18+ 
- npm or yarn
- TypeScript 5.5+

## Installation

1. Install dependencies:
```bash
npm install
```

2. Build the project:
```bash
npm run build
```

3. See available commands:
   - For a complete guide to all npm scripts, see [SCRIPTS.md](./SCRIPTS.md)
   - Quick reference: `npm run build`, `npm start`, `npm run dev`, `npm test`, `npm run validate`

## Configuration

The server supports the following environment variables:

### Available Environment Variables

- **`RUNDECK_DOCS_PATH`** (optional): Path to Rundeck documentation directory
  - If not set, the server searches for docs in: `./docs/docs`, `../docs/docs`, `./docs`, `../docs`
  - Example: `/path/to/rundeck/docs`

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

- **`RUNDECK_SKIP_OPENAPI_VALIDATE`** (optional): When set to `1`, disables pre-request validation of `api_call` query keys and JSON body top-level keys against the OpenAPI file shipped with the docs tree (`RUNDECK_DOCS_PATH/.vuepress/public/files/rundeck-api.yml`). Useful if you intentionally send parameters not yet documented in that spec.

### Configuration Methods

#### Option 1: MCP Settings (Recommended)

Configure environment variables in your MCP client settings (e.g., Claude Desktop configuration). This is the recommended approach as it keeps configuration centralized in your MCP settings file.

See the "Example MCP Client Configuration" section below for details.

#### Option 2: Shell Environment Variables

Alternatively, you can set environment variables in your shell before starting the server:

```bash
export RUNDECK_DOCS_PATH=/path/to/rundeck/docs
export RUNDECK_URL=https://your-rundeck-instance.com
export RUNDECK_TOKEN=your-api-token
export RUNDECK_API_VERSION=46
```

Note: When running via MCP client, shell environment variables may not be available. Use MCP settings instead.

## Running the Server

The server communicates via stdio using the MCP protocol. After `npm run build`:

```bash
npm start
```

Equivalent: `node dist/index.js`.

## Testing

To test the server, you can use an MCP client or connect it to a compatible application like Claude Desktop.

### Example MCP Client Configuration

For Claude Desktop, add to your MCP settings file (typically `~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

#### Minimal Configuration (Documentation Only)

```json
{
  "mcpServers": {
    "rundeck-docs": {
      "command": "node",
      "args": ["/path/to/rundeck-mcp/dist/index.js"],
      "env": {
        "RUNDECK_DOCS_PATH": "/path/to/rundeck/docs"
      }
    }
  }
}
```

#### Full Configuration (Documentation + API Tools)

```json
{
  "mcpServers": {
    "rundeck-docs": {
      "command": "node",
      "args": ["/path/to/rundeck-mcp/dist/index.js"],
      "env": {
        "RUNDECK_DOCS_PATH": "/path/to/rundeck/docs",
        "RUNDECK_URL": "https://your-rundeck-instance.com",
        "RUNDECK_TOKEN": "your-api-token-here",
        "RUNDECK_API_VERSION": "46"
      }
    }
  }
}
```

**Notes:**
- Replace `/path/to/rundeck-mcp/dist/index.js` with the actual path to your built server
- Replace `/path/to/rundeck/docs` with the path to your Rundeck documentation
- Replace `https://your-rundeck-instance.com` with your Rundeck instance URL
- Replace `your-api-token-here` with your Rundeck API token
- Adjust `RUNDECK_API_VERSION` to match your Rundeck instance version (default: 46)

## Development

```bash
# TypeScript watch + server auto-restart (see SCRIPTS.md)
npm run dev

# Optional: MCP Inspector GUI (builds then opens inspector)
npm run inspect
```

## Running the MCP Server Locally over HTTP

For local development with Claude Code, the server can run as a persistent local HTTP process instead of being spawned per-session over stdio. Claude Code then connects to it as a plain URL.

### Step 1: Configure `.env`

Create a `.env` file in the repo root (git-ignored) with your Rundeck credentials and the port the HTTP server should listen on:

```bash
# .env
RUNDECK_URL=http://localhost:4440
RUNDECK_TOKEN=your-rundeck-api-token
RUNDECK_API_VERSION=46
MCP_HTTP_PORT=3456
```

### Step 2: Build and start the server

The server doesn't load `.env` itself (no `dotenv` dependency) — source it into the shell before starting the process, the same way `start.sh` does for `/rundeck-mcp-setup`:

```bash
npm install
npm run build
set -a && source .env && set +a
node dist/http.js
```

Using Claude Code? Run `/rundeck-mcp-setup` instead to automate this step.

Once running, the server logs `Rundeck MCP HTTP server → http://localhost:3456/mcp`.

### Step 3: Point `.mcp.json` at it

Add this entry to `.mcp.json` in the repo root (or wherever your MCP client reads it from). Unlike the stdio configs (`docker run`, `npx`, `node dist/index.js`), the client doesn't spawn the process or pass env vars here — it just connects to the already-running server, which got its credentials from `.env` in Step 1:

```json
{
  "mcpServers": {
    "rundeck-mcp": {
      "type": "http",
      "url": "http://localhost:3456/mcp"
    }
  }
}
```

Reload Claude Code (or your MCP client) to connect.

### Day-to-day loop

- Changed `.env` (URL, token, port)? Restart the server so it picks up the new values — see `/rundeck-mcp-restart` below.
- Changed anything in `src/`? Rebuild first — see `/rundeck-mcp-rebuild` below.
- The `/rundeck-mcp-setup` skill automates all three steps above end-to-end (installs deps, builds, prompts for credentials into `.env`, writes `.mcp.json`, starts the server via `start.sh`).

## Local Development Skills Reference

These Claude Code skills (`.claude/skills/`) wrap the day-to-day local dev loop. Invoke with `/<skill-name>`:

| Skill | Use when | What it does |
|---|---|---|
| `/rundeck-mcp-setup` | First time cloning the repo, or the server shows as disconnected in `claude mcp list` | Installs deps, builds, prompts for Rundeck credentials into `.env`, registers `.mcp.json`, starts the HTTP server |
| `/rundeck-mcp-rebuild` | You changed anything in `src/`, or ran `npm install` | Stops the server, runs `npm run build`, starts it again |
| `/rundeck-mcp-restart` | You only changed `.env` (`RUNDECK_URL`, `RUNDECK_TOKEN`, `MCP_HTTP_PORT`, etc.) | Stops and starts the server without rebuilding — faster than rebuild |
| `/rundeck-mcp-stop` | You want to shut the server down without restarting it | Stops the running HTTP server |
| `/rundeck-mcp-docker-build` | You changed `src/`, `Dockerfile`, or `docker-entrypoint.sh` and want a local image | Multi-stage Docker build producing a production-ready `rundeck-mcp` image |
| `/rundeck-mcp-docker-setup` | You want to run the server via Docker without installing Node.js | Pulls the published image, collects credentials, wires it into `.mcp.json` over stdio |

Rule of thumb: **`.env` change → `/rundeck-mcp-restart`**, **`src/` change → `/rundeck-mcp-rebuild`**, **Docker-related file change → `/rundeck-mcp-docker-build`**.

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


