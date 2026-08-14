/**
 * Resource Model Source management tools
 *
 * Rundeck projects load Nodes from one or more "Resource Model Sources" —
 * `file`, `url`, `directory`, `script`, Enterprise-only ones like
 * `node-wizard`, or any third-party plugin (aws-ec2, azure, kubernetes, ...).
 * Configuring one requires a read-modify-write against the flat
 * `resources.source.N.*` key space inside `project/{project}/config` —
 * fiddly to hand-build via `api_call`, and easy to get subtly wrong (wrong
 * index, missing `.config.` prefix).
 *
 * This tool deliberately does NOT hardcode per-type behavior or assume which
 * provider types are writeable. Live testing showed that assumption breaks:
 * a `file`-type source can report `writeable: false` on Rundeck deployments
 * using DB-backed project storage instead of a real filesystem (some
 * Docker/OSS installs), while `node-wizard` — commonly assumed to be a
 * manual-entry-only, API-less Enterprise UI feature — turned out to be
 * `writeable: true` via the same generic endpoint. So `type` is a free-form
 * string (not a closed enum) and `config` is a free-form key/value passthrough
 * matching Rundeck's own `resources.source.N.config.*` shape — the tool makes
 * no claim about whether a given type/config combination ends up writeable.
 *
 * The one universal rule: **`writeable` is an empirical, per-source fact
 * reported by Rundeck itself** (via `list_sources`/`get_source`), never a
 * property of the type name. If `writeable: true`, `set_resources` (POST
 * project/{project}/source/{index}/resources) writes node definitions
 * directly — no server filesystem access needed. If `writeable: false`, the
 * source is only configurable (add/remove/list/get); loading node data must
 * happen through whatever mechanism that source actually reads from (a real
 * reachable URL, a script's own output, a third-party plugin's own data
 * fetch, etc.) — this tool cannot inject content into a non-writeable source.
 *
 * A `node-wizard` source's node data also lives in the project independent
 * of any one source's config entry/index — `remove_source` only deletes the
 * config pointer, not that underlying data, so re-adding such a source later
 * can resurface (and duplicate) old nodes.
 */

import { z } from "zod";
import { rundeckApiCall } from "./api.js";

export const NODE_DEFINITION_FORMAT_REFERENCE = `## Node Definition Format

A node definition document (YAML, JSON, or XML) describes a project's nodes, written via
\`set_resources\` to any source that Rundeck reports as \`writeable: true\` (check with
\`list_sources\`/\`get_source\` first — writeability is an empirical fact about the specific
source, not something this tool assumes from its \`type\`).

**Required per node:** \`nodename\`, \`hostname\`
**Optional:** \`description\`, \`tags\` (comma-separated string, e.g. \`'web,production'\`),
\`osFamily\` (\`unix\`/\`windows\`/\`other\`), \`osArch\`, \`osName\`, \`osVersion\`, \`username\`.
Any other key is a free-form custom attribute (string value).

### YAML (map form — \`nodename\` is the map key, so the \`nodename\` field itself is optional)
\`\`\`yaml
web-01:
  hostname: web-01.internal
  description: Web server 01
  tags: 'web,production'
  osFamily: unix
  username: deploy
  app-port: '8080'
web-02:
  hostname: web-02.internal
  tags: 'web,production'
  osFamily: unix
  username: deploy
\`\`\`

### JSON (same shape, map of nodename to attributes)
\`\`\`json
{
  "web-01": {
    "hostname": "web-01.internal",
    "tags": "web,production",
    "osFamily": "unix",
    "username": "deploy"
  }
}
\`\`\`

### XML (one \`<node>\` element per node, attributes as XML attributes)
\`\`\`xml
<project>
  <node name="web-01" hostname="web-01.internal" tags="web,production" osFamily="unix" username="deploy" />
</project>
\`\`\`
`;

const FORMAT_TO_CONTENT_TYPE: Record<string, string> = {
  yaml: "application/yaml",
  json: "application/json",
  xml: "application/xml",
};

export type ResourceSourceAction =
  | "list_provider_types"
  | "describe_provider_config"
  | "list_sources"
  | "get_source"
  | "add_source"
  | "remove_source"
  | "get_resources"
  | "set_resources";

