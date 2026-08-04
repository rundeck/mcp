import { renderPriorityGuidance } from "./tool-relationships.js";

/**
 * Fully-built `description` strings for the tools whose text is generated
 * (in part) from the tool-relationships registry, kept in their own
 * side-effect-free module so unit tests can assert on them directly
 * without importing index.ts.
 */

export const API_CALL_DESCRIPTION = `Execute a Rundeck API call to interact with a Rundeck instance.

**When to use:**
- Making API requests to Rundeck (GET, POST, PUT, DELETE, PATCH)
- Querying projects, jobs, executions, nodes, or system information
- Triggering job executions via API
- Managing Rundeck resources programmatically

**When NOT to use:**
- Reading documentation (use resources instead: rundeck://docs/*)
${renderPriorityGuidance("api_call")}

**Authentication:** Set RUNDECK_URL and RUNDECK_TOKEN environment variables before calling.
Call without required params for setup guidance.`;

export const JOB_CREATE_DESCRIPTION = `Generate a Rundeck job definition in YAML or JSON format.

**When to use:**
- Creating new job definitions from structured parameters
- Generating job YAML/JSON for import into Rundeck
- Building jobs programmatically

**When NOT to use:**
- Validating existing job definitions (use job_validate instead)
- Making API calls (use api_call instead)
- Reading job documentation (use rundeck://docs/manual/jobs resource instead)

**Guidance Mode:** Call without required params (name, project, workflow_steps) to get step-by-step guidance on job creation.
**Resources:** See rundeck://docs/manual/jobs for comprehensive job documentation.${renderPriorityGuidance("job_create")}`;

export const JOB_VALIDATE_DESCRIPTION = `Validate a Rundeck job definition against Rundeck schemas.

**When to use:**
- Validating job YAML/JSON before importing
- Checking job syntax and structure
- Debugging job definition errors

**When NOT to use:**
- Creating job definitions (use job_create instead)
- Making API calls (use api_call instead)
- Reading job schema (use rundeck://jobs/schema resource instead)

**Guidance Mode:** Call without required params (job_definition, format) to get validation guidance.
**Output:** Returns validation result with errors and warnings.${renderPriorityGuidance("job_validate")}`;

export const RUNNER_CREATE_DESCRIPTION = `Create a Rundeck Runner at system or project scope, on any supported platform (Docker, Kubernetes, Linux, or Windows).

**When to use:**
- Creating a runner for a specific project or global to the system
- Provisioning a runner on any platform: Docker, Kubernetes, Linux, or Windows
- \`installation_type\` (platform) and \`replica_type\` (ephemeral vs manual) are independent — each defaults sensibly (Docker/Kubernetes → ephemeral, Linux/Windows → manual) but any combination is valid, e.g. a manual Docker runner or an ephemeral Kubernetes runner

**When NOT to use:**
- Expecting the runner to be downloaded or started automatically — this tool only **registers** the runner and returns a one-time token; downloading/installing/starting it is always a separate, later step

**Scopes:**
- \`scope: "project"\` → POST project/{project}/runnerManagement/runners (recommended for isolation)
- \`scope: "system"\` → POST runnerManagement/runners (global runner)

**Important:** The response includes a one-time \`token\` and \`downloadTk\`. Store them — they cannot be retrieved again.

**Guidance Mode:** Call without required params (name, scope) to get step-by-step guidance.${renderPriorityGuidance("runner_create")}`;

export const ACL_MANAGE_DESCRIPTION = `List, get, create, update, or delete a Rundeck ACL Policy file at system or project scope.

**When to use:**
- Managing stored ACL policies (system/acl/* or project/{project}/acl/*) without hand-building api_call requests
- Auditing which ACL policies exist in a scope, or reading one's current contents
- Creating/updating a policy after validating it with acl_validate

**When NOT to use:**
- Editing ACL policy files on the server's local filesystem (not supported by this or any Rundeck API)
- Validating policy structure only, without submitting it (use acl_validate instead)

**Scopes:**
- \`scope: "system"\` → system/acl/* (instance/cluster-wide)
- \`scope: "project"\` → project/{project}/acl/* (single project, requires 'project')

**Reference docs (read these directly — do not guess the URI or list all resources):**
- \`rundeck://docs/manual/document-format-reference/aclpolicy-v10\` — full YAML format spec (context, for, by/notBy, allow/deny)
- \`rundeck://docs/learning/howto/acls/group-readonly\`, \`.../group-project-exec\`, \`.../group-project-full\`, \`.../group-manage-runner\`, \`.../group-jobname\`, \`.../group-jobgroup\`, \`.../group-node-filtered\`, \`.../group-multiproject\`, \`.../group-apikey\` — worked examples per access pattern

**Guidance Mode:** Call without required params (action, scope) to get step-by-step guidance.${renderPriorityGuidance("acl_manage")}`;
