# Plan: MCP protocol revision 2026-07-28 compliance

Branch: `protocol-update-final` (HEAD `9ec31a4` at time of writing).
Target: serve both the 2025-era protocol (existing clients) and 2026-07-28
from the same handler registrations in `src/index.ts`.

> Scrubbed by three independent review passes (SDK type-declaration audit,
> full changelog-completeness audit, live-codebase accuracy audit) after the
> first draft. Corrections from that review are folded in throughout; see
> the `[REVIEWED]` markers.

## Execution order — go/no-go gate on the `elicitInput`/MRTR rework

**Do Step 2b first, before any other step, as a spike.** Everything else in
this plan (transport wiring, `CacheableResult` fields, Inspector config) is
low-risk, mechanical, and independently valuable — but the entire reason
this migration is worth doing now is that `server.elicitInput` throws on a
2026-07-28-era request, and the MRTR replacement is the one piece of
genuinely new, unverified protocol machinery in this plan (see the
confidence assessment discussed earlier: the SDK's type signatures for
`inputRequired`/`acceptedContent`/`ServerContext` are confirmed correct,
but the actual retry semantics — does the client resend identical
`tools/call` params, does `requestState` round-trip cleanly, does
`acceptedContent` key correctly against what `inputRequired.elicit`
produced — have not been exercised end-to-end against a real client).

Concretely, before touching Step 1/2a/3/4/5:
1. Build the dedicated MRTR integration test described in Step 4 (the
   `api_call` `DELETE` → `input_required` → retry-with-`inputResponses` →
   completed-action round trip) against a minimal spike version of the
   Step 2b rework in `confirmation.ts`.
2. Get that round trip working end-to-end for real, including a concrete,
   defensible answer for `requestState` integrity-protection (not just a
   TODO).
3. **If that spike can't be gotten working correctly** — e.g. the retry
   semantics don't behave as the type signatures imply, or the
   `requestState` verification story doesn't close cleanly — **stop and
   postpone this entire effort to 2.0.0** rather than shipping a partial or
   fragile MRTR implementation. The rest of the plan (transport wiring,
   `CacheableResult`, Inspector config) is not worth landing on its own if
   the one thing that actually required this migration doesn't work, since
   a server that serves the 2026-07-28 era via `serveStdio` but silently
   breaks destructive-action confirmation for modern clients is worse than
   not serving that era at all.
4. Only once the spike is confirmed working does the rest of the plan
   (Steps 1, 2a, 3, 4, 5) proceed, in whatever order is convenient — they
   don't depend on each other or on Step 2b having landed first, they were
   just written up earlier because they're the easy part.

> **[SPIKE RESULT — GO.]** Implemented and verified end-to-end against a
> real client (`@modelcontextprotocol/client`, pinned to
> `versionNegotiation: { mode: { pin: "2026-07-28" } }`) driving the actual
> compiled server as a child process: `tools/call` (api_call, DELETE) →
> `input_required` (embedding an `elicitation/create` request) → the
> client's registered `elicitation/create` handler answers it → the SDK's
> `autoFulfill` retries the original request with `inputResponses` attached
> → a final ordinary result (declined guidance on decline, proceeds to
> `rundeckApiCall` on accept). Both legs (accept and decline) verified; the
> existing 2025-era legacy path verified unaffected (all pre-existing tests
> still pass); confirmed load-bearing by temporarily forcing the legacy
> branch on a modern-era connection and watching both new integration tests
> fail with the expected "confirmation unavailable" guidance (since
> `elicitInput` throws on a 2026-07-28 request), then restoring the fix.
>
> Two things Step 2b's original write-up got wrong or missed, found only by
> running this for real (not resolvable by reading `.d.mts` files alone):
> - **`requestState` is not needed at all.** Since the client is expected to
>   retry the exact same `tools/call` request verbatim, the handler
>   naturally re-derives the same `DestructiveAction` from `request.params`
>   on replay — nothing needs to survive round-trip in opaque state. This
>   sidesteps the `requestState` integrity-protection question entirely
>   (no `ServerOptions.requestState.verify` hook needed for this use case).
> - **`server.getClientCapabilities()`'s "backfilled per request from the
>   validated envelope on the 2026-07-28 era" doc comment did not hold up**
>   against a real client — it returned `undefined` even though the
>   request's envelope demonstrably carried a populated
>   `clientCapabilities` (confirmed via direct inspection). Worked around by
>   reading the capability directly off
>   `ctx.mcpReq.envelope[CLIENT_CAPABILITIES_META_KEY]` instead of going
>   through that accessor, for the modern-era branch only (the legacy branch
>   still uses `getClientCapabilities()` as before, unaffected).
>
> Implementation landed in `src/utils/confirmation.ts` (era-branching
> `requestDestructiveConfirmation`, now returning a
> `{ kind: "outcome" | "input_required" }` discriminated union),
> `src/index.ts` (both call sites plus the `tools/call` handler's new `ctx`
> parameter — which also required Step 1's `serveStdio` transport swap as a
> hard prerequisite, since a 2026-07-28-era connection literally cannot be
> reached without it), `src/__tests__/utils/confirmation.test.ts` (legacy
> tests preserved, modern-era MRTR tests added), and a new
> `src/__tests__/integration/integration-mrtr-confirmation.test.ts`.
> Steps 2a, 3, and 4 (the `CacheableResult` fields, Inspector config, and the
> broader integration-test suite) were not done as part of this spike — only
> what was needed to prove and exercise the MRTR replacement.

