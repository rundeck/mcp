# Switching Rundeck instances mid-session

## Goal
Today, using a different Rundeck instance means: quit Claude → edit `RUNDECK_URL`/`RUNDECK_TOKEN` → restart Claude → a brand-new MCP process/container starts. Internal folks — our team, other teams testing against multiple Rundeck instances (prod, staging, a customer's instance) — want to register several instances once, then say "use staging" mid-conversation: safely (tokens never touch the agent's context, logs, or transcript), conveniently (no bind mounts, no hand-escaped JSON, no re-running `claude mcp add-json` every time they switch), with zero setup change for anyone who only has one instance.

The actual install path for internal users is:
```
claude mcp add-json rundeck '{"command":"uvx","args":["runlayer","run","<uuid>","--host","https://pagerduty.runlayer.com"]}'
```
Runlayer owns that invocation — there's no bind mount or extra CLI flag to reach through it. The only lever is environment variables, however they get there. That constraint shapes everything below.

## The mechanism
`configManager` (`src/config.ts`) is an in-memory singleton inside the long-running server process. It already has `setRundeckConnection(url, token)` (`src/config.ts:90`) to overwrite its state at runtime — unused today, but the plumbing exists. Every tool (`api_call`, `job_create`, ...) reads `configManager.getConfig()` on each call, so once the singleton's state changes mid-session, every subsequent call picks it up with no restart and no new parameters on those tools. **Those tools are unchanged by this design.** If a user only ever sets `RUNDECK_URL`/`RUNDECK_TOKEN` (today's single-instance path), nothing here applies to them — that's it, done, same as before.

The one new tool is `rundeck_connect(instance: "staging")` — it takes a **name**, resolves it against a registry loaded into memory at startup, and calls `setRundeckConnection`. Tokens are read once at process start, from an env var already sitting in the process's environment — never passed as a tool argument, never appearing in a log or the transcript.

## The registry shape
One JSON object, with an explicit default:
```json
{
  "default": "prod",
  "instances": {
    "prod":    { "url": "https://rundeck-prod.example.com",    "token": "prod-token" },
    "staging": { "url": "https://rundeck-staging.example.com", "token": "staging-token" }
  }
}
```
`configManager` parses this once from `RUNDECK_INSTANCES` (an env var holding the whole blob) at startup. `default` doesn't get its own tracking concept — it's loaded via the existing `setRundeckConnection(url, token)` exactly like single-instance mode, so `rundeckUrl`/`apiToken` simply *become* `default`'s values before anyone calls `rundeck_connect`. The server is usable immediately after boot, not stuck waiting for an explicit selection.

`rundeck_connect(instance)` looks the name up in the registry and, on a match, calls `setRundeckConnection` again to switch. **On no match, the connection is cleared, not left pointing at whatever was previously active.** This is a deliberate correctness requirement, not a convenience: leaving the old connection (e.g. `default`/`prod`) active after a failed switch would mean a follow-up like "delete job X in instanceB" — where `instanceB` isn't registered — could silently execute against `prod` instead, because nothing forces the agent to notice and honor the error. Clearing the connection instead means there is no instance connected until a `rundeck_connect` call actually succeeds, so any subsequent `api_call`/`runner_create` mechanically fails closed — same "not configured" guidance path a brand-new user with no credentials at all already hits (`src/tools/api.ts`) — before any request is constructed, with zero network calls made. This isn't a matter of the agent being expected to behave correctly after seeing an error; the wrong-instance execution is structurally impossible, not just discouraged.

If `RUNDECK_INSTANCES` isn't set, behavior is completely unchanged: `RUNDECK_URL`/`RUNDECK_TOKEN` are the config, full stop.

## Getting the registry into `RUNDECK_INSTANCES` without hand-typing JSON
Two proposals for producing the same end state — `RUNDECK_INSTANCES` present in the MCP server process's environment — without a user ever pasting raw JSON (let alone tokens) into a shell command or an add-json payload. Both keep the registry as a normal file the user edits directly; neither has Claude read, echo, or relay its contents at any point.

