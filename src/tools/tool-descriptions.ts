import { renderPriorityGuidance } from "./tool-relationships.js";
import { ASK_USER_LINE } from "../utils/escalation.js";
import { NODE_DEFINITION_FORMAT_REFERENCE } from "./resources.js";

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
Call without required params for setup guidance.

**Destructive calls:** \`method: "DELETE"\`, and \`POST\` to a runner's \`regenerateCreds\` endpoint
(which revokes its current credentials), require live human confirmation before reaching Rundeck,
via the connected MCP client's support for MCP elicitation. **Call the tool directly for these —
do not ask the user to confirm in chat first;** the server pauses and prompts the user itself,
through the client's own UI, independent of anything you do — just wait for that outcome. If the
connected client doesn't support elicitation (or the request fails), the call is blocked outright
with no way to retry it through this tool.

${ASK_USER_LINE}`;

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
**Resources:** See rundeck://docs/manual/jobs for comprehensive job documentation.${renderPriorityGuidance("job_create")}

${ASK_USER_LINE}`;

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
**Output:** Returns validation result with errors and warnings.${renderPriorityGuidance("job_validate")}

${ASK_USER_LINE}`;

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

**Guidance Mode:** Call without required params (name, scope) to get step-by-step guidance.${renderPriorityGuidance("runner_create")}

${ASK_USER_LINE}`;

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
- Worked examples, one per access pattern: \`rundeck://docs/learning/howto/acls/group-readonly\`, \`rundeck://docs/learning/howto/acls/group-project-exec\`, \`rundeck://docs/learning/howto/acls/group-project-full\`, \`rundeck://docs/learning/howto/acls/group-manage-runner\`, \`rundeck://docs/learning/howto/acls/group-jobname\`, \`rundeck://docs/learning/howto/acls/group-jobgroup\`, \`rundeck://docs/learning/howto/acls/group-node-filtered\`, \`rundeck://docs/learning/howto/acls/group-multiproject\`, \`rundeck://docs/learning/howto/acls/group-apikey\`

**Guidance Mode:** Call without required params (action, scope) to get step-by-step guidance.${renderPriorityGuidance("acl_manage")}

**Changing or deleting a policy:** \`action: "delete"\` and \`action: "update"\` (both irreversible —
Rundeck keeps no prior version) require live human confirmation before reaching Rundeck, via the
connected MCP client's support for MCP elicitation. **Call the tool directly for these — do not
ask the user to confirm in chat first;** the server pauses and prompts the user itself, through the
client's own UI, independent of anything you do — just wait for that outcome. If the connected
client doesn't support elicitation (or the request fails), the call is blocked outright with no
way to retry it through this tool.

${ASK_USER_LINE}`;

export const RESOURCE_MODEL_SOURCE_MANAGE_DESCRIPTION = `Configure a project's Resource Model Sources (where Nodes come from) and, when possible, load node definitions into them directly — all without hand-building requests against plugin/list, plugin/detail, project/{project}/sources, project/{project}/source/{index}/resources, or project/{project}/config.

**The canonical 3-step flow this tool is built around:**
1. **Configure the requested plugin** — call \`describe_provider_config\` (after \`list_provider_types\` if the exact installed name is unknown) to get that plugin's real \`props\` schema, then \`add_source\` with a \`config\` built from those props. Never guess field names for a non-built-in plugin (Ansible, AWS, etc.).
2. **Check writeability** — this determines whether nodes can be created directly through the API at all, which is what makes use cases like "create these manual nodes" or "migrate nodes from an external source into Rundeck" possible without server filesystem access. \`set_resources\` (step 3) checks this itself via \`get_source\`, so no separate call is required.
3. **Load the nodes if writeable — otherwise stop.** If \`writeable: true\`, \`set_resources\` writes the node definitions. If \`writeable: false\`, it fails fast with that fact instead of attempting the POST or silently trying something else; the caller then decides whether to retry \`add_source\` with a different provider \`type\`.

**When to use:**
- Discovering which Resource Model Source plugins are installed on this instance (e.g. is 'ansible' available?), and what config keys a given plugin expects — instead of guessing or relying on static docs
- Auditing which Resource Model Sources a project has, and whether each is \`writeable\`
- Adding a source (any provider \`type\` — 'file', 'url', 'directory', 'script', Enterprise-only ones like 'node-wizard', or a third-party plugin) to hold node definitions
- Creating nodes manually, or migrating nodes from an external source into Rundeck, by loading node definitions (YAML/JSON/XML) directly on a source the API reports as \`writeable\` — no server filesystem access needed

**When NOT to use:**
- Making generic API calls unrelated to nodes/sources (use api_call instead)

**Actions:**
- \`list_provider_types\` — GET plugin/list, filtered to service 'ResourceModelSource' — which provider names are installed. Not project-scoped.
- \`describe_provider_config\` — GET plugin/detail/ResourceModelSource/{type} — that provider's \`props\` schema (name, type, required, defaultValue, description, allowed values). Requires \`type\`; not project-scoped.
- \`list_sources\` — GET project/{project}/sources (each entry reports \`writeable\`)
- \`get_source\` — GET project/{project}/source/{index} (also reports \`writeable\`)
- \`add_source\` — read-modify-write of project/{project}/config; index auto-assigned; \`type\` is free-form but **required, no default** (a bare \`file\` source with no \`config.file\` was observed to break \`list_sources\`/\`get_source\` for the whole project until removed, so guessing is disallowed rather than silently defaulting); \`config\` is a free-form key/value passthrough matching Rundeck's own \`resources.source.N.config.*\` keys, and \`config.file\` is required specifically when \`type\` is \`"file"\`
- \`remove_source\` — read-modify-write of project/{project}/config, removing that index's keys and renumbering any higher-indexed sources down to close the gap (Rundeck's own listing stops enumerating at the first missing index)
- \`get_resources\` — GET project/{project}/source/{index}/resources
- \`set_resources\` — POST project/{project}/source/{index}/resources — requires \`content\`; checks \`writeable\` via \`get_source\` first and stops with a clear error if false, rather than attempting the write

**Writeability is empirical, not implied by \`type\`:** whether a source accepts \`set_resources\` depends on the actual Rundeck deployment, not on its provider type name. A \`file\` source can report \`writeable: false\` on installs using DB-backed project storage instead of a real filesystem (some Docker/OSS setups) — confirmed against a live instance, where \`node-wizard\` (commonly assumed manual-entry-only, API-less) turned out to be \`writeable: true\` instead.

**Caveat — some providers' data outlives their source entry:** e.g. \`node-wizard\`'s node data lives in the project itself, independent of any single source's config entry/index. \`remove_source\` only deletes the config pointer, not that underlying data — re-adding such a source later can resurface (and duplicate) old nodes.

${NODE_DEFINITION_FORMAT_REFERENCE}
**Guidance Mode:** Call without \`action\` to get step-by-step guidance (\`project\` isn't checked for this, since it's only required for some actions — see Actions above).${renderPriorityGuidance("resource_model_source_manage")}

${ASK_USER_LINE}`;
