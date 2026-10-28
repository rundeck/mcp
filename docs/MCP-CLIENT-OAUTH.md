# MCP client OAuth (Cursor, Claude Code, Inspector)

Streamable HTTP clients can log in in the browser instead of pasting a Bearer token. This server acts as an **MCP Resource Server** (RFC 9728): it advertises metadata and returns **`401` + `WWW-Authenticate`** when `/mcp` is called without a token. The client runs OAuth 2.1 with PKCE against your IdP, then sends `Authorization: Bearer …` on every MCP request. The same token is forwarded to Rundeck on `api_call`.

Rundeck remains the **API Resource Server** for job/API access; Auth0 (or your IdP) issues tokens Rundeck accepts.

## Server environment

```bash
export MCP_TRANSPORT=http
export RUNDECK_AUTH_MODE=jwt_bearer
export RUNDECK_URL=http://localhost:4440
export RUNDECK_API_VERSION=60   # match your Rundeck instance

# IdP used for login (Auth0, Google, Keycloak, …)
# Google example: export OIDC_ISSUER=https://accounts.google.com
export OIDC_ISSUER=https://YOUR_TENANT.us.auth0.com

# Public URL of the MCP endpoint — must match what the client uses (scheme/host/port/path)
export MCP_PUBLIC_URL=http://127.0.0.1:3000/mcp

npm run build && node dist/index.js
```

Optional:

| Variable | Default | Purpose |
|----------|---------|---------|
| `MCP_OAUTH` | on when `OIDC_ISSUER` set | Set `0` to disable RFC 9728 metadata / 401 challenges (manual Bearer only) |
| `MCP_OAUTH_PROXY_TOKEN` | on | Proxies `POST /oauth/token` on the MCP origin (required for Google → JWT Bearer); set `0` to publish the IdP’s real token URL |
| `MCP_OAUTH_ALLOWED_REDIRECT_URIS` | — | Comma-separated exact client redirect URIs the authorize proxy accepts besides `http://localhost`/`127.0.0.1` loopback (e.g. Cursor's `cursor://…` callback) |
| `MCP_OAUTH_ACCESS_TOKEN` | `auto` | After code exchange: `auto` (swap opaque → `id_token`), `id_token`, or `upstream` — usually **omit** (defaults are correct) |
| `MCP_OAUTH_RESOURCE_NAME` | `Rundeck MCP` | Display name in Protected Resource Metadata |
| `MCP_OAUTH_SCOPES` | — | Comma/space-separated scopes advertised to clients |
| `MCP_REQUIRE_BEARER` | on in JWT/OAuth mode | Set `0` to allow unauthenticated MCP connect (tools still need a token for Rundeck) |

When `OIDC_ISSUER` is set, the server loads `/.well-known/openid-configuration` at startup and serves:

- `GET /.well-known/oauth-protected-resource/mcp` — Protected Resource Metadata (RFC 9728)
- `GET /.well-known/oauth-authorization-server` — Authorization Server metadata (RFC 8414 snapshot)

Unauthenticated `POST /mcp` returns **401** with `WWW-Authenticate: Bearer … resource_metadata="…"`.

## Cursor configuration

Use **Streamable HTTP** without an `Authorization` header in config — the client performs OAuth after the 401 challenge.

Example (`.cursor/mcp.json` or Cursor MCP settings):

```json
{
  "mcpServers": {
    "rundeck-mcp": {
      "url": "http://127.0.0.1:3000/mcp"
    }
  }
}
```

Click **Authenticate** when prompted. Cursor opens the browser; after approval, it stores tokens and attaches Bearer on later MCP calls.

`MCP_PUBLIC_URL` must match the `url` above (including path `/mcp`).

See also [docs/examples/cursor-mcp-oauth.json](./examples/cursor-mcp-oauth.json) for optional explicit OAuth client env vars.

## Claude Code (HTTP proxy)

Enterprise configs often require an explicit transport type:

```json
{
  "mcpServers": {
    "rundeck-mcp": {
      "type": "http",
      "url": "http://127.0.0.1:3000/mcp"
    }
  }
}
```

Use the same `OIDC_ISSUER` / `MCP_PUBLIC_URL` on the server process. If a gateway (e.g. Runlayer) sits in front of this server, set `MCP_PUBLIC_URL` to the URL the **client** uses to reach MCP, not only the upstream `:3000` bind address.

## Runlayer / gateways

Proxies may attempt OAuth **Dynamic Client Registration** against your IdP. Auth0 often returns **404** on DCR — configure **manual OAuth** (client id/secret) on the gateway and Auth0 callback URLs for the gateway’s OAuth flow. Hosted gateways with `auth_type: oauth` may show an **Authenticate** button; local `runlayer run` proxies often attach tokens inside the CLI instead.

## Google OAuth (opaque access_token)

Google’s token response includes an opaque `access_token` (`ya29…`) and a JWT `id_token`. MCP clients (Claude Code, Cursor) send **`access_token` as Bearer** per OAuth. Rundeck’s OAuth Resource Server expects a **JWT**, so opaque tokens fail with `Malformed token`.

When `OIDC_ISSUER` is set, this server acts as the **authorization server clients see** and proxies the whole code flow to the IdP:

| MCP endpoint | What it does |
|---|---|
| `GET /oauth/authorize` | Remembers the client's `redirect_uri`/`state`, redirects to the IdP with `redirect_uri=<MCP origin>/oauth/callback` (PKCE and other params pass through) |
| `GET /oauth/callback` | Sends the IdP's `code` (or `error`) back to the client's `redirect_uri` with its original `state` and `iss=<MCP origin>` |
| `POST /oauth/token` | Forwards to the IdP (rewriting `redirect_uri` to the callback on `authorization_code`) and, by default, returns **`access_token = id_token`** when the upstream access token is not JWT-shaped |

Metadata (PRM `authorization_servers`, `issuer`, `authorization_endpoint`, `token_endpoint`) all point at the MCP origin. Both halves are needed: if `issuer` stays Google's, clients discover Google directly and skip `/oauth/token`; if only the issuer changes, RFC 9207 clients reject Google's `iss=https://accounts.google.com` on the callback. Auth0-style JWT access tokens are left unchanged. See the optional variables table above; **you do not need to set `MCP_OAUTH_ACCESS_TOKEN` for Google.**

### Google checklist (Rundeck OAuth RS)

1. **Rundeck** — OAuth Resource Server with `issuer-uri` = `https://accounts.google.com` (or your Google issuer) and `jwt.audiences` = your **Google OAuth client ID** (what Rundeck expects on the `id_token` `aud` claim).
2. **Google Cloud OAuth client** — Authorized redirect URIs must include the MCP callback, **`<MCP origin>/oauth/callback`** (e.g. `http://127.0.0.1:3000/oauth/callback`); that is the URI Google redirects to. The client's own loopback callback (e.g. Claude Code's `http://localhost:8765/callback`) is only seen by the MCP, not Google. In Claude Code register with `claude mcp add --transport http --client-id <id> --client-secret --callback-port 8765 …` (Google has no dynamic client registration).
3. **MCP server** — `OIDC_ISSUER=https://accounts.google.com`, `MCP_PUBLIC_URL` matching the client’s MCP URL, `RUNDECK_AUTH_MODE=jwt_bearer`.
4. **After changing token proxy behavior** — Re-authenticate in Claude (`/mcp` → Re-authenticate); stored tokens are not upgraded in place.