### Proposal A — wrapper script
`scripts/rundeck-connect.sh <instances.json>` (added in this repo): reads the file, `export`s its content into `RUNDECK_INSTANCES`, and `exec`s `claude`. Because it's `exec`, not a subshell, `claude` (and whatever it spawns — a local process, Docker, or `uvx runlayer run ...`) inherits that env var normally, without needing it threaded through any add-json `"env"` field at all.
```
./scripts/rundeck-connect.sh ~/.rundeck-mcp/instances.json
```
The registry never touches Claude's context — the script is pure shell, run outside any Claude session, and its own body never prints the variable. It also validates the file's shape before exporting anything (valid JSON, every instance has `url`+`token`, `default` matches a registered name) and warns if the file is group/world-readable — all of that reporting is structural only (instance names, error messages), it never prints a url or token value even when something's wrong.

**Trade-off:** users have to remember to launch via this script instead of typing `claude` directly. Simple, portable, no dependency on any particular skill or setup flow.

### Proposal B — a setup skill does the groundwork
Extend `rundeck-mcp-docker-setup` (and/or `rundeck-mcp-setup`) to offer a "single instance or multiple?" branch. If multiple: ask for the registry file's path (or walk the user through creating it themselves in their editor — the skill tells them the shape and where to save it, but does **not** `Read` the file itself), then wire up the launch mechanism (e.g. writing a shell alias/function, or generating the same wrapper script above pointed at their file) so future `claude` launches pick it up automatically.

**Hard requirement, not optional:** the skill's own tool calls must never cause a token to appear in Claude's transcript or logs. Concretely that means:
- Never `cat`/`Read` the registry file's contents through a tool whose output becomes part of the conversation.
- Never construct a Bash command that echoes or interpolates the file's contents (e.g. no `echo $RUNDECK_INSTANCES`, no printing the JSON back for "confirmation").
- Only reference the file by **path** — existence checks (`[ -f "$path" ]`), permission checks, or handing the path to a generated script/alias — never its content.
- If validation of the JSON shape is needed, do it by invoking a script that reports pass/fail (or a redacted structural summary — instance names only, never url/token values) rather than dumping the parsed object.

**Trade-off:** better first-run UX (discoverable, guided, no manual scripting), but only helps users who go through that skill's flow; someone who already has a registry file and just wants to launch still reaches for Proposal A's script (or the skill can simply generate that same script for them, so the two proposals converge rather than compete).

## `src/index.ts` is the implementation target
`src/index.ts` — the stdio entry point, which is what the Dockerfile's `ENTRYPOINT` actually execs (`exec node dist/index.js`) — has its own handler registration: its own `ListToolsRequestSchema`/`CallToolRequestSchema` registration (`src/index.ts:131` / `src/index.ts:234`), its own `needsGuidance`/`returnGuidanceMarkdown` helpers, even a different tool set (no `runner_create`; plugin tools deliberately excluded per the Phase-1 comment at the top of the file). `src/create-server.ts` and `src/http.ts` — the local HTTP dev server they backed — have since been removed; `index.ts` is now the only server implementation, so there's no longer a second copy to keep in sync.

Since this feature is entirely about the Docker/`uvx runlayer run` path, **the implementation targets `src/index.ts`.**

## Concrete implementation map
What actually has to change, file by file:

1. **`src/config.ts`**
   - Add one piece of private state: `instanceRegistry: Record<string, {url: string; token: string}>` — just the lookup table. No separate "active instance" field is needed; `rundeckUrl`/`apiToken` (already on `RundeckConfig`) *are* the active state, exactly as they are today.
   - New `loadInstanceRegistry()`, called from `initialize()` alongside today's `RUNDECK_URL`/`RUNDECK_TOKEN` read: parses `process.env.RUNDECK_INSTANCES` as `{default, instances}`, stores `instanceRegistry`, and — if `default` names a valid entry — calls the existing `setRundeckConnection(url, token)` (`src/config.ts:90`) immediately, the same call any later switch uses. **The `JSON.parse` must be wrapped in try/catch.** `initialize()` runs synchronously at module load, before the server can respond to anything — an unparseable `RUNDECK_INSTANCES` (bad quoting, a stray trailing comma from hand-editing the file) would otherwise throw uncaught and kill the process before the MCP handshake, turning a bad edit into a full outage instead of a graceful fallback. On any parse/shape failure, log the failure and fall back to no registry (behaving as if `RUNDECK_INSTANCES` were unset) rather than crashing.
   - New `connectToInstance(name: string): {ok: true} | {ok: false; error: string}`: looks up `name` in `instanceRegistry`. On a hit, calls `setRundeckConnection` and returns `{ok: true}`. On a miss, **clears the connection** — sets `rundeckUrl`/`apiToken` back to `undefined`, the same as their initial unset state — rather than leaving them pointing at whatever was previously active, and returns `{ok: false, error}` listing the registered **names** (never url/token values). This is what makes a failed switch fail *closed*: the next `getConfig()` call sees missing credentials and every live-API tool takes the existing "not configured" branch, refusing to run rather than silently using a stale instance.
   - New `clearConnection()`: sets `this.config.rundeckUrl`/`this.config.apiToken` back to `undefined`. `setRundeckConnection(url: string, token: string, ...)` (`src/config.ts:90`) takes required strings, so it can't itself express "no connection" — this is the one genuinely new piece of state-mutation logic the feature needs, and `connectToInstance` calls it on every miss.
   - New `listInstanceNames(): string[]` — read-only accessor for error/guidance text.
   - No change needed to `refreshFromEnvironment()`/`getConfig()`'s existing fallback, but the reasoning matters, since `default` populates the very same `config.rundeckUrl`/`config.apiToken` fields that fallback reads *into*: `getConfig()` only calls `refreshFromEnvironment()` when `!apiToken || !rundeckUrl` (`src/config.ts`). Once `loadInstanceRegistry()` has populated both fields (via `default`, or later via `connectToInstance`), that guard is false, so `refreshFromEnvironment()` never runs again regardless of what's sitting in `process.env.RUNDECK_URL`/`RUNDECK_TOKEN` — those are the *env vars* `refreshFromEnvironment()` reads from, a separate thing from the `config.rundeckUrl`/`config.apiToken` fields it writes to. One ordering requirement this implies: `loadInstanceRegistry()` must run in `initialize()` *after* the existing `this.config.rundeckUrl = process.env.RUNDECK_URL` line, so that if a user's environment happens to still have stray `RUNDECK_URL`/`RUNDECK_TOKEN` set alongside `RUNDECK_INSTANCES`, `default` wins rather than getting silently overwritten by them.

2. **New file `src/tools/connect.ts`** (same pattern as `src/tools/api.ts`):
   - `rundeckConnectSchema = z.object({ instance: z.string() })` — the only input this tool ever accepts is a name.
   - `export async function rundeckConnect(params: { instance: string })`: calls `configManager.connectToInstance(params.instance)`, returns `{ connected: string, available: string[] }` on success, or throws (with the registered names, never a partial/silent result) on failure. Unlike a typical "please stop now" tool error, this one doesn't depend on the model reading it correctly: `connectToInstance` already cleared the connection on that same failure, so even if the model ignores the error and calls `api_call` anyway, that call independently fails closed with no request sent. The tool description is still worth writing to discourage retrying blindly, but it's a UX nicety here, not the safety mechanism.

3. **`src/index.ts`** (the only server implementation — see above)
   - Import `rundeckConnect`, `rundeckConnectSchema` from `./tools/connect.js`, alongside the existing tool imports (`src/index.ts:19-34`).
   - Add a `rundeck_connect` entry to the `tools` array in the `ListToolsRequestSchema` handler (`src/index.ts:131-232`), following the existing `{name, description, inputSchema}` shape — `inputSchema` built the same way as `apiCallInputSchema` etc. (`src/index.ts:124-128`).
   - Add a new `case "rundeck_connect":` branch next to the existing ones in the `CallToolRequestSchema` switch (`src/index.ts:242-321`): reuse `needsGuidance(args, ["instance"])` (already defined at `src/index.ts:346`) → return guidance listing `configManager.listInstanceNames()`; otherwise call `rundeckConnect(args)` and return its result via `returnGuidanceMarkdown`-style content.
   - Update the "Unknown tool" error message (`src/index.ts:322`) to include `rundeck_connect` in its list.
   - Note on `logger.logToolCall(name, args)` at `src/index.ts:238`: this already logs every tool call's full `args` object. Because `rundeck_connect`'s schema only ever accepts `instance` (a name), this pre-existing logging call stays safe by construction — it's exactly why the tool must never accept `url`/`token` as parameters, only a name to look up against the in-memory registry.

4. **`src/utils/guidance.ts`**: add `getRundeckConnectGuidance(instanceNames: string[])`, following the existing `getJobCreationGuidance()`/`getApiCallGuidance()` pattern — lists available instance names only, never registry contents. Import it into `src/index.ts` alongside the other guidance imports (`src/index.ts:31-34`).

