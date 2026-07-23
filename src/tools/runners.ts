/**
 * Runner management tools
 */

import { z } from "zod";
import { rundeckApiCall } from "./api.js";

export interface RunnerCreateResult {
  runnerId: string;
  name: string;
  token: string;
  downloadTk: string;
  filename: string;
  description?: string;
  projectAssociations?: unknown;
  replicaId?: string | null;
  nodeDispatch?: unknown;
}

export interface NodeDispatchParams {
  runner_as_node_enabled?: boolean;
  remote_node_dispatch?: boolean;
  node_filter?: string;
}

/**
 * Create a Rundeck Runner at system or project scope.
 *
 * System scope: POST runnerManagement/runners
 * Project scope: POST project/{project}/runnerManagement/runners
 */
export async function rundeckCreateRunner(params: {
  name: string;
  scope: "system" | "project";
  project?: string;
  description?: string;
  replica_type?: "ephemeral" | "manual";
  installation_type?: "linux" | "windows" | "kubernetes" | "docker";
  tag_names?: string[];
  node_dispatch?: NodeDispatchParams;
}): Promise<RunnerCreateResult> {
  if (params.scope === "project" && !params.project) {
    throw new Error("'project' is required when scope is 'project'");
  }

  if (params.node_dispatch && (params.scope !== "project" || !params.project)) {
    throw new Error("'node_dispatch' requires scope 'project' and a 'project' value");
  }

  const installationType = params.installation_type ?? "docker";
  const defaultReplicaType =
    installationType === "linux" || installationType === "windows" ? "manual" : "ephemeral";

  const body: Record<string, unknown> = {
    name: params.name,
    replicaType: params.replica_type ?? defaultReplicaType,
    installationType,
  };

  if (params.description) body.description = params.description;
  if (params.tag_names && params.tag_names.length > 0) body.tagNames = params.tag_names;

  const endpoint =
    params.scope === "project"
      ? `project/${params.project}/runnerManagement/runners`
      : "runnerManagement/runners";

  const result = await rundeckApiCall({ endpoint, method: "POST", body });

  if (result.status !== 200 && result.status !== 201) {
    throw new Error(
      `Runner creation failed (HTTP ${result.status}): ${JSON.stringify(result.body)}`
    );
  }

  const runner = result.body as RunnerCreateResult;

  if (params.node_dispatch) {
    const nodeDispatchBody: Record<string, unknown> = {
      runnerId: runner.runnerId,
      // Rundeck requires this field on every call to this endpoint; default to its
      // own "enabled" default for newly-created runners when the caller omits it.
      runnerAsNodeEnabled: params.node_dispatch.runner_as_node_enabled ?? true,
    };
    if (params.node_dispatch.remote_node_dispatch !== undefined) {
      nodeDispatchBody.remoteNodeDispatch = params.node_dispatch.remote_node_dispatch;
    }
    if (params.node_dispatch.node_filter !== undefined) {
      nodeDispatchBody.runnerNodeFilter = params.node_dispatch.node_filter;
    }

    const nodeDispatchResult = await rundeckApiCall({
      endpoint: `project/${params.project}/runnerManagement/nodeDispatch/config`,
      method: "POST",
      body: nodeDispatchBody,
    });

    if (nodeDispatchResult.status !== 200) {
      throw new Error(
        `Runner '${runner.name}' (ID ${runner.runnerId}) was created, but Node Dispatch config failed ` +
        `(HTTP ${nodeDispatchResult.status}): ${JSON.stringify(nodeDispatchResult.body)}`
      );
    }

    runner.nodeDispatch = nodeDispatchResult.body;
  }

  return runner;
}

// Zod schema
export const rundeckCreateRunnerSchema = z.object({
  name: z.string().describe("Runner name. Must be unique within its scope."),
  scope: z.enum(["system", "project"]).describe(
    "Creation scope.\n" +
    "- 'system': global runner via POST runnerManagement/runners. Can later be associated to projects.\n" +
    "- 'project': runner scoped directly to a project via POST project/{project}/runnerManagement/runners. " +
    "Requires the 'project' field."
  ),
  project: z.string().optional().describe(
    "Project name — required when scope is 'project'. " +
    "Example: 'my-project'"
  ),
  description: z.string().optional().describe("Human-readable description for the runner."),
  replica_type: z.enum(["ephemeral", "manual"])
    .optional()
    .describe(
      "Replica type.\n" +
      "- 'ephemeral': short-lived runner (e.g. Docker container spun up per job).\n" +
      "- 'manual': long-lived persistent runner.\n" +
      "If omitted, defaults based on installation_type — 'manual' for 'linux'/'windows', " +
      "'ephemeral' for 'docker'/'kubernetes' — matching Rundeck's own default behavior."
    ),
  installation_type: z.enum(["linux", "windows", "kubernetes", "docker"])
    .optional()
    .default("docker")
    .describe(
      "Platform/method the runner is installed on.\n" +
      "- 'docker': Docker image (recommended for ephemeral runners).\n" +
      "- 'kubernetes': runs as a Kubernetes workload.\n" +
      "- 'linux': standalone JAR on a Linux host.\n" +
      "- 'windows': standalone JAR on a Windows host.\n" +
      "'linux'/'windows' default to replica_type 'manual'; 'docker'/'kubernetes' default to 'ephemeral' — " +
      "matching Rundeck's own behavior when replica_type is left unset.\n" +
      "Default: 'docker'"
    ),
  tag_names: z.array(z.string())
    .optional()
    .describe(
      "Tags to assign to the runner. Used for filtering and targeting. " +
      "Example: ['DOCKER', 'PRODUCTION', 'US-EAST']"
    ),
  node_dispatch: z.object({
    runner_as_node_enabled: z.boolean().optional().describe(
      "Adds the Runner itself as a node in the project's node inventory (the 'Runner as a Node' setting). " +
      "Default: true, matching Rundeck's own default when a Runner is created."
    ),
    remote_node_dispatch: z.boolean().optional().describe(
      "Enables the Runner to dispatch commands/scripts/API calls to remote nodes (via SSH, WinRM, HTTP/S) " +
      "that match 'node_filter'."
    ),
    node_filter: z.string().optional().describe(
      "Node Filter expression defining which nodes this Runner is responsible for when " +
      "'remote_node_dispatch' is enabled. Example: 'tags: LINUX'."
    ),
  })
    .optional()
    .describe(
      "Optional Node Dispatch configuration, applied via a follow-up call to " +
      "POST project/{project}/runnerManagement/nodeDispatch/config right after the runner is created. " +
      "Only valid when scope is 'project' (requires the 'project' field)."
    ),
}).refine(
  (s) => s.scope !== "project" || s.project !== undefined,
  { message: "'project' is required when scope is 'project'", path: ["project"] }
).refine(
  (s) => !s.node_dispatch || (s.scope === "project" && s.project !== undefined),
  { message: "'node_dispatch' requires scope 'project' and a 'project' value", path: ["node_dispatch"] }
);