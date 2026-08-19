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

async function listTools(env: Record<string, string>) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [serverEntry],
    env,
  });
  const client = new Client({ name: "test-client", version: "0.0.0" });
  await client.connect(transport);
  try {
    return await client.listTools();
  } finally {
    await client.close();
  }
}

async function listToolNames(env: Record<string, string>): Promise<string[]> {
  const result = await listTools(env);
  return result.tools.map((tool) => tool.name);
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

// Regression coverage for the SDK v1->v2 migration: zod v4's z.toJSONSchema
// silently produces different output than the zod-to-json-schema package it
// replaced, and the client-side SDK validates tools/list responses against
// the MCP spec — so these only fail loudly when driven through a real
// client/server round trip, not via the underlying zod schemas directly.
describe("Integration: index.ts tools/list schema fidelity", () => {
  beforeAll(() => {
    if (!fs.existsSync(serverEntry)) {
      throw new Error(
        `${serverEntry} does not exist — run \`npm run build\` before running this test.`
      );
    }
  });

  it("declares additionalProperties: false on every object schema, including nested ones", async () => {
    const env = { ...process.env } as Record<string, string>;
    delete env.RUNDECK_INSTANCES;
    const { tools } = await listTools(env);

    expect(tools.length).toBeGreaterThan(0);

    // Object schemas produced by an explicit z.record() (e.g. a
    // provider-config bag) intentionally declare additionalProperties as a
    // value schema rather than `false` — those are legitimate open records,
    // not missing restrictions, so only flag schemas where it's unset.
    const missing: string[] = [];
    function walk(node: unknown, path: string): void {
      if (!node || typeof node !== "object") return;
      const schema = node as Record<string, unknown>;
      if (schema.type === "object" && schema.additionalProperties === undefined) {
        missing.push(path);
      }
      if (schema.properties && typeof schema.properties === "object") {
        for (const [key, value] of Object.entries(schema.properties as Record<string, unknown>)) {
          walk(value, `${path}.${key}`);
        }
      }
      if (schema.items) {
        if (Array.isArray(schema.items)) {
          schema.items.forEach((item, i) => walk(item, `${path}[${i}]`));
        } else {
          walk(schema.items, `${path}[]`);
        }
      }
      for (const key of ["anyOf", "oneOf", "allOf"]) {
        const branches = (schema as Record<string, unknown>)[key];
        if (Array.isArray(branches)) {
          branches.forEach((branch, i) => walk(branch, `${path}.${key}[${i}]`));
        }
      }
    }

    for (const tool of tools) {
      walk(tool.inputSchema, tool.name);
    }

    expect(missing).toEqual([]);
  }, 15000);

  it("does not list optional/defaulted params as required", async () => {
    const env = { ...process.env } as Record<string, string>;
    delete env.RUNDECK_INSTANCES;
    const { tools } = await listTools(env);

    const apiCall = tools.find((tool) => tool.name === "api_call");
    expect(apiCall).toBeDefined();
    const schema = apiCall!.inputSchema as { required?: string[] };

    // `method` is `.optional().default("GET")` — it must stay out of
    // `required`, or clients are misled into thinking it's mandatory.
    expect(schema.required).toEqual(["endpoint"]);
  }, 15000);
});
