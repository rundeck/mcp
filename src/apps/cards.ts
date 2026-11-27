/**
 * Tools whose results render as cards in MCP Apps hosts (Claude Desktop/web).
 * Hosts without MCP Apps just get the text content. See card-html.ts.
 */
import { z } from "zod";
import { createHash } from "node:crypto";
import { rundeckApiCall } from "../tools/api.js";
import { configManager } from "../config.js";

export const CARD_URI = "ui://rundeck/card";
export const CARD_MIME = "text/html;profile=mcp-app";
/** Tool `_meta` linking a tool to the card (current key + the legacy flat key). */
export const CARD_TOOL_META = { ui: { resourceUri: CARD_URI }, "ui/resourceUri": CARD_URI };

export const showJobSchema = z.object({
  project: z.string().describe("Rundeck project."),
  job: z.string().describe("Job id (UUID) or its path `group/name` (or just the name), e.g. from GET /project/{project}/jobs."),
  options: z.record(z.string(), z.string()).optional().describe("Proposed option values to prefill, e.g. {\"service\": \"checkout-api\"}."),
});
const instanceField = z
  .string()
  .optional()
  .describe("Opaque instance tag from a card (`instance` in its data). When set, the call is rejected if the server is now connected to a different Rundeck instance.");
export const runJobSchema = z.object({
  job_id: z.string().describe("Job id (UUID)."),
  options: z.record(z.string(), z.string()).optional().describe("Option values."),
  instance: instanceField,
});
export const executionStatusSchema = z.object({ execution_id: z.string().describe("Execution id."), instance: instanceField });
export const showRunnersSchema = z.object({
  project: z.string().optional().describe("Only runners of this project. Omit for all projects."),
});

export const SHOW_JOB_DESCRIPTION = `Show a Rundeck job as a card: description, options (prefilled with your proposed values) and its last run, with a **Run** button for the user.

**Use this to propose a job** instead of asking "shall I run it?" in text: the user reviews the options and clicks Run (that click is the confirmation). Find the project and job first (e.g. api_call GET /project/{project}/jobs).`;
export const RUN_JOB_DESCRIPTION = `Run a Rundeck job and show its execution as a live card (status, node, log tail).

Read-only jobs (health checks, status, listings: nothing in them changes state) can be run directly. Jobs that change state (deploy, rollback, restart, scale...) only after the user explicitly confirmed this exact job and options in the conversation (or clicked Run on the job card).`;
export const EXECUTION_STATUS_DESCRIPTION = `Show the current status of a Rundeck execution as a card (status, duration, node, last log lines).`;
export const SHOW_RUNNERS_DESCRIPTION = `Show the user's Rundeck runners as cards: status, description, tags (which CLIs they have, e.g. kubectl), projects and the node filter for ad-hoc commands.

Use it when the user asks which runners or remote targets they have, or before an ad-hoc command to show which runner will be used.`;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Opaque tag of the Rundeck instance currently connected (hash of its URL, never the URL itself). */
export function currentInstanceTag(): string {
  const url = configManager.getConfig().rundeckUrl ?? "";
  return createHash("sha256").update(url.replace(/\/+$/, "")).digest("hex").slice(0, 12);
}

/** Reject actions from a card that was rendered against another Rundeck instance. */
export function assertSameInstance(instance?: string): void {
  if (instance && instance !== currentInstanceTag()) {
    throw new Error("This card belongs to a different Rundeck instance than the one now connected (rundeck_connect switched it). Show the job again to get a fresh card.");
  }
}

async function get(endpoint: string, query_params?: Record<string, string>): Promise<any> {
  const r = await rundeckApiCall({ endpoint, method: "GET", query_params });
  if (r.status >= 400) throw new Error(`GET ${endpoint} → HTTP ${r.status}: ${JSON.stringify(r.body).slice(0, 300)}`);
  return r.body;
}

async function resolveJobId(project: string, job: string): Promise<string> {
  if (UUID.test(job)) return job;
  const i = job.lastIndexOf("/");
  const name = i >= 0 ? job.slice(i + 1) : job;
  const group = i >= 0 ? job.slice(0, i) : undefined;
  const list = await get(`/project/${encodeURIComponent(project)}/jobs`);
  const hits = (Array.isArray(list) ? list : []).filter(
    (j: any) => j.name === name && (group === undefined || (j.group || "") === group)
  );
  if (!hits.length) throw new Error(`No job "${job}" in project ${project}. List them with GET /project/${project}/jobs.`);
  if (hits.length > 1) {
    const paths = hits.map((j: any) => `${j.group ? j.group + "/" : ""}${j.name} (${j.id})`).join(", ");
    throw new Error(`"${job}" matches ${hits.length} jobs in project ${project}: ${paths}. Pass the group/name path or the job UUID.`);
  }
  return hits[0].id;
}