## Starting state

- `package.json` already depends on `@modelcontextprotocol/server@^2.0.0` /
  `@modelcontextprotocol/client@^2.0.0`, and `node_modules` has that version
  installed. This SDK version implements the full 2026-07-28 spec (stateless
  requests, `server/discover`, the `resultType`/`_meta` envelope, MRTR,
  `subscriptions/listen`, renumbered error codes, etc.) behind a "legacy
  shim" that can serve 2025-era clients from the *same* handler
  registrations used for the modern era.
- `src/index.ts` currently wires the transport by hand:
  `new StdioServerTransport()` + `await server.connect(transport)`
  (`src/index.ts:557-558`). This form only ever serves the 2025-era
  protocol, regardless of installed SDK version — confirmed against the
  SDK's own type declarations (`serveStdio`'s `legacy` option and the
  `ServeStdioOptions` doc comments in
  `node_modules/@modelcontextprotocol/server/dist/stdio.d.mts`).
- `src/utils/confirmation.ts`'s `requestDestructiveConfirmation` calls
  `server.elicitInput(...)` (a blocking server→client request). The
  installed SDK's type declarations mark this **`@deprecated`: "Throws on a
  2026-07-28-era request — use `inputRequired(...)` instead. The 2025
  push-style server-to-client request model is replaced by input_required
  results in the 2026-07-28 protocol."** Same deprecation applies to
  `createMessage`, `listRoots`, and `ping` (none of which this codebase
  calls). This is not a hypothetical concern raised by the spec text alone —
  it is enforced by the concrete SDK version already in `package.json`.
- Two call sites depend on `requestDestructiveConfirmation`:
  `src/index.ts:317` (`api_call`, for `DELETE` and runner-credential
  regeneration) and `src/index.ts:399` (`acl_manage`, for
  `action === "delete"` and `action === "update"` only — **[REVIEWED]**
  confirmed there is no confirmation gate on ACL `create`).
- This server is stdio-only. HTTP-transport-specific changes in the spec
  (Streamable HTTP session-ID removal, `Mcp-Method`/`Mcp-Name`/
  `x-mcp-header`, SSE resumability removal, HTTP+SSE deprecation) do not
  apply here and are out of scope.
- Roots, Sampling, and Logging (deprecated features) were never used in
  this codebase — nothing to remove for those.

## Step 1 — Stdio transport wiring [DONE]

In `src/index.ts`:
- Replace `new StdioServerTransport()` + `server.connect(transport)` with
  `serveStdio(() => server)` imported from
  `@modelcontextprotocol/server/stdio`.
- Keep the single `Server` instance built at module scope as-is — a stdio
  process serves exactly one connection for its lifetime, so
  `serveStdio`'s factory is only ever invoked once; no need to move ~300
  lines of handler registrations into a new function scope.
- Wire `ServeStdioOptions.onerror` to `logger.error`. Out-of-band errors
  during the opening/era-classification exchange (e.g. a malformed
  2026-07-28 envelope claim) happen before any `Server` instance is pinned,
  so they never reach the instance's own `server.onerror` — this must be
  set explicitly or those errors are invisible in logs.
