# SPEC: Centralized monitoring for Rundeck MCP

## Objective

Define how **enterprise and central deployments** measure Rundeck MCP **adoption and impact** in a **central observability stack** (OTLP → collector → Prometheus/Grafana), without relying on per-laptop Claude hooks or Runlayer audit as the only source of truth.

**Product goals:**

- Answer: *which MCP tools run, how often, success vs guidance vs errors, and latency* — from the **MCP server process**.
- Answer: ***who* uses MCP** (per human or service account) for adoption, chargeback conversations, and support — via **OTLP traces/logs (Tier C)** with `enduser.id` from the JWT `sub`, without putting user id on Prometheus counters and without logging the raw Bearer token.
- Support **customers who run Docker or npm stdio** (no Runlayer) and a future **HTTP + JWT** central service (see [mcp-http-oauth-jwt.md](./mcp-http-oauth-jwt.md)).
- Complement (not duplicate) **Rundeck server logs** (API impact by token/User-Agent) and optional **client-side** telemetry.

## Background

| Stakeholder / context | Need |
|----------------------|------|
| **Enterprise (e.g. Roche)** | Central KPIs on MCP tool usage; per-user identity where possible |
| **OSS / local** | Opt-in OTel; no HTTP `/metrics` on stdio process |
| **PagerDuty internal** | Runlayer does not forward `OTEL_*` to local Docker; `local-otel` image target; hooks vs server metrics |
| **Future HTTP** | One service, many users; JWT `sub` for identity; MCP transport session vs auth session |

**Implemented today (Phase 0):**

- `src/telemetry.ts` — OTLP **push** only; counters/histogram on `tools/call`
- Metrics: `rundeck_mcp_tool_calls`, `rundeck_mcp_tool_duration_ms`
- Labels: `tool`, `outcome`, `rundeck_api`
- Docker target `local-otel` — baked OTEL env for bridge → `host.docker.internal:4317`
- Reference dashboard: `rundeck-development/docker/monitoring/grafana/dashboards/Rundeck-MCP-Server-OTel.json`

## Problem statement

1. **No single signal** tells central ops “how MCP is used” — Rundeck logs see only REST tools; client hooks see only configured laptops.
2. **Stdio MCP** has no built-in user or chat-session identity; one process ≈ one client connection.
3. **Prometheus cardinality** limits how much identity (email, session UUID) can be stored on counters.
4. **Runlayer** and similar proxies may not pass operator env vars into the upstream container.

## Principles

1. **Server-side OTel is the canonical product metric** for tool-level usage (`rundeck_mcp_*`).
2. **Push OTLP** from the MCP process; do not require scraping stdio containers on random ports.
3. **Opt-in** unless deployment explicitly enables an endpoint (env or `local-otel` image).
4. **Per-user usage uses Tier C (traces/logs), not metric labels** — JWT `sub` on spans and structured logs; Prometheus stays aggregate (Tier A).
5. **Never log or export full Bearer tokens or `RUNDECK_TOKEN`.**
6. **Separate concerns:** usage (MCP) vs authorization (Rundeck ACL) vs client UX (hooks).

## Observability sources (what measures what)

| Source | Metric / log prefix | Sees | Identity | Central by default? |
|--------|---------------------|------|----------|---------------------|
| **MCP server OTel** | `rundeck_mcp_*` + trace spans | Every `tools/call` | Metrics: aggregate; **Traces: JWT `sub` → `enduser.id`** (HTTP + Tier C) | Yes, if OTLP configured |
| **Rundeck API log / audit** | `rundeck.api.log`, audit | REST calls from MCP | API token → Rundeck user | Yes (Rundeck ops) |
| **Claude / IDE hooks** | `claude_code_*` | Client-side tool dispatch | `session_id` in Loki | No (laptop-local) |
| **Runlayer audit** | API `tool_call`, actor | Proxied MCP tools | User email/name | Yes (Runlayer UI/API) |
| **cAdvisor / container metrics** | container_* | CPU/mem of MCP containers | None | Infra only |

**KPI recommendation:**