/** Rundeck's own service name for Resource Model Source plugins (see plugin/list's `service` field). */
const RESOURCE_MODEL_SOURCE_SERVICE = "ResourceModelSource";

export type NodeDefinitionFormat = "yaml" | "json" | "xml";

export interface ResourceSourceResult {
  status: number;
  body: unknown;
}

async function getProjectConfig(project: string): Promise<Record<string, string>> {
  const result = await rundeckApiCall({ endpoint: `project/${project}/config`, method: "GET" });
  if (result.status !== 200) {
    const detail = typeof result.body === "string" ? result.body : JSON.stringify(result.body);
    throw new Error(`Failed to read project config (HTTP ${result.status}): ${detail}`);
  }
  return (result.body as Record<string, string>) ?? {};
}

async function putProjectConfig(project: string, config: Record<string, string>): Promise<ResourceSourceResult> {
  const result = await rundeckApiCall({ endpoint: `project/${project}/config`, method: "PUT", body: config });
  if (result.status < 200 || result.status >= 300) {
    const detail = typeof result.body === "string" ? result.body : JSON.stringify(result.body);
    throw new Error(`Updating project config failed (HTTP ${result.status}): ${detail}`);
  }
  return { status: result.status, body: result.body };
}

/**
 * Fetches a source's own detail and reports whether Rundeck considers it
 * writeable — the `resources.writeable` field from `GET project/{project}/source/{index}`.
 * Returns `undefined` (inconclusive) rather than throwing if the detail call
 * fails or the field is absent, so a transient/unrelated GET failure doesn't
 * block a `set_resources` call that might otherwise succeed; the POST itself
 * remains the final authority.
 */
async function getSourceWriteable(project: string, index: number): Promise<boolean | undefined> {
  const result = await rundeckApiCall({ endpoint: `project/${project}/source/${index}`, method: "GET" });
  if (result.status !== 200 || typeof result.body !== "object" || result.body === null) {
    return undefined;
  }
  const resources = (result.body as Record<string, unknown>).resources;
  if (typeof resources !== "object" || resources === null) {
    return undefined;
  }
  const writeable = (resources as Record<string, unknown>).writeable;
  return typeof writeable === "boolean" ? writeable : undefined;
}

/** Scans existing `resources.source.N.type` keys and returns the next unused index (1-based). */
function findNextSourceIndex(config: Record<string, string>): number {
  const pattern = /^resources\.source\.(\d+)\.type$/;
  let max = 0;
  for (const key of Object.keys(config)) {
    const match = pattern.exec(key);
    if (match) {
      const idx = parseInt(match[1], 10);
      if (idx > max) max = idx;
    }
  }
  return max + 1;
}

/**
 * Strips the target index's `resources.source.N.*` keys and renumbers every
 * remaining source contiguously starting at 1. Rundeck's own source listing
 * (`GET project/{project}/sources`) stops enumerating at the first missing
 * index, so simply deleting a middle index's keys leaves higher-numbered
 * sources technically still configured but invisible to `list_sources`.
 * Non-source config keys pass through untouched.
 */
function removeAndRenumberSource(
  config: Record<string, string>,
  targetIndex: number
): { config: Record<string, string>; moves: Array<{ from: number; to: number }> } {
  const sourceKeyPattern = /^resources\.source\.(\d+)\.(.*)$/;
  const bySourceIndex = new Map<number, Record<string, string>>();
  const passthrough: Record<string, string> = {};

  for (const [key, value] of Object.entries(config)) {
    const match = sourceKeyPattern.exec(key);
    if (!match) {
      passthrough[key] = value;
      continue;
    }
    const idx = parseInt(match[1], 10);
    if (idx === targetIndex) continue; // drop the removed source's keys
    const rest = match[2];
    if (!bySourceIndex.has(idx)) bySourceIndex.set(idx, {});
    bySourceIndex.get(idx)![rest] = value;
  }

  const sortedIndices = [...bySourceIndex.keys()].sort((a, b) => a - b);
  const result: Record<string, string> = { ...passthrough };
  const moves: Array<{ from: number; to: number }> = [];

  sortedIndices.forEach((oldIdx, position) => {
    const newIdx = position + 1;
    if (newIdx !== oldIdx) moves.push({ from: oldIdx, to: newIdx });
    const entries = bySourceIndex.get(oldIdx)!;
    for (const [rest, value] of Object.entries(entries)) {
      result[`resources.source.${newIdx}.${rest}`] = value;
    }
  });

  return { config: result, moves };
}