- **[REVIEWED — correction]** The original draft claimed no handler-logic
  changes are needed anywhere outside the MRTR confirmation rework. That's
  wrong for one thing: the 2026-07-28 `CacheableResult` interface requires
  a `ttlMs` and `cacheScope` field on results from `tools/list`,
  `prompts/list`, `resources/list`, and `resources/read` — this is a
  response-shape requirement, independent of transport, so it applies to
  this stdio server too. See new Step 2a below. Aside from that, the
  `resources/*`, `tools/list`, `prompts/*` registrations otherwise need no
  changes — the SDK's legacy shim serves both eras from the same
  registrations for everything else (version negotiation, `resultType`
  envelope, `server/discover`, etc.).

## Step 2a — `CacheableResult` (`ttlMs`/`cacheScope`) on list/read results [DONE]

**[REVIEWED AGAIN during implementation — the "real gap" framing above was
itself wrong; corrected here.]** Reading the SDK's actual cache-hint
plumbing (`resultCacheHints.d.ts`, bundled into
`createMcpHandler-CLhGwQTn.d.mts`) rather than just the `CacheableResult`
interface shows the SDK resolves `ttlMs`/`cacheScope` at the era-aware
encode seam automatically, most-specific-first: (1) fields the handler put
on the result itself, (2) a configured cache hint (per-registration, then
server-level, via `ServerOptions.cacheHints`), (3) conservative defaults
(`{ ttlMs: 0, cacheScope: 'private' }`). So **compliance never required any
handler changes at all** — the defaults alone satisfy the wire requirement,
and 2025-era responses are never affected either way.

What *is* worth doing, as a genuinely optional performance tuning (not a
compliance requirement): configure `cacheHints` in `ServerOptions` when
constructing `new Server(...)` in `src/index.ts`, since none of
`tools/list`/`prompts/list`/`resources/list`/`resources/read`'s content is
sensitive or per-caller — `cacheScope: "public"` is safe, with short TTLs
(5–10 min) so a `rundeck_connect` switch or docs update surfaces promptly.
Implemented as a single `cacheHints` object on the `Server` constructor's
options — no per-handler changes needed, since `ServerOptions.cacheHints`
applies at the server-config level regardless of the low-level
`setRequestHandler` API this codebase uses (there's no `McpServer`-only
requirement here, unlike the per-resource `cacheHint` option which *is*
`McpServer.registerResource`-only and not used).

## Step 2b — MRTR rework of destructive-action confirmation

This is the substantive compliance gap, not just wiring.

1. Extend the low-level `tools/call` handler's signature in
   `src/index.ts:286` from `async (request) => ...` to
   `async (request, ctx) => ...` so handlers can read
   `ctx.mcpReq.inputResponses` and `ctx.mcpReq.envelope` (2026-07-28) or
   fall back to the 2025-era path when `ctx.mcpReq` is absent/undefined.
   **[REVIEWED — citation fixed, conclusion confirmed correct.]** The
   original draft pointed at `McpRequestContext` (line ~3781 of
   `createMcpHandler-CLhGwQTn.d.mts`) as the type to check — that's wrong;
   `McpRequestContext` is the **factory-construction** context (`{ era,
   authInfo?, requestInfo? }`), used only by `McpServerFactory`, not the
   per-request handler context. The real type is `ServerContext extends
   BaseContext`, since `Server extends Protocol<ServerContext>` and
   `Protocol.setRequestHandler<M>(method, handler: (request, ctx:
   ContextT) => ...)`. `BaseContext.mcpReq` (same file, ~lines 2073-2167)
   includes `inputResponses?: Record<string, unknown>`,
   `envelope?: Partial<RequestMetaEnvelope>`, and `requestState:
   RequestStateAccessor` — all reachable from a **raw**
   `setRequestHandler` registration with no `McpServer` needed. The
   plan's original conclusion (this is reachable from the low-level API)
   was correct; only the file/line pointer was wrong.
1a. Update both call sites (`src/index.ts:317` and `src/index.ts:399`, and
   any other `tools/call` case that needs it) to pass the new `ctx`
   parameter through.
