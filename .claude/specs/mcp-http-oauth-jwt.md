# SPEC: MCP Streamable HTTP + Rundeck JWT (OAuth at the API)

## Objective

Enable **centrally hosted** Rundeck MCP over **Streamable HTTP** with **per-user OAuth/OIDC access tokens** used **only for Rundeck API authentication**, so **Rundeck ACLs** govern every tool call. Preserve **stdio + PAT (`RUNDECK_TOKEN`)** for OSS and local installs.

**Product decision:** OAuth is **not** implemented as “MCP Authorization” (this server is **not** an OAuth resource server for the MCP endpoint). The client (or an upstream gateway) obtains a JWT from the enterprise IdP; the MCP **forwards** that token to Rundeck. **Authorization** (what the user may do) is entirely **Rundeck’s job** via existing ACL + Commercial JWT/OAuth Resource Server configuration.

## Background (requirements sources)

- **#rba_mcp_plan** (Slack `C0B06CPGRR8`): central MCP needs HTTP + per-user auth; validate whether Rundeck alone validates JWT; local stays API token.
- **Customer (Roche)**: per-user tokens; ACL inheritance (read-only stays read-only).
- **Rundeck API**: [JWT Token Authentication (Commercial)](https://docs.rundeck.com/docs/api/#jwt-token-authentication-commercial) — `Authorization: Bearer <jwt>` when OAuth Resource Server is enabled on Rundeck 5.1+.
- **MCP normative note:** The MCP 2026-07-28 spec **SHOULD** put OAuth on HTTP MCP servers themselves. This product **intentionally diverges**: Rundeck is the OAuth resource server; MCP is a protocol adapter. Edge protection for a public MCP URL remains a **deployment** concern (private network, API gateway, mTLS, or future unified PD MCP BFF)—not a second OAuth stack inside `rundeck_mcp`.
- **Backlog:** RUN-4707, RUN-4708, RUN-4709.

## Problem statement

Today the server is **stdio-only** and uses a **shared** `RUNDECK_TOKEN` in env with `X-Rundeck-Auth-Token` (`src/tools/api.ts`). Central multi-user MCP needs **per-request** user identity on Rundeck calls without duplicating Rundeck’s permission model in MCP code.

## Approach

### Single source of truth: Rundeck

| Concern | Where it lives |
|--------|----------------|
| **Authentication** (who is this user?) | IdP → JWT → Rundeck validates (OAuth RS on Rundeck) |
| **Authorization** (may they run/delete/ACL?) | **Rundeck ACL** on each API response |
| **MCP server** | Passes through Bearer token; **does not** implement parallel MCP scopes or ACL rules |

If the JWT is valid for Rundeck but the user lacks ACL for an action, Rundeck returns `unauthorized` / 403 — same as the UI or CLI.

### What the MCP does (and does not do)

**Does:**

- Accept **`Authorization: Bearer <access_token>`** on incoming HTTP MCP requests (when `RUNDECK_AUTH_MODE=jwt_bearer`).
- Store token in **request-scoped context** and call Rundeck with **`Authorization: Bearer`** (not `X-Rundeck-Auth-Token`).
- Optionally require a Bearer header before running tools (fail fast with clear error if missing).
- **May** optionally decode JWT **without trusting it for authorization** (e.g. read `sub` for logs/OTel only); **must not** treat MCP as the authority on permissions.

**Does not (Phase 1):**

- Expose `/.well-known/oauth-protected-resource` for MCP.
- Run the MCP Authorization OAuth discovery / PKCE / token endpoint flow **as the MCP server**.
- Define MCP-specific OAuth scopes that gate tools (unless added later at a gateway/BFF).

**OAuth flow location:** Client IDE, Backstage, or **ingress gateway** completes OAuth against the **same IdP Rundeck trusts**; the access token is presented on each MCP HTTP request and reused for Rundeck API calls.

### Rundeck credential modes

| Mode | Transport | To Rundeck | Credential source | Typical user |
|------|-----------|------------|-------------------|--------------|
| **`pat`** (default) | stdio (primary); http optional | `X-Rundeck-Auth-Token` | `RUNDECK_TOKEN` env | OSS, local Docker |
| **`jwt_bearer`** | http (required) | `Authorization: Bearer` | Bearer on **incoming** MCP HTTP request | Commercial central |

Rules:

- **`jwt_bearer` + stdio-only** → fail at startup (need per-request Bearer).
- **`pat` + http** → allowed for migration / single-user HTTP behind VPN.
- OSS: **pat only** (no Rundeck OAuth RS requirement).

### Transport

- **`MCP_TRANSPORT=stdio`** (default): unchanged.
- **`MCP_TRANSPORT=http`**: Streamable HTTP for central deploy.
- **`MCP_TRANSPORT=both`**: dev/smoke only.

### Securing the MCP HTTP endpoint (deployment, not duplicate OAuth)

Because MCP does not implement MCP Authorization:

- **Recommended:** MCP HTTP on private network, or behind gateway that authenticates users and forwards `Authorization: Bearer`.
- **Acceptable for pilots:** Bearer required on MCP; **Rundeck validates** token on every API call (invalid token → tool errors even if MCP accepted the header).
- **Not in scope:** Full MCP-spec OAuth RS in this repo unless requirements change.

### Configuration model

| Variable | Default | Purpose |
|----------|---------|---------|
| `MCP_TRANSPORT` | `stdio` | `stdio` \| `http` \| `both` |
| `MCP_HTTP_HOST` / `MCP_HTTP_PORT` | `0.0.0.0` / `3000` | HTTP listen |
| `RUNDECK_AUTH_MODE` | `pat` | `pat` \| `jwt_bearer` |
| `RUNDECK_URL` | — | Unchanged |
| `RUNDECK_TOKEN` | — | Required for `pat` when calling live API |
| `MCP_REQUIRE_BEARER` | `true` when `jwt_bearer` | Reject MCP requests with no Bearer |
| `MCP_CORS_ORIGINS` | — | If browser clients |
| `RUNDECK_JWT_DECODE_FOR_TELEMETRY` | `1` when `jwt_bearer` | Decode `sub` for Tier C traces (see observability spec) |

Remove from Phase 1 plan: `MCP_OAUTH_*`, `MCP_PUBLIC_URL` for MCP resource metadata (unless needed for unrelated HTTP URLs).

Refactor: `getRundeckCredentials(requestContext?)` — env PAT vs request Bearer.

### Observability

See [mcp-observability-centralized.md](./mcp-observability-centralized.md). With `jwt_bearer`, **Tier C** applies: each `tools/call` emits an OTLP **trace span** with `enduser.id` = JWT `sub` (same Bearer as Rundeck API). Prometheus metrics stay aggregate; per-user MAU/drill-down uses Tempo/Loki.

- Do not log full Bearer tokens.

### Human-in-the-loop

Destructive confirmation (`requestDestructiveConfirmation`) stays MCP-side UX; **does not replace** Rundeck ACL. User can confirm in MCP and still get denied by Rundeck if ACL forbids.

## Acceptance Criteria

- [ ] **`MCP_TRANSPORT`** default `stdio` unchanged — Verification: existing tests
- [ ] **HTTP + Streamable HTTP** MCP handler — Verification: integration / Inspector
- [ ] **`jwt_bearer`**: inbound MCP HTTP Bearer → outbound Rundeck `Authorization: Bearer`; no `X-Rundeck-Auth-Token` — Verification: unit test on `fetch` headers
- [ ] **`pat`**: unchanged env token behavior on stdio — Verification: `api.test.ts`
- [ ] **No MCP OAuth RS** (no PRM endpoint, no MCP audience validation as product requirement) — Verification: code review / negative test
- [ ] **Request-scoped tokens** do not leak across concurrent HTTP requests — Verification: async unit test
- [ ] **SETUP.md / guidance** explain: OAuth is for Rundeck API; ACL on Rundeck; PAT for OSS/local — Verification: doc review
- [ ] **`jwt_bearer` + stdio** fails startup — Verification: unit test

## Scope

**In scope:** HTTP transport; Bearer passthrough; request-scoped credentials; pat path unchanged; docs.

**Out of scope:** MCP Authorization (9728/8707 on MCP URL); MCP AS; duplicate ACL in MCP; token exchange (unless Rundeck rejects passthrough audience—see open questions); PD unified BFF; Runlayer stdio proxy changes.

## Architecture sketch

```text
┌──────────────┐  OAuth (IdP)     ┌─────────────┐
│ MCP Client   │ ───────────────► │   IdP       │
│              │ ◄── JWT ─────────│             │
└──────┬───────┘                  └─────────────┘
       │  MCP HTTP + Authorization: Bearer (same JWT)
       ▼
┌──────────────────┐  Authorization: Bearer     ┌─────────────┐
│ rundeck_mcp      │ ─────────────────────────► │ Rundeck API │
│ (no MCP OAuth)   │                            │ validates   │
└──────────────────┘                            │ JWT + ACL   │
                                                └─────────────┘

stdio + RUNDECK_TOKEN ──► X-Rundeck-Auth-Token ──► Rundeck (PAT)
```

## Open questions

1. Will the IdP access token Rundeck accepts be the **same** token clients send to MCP (audience aligned with Rundeck RS config)?
2. Where does the OAuth **authorization code flow** run for Cursor/Claude—native client support vs gateway vs short-lived PAT fallback for local?
3. One `RUNDECK_URL` per MCP deployment vs `RUNDECK_INSTANCES` over HTTP?

## Context

- `src/tools/api.ts` — today PAT header only.
- Prior draft of this spec assumed MCP OAuth RS; superseded by this document.

## Compaction Note

Preserve: **OAuth for Rundeck only**, **ACL on Rundeck**, **no MCP OAuth RS**, **pat vs jwt_bearer**, **Acceptance Criteria**.
