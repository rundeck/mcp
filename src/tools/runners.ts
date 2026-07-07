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
  installation_type?: "docker" | "jar";
  tag_names?: string[];
}): Promise<RunnerCreateResult> {
  if (params.scope === "project" && !params.project) {
    throw new Error("'project' is required when scope is 'project'");
  }

  const body: Record<string, unknown> = {
    name: params.name,
    replicaType: params.replica_type ?? "ephemeral",
    installationType: params.installation_type ?? "docker",
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

  return result.body as RunnerCreateResult;
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
    .default("ephemeral")
    .describe(
      "Replica type.\n" +
      "- 'ephemeral': short-lived runner (e.g. Docker container spun up per job).\n" +
      "- 'manual': long-lived persistent runner.\n" +
      "Default: 'ephemeral'"
    ),
  installation_type: z.enum(["docker", "jar"])
    .optional()
    .default("docker")
    .describe(
      "How the runner is installed.\n" +
      "- 'docker': Docker image (recommended for ephemeral runners).\n" +
      "- 'jar': standalone JAR file.\n" +
      "Default: 'docker'"
    ),
  tag_names: z.array(z.string())
    .optional()
    .describe(
      "Tags to assign to the runner. Used for filtering and targeting. " +
      "Example: ['DOCKER', 'PRODUCTION', 'US-EAST']"
    ),
});