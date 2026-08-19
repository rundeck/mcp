/**
 * Central registry of tool priority/fallback relationships.
 *
 * The MCP protocol has no standard priority/fallback field on `Tool` (only
 * per-tool behavioral `annotations`, and an untyped `_meta` bag no client
 * acts on for routing), so `description` text is the only lever that
 * reliably steers which tool the model calls next. This registry is the
 * single source of truth for that text, generated consistently instead of
 * hand-written and duplicated across index.ts and guidance.ts.
 *
 * This is guidance text only — the server never intercepts a failed tool
 * call and retries a different tool itself; the model reads the fallback
 * text and decides to call the fallback tool on its next turn.
 */

import { ASK_USER_GUIDANCE } from "../utils/escalation.js";

export interface ToolRelationship {
  /** The specialized tool being described. */
  tool: string;
  /** The generic tool this one should be preferred over for its domain. */
  prioritizedOver: string;
  /** The tool to fall back to if `tool` fails or doesn't cover the case. */
  fallbackTo: string;
  /** Short phrase describing the domain, e.g. "runner management". */
  domain: string;
  /** "by doing Y" detail for the fallback phrase. */
  fallbackAction: string;
}

export const TOOL_RELATIONSHIPS: ToolRelationship[] = [
  {
    tool: "runner_create",
    prioritizedOver: "api_call",
    fallbackTo: "api_call",
    domain: "runner management",
    fallbackAction:
      "calling `api_call` against `runnerManagement/runners` (system scope) or " +
      "`project/{project}/runnerManagement/runners` (project scope)",
  },
  {
    tool: "acl_manage",
    prioritizedOver: "api_call",
    fallbackTo: "api_call",
    domain: "ACL policy management",
    fallbackAction:
      "calling `api_call` against the ACL policy endpoints " +
      "(`system/acl/*` or `project/{project}/acl/*`)",
  },
  {
    tool: "job_create",
    prioritizedOver: "api_call",
    fallbackTo: "api_call",
    domain: "generating job definition YAML/JSON",
    fallbackAction:
      "hand-building the job body yourself and calling `api_call` directly " +
      "against the job-import endpoint (e.g. `project/{project}/jobs/import`)",
  },
  {
    tool: "job_validate",
    prioritizedOver: "api_call",
    fallbackTo: "api_call",
    domain: "validating job YAML/JSON structure before import",
    fallbackAction:
      "calling `api_call`'s job-import endpoint directly, accepting the risk of " +
      "submitting an unvalidated payload",
  },
  {
    tool: "resource_model_source_manage",
    prioritizedOver: "api_call",
    fallbackTo: "api_call",
    domain: "Resource Model Source and node definition management",
    fallbackAction:
      "calling `api_call` against `project/{project}/sources`, " +
      "`project/{project}/source/{index}/resources`, and `project/{project}/config` yourself",
  },
];

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Dual-purpose by design: called with one of the specialized tool names
 * above, returns a short "prioritized over X" suffix for that tool's own
 * description. Called with the name of a tool that OTHER tools are
 * `prioritizedOver` (i.e. "api_call" today), returns the replacement
 * "When NOT to use" bullet list for that generic tool's description,
 * covering every specialized tool that defers to it. Any other name
 * returns "".
 */
export function renderPriorityGuidance(toolName: string): string {
  const own = TOOL_RELATIONSHIPS.find((r) => r.tool === toolName);
  if (own) {
    return `\n\n**Prioritized over \`${own.prioritizedOver}\`** for ${own.domain}.`;
  }
  const deferrals = TOOL_RELATIONSHIPS.filter((r) => r.prioritizedOver === toolName);
  if (deferrals.length > 0) {
    return deferrals.map((r) => `- ${capitalize(r.domain)} (use ${r.tool} instead)`).join("\n");
  }
  return "";
}

/**
 * Returns the fallback guidance block for a specialized tool, describing
 * what to fall back to (and how) if it fails or doesn't cover the case.
 * Returns "" for any tool not in the registry.
 */
export function renderFallbackGuidance(toolName: string): string {
  const entry = TOOL_RELATIONSHIPS.find((r) => r.tool === toolName);
  if (!entry) return "";
  return (
    `\n\n## Fallback\nIf \`${entry.tool}\` fails or doesn't cover your case, fall back to ` +
    `\`${entry.fallbackTo}\` by ${entry.fallbackAction}.` +
    ASK_USER_GUIDANCE
  );
}
