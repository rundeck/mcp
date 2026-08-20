/**
 * Integration test for the MRTR (Multi Round-Trip Requests) rework of
 * destructive-action confirmation, spiked as the go/no-go gate for the
 * broader 2026-07-28 protocol migration (see
 * PROTOCOL_2026_07_28_MIGRATION_PLAN.md).
 *
 * `server.elicitInput` (the old blocking server->client request used to
 * confirm destructive actions) throws on a 2026-07-28-era request — that
 * revision removed the server-initiated request channel entirely.
 * `src/utils/confirmation.ts` no longer calls it at all: it's written once
 * via `inputRequired()`, and on a legacy (2025-era) connection the SDK's own
 * built-in shim (confirmed directly against the installed SDK's runtime
 * source, not just doc comments) sends the real `elicitation/create`
 * request itself and re-invokes the handler with the answer — no
 * server-side era branching needed.
 *
 * This file drives BOTH eras against the actual compiled server (spawned as
 * a child process): a client pinned to the 2026-07-28 revision (native
 * `input_required` handling), and a plain default-negotiation client (the
 * SDK's legacy shim doing the equivalent work in-process). Both must
 * produce identical outcomes for `tools/call` (api_call, method: DELETE) ->
 * `elicitation/create` -> accept/decline -> final ordinary result — proving
 * the "written once" simplification didn't change behavior on either era.
 *
 * Requires `npm run build` to have run first (spawns dist/index.js).
 */
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { Client } from "@modelcontextprotocol/client";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverEntry = path.resolve(__dirname, "../../../dist/index.js");

function modernClient(elicitationAction: "accept" | "decline"): Client {
  const client = new Client(
    { name: "mrtr-test-client", version: "0.0.0" },
    {
      capabilities: { elicitation: {} },
      versionNegotiation: { mode: { pin: "2026-07-28" } },
    }
  );
  client.setRequestHandler("elicitation/create", async () => ({ action: elicitationAction }));
  return client;
}

/**
 * A plain default-negotiation client — no `versionNegotiation` option at
 * all, i.e. the same shape a real 2025-era client uses. Registering an
 * `elicitation/create` handler is the only thing needed for the SDK's
 * legacy shim to fulfil this server's `inputRequired()`-based confirmation
 * automatically; this codebase's handler never calls `server.elicitInput`
 * itself anymore.
 */
function legacyClient(elicitationAction: "accept" | "decline"): Client {
  const client = new Client(
    { name: "mrtr-legacy-test-client", version: "0.0.0" },
    { capabilities: { elicitation: {} } }
  );
  client.setRequestHandler("elicitation/create", async () => ({ action: elicitationAction }));
  return client;
}

async function connectFresh(client: Client): Promise<void> {
  const env = { ...process.env } as Record<string, string>;
  delete env.RUNDECK_URL;
  delete env.RUNDECK_TOKEN;
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [serverEntry],
    env,
  });
  await client.connect(transport);
}

describe.each([
  ["2026-07-28 era (native input_required handling)", modernClient] as const,
  ["2025 era (SDK legacy shim)", legacyClient] as const,
])("Integration: MRTR-based destructive-action confirmation — %s", (_label, makeClient) => {
  beforeAll(() => {
    if (!fs.existsSync(serverEntry)) {
      throw new Error(
        `${serverEntry} does not exist — run \`npm run build\` before running this test.`
      );
    }
  });

  it("declines a destructive api_call DELETE via the input_required/retry round trip", async () => {
    const client = makeClient("decline");
    await connectFresh(client);
    try {
      const result = await client.callTool({
        name: "api_call",
        arguments: { endpoint: "project/test/jobs/some-id", method: "DELETE" },
      });

      // A plain CallToolResult comes back on both eras — the SDK's typed
      // callTool() API auto-fulfils the round trip (natively on 2026-07-28,
      // via the legacy shim on 2025-era connections) and only ever surfaces
      // the final ordinary result (or throws), never the wire-only
      // resultType discriminator (confirmed against the SDK's own type
      // declarations during the migration review).
      const text = (result.content as Array<{ type: string; text?: string }>)
        .map((c) => c.text ?? "")
        .join("\n");
      expect(text.toLowerCase()).toContain("action not confirmed");
      expect(text.toLowerCase()).toContain("did not confirm");
    } finally {
      await client.close();
    }
  }, 15000);

  it("proceeds past confirmation on accept via the input_required/retry round trip", async () => {
    const client = makeClient("accept");
    await connectFresh(client);
    try {
      const result = await client.callTool({
        name: "api_call",
        arguments: { endpoint: "project/test/jobs/some-id", method: "DELETE" },
      });

      // With no RUNDECK_URL/RUNDECK_TOKEN configured, an accepted
      // confirmation proceeds to rundeckApiCall, which fails fast with a
      // configuration error (no network call) rather than the "declined"
      // guidance text above — this distinguishes "confirmation resolved to
      // confirmed and the action was attempted" from "confirmation never
      // resolved" or "declined", without depending on a live Rundeck
      // instance.
      const text = (result.content as Array<{ type: string; text?: string }>)
        .map((c) => c.text ?? "")
        .join("\n");
      expect(text.toLowerCase()).not.toContain("declined");
      expect(text).toContain("RUNDECK_URL");
    } finally {
      await client.close();
    }
  }, 15000);
});