5. **Tests**: `src/__tests__/config.test.ts` gets coverage for registry parsing (including the malformed-input fallback above), default-instance auto-connect, and `connectToInstance` success/failure; `src/__tests__/tools/` gets a new `connect.test.ts` for the tool handler plus a guidance-mode case in the style of `src/__tests__/tools/guidance-mode.test.ts`. Needed to hold the 70% coverage gate `npm run validate` already enforces.

6. **`src/tools/api.ts` (`rundeckApiCall`'s response)** — small, optional addition, not load-bearing for safety (that's `clearConnection`, above): include the active `config.rundeckUrl` (never the token) in `api_call`'s response alongside the existing `status`/`headers`/`body`, purely so anyone reading the transcript can see which instance a request actually hit without having to infer it. Since a failed switch already fails closed on its own, this is a visibility nicety, not a gap-filler.

## Using it mid-session
Boot: `configManager` loads the registry, and — if a `default` is set — is immediately connected to it, no tool call required. "use staging" → the agent calls `rundeck_connect(instance: "staging")` → every subsequent `api_call`/`job_create`/etc. call uses staging's URL and token, with zero change to those tools' signatures. If `RUNDECK_INSTANCES` is set but somehow has no valid `default`, or the most recent `rundeck_connect` call named an instance that doesn't exist, there is no active connection at all — every live-API tool returns the existing "not configured" guidance until a `rundeck_connect` call actually succeeds. Nothing ever silently continues against a previously active instance.

## Rotating a token or adding an instance
Registry is loaded once at process start. Rotating a token or registering a new instance means editing the JSON file and relaunching (`./scripts/rundeck-connect.sh` again, or restarting through the skill's generated alias) — the same expectation that already exists today for rotating a single `RUNDECK_TOKEN`. No live reload, no self-service "add an instance from chat."

## Open items from security review
An MCP-and-security review of this proposal (covering the doc, `config.ts`, `index.ts`, and `rundeck-connect.sh`) confirmed the core mechanism — name-only tool input, `default`→`setRundeckConnection` reuse — is sound and correctly targets the actual code. Status on what it flagged:

1. **Resolved — startup crash on malformed `RUNDECK_INSTANCES`.** `loadInstanceRegistry()` catches parse/shape errors and falls back to no-registry instead of crashing the process at boot (`config.ts` implementation notes, item 1).

2. **Resolved — failed switch could silently run against the wrong instance.** The original design left the previous connection active on a failed `rundeck_connect` and relied on the model treating the error as a hard stop. That's not good enough — a follow-up command like "delete job X in instanceB" against an unregistered `instanceB` must never execute against whatever instance happened to be active before. Fixed structurally, not by convention: `connectToInstance` now clears the connection on a miss (`clearConnection()`, config.ts item 1), so any subsequent live-API call fails closed on its own via the existing "not configured" guidance path — see "Using it mid-session" above. No reliance on the model noticing or behaving correctly.

3. **Resolved — Runlayer session-pooling assumption.** Confirmed against Runlayer's own docs (docs.runlayer.com/local-mcps): for local/stdio MCPs, `runlayer run <server-id>` launches a fully independent process per user — the CLI authenticates as that specific user and spawns/proxies to the local MCP target itself, with no pooling or reuse of a backend MCP process across users or sessions. Environment variables (so `RUNDECK_INSTANCES`) are inherited from that user's own `runlayer run` process, and Runlayer explicitly does not store local upstream tokens — they never leave the user's machine. So this doc's "single-session, single-process" framing, which is true for this repo's code, is also true end-to-end for the actual Runlayer-hosted install path — not just an assumption.

4. **Partially addressed — aggregate blast radius.** One leaked `RUNDECK_INSTANCES` still exposes every registered token at once (prod, staging, whatever's in the file) rather than the one token today's setup exposes — a notice can't change that underlying fact. What it can do is turn it from a silent, easy-to-miss trade-off into a deliberate, acknowledged one: `rundeck-connect.sh` now prints a one-line reminder whenever a registry has more than one instance ("bundles N instances into one token blob... a single leak exposes all N tokens at once"), at the moment the human launching it can still act on it — trim the file, tighten permissions, split it up. This is a nicety for informed consent, not a technical fix; for a small internal audience it's an acceptable trade, but if a customer instance's token is ever added to someone's registry, that decision should be revisited deliberately rather than assumed fine by extension.

## What this deliberately doesn't solve
- Typing a brand-new URL and token straight into chat with zero prior setup isn't achievable without the token touching the transcript, which we don't control. This assumes instances are registered once, in a file the user maintains directly, then swapped by name.