export interface CardResult {
  text: string;
  data: Record<string, unknown>;
}

/** `uiSupported`: the client renders MCP Apps (declared the io.modelcontextprotocol/ui extension). */
export async function showJob(params: z.infer<typeof showJobSchema>, uiSupported = false): Promise<CardResult> {
  const p = showJobSchema.parse(params);
  const id = await resolveJobId(p.project, p.job);
  const defs = await get(`/job/${id}`, { format: "json" });
  const def = Array.isArray(defs) ? defs[0] : defs;
  const proposed = p.options ?? {};
  const options = (def?.options ?? []).map((o: any) => {
    const secure = !!(o.secure || o.valueExposed === false || o.storagePath);
    return {
      name: o.name,
      required: !!o.required,
      enforced: !!o.enforced,
      secure,
      values: Array.isArray(o.values) ? o.values : undefined,
      // Never echo a secret value back (not even a proposed one); the user types it in the card.
      value: secure ? "" : proposed[o.name] ?? o.value ?? "",
      description: o.description,
    };
  });
  let lastExecution: Record<string, unknown> | undefined;
  try {
    const ex = await get(`/job/${id}/executions`, { max: "1" });
    const e = ex?.executions?.[0];
    if (e) lastExecution = { id: e.id, status: e.status, date: e["date-started"]?.date, permalink: e.permalink };
  } catch {
    /* last run is optional */
  }
  const data = {
    kind: "job",
    instance: currentInstanceTag(),
    id,
    project: p.project,
    name: def?.name,
    group: def?.group,
    description: def?.description,
    options,
    lastExecution,
    permalink: def?.permalink,
  };
  const opts = options.map((o: any) => `${o.name}=${o.secure ? "(secure, not shown)" : o.value || "(empty)"}`).join(", ");
  return {
    text:
      `Proposed job: ${p.project} → ${def?.group ? def.group + "/" : ""}${def?.name} (id ${id})` +
      (opts ? ` with ${opts}` : "") +
      `. Show the user this job and these options and ask them to confirm in chat; run it with run_job (job_id ${id}) only after an explicit yes.` +
      (uiSupported ? ` They may also see a card with a Run button; don't rely on it being visible.` : ``),
    data,
  };
}

function fmtDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}

export async function executionCard(executionId: string | number, title?: string): Promise<CardResult> {
  const e = await get(`/execution/${executionId}`);
  let log = "";
  try {
    const out = await get(`/execution/${executionId}/output`, { lastlines: "20" });
    const lines = (Array.isArray(out?.entries) ? out.entries : []).map((x: any) => x.log).filter((l: unknown) => l != null);
    log = lines.slice(-20).join("\n");
  } catch {
    /* output may not be available yet */
  }
  const start = e?.["date-started"]?.unixtime;
  const end = e?.["date-ended"]?.unixtime;
  const nodes = [...(e?.successfulNodes ?? []), ...(e?.failedNodes ?? [])];
  const data = {
    kind: "execution",
    instance: currentInstanceTag(),
    id: e?.id ?? executionId,
    project: e?.project,
    status: e?.status,
    title: title ?? (e?.job ? `${e.job.group ? e.job.group + "/" : ""}${e.job.name}` : e?.description || "Ad-hoc command"),
    user: e?.user,
    node: nodes.join(", ") || undefined,
    duration: start ? fmtDuration((end ?? Date.now()) - start) : undefined,
    permalink: e?.permalink,
    log,
  };
  return {
    text: `Execution ${data.id} (${data.title}) in ${data.project}: ${data.status}${data.permalink ? `\n${data.permalink}` : ""}\n\n${log || "(no output yet)"}`,
    data,
  };
}

export async function runJob(params: z.infer<typeof runJobSchema>): Promise<CardResult> {
  const p = runJobSchema.parse(params);
  assertSameInstance(p.instance);
  const r = await rundeckApiCall({ endpoint: `/job/${p.job_id}/run`, method: "POST", body: { options: p.options ?? {} } });
  const id = (r.body as any)?.id;
  if (r.status >= 400 || !id) throw new Error(`Could not run job (HTTP ${r.status}): ${JSON.stringify(r.body).slice(0, 300)}`);
  try {
    return await executionCard(id);
  } catch (err) {
    // The job already started: never report this as a failed run (that invites a second run).
    return {
      text: `Job started as execution ${id}, but reading its status failed (${(err as Error).message}). Do NOT run it again; check it with execution_status (execution_id ${id}).`,
      data: { kind: "execution", instance: currentInstanceTag(), id, status: "running", title: "Execution " + id, log: "" },
    };
  }
}