- **Tool adoption & reliability:** `rundeck_mcp_tool_calls_total` by `tool`, `outcome`
- **Rundeck blast radius:** Rundeck logs filtered `User-Agent: rundeck-mcp/*`
- **Per human (central HTTP):** see [Per-user MCP usage metrics](#per-user-mcp-usage-metrics) below
- **Per human (Runlayer only):** Runlayer audit for identity; MCP OTel for tool mix/latency (join in BI if needed)

## Phase 0 — Server OTel (current)

### Instrumentation

| Instrument | Name (OTel) | Prometheus (typical) | Attributes |
|------------|-------------|----------------------|------------|
| Counter | `rundeck_mcp_tool_calls` | `rundeck_mcp_tool_calls_total` | `tool`, `outcome`, `rundeck_api` |
| Histogram | `rundeck_mcp_tool_duration_ms` | `*_bucket`, `*_sum`, `*_count` | same |

**`outcome` values:** `success`, `error`, `guidance`, `input_required`

**`rundeck_api`:** `true` for `api_call`, `acl_manage`, `runner_create`, `resource_model_source_manage`

### Enablement

| Variable | Purpose |
|----------|---------|
| `OTEL_EXPORTER_OTLP_ENDPOINT` | gRPC collector URL (required for export unless `OTEL_METRICS_EXPORTER=otlp` with SDK default) |
| `OTEL_EXPORTER_OTLP_METRICS_ENDPOINT` | Metrics-only override |
| `OTEL_METRICS_EXPORTER` | `otlp` or `none` |
| `OTEL_SDK_DISABLED` | Kill switch |
| `OTEL_SERVICE_NAME` | Default `rundeck-mcp` |
| `OTEL_METRIC_EXPORT_INTERVAL` | Default `60000` ms; must be ≥ export timeout (code clamps timeout) |

**Not supported:** HTTP `/metrics` listener on the MCP process.

### Per-user MCP usage metrics

Enterprise asks for **usage by user**, not only aggregate tool counts.

**Product choice:** implement **Tier C** — one **trace span per `tools/call`** (and matching structured log line when logging export is enabled) carrying identity decoded from the inbound JWT. **Tier B** (user id as a Prometheus label) is **not** part of Phase 1; avoid unless a customer explicitly needs PromQL `topk` by user and accepts cardinality risk.

#### Tier C — JWT → per-user traces/logs (required in Phase 1 for HTTP + JWT)

**When:** `RUNDECK_AUTH_MODE=jwt_bearer` and `RUNDECK_JWT_DECODE_FOR_TELEMETRY=1` (default **`1`** when `jwt_bearer` once HTTP ships).

**Flow:**

1. HTTP middleware reads `Authorization: Bearer <jwt>` (same token forwarded to Rundeck per [oauth spec](./mcp-http-oauth-jwt.md)).
2. Decode JWT payload **without using it for authorization** (signature optional for telemetry-only decode, or verify with same JWKS as Rundeck if configured — TBD in implementation; **never** trust unsigned decode in production without explicit dev flag).
3. Extract **`sub`** (required). Optionally map **`preferred_username`**, `email`, or a configured claim → span attribute `enduser.username` (never duplicate raw JWT on span).
4. Store `{ sub, optionalUsername, tenantId? }` in request-scoped context for the `tools/call` handler.
5. On each `tools/call`, start span `mcp.tools/call` (name TBD) with attributes:

| Attribute | Source | Notes |
|-----------|--------|--------|
| `enduser.id` | JWT `sub` | OpenTelemetry semantic convention |
| `mcp.tool.name` | tool name | e.g. `api_call` |
| `mcp.tool.outcome` | classifier | `success`, `error`, `guidance`, `input_required` |
| `mcp.tool.duration_ms` | wall time | mirror histogram |
| `rundeck.api.invoked` | tool set | boolean, same as `rundeck_api` metric label |
| `rundeck.auth.mode` | config | `jwt_bearer` |
| `mcp.transport.session_id` | HTTP transport | when SDK exposes it |

6. Export spans via **OTLP gRPC** (same collector endpoint as metrics, or `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT`).

**Structured logs (same Tier C event):** when `OTEL_LOGS_EXPORTER=otlp` or MCP debug pipeline is enabled, emit one JSON log per tool call with `{ enduser_id, tool, outcome, duration_ms, trace_id }` — no token. Enables Loki queries if traces backend is not deployed.

**Queries customers run (examples):**

- **MAU (30d):** Tempo/Jaeger — `count distinct(enduser.id)` on `mcp.tools/call`
- **Top users by volume:** TraceQL / SQL on span table grouped by `enduser.id`
- **User drill-down:** filter `enduser.id="<sub>"` and `mcp.tool.name`

**Stdio fallback:** no JWT on wire → set `MCP_ENDUSER_ID` at process start; same span shape with static `enduser.id` on every call in that process.

#### Identity sources (by deployment)

| Mode | Who is the “user”? | How MCP learns it | Stable for MAU? |
|------|-------------------|-------------------|-----------------|
| **HTTP + JWT** (`jwt_bearer`) | Rundeck/OIDC subject | Decode `sub` from inbound `Authorization: Bearer` (telemetry only; Rundeck still validates) | Yes, if `sub` matches IdP/Rundeck user |
| **Stdio + PAT** | Rundeck user behind PAT | **Not visible** unless orchestrator sets env (below) | Only if env injected per launch |
| **Stdio + env** | Operator-defined | `MCP_ENDUSER_ID` or `OTEL_RESOURCE_ATTRIBUTES=enduser.id=…` at container spawn | Per process, not per chat |
| **Runlayer proxy** | PD user | Runlayer audit (`actor`); optional future header/env into container | Yes in Runlayer; optional in MCP |

#### Export tiers (summary)

| Tier | Phase | Mechanism | Per-user? |
|------|-------|-----------|-----------|
| **A. Metrics** | 0 (done) | `rundeck_mcp_tool_calls`, duration — **no** user label | Aggregate only |
| **C. Traces/logs** | **1 (required)** | Span + optional OTLP log per `tools/call`, `enduser.id` = JWT `sub` | **Yes** |
| **B. User on counters** | future / opt-in | Hashed `enduser.id` on Prometheus | Discouraged |

**Monthly active users (MAU):** always from **Tier C** (`count distinct enduser.id` over 30d on traces or logs), not from Prometheus counters.

#### Request-scoped attributes (HTTP)

When multiple users share one MCP HTTP process, identity must be **per `tools/call`**:

- Request context (AsyncLocalStorage): `{ enduserId, enduserUsername?, tenantId?, mcpTransportSessionId? }`.
- `recordToolCall()` starts/ends the Tier C span and records Tier A metrics **without** user labels.

#### Environment variables (Phase 1 — Tier C + JWT)

| Variable | Default | Purpose |
|----------|---------|---------|
| `RUNDECK_JWT_DECODE_FOR_TELEMETRY` | `1` when `jwt_bearer`, else `0` | Decode Bearer for `sub` / optional claims |
| `RUNDECK_JWT_TELEMETRY_USERNAME_CLAIM` | `preferred_username` | Optional second span attribute; omit if absent |
| `MCP_ENDUSER_ID` | — | Stdio/gateway when no JWT on request |
| `OTEL_TRACES_EXPORTER` | `otlp` when endpoint set | Enable trace export alongside metrics |
| `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` | falls back to `OTEL_EXPORTER_OTLP_ENDPOINT` | Trace-specific collector URL |
| `OTEL_LOGS_EXPORTER` | `none` | Set `otlp` to duplicate tool events as logs for Loki |
| `OTEL_RESOURCE_ATTRIBUTES` | — | Static `deployment.id`, `tenant.id` on resource |

Never export: full JWT, `RUNDECK_TOKEN`.

#### Grafana patterns

- **Prometheus (Tier A):** tool calls by `tool`, `outcome` — existing dashboard.
- **Tempo / Jaeger (Tier C):** MAU, top users, per-user tool timeline — **primary per-user UX**.
- **Loki (Tier C logs):** same KPIs if `OTEL_LOGS_EXPORTER=otlp`.
- **Join:** `enduser.id` = Rundeck audit user when JWT passthrough is used.

### Deployment patterns

**A. Customer env (Docker / npm)** — pass OTLP env at runtime (preferred for production).

**B. Local testing image (`Dockerfile` target `local-otel`)** — embeds OTLP endpoint; default `http://host.docker.internal:4317` for Docker Desktop bridge to host-published `:4317`. Override build-arg `OTEL_COLLECTOR_ENDPOINT=http://otel-collector:4317` when MCP runs on the same Docker network as the collector.

**C. Runlayer stdio** — operator cannot rely on shell `export OTEL_*`; use `local-otel` image or future Runlayer-injected env.

### Reference pipeline

```text
MCP process (tools/call)
    │ OTLP gRPC :4317  (metrics + traces [+ logs])
    ▼
OpenTelemetry Collector
    ├─ metrics → prometheus exporter :8889 → Prometheus → Grafana (tools, SLOs)
    ├─ traces  → Tempo / Jaeger              → Grafana (per-user MAU, drill-down)
    └─ logs    → Loki (optional)             → Grafana (same KPIs via LogQL)
```

### Dashboard (reference)

- **Folder:** Rundeck (file provisioning)
- **Top row:** tool share (donut) + stacked activity by tool
- **Tables:** tool totals, tool × outcome
- **Not** client hook metrics (`claude_code_*`)

## Phase 1 — Identity, session & per-user usage (stdio + HTTP prep)

### Stdio / Docker (one process ≈ one MCP connection)

| Concept | Definition | Implementation option |
|---------|------------|------------------------|
| **MCP connection session** | Lifetime of one server process | `service.instance.id` = UUID at `initTelemetry()` |
| **Chat / IDE session** | Conversation in Cursor/Claude | Not visible unless client injects env (e.g. `MCP_SESSION_ID`) — **optional, deployment-specific** |
| **End user** | Human using MCP | `MCP_ENDUSER_ID` at spawn **or** unknown (aggregate-only metrics) |

**Metrics:**

- Add resource attribute `mcp.session.id` (same as instance id for stdio).
- If `MCP_ENDUSER_ID` set → resource `enduser.id` for process lifetime (Tier C on resource; Tier B only if opt-in env).
- **Do not** add high-cardinality `session_id` as a counter label in shared Prometheus unless retention/cardinality is managed.

**Operational gauge (optional):**

- `rundeck_mcp_active_instances` — external (count running containers with image `rundeck/mcp*`), not in-process.

### HTTP + JWT (`RUNDECK_AUTH_MODE=jwt_bearer`, see oauth spec)

| Concept | Source |
|---------|--------|
| **Authenticated user** | JWT `sub` when `RUNDECK_JWT_DECODE_FOR_TELEMETRY=1` |
| **MCP transport session** | Streamable HTTP session id from MCP SDK / transport layer |
| **Tenant** | Claim or gateway header (TBD) → `tenant.id` resource attribute |

**Per-user usage (Tier C — in scope Phase 1):**

- Every `tools/call`: OTLP **span** with `enduser.id` = JWT `sub` (see Tier C table above).
- Metrics unchanged (Tier A, no user label).
- Span attribute `rundeck.auth.mode` = `jwt_bearer`.

**Concurrent sessions:** request-scoped context (AsyncLocalStorage) so user A’s spans never get user B’s `sub`.

### Phase 1 implementation touchpoints

- `src/telemetry.ts` — extend `NodeSDK` with trace exporter; `recordToolCall()` wraps handler in span; read `enduser.id` from AsyncLocalStorage.
- `src/telemetry/jwt-telemetry.ts` (or similar) — parse Bearer payload for `sub` / username claim; no token logging.
- HTTP middleware ([oauth spec](./mcp-http-oauth-jwt.md)) — set telemetry context from Bearer before MCP dispatch.
- `src/index.ts` — unchanged tool handlers; context + `recordToolCall` at dispatch boundary.
- Tests: fake JWT → exported span attributes include `enduser.id`; parallel requests isolated.

## Phase 2 — Central product requirements (future)

- [ ] Documented **Helm/Docker Compose** snippet: MCP + OTLP endpoint for enterprise
- [ ] **SLO panels:** error rate, p95 latency by tool, guidance ratio
- [ ] **Per-user panels (Tier C):** MAU, top-N users, tool breakdown by `enduser.id` — Tempo/Jaeger or Loki datasource
- [ ] **Alerting** examples (optional): spike in `outcome=error`, drop in export health; optional per-tenant anomaly
- [ ] **Trace correlation:** `trace_id` from MCP to Rundeck API spans (if Rundeck trace context propagated); same trace carries `enduser.id`
- [ ] **Runbook:** distinguish empty dashboard (OTLP path) vs no usage; cardinality runbook when enabling per-user metric labels

## Acceptance Criteria

### Phase 0 (done — maintain)

- [ ] With OTLP endpoint set, `tools/call` increments `rundeck_mcp_tool_calls` with correct `tool`, `outcome`, `rundeck_api` — Verification: unit tests in `telemetry.test.ts`; manual `curl :8889/metrics | grep rundeck_mcp`
- [ ] Without OTLP endpoint, zero export overhead path (no `sdk.start()` failure) — Verification: unit test
- [ ] `OTEL_METRIC_EXPORT_INTERVAL` &lt; default timeout does not crash startup — Verification: unit test
- [ ] `CLAUDE.md` / `SETUP.md` document env vars — Verification: doc review
- [ ] `local-otel` target builds and smoke tests pass — Verification: `ci/docker-smoke-test.sh`

### Phase 1 (planned)

- [ ] **Session id** on resource for each process (`service.instance.id` or `mcp.session.id`) — Verification: integration test with OTel exporter mock or collector testcontainer
- [ ] **Tier C traces:** OTLP trace export enabled when OTLP endpoint configured; one span per `tools/call` — Verification: unit/integration test with in-memory span exporter
- [ ] **HTTP + JWT:** span `enduser.id` = JWT `sub` from inbound Bearer when `RUNDECK_JWT_DECODE_FOR_TELEMETRY=1`; parallel requests get distinct `sub` — Verification: unit test with signed or test JWT payloads
- [ ] **Span attributes:** `mcp.tool.name`, `mcp.tool.outcome`, `mcp.tool.duration_ms`, `rundeck.api.invoked` on every tool span — Verification: unit test
- [ ] **Stdio:** `MCP_ENDUSER_ID` sets `enduser.id` on every tool span when set — Verification: unit test
- [ ] **Metrics unchanged:** Prometheus counters **must not** gain `enduser.id` label in Phase 1 — Verification: unit test / regression on `telemetry.test.ts`
- [ ] **No** full JWT or `RUNDECK_TOKEN` in logs, spans, or metric labels — Verification: code review
- [ ] **SETUP.md:** document Tier C pipeline (collector traces → Tempo), example MAU query, env vars — Verification: doc review
- [ ] Spec cross-link in [mcp-http-oauth-jwt.md](./mcp-http-oauth-jwt.md) — Verification: doc review

### Phase 2 (planned)

- [ ] Published **Grafana JSON** or Helm config in **this repo** (or `rundeck/docs`) for customers without `rundeck-development` — Verification: import dry-run
- [ ] Dashboard rows: **MAU**, **calls by user (top 10)**, tool mix per `deployment.id` / `tenant.id` — Verification: import dry-run
- [ ] **Example Grafana dashboard** panels wired to Tempo (Tier C), not Prometheus, for per-user KPIs — Verification: import dry-run

## Scope

**In scope:**

- Server-side OTel **metrics + traces (Tier C)** design, JWT `sub` → `enduser.id`, env contract, Docker `local-otel`, reference Grafana dashboards (aggregate + per-user trace panels), identity model stdio vs HTTP, relation to Rundeck logs and client hooks.

**Out of scope:**

- Implementing MCP HTTP transport (see oauth spec).
- Runlayer product changes (audit export to customer Prometheus).
- Claude Code managed OTel (org-blocked local collector).
- Micrometer per-User-Agent on Rundeck server (not available today).
- Billing/chargeback logic.

## Open questions

1. **Ship `local-otel` to customers** or only document env vars on official `rundeck/mcp` image?
2. **Standard env names** for orchestrator-injected identity on stdio (`MCP_SESSION_ID`, `MCP_ENDUSER_ID`, `OTEL_RESOURCE_ATTRIBUTES`)?
3. **HTTP:** same JWT for MCP and Rundeck — confirm `sub` stable for MAU and matches Rundeck audit username.
4. **Long-term home** for dashboard JSON: `rundeck_mcp` repo vs `rundeck/docs` vs customer Helm chart?
5. **JWT telemetry decode:** verify signature with Rundeck-trusted JWKS vs payload-only decode in dev (`RUNDECK_JWT_TELEMETRY_VERIFY=0`)?
6. **Runlayer:** inject audit `actor` as `MCP_ENDUSER_ID` for stdio Tier C spans when JWT unavailable?
7. **Tier B** ever needed, or always trace/Loki for per-user PromQL-adjacent KPIs?

## Context

- Implementation: `src/telemetry.ts`, `src/index.ts` (`recordToolCall`)
- User-Agent for Rundeck REST: `src/tools/api.ts` (`rundeck-mcp/<version>`)
- Related: [mcp-http-oauth-jwt.md](./mcp-http-oauth-jwt.md), `SETUP.md`, `RUNLAYER.md`, monitoring doc `claude-code-rundeck-mcp-monitoring.md`

## Compaction note

Preserve: **OTLP push**, **`rundeck_mcp_*` metrics**, **Tier C JWT → `enduser.id` traces**, **no user on Prometheus**, **Phase 0/1/2**, **sources table**, **local-otel**, **not hooks metrics**.
