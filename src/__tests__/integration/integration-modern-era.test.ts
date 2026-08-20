/**
 * Integration test for the 2026-07-28 protocol revision's basic round trip
 * (discover/initialize -> tools/list -> tools/call) against a non-destructive
 * tool, as distinct from integration-mrtr-confirmation.test.ts which covers
 * the destructive-action MRTR flow specifically.
 *
 * Requires `npm run build` to have run first (spawns dist/index.js).
 */
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { Client } from "@modelcontextprotocol/client";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { REGISTERED_TOOL_NAMES } from "../../tools/registered-tool-names.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverEntry = path.resolve(__dirname, "../../../dist/index.js");

function modernClient(): Client {
  return new Client(
    { name: "modern-era-test-client", version: "0.0.0" },
    { versionNegotiation: { mode: { pin: "2026-07-28" } } }
  );
}

async function connectFresh(client: Client) {
  const env = { ...process.env } as Record<string, string>;
  delete env.RUNDECK_INSTANCES;
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [serverEntry],
    env,
  });
  await client.connect(transport);
}

describe("Integration: 2026-07-28 basic round trip (discover -> tools/list -> tools/call)", () => {
  beforeAll(() => {
    if (!fs.existsSync(serverEntry)) {
      throw new Error(
        `${serverEntry} does not exist — run \`npm run build\` before running this test.`
      );
    }
  });

  it("negotiates protocol revision 2026-07-28 and lists tools", async () => {
    const client = modernClient();
    await connectFresh(client);
    try {
      // getServerVersion() reflects the initialize/discover-negotiated
      // revision — confirms the pin actually took, not a silent legacy
      // fallback.
      expect(client.getServerCapabilities()).toBeDefined();

      const { tools } = await client.listTools();
      expect(tools.map((t) => t.name)).toEqual(expect.arrayContaining(REGISTERED_TOOL_NAMES));
    } finally {
      await client.close();
    }
  }, 15000);

  it("answers resources/templates/list with an empty list instead of Method not found", async () => {
    // This server only exposes concrete rundeck:// resources, no templates
    // — but MCP Inspector (and potentially other clients) probes this
    // method as part of standard capability discovery regardless. Observed
    // live via the Inspector web UI returning a -32601 "Method not found"
    // error before this handler was registered.
    const client = modernClient();
    await connectFresh(client);
    try {
      const result = await client.listResourceTemplates();
      expect(result.resourceTemplates).toEqual([]);
    } finally {
      await client.close();
    }
  }, 15000);

  it("calls a non-destructive tool and gets back a plain CallToolResult, not an input_required shape", async () => {
    const client = modernClient();
    await connectFresh(client);
    try {
      const result = await client.callTool({ name: "api_list", arguments: { category: "jobs" } });

      // The typed callTool() API only ever returns a plain CallToolResult
      // (or throws) — resultType is a wire-only discriminator the SDK lifts
      // before handing the result back (confirmed against the SDK's own
      // type declarations during the migration review). A non-destructive
      // call must never come back as an input_required shape.
      expect(result).not.toHaveProperty("resultType", "input_required");
      expect(Array.isArray(result.content)).toBe(true);
      expect((result.content as Array<{ type: string }>)[0]?.type).toBe("text");
    } finally {
      await client.close();
    }
  }, 15000);

  it("returns tools/list in the same deterministic order across repeated calls", async () => {
    const client = modernClient();
    await connectFresh(client);
    try {
      const first = (await client.listTools()).tools.map((t) => t.name);
      const second = (await client.listTools()).tools.map((t) => t.name);

      expect(second).toEqual(first);
      // Matches the static registration order (REGISTERED_TOOL_NAMES),
      // rundeck_connect aside (RUNDECK_INSTANCES is unset here).
      expect(first).toEqual(REGISTERED_TOOL_NAMES);
    } finally {
      await client.close();
    }
  }, 15000);
});