export async function executionStatus(params: z.infer<typeof executionStatusSchema>): Promise<CardResult> {
  const p = executionStatusSchema.parse(params);
  assertSameInstance(p.instance);
  return executionCard(p.execution_id);
}

export interface RunnerInfo {
  id: string;
  name: string;
  description?: string;
  status?: string;
  tags: string[];
  /** Node the runner appears as ("Runner as a Node"), usable as an ad-hoc node filter. */
  node?: string;
  /** Extra label/value pairs from the runners API (version, last check-in...). */
  details?: [string, string][];
  projects: string[];
}

const RUNNER_DETAIL_FIELDS: [string, string][] = [
  ["version", "Version"],
  ["runnerVersion", "Version"],
  ["lastCheckIn", "Last check-in"],
  ["lastCheckin", "Last check-in"],
  ["installationType", "Installation"],
  ["replicaCount", "Replicas"],
];

function runnerDetails(r: any): [string, string][] | undefined {
  const seen = new Set<string>();
  const out: [string, string][] = [];
  for (const [key, label] of RUNNER_DETAIL_FIELDS) {
    if (r?.[key] != null && r[key] !== "" && !seen.has(label)) {
      seen.add(label);
      out.push([label, String(r[key])]);
    }
  }
  return out.length ? out : undefined;
}

/**
 * Runners of one project (Enterprise only; OSS answers 404 and gets none) and
 * the node each one appears as. Prefer the node named like the runner; only
 * fall back to an attribute match when no node has that name, because nodes
 * discovered through the runner (e.g. Kubernetes pods) also carry its id.
 */
async function projectRunners(project: string): Promise<Omit<RunnerInfo, "projects">[]> {
  const res = await rundeckApiCall({ endpoint: `/project/${encodeURIComponent(project)}/runnerManagement/runners`, method: "GET" });
  // OSS has no runners API (404): no runners. Any other error is real and must surface.
  if (res.status === 404) return [];
  if (res.status >= 400) {
    throw new Error(`GET /project/${project}/runnerManagement/runners → HTTP ${res.status}: ${JSON.stringify(res.body).slice(0, 300)}`);
  }
  const list = (res.body as any)?.runners ?? [];
  if (!Array.isArray(list) || !list.length) return [];
  let nodes: Record<string, Record<string, unknown>> = {};
  try {
    const n = await get(`/project/${encodeURIComponent(project)}/resources`);
    if (n && typeof n === "object") nodes = n;
  } catch {
    /* the node filter is optional */
  }
  const entries = Object.entries(nodes);
  return list.map((r: any) => {
    const keys = [r.id, r.name].filter(Boolean).map(String);
    const node =
      entries.find(([name, attrs]) => keys.includes(name) || keys.includes(String((attrs as any)?.nodename ?? "")))?.[0] ??
      entries.find(([, attrs]) => Object.values(attrs ?? {}).some((v) => keys.includes(String(v))))?.[0];
    return {
      id: String(r.id ?? r.name),
      name: String(r.name ?? r.id),
      description: r.description || undefined,
      status: r.status || undefined,
      tags: Array.isArray(r.tagNames) ? r.tagNames.map(String) : [],
      node,
      details: runnerDetails(r),
    };
  });
}

export async function showRunners(params: z.infer<typeof showRunnersSchema>): Promise<CardResult> {
  const p = showRunnersSchema.parse(params ?? {});
  let projects: string[];
  if (p.project) {
    projects = [p.project];
  } else {
    const list = await get("/projects");
    projects = (Array.isArray(list) ? list : []).map((x: any) => String(x.name));
  }
  // Names are only unique within a scope, so merge by runner id.
  const byId = new Map<string, RunnerInfo>();
  for (const project of projects) {
    for (const r of await projectRunners(project)) {
      const cur = byId.get(r.id) ?? { ...r, projects: [] };
      cur.projects.push(project);
      cur.node = cur.node ?? r.node;
      byId.set(r.id, cur);
    }
  }
  const runners = [...byId.values()];
  const text = runners.length
    ? runners
        .map((r) => `- ${r.name} [${r.status ?? "?"}] tags: ${r.tags.join(", ") || "-"} · projects: ${r.projects.join(", ")}` +
          (r.node ? ` · node filter \`name: ${r.node}\`` : ""))
        .join("\n")
    : "No runners found" + (p.project ? ` in project ${p.project}` : "") + ".";
  return { text, data: { kind: "runners", runners } };
}
