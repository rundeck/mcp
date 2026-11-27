/**
 * Tests for the MCP Apps card tools (show_job, run_job, execution_status, show_runners).
 */

import { jest } from "@jest/globals";
import { showJob, runJob, executionCard, executionStatus, showRunners, currentInstanceTag, CARD_TOOL_META, CARD_URI } from "../../apps/cards.js";
import { CARD_HTML } from "../../apps/card-html.js";
import { configManager } from "../../config.js";

const mockFetch = jest.fn<typeof fetch>();
global.fetch = mockFetch as unknown as typeof fetch;

/** Answer each request by matching its path (method + path after /api/N). */
function route(routes: Record<string, unknown | [number, unknown]>) {
  mockFetch.mockImplementation(async (input, init) => {
    const url = new URL(String(input));
    const path = url.pathname.replace(/^\/api\/\d+/, "");
    const key = `${(init?.method ?? "GET").toUpperCase()} ${path}`;
    const hit = routes[key];
    const [status, body] = Array.isArray(hit) && typeof hit[0] === "number" ? (hit as [number, unknown]) : [hit === undefined ? 404 : 200, hit ?? { error: "not found" }];
    return {
      status,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => body,
      text: async () => JSON.stringify(body),
    } as unknown as Response;
  });
}

const JOB_ID = "11111111-2222-3333-4444-555555555555";

beforeEach(() => {
  jest.clearAllMocks();
  process.env.RUNDECK_SKIP_OPENAPI_VALIDATE = "1";
  configManager.setRundeckConnection("https://rundeck.example.com", "test-token");
});

describe("card resource", () => {
  it("links tools to the card and serves an MCP App page", () => {
    expect(CARD_TOOL_META.ui.resourceUri).toBe(CARD_URI);
    expect(CARD_HTML).toContain("ui/initialize");
    expect(CARD_HTML).not.toContain("run_remote_command");
  });

  it("classifies unhealthy/disconnected runners as bad, not ok", () => {
    const m = CARD_HTML.match(/function cls\(st\)\{[^\n]*\}/);
    const cls = new Function(`${m![0]}; return cls;`)() as (s: string) => string;
    expect(cls("Unhealthy")).toBe("bad");
    expect(cls("Disconnected")).toBe("bad");
    expect(cls("Healthy")).toBe("ok");
    expect(cls("running")).toBe("run");
  });
});

describe("showJob", () => {
  it("resolves a group/name path, prefills options and adds the last run", async () => {
    route({
      "GET /project/demo/jobs": [{ id: JOB_ID, name: "Deploy", group: "shop" }, { id: "x", name: "Deploy", group: "other" }],
      [`GET /job/${JOB_ID}`]: [{ name: "Deploy", group: "shop", description: "Deploys a service", options: [{ name: "service", value: "web", required: true }, { name: "env", values: ["dev", "prod"] }] }],
      [`GET /job/${JOB_ID}/executions`]: { executions: [{ id: 7, status: "succeeded", "date-started": { date: "2026-11-20" } }] },
    });
    const r = await showJob({ project: "demo", job: "shop/Deploy", options: { service: "api" } });
    expect(r.data.id).toBe(JOB_ID);
    expect(r.data.options).toEqual([
      expect.objectContaining({ name: "service", value: "api", required: true }),
      expect.objectContaining({ name: "env", value: "", values: ["dev", "prod"] }),
    ]);
    expect(r.data.lastExecution).toEqual(expect.objectContaining({ id: 7, status: "succeeded" }));
    expect(r.text).toContain("ask them to confirm in chat");
    expect(r.text).not.toContain("card with a Run button");
  });

  it("mentions the card only when the client renders MCP Apps", async () => {
    route({ [`GET /job/${JOB_ID}`]: [{ name: "Deploy", options: [] }], [`GET /job/${JOB_ID}/executions`]: [500, {}] });
    const r = await showJob({ project: "demo", job: JOB_ID }, true);
    expect(r.text).toContain("card with a Run button");
    expect(r.data.lastExecution).toBeUndefined();
  });

  it("rejects a bare name that matches jobs in several groups", async () => {
    route({ "GET /project/demo/jobs": [{ id: "a", name: "Deploy", group: "shop" }, { id: "b", name: "Deploy", group: "other" }] });
    await expect(showJob({ project: "demo", job: "Deploy" })).rejects.toThrow(/matches 2 jobs.*shop\/Deploy.*other\/Deploy/);
  });

  it("never exposes secure option values", async () => {
    route({
      [`GET /job/${JOB_ID}`]: [{ name: "Deploy", options: [{ name: "token", secure: true, value: "s3cret" }, { name: "svc", value: "web" }] }],
      [`GET /job/${JOB_ID}/executions`]: { executions: [] },
    });
    const r = await showJob({ project: "demo", job: JOB_ID, options: { token: "proposed-secret" } });
    expect(r.data.options).toEqual([
      expect.objectContaining({ name: "token", secure: true, value: "" }),
      expect.objectContaining({ name: "svc", secure: false, value: "web" }),
    ]);
    expect(r.text).not.toMatch(/s3cret|proposed-secret/);
    expect(r.text).toContain("token=(secure, not shown)");
    expect(r.data.instance).toBe(currentInstanceTag());
  });

  it("fails clearly when the job does not exist", async () => {
    route({ "GET /project/demo/jobs": [] });
    await expect(showJob({ project: "demo", job: "nope" })).rejects.toThrow('No job "nope" in project demo');
  });
});

