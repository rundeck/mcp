# Local test: MCP HTTP + JWT passthrough to Rundeck

**Preferred:** [MCP client OAuth (Cursor)](./MCP-CLIENT-OAUTH.md) — browser login, no pasted JWT.

This doc is for **manual** debugging (curl / Inspector headers).

Implements [mcp-http-oauth-jwt](../.claude/specs/mcp-http-oauth-jwt.md): **no MCP OAuth server** — the client sends `Authorization: Bearer <jwt>` on each MCP HTTP request; the MCP forwards that token to the Rundeck API.

## Prerequisites

- Node.js ≥ 22.19
- `npm install` (includes `@modelcontextprotocol/server` and `@modelcontextprotocol/node`)
- Rundeck Commercial with **OAuth Resource Server** enabled, or a staging instance that accepts your IdP JWT
- A valid **access token** for Rundeck API (same token you would use with `curl -H "Authorization: Bearer …"`)

## 1. Build

```bash
cd /Users/ltoledo/development/rundeck_mcp
npm run build
```

## 2. Start HTTP + JWT mode

```bash
export MCP_TRANSPORT=http
export RUNDECK_AUTH_MODE=jwt_bearer
export RUNDECK_URL=https://your-rundeck.example.com
export MCP_HTTP_HOST=127.0.0.1
export MCP_HTTP_PORT=3000

npm start
```

You should see: `Rundeck MCP HTTP listening at http://127.0.0.1:3000/mcp`.

## 3. Call with Bearer token

Replace `YOUR_JWT` with a real access token from your IdP / Rundeck OAuth setup.

```bash
export MCP_TOKEN='YOUR_JWT'

curl -sS -X POST "http://127.0.0.1:3000/mcp" \
  -H "Authorization: Bearer ${MCP_TOKEN}" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"curl","version":"1.0.0"}}}'
```

Then run `tools/list` / `tools/call` using the same Bearer header (MCP Inspector is easier for full flows).

## 4. MCP Inspector (optional)

Add `inspector.config.http.json`:

```json
{
  "mcpServers": {
    "rundeck-mcp-http": {
      "type": "streamable-http",
      "url": "http://127.0.0.1:3000/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_JWT"
      }
    }
  }
}
```

```bash
npm run build
npx @modelcontextprotocol/inspector --config ./inspector.config.http.json --server rundeck-mcp-http
```

## 5. Stdio unchanged (PAT)

Default (no env): stdio + `RUNDECK_TOKEN` as before.

```bash
export RUNDECK_URL=…
export RUNDECK_TOKEN=…
npm start
```

## Troubleshooting

| Symptom | Check |
|--------|--------|
| `401 missing_bearer` | Set `Authorization: Bearer` on every HTTP request |
| Rundeck `unauthorized` | JWT not trusted by Rundeck RS, or user lacks ACL |
| `jwt_bearer requires MCP_TRANSPORT=http` | Do not use JWT mode with stdio-only |
| Build import errors | Run `npm install` (PD npm registry auth for `@modelcontextprotocol/*`) |