## Auth0 checklist (local Rundeck JWT RS)

1. **Rundeck** — Resource Server enabled with `issuer-uri` = your Auth0 issuer and audience matching Rundeck (e.g. `http://localhost:4440`).
2. **Auth0 API** — Identifier = that audience; enable RBAC if you use scopes.
3. **Auth0 Application** — Native or SPA for the MCP client; add **Callback URLs** Cursor uses (often `http://127.0.0.1:*` / localhost — see Cursor docs for current redirect URIs).
4. **Dynamic Client Registration** — If Cursor registers dynamically, enable DCR on Auth0 or pre-register the client id Cursor expects.

The access token **`aud`** (and issuer) must satisfy **Rundeck’s** Resource Server settings, not only MCP. If login succeeds but `api_call` returns 401 from Rundeck, align Auth0 API identifier / custom claims with Rundeck’s configured audience.

## Inspector (manual token vs OAuth)

- **OAuth:** omit `headers.Authorization` in `inspector.config.http.json`; the Inspector should follow the same 401 → browser flow when supported.
- **Manual JWT:** keep `Authorization: Bearer …` for quick tests without OAuth.

## Security notes

- Do not commit access tokens or client secrets in repo config files.
- `MCP_DANGEROUSLY_ALLOW_INSECURE_ISSUER_URL=1` only for non-HTTPS issuers in local dev.
- This MCP server **does not** replace Rundeck ACLs — it forwards the user token; Rundeck enforces permissions.