2. Rework `requestDestructiveConfirmation` (`src/utils/confirmation.ts`) to
   branch on era:
   - **Legacy (2025-era) path**: unchanged — keep calling
     `server.elicitInput(...)` exactly as today.
   - **Modern (2026-07-28) path**: cannot block mid-handler. Instead:
     - On first entry (no prior `inputResponses` for this confirmation),
       return an `InputRequiredResult` built via
       `inputRequired({ inputRequests: { confirm: inputRequired.elicit({ message, requestedSchema }) }, requestState })`
       from `@modelcontextprotocol/server`. `requestState` must encode
       enough to identify which destructive action was being confirmed
       when the client retries the original `tools/call` request — per the
       SDK's doc comments, `requestState` is opaque but round-trips through
       an untrusted client, so if it's more than an opaque marker (e.g. if
       it encodes which action/endpoint to actually perform on retry) it
       must be integrity-protected (HMAC/AEAD) via
       `ServerOptions.requestState.verify`, not trusted verbatim.
     - On retry (client resubmits the same tool call with
       `ctx.mcpReq.inputResponses` populated), read the elicitation result
       via `acceptedContent(ctx.mcpReq.inputResponses, 'confirm')` and
       proceed/decline based on it, mirroring today's
       `"confirmed"`/`"declined"`/`"unsupported"` trichotomy as closely as
       possible.
   - This changes `requestDestructiveConfirmation`'s signature: it needs
     access to `ctx` (or the era + inputResponses + a requestState-emitting
     capability) in addition to `server` and the `DestructiveAction`. Design
     the exact signature during implementation once the `ctx` type from
     step 1 is confirmed.
3. Update both call sites (`src/index.ts:317` and `src/index.ts:399`) to
   pass through whatever `requestDestructiveConfirmation` now needs, and to
   handle a possible `InputRequiredResult` return value by returning it
   directly from the `tools/call` handler (bypassing the normal
   `CallToolResult` content wrapping) rather than a guidance markdown blob
   for the "needs more input" case specifically — decline/unsupported
   outcomes keep using today's `returnGuidance(...)` paths.
4. Update `src/__tests__/utils/confirmation.test.ts` to cover the new
   modern-era branch (asserting an `InputRequiredResult` is returned on
   first entry, and that a retried call with `inputResponses` completes the
   action), alongside the existing legacy-era tests which should keep
   passing unmodified.