/**
 * Manage a project's Resource Model Sources (nodes) and, for writeable
 * sources, the node definition content itself: list/get/add/remove sources,
 * and get/set the resource model data for a given source index. Thin
 * wrapper over `project/{project}/sources`, `project/{project}/source/{index}`,
 * `project/{project}/source/{index}/resources`, and (for add/remove)
 * a read-modify-write against `project/{project}/config`.
 */
export async function rundeckManageResourceSource(params: {
  action: ResourceSourceAction;
  project?: string;
  index?: number;
  type?: string;
  config?: Record<string, string>;
  format?: NodeDefinitionFormat;
  content?: string;
}): Promise<ResourceSourceResult> {
  const { action, project } = params;

  switch (action) {
    case "list_provider_types": {
      // Not project-scoped — plugins are instance-wide.
      const result = await rundeckApiCall({ endpoint: "plugin/list", method: "GET" });
      const allPlugins = Array.isArray(result.body) ? (result.body as Array<Record<string, unknown>>) : [];
      const resourceModelSourcePlugins = allPlugins.filter(
        (p) => p.service === RESOURCE_MODEL_SOURCE_SERVICE
      );
      return { status: result.status, body: resourceModelSourcePlugins };
    }

    case "describe_provider_config": {
      if (!params.type) {
        throw new Error("'type' is required for action 'describe_provider_config'");
      }
      // Not project-scoped — plugin metadata is instance-wide. Requires API v49+.
      const result = await rundeckApiCall({
        endpoint: `plugin/detail/${RESOURCE_MODEL_SOURCE_SERVICE}/${encodeURIComponent(params.type)}`,
        method: "GET",
      });
      return { status: result.status, body: result.body };
    }

    case "list_sources": {
      if (!project) {
        throw new Error("'project' is required for action 'list_sources'");
      }
      const result = await rundeckApiCall({ endpoint: `project/${project}/sources`, method: "GET" });
      return { status: result.status, body: result.body };
    }

    case "get_source": {
      if (!project) {
        throw new Error("'project' is required for action 'get_source'");
      }
      if (params.index === undefined) {
        throw new Error("'index' is required for action 'get_source'");
      }
      const result = await rundeckApiCall({
        endpoint: `project/${project}/source/${params.index}`,
        method: "GET",
      });
      return { status: result.status, body: result.body };
    }

    case "get_resources": {
      if (!project) {
        throw new Error("'project' is required for action 'get_resources'");
      }
      if (params.index === undefined) {
        throw new Error("'index' is required for action 'get_resources'");
      }
      const result = await rundeckApiCall({
        endpoint: `project/${project}/source/${params.index}/resources`,
        method: "GET",
      });
      return { status: result.status, body: result.body };
    }

    case "set_resources": {
      if (!project) {
        throw new Error("'project' is required for action 'set_resources'");
      }
      if (params.index === undefined) {
        throw new Error("'index' is required for action 'set_resources'");
      }
      if (!params.content) {
        throw new Error("'content' is required for action 'set_resources'");
      }

      // Proactively confirm writeability instead of only finding out from a
      // failed POST — writeability is an empirical, per-source fact (not
      // implied by 'type'), so check it fresh every call rather than assume
      // it from whatever a previous add_source/get_source call reported.
      const writeable = await getSourceWriteable(project, params.index);
      if (writeable === false) {
        throw new Error(
          `Source ${params.index} in project '${project}' is not writeable (writeable: false) — ` +
          "set_resources cannot write node definitions to it. Writeability depends on the actual " +
          "Rundeck deployment (e.g. a 'file' source can be non-writeable on DB-backed project storage), " +
          "not on the source's 'type' name. Try add_source with a different type (e.g. 'node-wizard' on " +
          "Enterprise instances, or check list_provider_types/describe_provider_config for other options), " +
          "then get_source again to confirm writeable: true before retrying set_resources."
        );
      }

      const format = params.format ?? "yaml";
      const result = await rundeckApiCall({
        endpoint: `project/${project}/source/${params.index}/resources`,
        method: "POST",
        body: params.content,
        content_type: FORMAT_TO_CONTENT_TYPE[format],
      });
      if (result.status < 200 || result.status >= 300) {
        const detail = typeof result.body === "string" ? result.body : JSON.stringify(result.body);
        throw new Error(
          `set_resources failed (HTTP ${result.status}): ${detail}. ` +
          "The pre-flight writeable check passed (or was inconclusive), so this is a different failure " +
          "than a non-writeable source — check the response detail above."
        );
      }
      return { status: result.status, body: result.body };
    }

    case "add_source": {
      if (!project) {
        throw new Error("'project' is required for action 'add_source'");
      }
      const type = params.type ?? "file";
      const config = await getProjectConfig(project);
      const nextIndex = findNextSourceIndex(config);
      const prefix = `resources.source.${nextIndex}`;

      const updates: Record<string, string> = {
        [`${prefix}.type`]: type,
      };
      for (const [key, value] of Object.entries(params.config ?? {})) {
        updates[`${prefix}.config.${key}`] = value;
      }

      const merged = { ...config, ...updates };
      const putResult = await putProjectConfig(project, merged);
      return { status: putResult.status, body: { index: nextIndex, ...updates } };
    }

    case "remove_source": {
      if (!project) {
        throw new Error("'project' is required for action 'remove_source'");
      }
      if (params.index === undefined) {
        throw new Error("'index' is required for action 'remove_source'");
      }
      const config = await getProjectConfig(project);
      const { config: renumbered, moves } = removeAndRenumberSource(config, params.index);
      const putResult = await putProjectConfig(project, renumbered);
      return {
        status: putResult.status,
        body: {
          removedIndex: params.index,
          // Rundeck's source listing stops at the first missing index, so
          // any source above the removed one is renumbered down to close
          // the gap — otherwise it becomes invisible to list_sources even
          // though its config still exists.
          renumbered: moves,
        },
      };
    }

    default: {
      const exhaustive: never = action;
      throw new Error(`Unknown action: ${exhaustive}`);
    }
  }
}

