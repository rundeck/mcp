/**
 * Integration test for src/index.ts's tool-list gating.
 *
 * index.ts starts a real stdio server as a side effect of being imported
 * (configManager.initialize() + main().catch(...) run at module scope), so
 * it can't be imported directly in a test process — hence no other test
 * file touches it, and jest.config.js excludes it from coverage. This test
 * instead spawns the compiled server as a child process (requires `npm run
 * build` to have run first) and drives it over real MCP stdio, the same way
 * an actual client would, to verify that `rundeck_connect` is listed only
 * when RUNDECK_INSTANCES is configured.
 */
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { Client } from "@modelcontextprotocol/client";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverEntry = path.resolve(__dirname, "../../../dist/index.js");

async function listToolNames(env: Record<string, string>): Promise<string[]> {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [serverEntry],
    env,
  });
  const client = new Client({ name: "test-client", version: "0.0.0" });
  await client.connect(transport);
  try {
    const result = await client.listTools();
    return result.tools.map((tool) => tool.name);
  } finally {
    await client.close();
  }
}

describe("Integration: index.ts tools/list registry gating", () => {
  beforeAll(() => {
    if (!fs.existsSync(serverEntry)) {
      throw new Error(
        `${serverEntry} does not exist — run \`npm run build\` before running this test.`
      );
    }
  });

  it("does not list rundeck_connect when RUNDECK_INSTANCES is unset", async () => {
    const env = { ...process.env } as Record<string, string>;
    delete env.RUNDECK_INSTANCES;
    const toolNames = await listToolNames(env);

    expect(toolNames).not.toContain("rundeck_connect");
    expect(toolNames).toEqual(
      expect.arrayContaining([
        "api_call",
        "api_list",
        "job_create",
        "job_validate",
        "runner_create",
        "acl_validate",
        "acl_manage",
        "docs_search",
      ])
    );
  }, 15000);

  it("lists rundeck_connect when RUNDECK_INSTANCES defines a registry", async () => {
    const env = {
      ...process.env,
      RUNDECK_INSTANCES: JSON.stringify({
        default: "prod",
        instances: {
          prod: { url: "https://prod.example.com", token: "prod-token" },
        },
      }),
    } as Record<string, string>;
    const toolNames = await listToolNames(env);

    expect(toolNames).toContain("rundeck_connect");
  }, 15000);
});