describe("runJob and executionCard", () => {
  it("runs the job and returns the execution card with the log tail", async () => {
    route({
      [`POST /job/${JOB_ID}/run`]: { id: 42 },
      "GET /execution/42": { id: 42, project: "demo", status: "running", job: { name: "Deploy", group: "shop" }, successfulNodes: ["node1"], "date-started": { unixtime: Date.now() - 5000 } },
      "GET /execution/42/output": { entries: [{ log: "line 1" }, { log: "line 2" }] },
    });
    const r = await runJob({ job_id: JOB_ID, options: { service: "api" } });
    expect(r.data).toEqual(expect.objectContaining({ kind: "execution", id: 42, status: "running", title: "shop/Deploy", node: "node1", log: "line 1\nline 2" }));
    const runCall = mockFetch.mock.calls.find(([u, i]) => String(u).endsWith(`/job/${JOB_ID}/run`) && i?.method === "POST");
    expect(JSON.parse(String(runCall?.[1]?.body))).toEqual({ options: { service: "api" } });
  });

  it("asks for the last 20 lines only", async () => {
    route({ "GET /execution/5": { id: 5, status: "running" }, "GET /execution/5/output": { entries: [] } });
    await executionCard(5);
    const out = mockFetch.mock.calls.find(([u]) => String(u).includes("/execution/5/output"));
    expect(new URL(String(out?.[0])).searchParams.get("lastlines")).toBe("20");
  });

  it("keeps the execution id and warns not to rerun when the status read fails after starting", async () => {
    route({ [`POST /job/${JOB_ID}/run`]: { id: 77 }, "GET /execution/77": [503, {}] });
    const r = await runJob({ job_id: JOB_ID });
    expect(r.data).toEqual(expect.objectContaining({ kind: "execution", id: 77 }));
    expect(r.text).toContain("Do NOT run it again");
  });

  it("rejects a card from a different Rundeck instance before calling the API", async () => {
    const tag = currentInstanceTag();
    configManager.setRundeckConnection("https://prod.example.com", "other-token");
    await expect(runJob({ job_id: JOB_ID, instance: tag })).rejects.toThrow("different Rundeck instance");
    await expect(executionStatus({ execution_id: "1", instance: tag })).rejects.toThrow("different Rundeck instance");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("throws when Rundeck refuses the run", async () => {
    route({ [`POST /job/${JOB_ID}/run`]: [403, { message: "unauthorized" }] });
    await expect(runJob({ job_id: JOB_ID })).rejects.toThrow("Could not run job (HTTP 403)");
  });

  it("shows an execution even before it has output", async () => {
    route({ "GET /execution/9": { id: 9, project: "demo", status: "succeeded", description: "uptime" } });
    const r = await executionCard(9);
    expect(r.data.title).toBe("uptime");
    expect(r.text).toContain("(no output yet)");
  });
});

describe("showRunners", () => {
  it("lists runners of every project from the API, merged by name, with their node", async () => {
    route({
      "GET /projects": [{ name: "a" }, { name: "b" }],
      "GET /project/a/runnerManagement/runners": { runners: [{ id: "r1", name: "eks", status: "Healthy", tagNames: ["kubectl"], version: "5.1" }] },
      "GET /project/a/resources": { "eks": { nodename: "eks" }, "pod-1": { runnerId: "r1" } },
      "GET /project/b/runnerManagement/runners": { runners: [{ id: "r1", name: "eks", tagNames: ["kubectl"] }] },
      "GET /project/b/resources": {},
    });
    const r = await showRunners({});
    const runners = r.data.runners as any[];
    expect(runners).toHaveLength(1);
    expect(runners[0]).toEqual(expect.objectContaining({ name: "eks", node: "eks", projects: ["a", "b"], details: [["Version", "5.1"]] }));
    expect(r.text).toContain("node filter `name: eks`");
  });

  it("keeps same-named runners with different ids apart", async () => {
    route({
      "GET /project/a/runnerManagement/runners": { runners: [{ id: "r1", name: "local", status: "Healthy" }] },
      "GET /project/a/resources": {},
      "GET /project/b/runnerManagement/runners": { runners: [{ id: "r2", name: "local", status: "Unhealthy" }] },
      "GET /project/b/resources": {},
      "GET /projects": [{ name: "a" }, { name: "b" }],
    });
    const runners = (await showRunners({})).data.runners as any[];
    expect(runners.map((r) => [r.id, r.status, r.projects])).toEqual([["r1", "Healthy", ["a"]], ["r2", "Unhealthy", ["b"]]]);
  });

  it("surfaces runner API errors other than 404", async () => {
    route({ "GET /project/demo/runnerManagement/runners": [403, { message: "forbidden" }] });
    await expect(showRunners({ project: "demo" })).rejects.toThrow("HTTP 403");
  });

  it("returns no runners on Rundeck OSS (runners API 404)", async () => {
    route({});
    const r = await showRunners({ project: "demo" });
    expect(r.data.runners).toEqual([]);
    expect(r.text).toBe("No runners found in project demo.");
  });
});