// Zod schema

export const rundeckManageResourceSourceSchema = z
  .object({
    action: z
      .enum([
        "list_provider_types",
        "describe_provider_config",
        "list_sources",
        "get_source",
        "add_source",
        "remove_source",
        "get_resources",
        "set_resources",
      ])
      .describe(
        "Operation to perform.\n" +
        "- 'list_provider_types': list installed Resource Model Source plugins (GET plugin/list, filtered to service " +
        "'ResourceModelSource') — discover which provider names ('type') are actually available on this instance " +
        "(e.g. is 'ansible' installed?). Not project-scoped; 'project' is not used.\n" +
        "- 'describe_provider_config': fetch a specific provider's config schema (GET plugin/detail/ResourceModelSource/{type}) " +
        "— returns its 'props' array (name, type, required, defaultValue, description, allowed values), i.e. exactly which " +
        "keys to pass in 'config' for 'add_source'. Requires 'type'; not project-scoped.\n" +
        "- 'list_sources': list all Resource Model Sources for a project (GET project/{project}/sources) — each entry reports 'writeable'\n" +
        "- 'get_source': fetch one source's details by index (GET project/{project}/source/{index}), including 'writeable'\n" +
        "- 'add_source': declare a new source (read-modify-write against project/{project}/config); index is auto-assigned\n" +
        "- 'remove_source': remove a source by index (read-modify-write against project/{project}/config), renumbering higher indices down\n" +
        "- 'get_resources': fetch the current node definitions for a source (GET project/{project}/source/{index}/resources)\n" +
        "- 'set_resources': write node definitions (POST project/{project}/source/{index}/resources) — requires 'content'; only works if the source is 'writeable' (check list_sources/get_source first — writeability is empirical, not implied by 'type')"
      ),
    project: z
      .string()
      .optional()
      .describe(
        "Project name — required for all actions except 'list_provider_types' and 'describe_provider_config', " +
        "which query instance-wide plugin metadata, not a project."
      ),
    index: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe(
        "1-based Resource Model Source index. Required for 'get_source', 'remove_source', 'get_resources', " +
        "and 'set_resources'. Not used for 'list_sources' or 'add_source' (index is auto-assigned)."
      ),
    type: z
      .string()
      .optional()
      .describe(
        "Resource Model Source provider type — required for 'add_source' (which provider to configure) and " +
        "'describe_provider_config' (which provider's config schema to fetch). No default: a caller must pick " +
        "one explicitly rather than silently getting 'file' — a bare 'file' source created without a 'config.file' " +
        "path doesn't just fail cleanly, it can break 'list_sources'/'get_source' for the whole project until " +
        "removed (observed against a live instance), so guessing here is actively risky, not just imprecise. " +
        "Not a closed list — Rundeck supports many provider types, and this tool makes no assumption about " +
        "which ones end up writeable (that's an empirical fact reported by 'writeable' on list_sources/get_source, " +
        "not a property of the type name). Common built-in types: 'file', 'url', 'directory', 'script'. " +
        "Enterprise-only plugin types (e.g. 'node-wizard') and third-party plugin provider names (e.g. 'ansible', " +
        "'aws-ec2') are also valid — pass them as-is. Use 'list_provider_types' to see which are actually " +
        "installed, and 'describe_provider_config' to see the exact config keys each expects, instead of guessing."
      ),
    config: z
      .record(z.string())
      .optional()
      .describe(
        "Provider-specific configuration for 'add_source', written as `resources.source.{index}.config.{key}` " +
        "for each entry — mirrors Rundeck's own flat key convention exactly, so any provider's documented config " +
        "keys work here unmodified. Keys/values depend on 'type'. Common examples:\n" +
        "- type 'file': { file: 'etc/resources.yaml', format: 'resourceyaml', generateFileAutomatically: 'true', " +
        "requireFileExists: 'false', includeServerNode: 'false' } — 'format' here is Rundeck's plugin name " +
        "(resourceyaml/resourcejson/resourcexml), not the top-level 'format' param below.\n" +
        "- type 'url': { url: 'https://...' }\n" +
        "- type 'directory': { directory: '/path/to/dir' }\n" +
        "- type 'node-wizard' (Enterprise): omit entirely — it takes no config, its data lives in the project."
      ),
    format: z
      .enum(["yaml", "json", "xml"])
      .optional()
      .default("yaml")
      .describe(
        "Node definition format for 'set_resources' — mapped to the request's Content-Type header " +
        "(application/yaml, application/json, application/xml). Unrelated to the 'format' key inside 'config' " +
        "(add_source), which uses Rundeck's plugin names instead (resourceyaml/resourcejson/resourcexml)."
      ),
    content: z
      .string()
      .optional()
      .describe(
        "Node definition document contents for 'set_resources' — a YAML, JSON, or XML string matching 'format'. " +
        "See the Node Definition Format reference in this tool's description."
      ),
  })
  .refine(
    (s) =>
      !["get_source", "remove_source", "get_resources", "set_resources"].includes(s.action) ||
      s.index !== undefined,
    {
      message: "'index' is required for actions 'get_source', 'remove_source', 'get_resources', and 'set_resources'",
      path: ["index"],
    }
  )
  .refine((s) => s.action !== "set_resources" || !!s.content, {
    message: "'content' is required for action 'set_resources'",
    path: ["content"],
  })
  .refine(
    (s) => ["list_provider_types", "describe_provider_config"].includes(s.action) || !!s.project,
    {
      message: "'project' is required for all actions except 'list_provider_types' and 'describe_provider_config'",
      path: ["project"],
    }
  )
  .refine((s) => s.action !== "describe_provider_config" || !!s.type, {
    message: "'type' is required for action 'describe_provider_config'",
    path: ["type"],
  })
  .refine((s) => s.action !== "add_source" || !!s.type, {
    message:
      "'type' is required for action 'add_source' — there is no default. Use 'list_provider_types' " +
      "to see what's installed if unsure, or 'describe_provider_config' to see a specific one's config schema.",
    path: ["type"],
  })
  .refine(
    (s) => s.action !== "add_source" || s.type !== "file" || !!s.config?.file,
    {
      message:
        "'config.file' is required when type is 'file' (add_source) — a 'file' source with no file path " +
        "doesn't just fail to write, it can break 'list_sources'/'get_source' for the whole project until removed.",
      path: ["config"],
    }
  );