> **[POST-LAUNCH SIMPLIFICATION — the dual-branch design above was
> superseded.]** After the initial spike shipped (dual era-branch: legacy
> called `server.elicitInput()` directly, modern used `inputRequired()`),
> a review pass cross-checked this migration against the official SDK
> migration guide
> (https://ts.sdk.modelcontextprotocol.io/v2/migration/support-2026-07-28.html),
> which states handlers should be **written once** in the `inputRequired()`
> style and served on both eras via the SDK's built-in legacy shim.
>
> Verified this directly against the installed SDK's *runtime source*
> (not just doc comments, given how many doc-comment-vs-real-behavior
> mismatches this migration already turned up): `Protocol.setRequestHandler`
> unconditionally wraps every registered handler through
> `Server._wrapHandler` (`src-CX2iR2pK.mjs:6774`), whose override
> (`mcp-DXXb3Vv3.mjs:816`) routes `tools/call`/`prompts/get`/
> `resources/read` through `_invokeInputRequiredCapableHandler`. On a
> legacy-era request, an `InputRequiredResult` return dispatches to
> `LegacyInputRequiredShim.fulfill()` (`mcp-DXXb3Vv3.mjs:542`), which sends
> a **real** `elicitation/create` request via the exact same
> `_sendElicitationLeg` primitive `Server.elicitInput()` itself calls, then
> re-invokes the same handler with `ctx.mcpReq.inputResponses` populated —
> applying automatically to a raw `Server.setRequestHandler('tools/call',
> ...)` registration, no `McpServer` needed. Confirmed empirically too: a
> plain default-negotiation (unpinned, 2025-era) `Client` in
> `integration-mrtr-confirmation.test.ts` produces byte-identical log
> behavior to the 2026-07-28-pinned client, going through this same code
> path.
>
> **`requestDestructiveConfirmation` was simplified to a single code path**
> for both eras: no more `isModernEra` branch, no more direct
> `server.elicitInput()` call anywhere in the file. It still does its own
> era-aware capability check up front (`ctx.mcpReq.envelope !== undefined`
> ? read `CLIENT_CAPABILITIES_META_KEY` off the envelope : `server.
> getClientCapabilities()`) so a client that never declared `elicitation`
> gets this codebase's friendly `getConfirmationUnavailableGuidance`
> markdown rather than the SDK's generic missing-capability error — that
> part couldn't be dropped without a UX regression. One accepted, documented
> tradeoff: a raw dispatch failure on a legacy connection (as opposed to the
> client simply not declaring the capability) now surfaces as the SDK's own
> generic `isError` result from `LegacyInputRequiredShim`'s failure path,
> not this codebase's friendlier guidance text — a narrower, rarer case than
> before, and explicitly commented in `confirmation.ts`.
>
> Also fixed in the same pass, per the independent correctness-audit
> review: `ctx.mcpReq.droppedInputResponseKeys` (a retried answer the SDK
> silently drops for being malformed, e.g. a wrapped `{method, result}`
> shape) is now logged explicitly rather than being silently indistinguishable
> from "no answer yet."
>
> Net effect: less code, one fewer deprecated-API usage
> (`server.elicitInput` no longer appears anywhere), and the exact pattern
> the SDK's own migration guide recommends — verified against real clients
> on both eras, not just the guide's prose.

## Step 3 — Inspector support for both eras [DONE]

**[VERIFIED against the actually-installed Inspector, not just assumed from
the sibling branch's approach]** — read the installed
`@modelcontextprotocol/inspector`'s CLI source directly (`--help` output
plus grepping `clients/cli/build/index.js` for `protocolEra`/`mcpServers`
parsing) to confirm the config shape and `--config`/`--server` flags below
are real, then drove `npx mcp-inspector --cli --config ./inspector.config.json
--server rundeck-mcp --method initialize` against the built server and
confirmed the response's `protocolVersion` is literally `"2026-07-28"` —
not just that the config file was accepted.

- Add `inspector.config.json` at the repo root:
  ```json
  {
    "mcpServers": {
      "rundeck-mcp": {
        "command": "node",
        "args": ["dist/index.js"],
        "protocolEra": "modern"
      }
    }
  }
  ```
  (MCP Inspector's ad-hoc launch mode, `mcp-inspector <command>`, has no
  persisted server entry for a Protocol Era setting to attach to.)
- Update `package.json`'s `inspect` script from
  `npm run build && mcp-inspector node dist/index.js` to
  `npm run build && mcp-inspector --config ./inspector.config.json --server rundeck-mcp`.

## Step 4 — Integration tests [DONE]

**[DONE — implemented in `src/__tests__/integration/integration-modern-era.test.ts`
(new) plus the earlier `integration-mrtr-confirmation.test.ts` from the
Step 2b spike.]** The new file covers: negotiating `2026-07-28` and listing
tools, a non-destructive `api_list` call asserting a plain `CallToolResult`
(explicitly not an `input_required` shape) — the corrected assertion noted
below — and deterministic `tools/list` ordering across repeated calls
matching `REGISTERED_TOOL_NAMES` (verified, not just assumed, per the
changelog-completeness review's suggestion). The existing default-`Client()`
gating/schema-fidelity tests were left untouched as the legacy-path
regression check.

- Add a modern-era integration test alongside
  `src/__tests__/integration/integration-server-tool-gating.test.ts` (or a
  new file) that pins a real `Client` to
  `versionNegotiation: { mode: { pin: "2026-07-28" } }` and drives
  `discover → tools/list → tools/call` against the built server.
  **[REVIEWED — correction]** The original draft said to assert
  `resultType: "complete"` on the result. That doesn't work as written:
  the SDK's typed `Client.callTool()` strips the wire-only `resultType`
  discriminator before handing back a plain `CallToolResult` on *both*
  eras — `resultType` is only preserved on the typed client's
  `InputRequiredResult` return (the `input_required` case). So for the
  ordinary-call assertion, either (a) assert the result is a plain
  `CallToolResult` and is *not* an `InputRequiredResult` shape, or (b) if
  actually seeing `resultType: "complete"` on the wire matters, drive the
  request at the raw JSON-RPC level instead of through `Client.callTool()`.
- Add a dedicated integration test exercising the MRTR confirmation flow
  end-to-end on the modern era: call `api_call` with `method: DELETE`
  against some endpoint, assert the first response is
  `resultType: "input_required"` with an embedded `elicit` request, submit
  a client-side `inputResponses` accepting the elicitation, retry the same
  `tools/call` request, and assert the action completes.
- Keep the existing default-`Client()` tests (no version pin → 2025-era
  negotiation) as the legacy-path regression check for both `tools/list`
  gating and the existing (unchanged) `requestDestructiveConfirmation`
  behavior.

## Step 5 — Verify, don't assume [DONE]

- `npm run build && npm test` — 385 tests pass (28 suites). `npm run
  validate` (build + test + doc-corpus integration validations) also
  passes clean.
- Drove the modern era via `npm run inspect`'s new config (Step 3) and
  confirmed `initialize`/`server/discover` negotiate `protocolVersion:
  "2026-07-28"` for real, not just that the CLI accepted the config.
- Temporarily forced the legacy branch in `requestDestructiveConfirmation`
  on a modern-era connection (i.e. simulated Step 1 not having landed) and
  confirmed both MRTR integration tests failed with the exact expected
  "confirmation unavailable" guidance (since `elicitInput` throws on a
  2026-07-28 request) — proving the tests are load-bearing — then restored
  the fix and re-confirmed all tests pass.
- Rebuilt and smoke-tested the Docker image (`rundeck/mcp-ci:latest`) after
  landing the Step 2b spike; all smoke tests passed including a real MCP
  `initialize` round trip. Manually exercised the rebuilt image via real
  Claude Code sessions (containers `musing_villani`, `gifted_johnson`):
  confirmed the legacy 2025-era path (Claude Code's default negotiation)
  is unaffected — tool listing, `api_call`, `docs_search`, and both
  destructive-action confirmation outcomes (decline and accept, via the
  legacy `elicitInput` path) all worked correctly against a live Rundeck
  instance, including finding and using the real
  `runnerManagement/runner/{id}/regenerateCreds` endpoint end-to-end.

## Explicitly out of scope

- Any Streamable HTTP / SSE transport changes, and the `Mcp-Method`/
  `Mcp-Name`/`x-mcp-header` requirement (this server is stdio-only).
- Removing/reworking Roots, Sampling, Logging support, and the
  `includeContext: "thisServer"/"allServers"` deprecation (none ever
  implemented here — confirmed via grep, no `listRoots`/`createMessage`/
  logging-capability code exists).
- The tasks extension (`io.modelcontextprotocol/tasks`) — not used by this
  codebase. **[REVIEWED — added]** the first draft omitted this silently;
  named here for audit completeness.
- OAuth/DCR-related spec changes (RFC 9207 `iss`, DCR `application_type`,
  issuer-bound credentials) — this server has no authorization-server
  interaction; the only "OAuth" references in `src/` are guidance prose
  about *Rundeck's own* auth options, not this server implementing one.
- `subscriptions/listen` (replaces `resources/subscribe`/`unsubscribe`) —
  this server never declares the `subscribe` capability and has no
  `resources/subscribe` handler. **[REVIEWED — added]**.
- Error code renumbering (`-32001`→`-32020` etc.) and the resource-not-found
  code change (`-32002`→`-32602`) — **[REVIEWED — added]** grepped `src/`
  for hardcoded JSON-RPC error codes in the affected range: none found.
  `handleResource`'s not-found case throws a plain `Error`; any JSON-RPC
  error code is assigned by the SDK's error-wrapping layer, not app code.
  No action needed, but call this out explicitly rather than going silent,
  since the plan elsewhere asserts this SDK version implements the full
  spec.
- Looser `inputSchema`/`outputSchema`/`structuredContent` (JSON Schema
  2020-12) — **[REVIEWED — added]** purely permissive; this codebase's
  custom `additionalProperties: false` hardening (`restoreAdditionalProperties`
  in `src/index.ts:72-101`) remains valid and compatible, no changes needed.
- Deterministic `tools/list` ordering — **[REVIEWED — added]** already
  satisfied incidentally: `REGISTERED_TOOL_NAMES` is a static array with
  `rundeck_connect` always appended last, so output order is already
  deterministic. No action needed, but noting it here means this was
  verified rather than accidentally compliant.
- `extensions` field on capabilities, OpenTelemetry `_meta` trace
  conventions, and the `schema.json` number-vs-integer typing fix —
  **[REVIEWED — added]** all purely additive/tooling-level; nothing in
  this codebase needs to change for any of them.
- Reconciling this branch with the separately-diverged `update-protocol`
  branch (explicitly deferred per user decision — working from
  `protocol-update-final` as the base).
