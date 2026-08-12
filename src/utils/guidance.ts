/**
 * Guidance content utility
 * Provides step-by-step guidance for tools when called without required parameters
 * 
 * Integration with Prompts:
 * - Prompts are available via MCP protocol (prompts/list, prompts/get)
 * - Guidance mode provides similar functionality when tools are called without required params
 * - Both approaches complement each other:
 *   - Prompts: Pre-configured templates with arguments, accessible via prompts/get
 *   - Guidance: Dynamic guidance returned when tools are called without required params
 * 
 * When to use Prompts vs Guidance:
 * - Use Prompts: When you want a pre-configured template with specific arguments
 * - Use Guidance: When calling a tool without required params for step-by-step instructions
 */

import { renderFallbackGuidance } from "../tools/tool-relationships.js";

export function getJobCreationGuidance(): string {
  return `# Creating a Rundeck Job

## Overview
A Rundeck job encapsulates a sequence of steps, job options, and nodes where the steps execute.

## Key Components

### 1. Basic Job Structure
Every job needs:
- **name**: The job name (required)
- **description**: Job description (can be blank)
- **loglevel**: Logging level (DEBUG, VERBOSE, INFO, WARN, ERROR)
- **sequence**: The workflow sequence definition

### 2. Workflow Steps
Jobs execute a sequence of commands. Steps can be:
- **Node Steps**: Execute on each targeted node (e.g., commands, scripts)
- **Workflow Steps**: Execute once on the Rundeck server (e.g., refresh nodes, HTTP requests)

### 3. Node Filters
Define which nodes the job will target using node filter expressions.

### 4. Job Options (Optional)
Allow users to provide input when running the job.

### 5. Schedule (Optional)
Use a Quartz cron expression or a structured time definition to run jobs on a schedule.

## Job Format
Jobs can be defined in YAML or JSON format. YAML is recommended for readability.

## Importing Jobs into Rundeck

\`job_create\` generates a YAML/JSON definition — it does NOT create the job in Rundeck.
To actually create the job, pipe the output to \`api_call\`:

\`\`\`
1. job_create(name: "My Job", project: "myProject", ...)  → returns YAML string
2. api_call(
     endpoint: "project/myProject/jobs/import",
     method: "POST",
     body: "<yaml from step 1>",
     content_type: "application/yaml"
   )
\`\`\`

### Bulk import (N jobs at once)
\`job_create\` returns an array (YAML by default, JSON if \`format: "json"\` is set).
To import multiple jobs in one API call, call \`job_create\` for each job using the same
format, concatenate the arrays, then do a single \`api_call\` with the matching \`content_type\`
(\`application/yaml\` or \`application/json\`).

## Required Parameters
- **name** (string): Job name
- **project** (string): Project name
- **workflow_steps** (array): Array of workflow step definitions

## Optional Parameters
- **description** (string): Job description
- **node_filter** (string): Node filter expression
- **options** (array): Job options
- **format** ("yaml" | "json"): Output format (default: "yaml")
- **group** (string): Job group
- **loglevel** ("DEBUG" | "VERBOSE" | "INFO" | "WARN" | "ERROR"): Log level (default: "INFO")
- **timeout** (string): Job timeout (e.g., "1h", "30m")
- **retry** (number | string): Number of retries
- **multipleExecutions** (boolean): Allow multiple simultaneous executions
- **schedule** (object): Schedule definition
  - \`crontab\` (string): Quartz cron, e.g. \`"0 0 8 ? * MON-FRI"\` (8 AM weekdays)
  - \`time\` (object): \`{ hour, minute, seconds? }\` — alternative to crontab
  - \`month\`, \`year\`, \`weekday\`, \`day\`: additional structured fields

## Next Steps
1. Use \`job_create\` with required parameters to generate your job definition
2. Validate with \`job_validate\` before importing
3. Import with \`api_call\` as described above

## Resources
- Job Schema: \`rundeck://jobs/schema\`
- Job Examples: \`rundeck://docs/manual/jobs\`
- Workflow Strategies: \`rundeck://jobs/workflows\`
- Job Options: \`rundeck://jobs/options\`` + renderFallbackGuidance("job_create");
}

export function getRundeckConnectGuidance(instanceNames: string[]): string {
  const list =
    instanceNames.length > 0
      ? instanceNames.map((name) => `- \`${name}\``).join("\n")
      : "(none registered)";

  return `# Switching Rundeck Instances

## Usage
Call \`rundeck_connect\` with an \`instance\` argument naming a registered instance:

\`\`\`json
{ "instance": "staging" }
\`\`\`

## Registered instances
${list}

## Notes
- This tool only takes a **name** — never a URL or token.
- If the name doesn't match a registered instance, the connection is cleared rather than left pointing at whatever was active before, so a follow-up \`api_call\` fails closed instead of silently hitting the wrong instance.`;
}

export function getApiCallGuidance(): string {
  return `# Calling the Rundeck API

## Prerequisites
1. **Setup Authentication**: Set RUNDECK_URL and RUNDECK_TOKEN environment variables
   - \`export RUNDECK_URL=https://your-rundeck-instance.com\`
   - \`export RUNDECK_TOKEN=your-api-token\`
2. **Get API Token**: Generate a token from your Rundeck user profile page (User Profile → Generate API Token)

## Authentication Methods
Rundeck supports three authentication methods:
1. **API Token** (recommended): Include \`X-Rundeck-Auth-Token\` header
2. **Password**: Session-based authentication
3. **JWT Token** (Enterprise): OAuth/OIDC bearer tokens

## Making API Calls

### Step 1: List Available Endpoints
Use \`api_list\` tool to discover available API endpoints.

### Step 2: Execute API Call
Use \`api_call\` with:
- \`endpoint\`: API path (e.g., "/api/59/projects" or "projects")
- \`method\`: HTTP method (GET, POST, PUT, DELETE)
- \`body\`: Request body for POST/PUT (optional)
- \`query_params\`: Query parameters (optional)

### Example: List Projects
\`\`\`
api_call({
  endpoint: "projects",
  method: "GET"
})
\`\`\`

### Example: Run a Job
\`\`\`
api_call({
  endpoint: "job/{job-id}/run",
  method: "POST",
  body: {
    options: {
      "option-name": "value"
    }
  }
})
\`\`\`

## API Version
The API version is specified in the URL path (e.g., /api/59/...). Current default version is 59.

## Required Parameters
- **endpoint** (string): API endpoint path
- **method** (string): HTTP method (GET, POST, PUT, DELETE)

## Optional Parameters
- **body** (object): Request body for POST/PUT requests
- **query_params** (object): Query parameters

## Alternative: Use Prompts
You can also use the \`call-api\` prompt via \`prompts/get\` for API guidance:
- \`prompts/get\` with name: "call-api" and optional arguments: { endpoint_category: "jobs" | "projects" | "executions" | "system" | "authentication" | "general" }

## Resources
- API Index: \`rundeck://api\`
- Authentication: \`rundeck://api/auth\`
- API Examples: \`rundeck://api/examples\``;
}

export function getJobValidationGuidance(): string {
  return `# Validating a Rundeck Job

## Overview
Validate a Rundeck job definition against expected structure before import.

## Required Parameters
- **job_definition** (string): The job as a YAML or JSON string
- **format** (\`yaml\` | \`json\`): Must match how \`job_definition\` is encoded

## Example
\`\`\`
job_validate({
  job_definition: "name: My Job\\nproject: my-project\\nsequence:\\n  commands:\\n    - exec: echo hello",
  format: "yaml"
})
\`\`\`

## Resources
- Job schema: \`rundeck://jobs/schema\`
- Authoring: MCP prompt \`create-job\` or tool \`job_create\`` + renderFallbackGuidance("job_validate");
}

export function getProjectConfigGuidance(): string {
  return `# Configuring a Rundeck Project

## Overview
Project configuration controls how jobs execute, where nodes come from, and project-specific settings.

## Configuration Areas

### 1. Project Settings
- Project name and description
- Execution history cleanup
- Execution mode (enable/disable executions)
- User interface settings

### 2. Node Execution
- Default node executor (SSH, WinRM, etc.)
- Default file copier
- Node executor configuration

### 3. Resource Model Sources
Configure where nodes come from:
- File-based sources
- Remote URL sources
- Plugin-based sources (AWS, Azure, etc.)

### 4. SCM Integration
- Git integration for job version control
- Import/export jobs

### 5. Plugin Configuration
Configure plugins at project level for shared settings.

## Configuration Methods

### Via Web UI
Navigate to Project Settings → Edit Configuration

### Via API
Use \`PUT /api/{version}/project/{project}/config\` endpoint

### Via CLI
Use \`rd projects configure set\` command

## Resources
- Project Configuration: \`rundeck://config/project\`
- System Configuration: \`rundeck://config/system\`
- Plugin Configuration: \`rundeck://config/plugins\``;
}

export function getAuthSetupGuidance(): string {
  return `# Setting Up Rundeck API Authentication

## Overview
To use the Rundeck API, you need to authenticate via environment variables. The recommended method is API token authentication.

## Step 1: Generate API Token

### Via Web UI
1. Log in to Rundeck
2. Click on your username in the header
3. Go to "User Profile" page
4. Click "Generate API Token"
5. Copy the token (you won't see it again!)

### Via API (if you have existing auth)
\`POST /api/{version}/tokens/{user}\`

## Step 2: Configure Environment Variables
Set the following environment variables before using \`api_call\`:

\`\`\`bash
export RUNDECK_URL=https://your-rundeck-instance.com
export RUNDECK_TOKEN=your-api-token-here
export RUNDECK_API_VERSION=59  # Optional, defaults to 59
\`\`\`

## Security Best Practices
1. **Use HTTPS**: Always use SSL/TLS for API communication
2. **Token Security**: Keep tokens secure, don't commit to version control
3. **Token Expiration**: Set appropriate expiration periods
4. **Least Privilege**: Generate tokens with minimum required permissions
5. **Rotate Tokens**: Regularly rotate API tokens

## Token Authorization
Tokens inherit the authorization roles of the user who created them. Ensure your user has appropriate permissions.

## Resources
- Authentication Methods: \`rundeck://api/auth\`
- API Basics: \`rundeck://api/examples\`
- Configuration: \`rundeck://docs/administration/configuration\``;
}

export function getNodeFilterGuidance(): string {
  return `# Writing Node Filter Expressions

## Overview
Node filters determine which nodes a job will target. Filters use attribute matching and boolean logic.

## Basic Syntax

### Attribute Matching
\`\`\`
name: web-.*          # Node name matches regex
tags: web              # Node has tag "web"
os-family: unix        # Node has os-family attribute
\`\`\`

### Boolean Operators
\`\`\`
tags: web AND os-family: unix    # Both conditions
tags: web OR tags: database       # Either condition
!tags: maintenance                # NOT condition
\`\`\`

### Common Attributes
- \`name\`: Node name
- \`tags\`: Node tags
- \`os-family\`: Operating system family
- \`os-name\`: Operating system name
- \`os-version\`: Operating system version
- \`os-arch\`: Architecture
- \`hostname\`: Hostname
- \`username\`: Username
- Custom attributes defined in resource model

## Examples

### Simple Filter
\`\`\`
tags: production
\`\`\`

### Complex Filter
\`\`\`
tags: web AND os-family: linux AND !tags: maintenance
\`\`\`

### Name Pattern
\`\`\`
name: web-.* AND tags: production
\`\`\`

## Alternative: Use Prompts
You can also use the \`write-node-filter\` prompt via \`prompts/get\`:
- \`prompts/get\` with name: "write-node-filter" and optional arguments: { filter_complexity: "simple" | "complex" }

## Resources
- Node Filter Reference: \`rundeck://ref/filters\`
- Node Documentation: \`rundeck://learn\``;
}

export function getPluginIntegrationGuidance(): string {
  return `# Integrating Rundeck Plugins

## Overview
Plugins extend Rundeck functionality. They can be configured at system, project, or job level.

## Plugin Types

### Node Steps
Execute on each targeted node (e.g., AWS commands, Kubernetes operations)

### Workflow Steps
Execute once on Rundeck server (e.g., HTTP requests, notifications)

### Node Executors
Control how commands are executed on nodes (SSH, WinRM, etc.)

### File Copiers
Control how files are copied to nodes

### Notifications
Send notifications on job events (email, Slack, PagerDuty, etc.)

## Configuration Levels

### 1. System Level
Configure for all projects:
- Navigate to System Configuration
- Find plugin suite
- Configure shared properties

### 2. Project Level
Configure for specific project:
- Navigate to Project Settings → Edit Configuration → Plugins
- Add PluginGroup
- Configure properties

### 3. Job Level
Configure in individual job step

## Configuration Priority
Job > Project > System

## Common Plugins
- AWS (EC2, S3, Lambda, etc.)
- Azure
- Kubernetes
- Docker
- Jira
- PagerDuty
- ServiceNow
- GitHub

## Alternative: Use Prompts
You can also use the \`integrate-plugin\` prompt via \`prompts/get\`:
- \`prompts/get\` with name: "integrate-plugin" and optional arguments: { plugin_type: "node-step" | "workflow-step" | "file-copier" | "notification" | "executor", configuration_level: "system" | "project" | "job" }

## Resources
- Plugin Overview: \`rundeck://plugins\`
- Node Step Plugins: \`rundeck://plugins/node-steps\`
- Workflow Step Plugins: \`rundeck://plugins/workflow-steps\`
- Plugin Configuration: \`rundeck://config/plugins\``;
}

export function getRunnerGuidance(): string {
  return `# Creating a Rundeck Runner

## Overview
Runners execute jobs on remote infrastructure. They connect back to Rundeck and poll for work.
Two creation scopes exist — choose based on whether the runner should be shared across projects or tied to one.

## Scopes

### Project scope (recommended for isolation)
Creates a runner directly associated to a specific project.
- Endpoint: \`POST project/{project}/runnerManagement/runners\`
- Use \`runner_create(scope: "project", project: "my-project", ...)\`

### System scope (global runner)
Creates a global runner that can later be associated to multiple projects.
- Endpoint: \`POST runnerManagement/runners\`
- Use \`runner_create(scope: "system", ...)\`

## Required Parameters
- **name** (string): Runner name — must be unique within its scope
- **scope** ("system" | "project"): Creation scope
- **project** (string): Project name — required when scope is "project"

## Optional Parameters
- **description** (string): Human-readable description
- **installation_type** ("docker" | "kubernetes" | "linux" | "windows"): Platform/method the runner runs on. Default "docker".
- **replica_type** ("ephemeral" | "manual"): If omitted, defaults based on installation_type — "manual" for "linux"/"windows", "ephemeral" for "docker"/"kubernetes" — matching Rundeck's own default behavior.
- **tag_names** (string[]): Tags for filtering, e.g. ["DOCKER", "PRODUCTION"]
- **node_dispatch** (object): Node Dispatch config, applied via a follow-up call to
  \`POST project/{project}/runnerManagement/nodeDispatch/config\` right after creation.
  Only valid when scope is "project". Fields:
  - **runner_as_node_enabled** (boolean): Adds the Runner itself as a node in the inventory. Default: true.
  - **remote_node_dispatch** (boolean): Lets the Runner dispatch to remote nodes (SSH/WinRM/HTTP/S) matching \`node_filter\`.
  - **node_filter** (string): Node Filter expression defining which nodes this Runner handles, e.g. \`"tags: LINUX"\`.
  If the Node Dispatch follow-up call fails, the runner has already been created — the result still
  includes \`token\`/\`downloadTk\`, plus a \`nodeDispatchError\` field describing the failure. The call
  does not throw in this case, so the one-time token is never lost.

## Response
Creating a runner only **registers** it — it does not download or install anything.
The response includes a **one-time token** and **downloadTk**, which you use afterward,
in a separate step, to actually fetch the runner:
- \`token\`: used to authenticate the runner process on startup
- \`downloadTk\`: one-time token to download the runner artifact (see below)
- \`runnerId\`: unique runner ID

## Downloading and Starting the Runner (separate step, after creation)

### Docker
\`\`\`bash
docker run -e RUNNER_TOKEN=<token> rundeck/runner:latest
\`\`\`

### Kubernetes
Deploy the runner workload using \`<token>\`, following your cluster's standard deployment process.

### Linux / Windows (standalone JAR)
Redeem \`downloadTk\` via the runner download endpoint to fetch the JAR, then run it with \`<token>\`.

## Examples

### Create an ephemeral Docker runner for a project
\`\`\`
runner_create({
  scope: "project",
  project: "my-project",
  name: "my-docker-runner",
  installation_type: "docker",
  tag_names: ["DOCKER"]
})
\`\`\`

### Create a manual Linux runner for a project
\`\`\`
runner_create({
  scope: "project",
  project: "my-project",
  name: "my-linux-runner",
  installation_type: "linux",
  tag_names: ["LINUX"]
})
\`\`\`

### Create a manual Linux runner with Node Dispatch enabled
\`\`\`
runner_create({
  scope: "project",
  project: "my-project",
  name: "my-linux-runner",
  installation_type: "linux",
  tag_names: ["LOCAL", "JAR"],
  node_dispatch: {
    remote_node_dispatch: true,
    node_filter: "tags: LINUX"
  }
})
\`\`\`

### Create a global system runner
\`\`\`
runner_create({
  scope: "system",
  name: "shared-runner",
  description: "Shared runner for all projects",
  tag_names: ["SHARED"]
})
\`\`\`` + renderFallbackGuidance("runner_create");
}

export function getAclValidateGuidance(): string {
  return `# Validating a Rundeck ACL Policy

## Overview
Checks the structure of an ACL Policy YAML document (or multi-document file) against the
aclpolicy v1.0 format, catching the most common authoring mistakes offline before you
create or update a policy via \`acl_manage\`.

## Required Parameters
- **acl_definition** (string): ACL policy YAML contents. May contain multiple \`---\`-separated documents.

## What is checked
- **context**: must declare exactly one of \`project\` (regex) or \`application: rundeck\`
- **for**: must declare at least one resource type (job, node, adhoc, project, resource, storage, project_acl, system_acl, user, runner, apitoken, plugin, event, webhook, system), each with rules that declare \`allow\` and/or \`deny\`
- **by** / **notBy**: at least one must be present, declaring \`username\`, \`group\`, or \`urn\`
- Warns (does not error) when a rule has no \`match\`/\`equals\`/\`contains\`/\`subset\` clause, since that means the rule applies to ALL resources of that type — often unintentional
- Warns when an \`allow\`/\`deny\` action isn't recognized for that resource type/kind and scope (project vs application) — catches typos like \`raed\` instead of \`read\`, which otherwise pass silently and just mean the permission is never granted. Only checked where the action vocabulary is confirmed; unrecognized type/kind/scope combinations are skipped rather than guessed.

## Note
This is a local, offline structural check. Only Rundeck itself is authoritative — a policy that
passes here can still be rejected by the server (e.g. for actions that don't exist for a given
resource type). \`acl_manage\` with action \`create\`/\`update\` surfaces Rundeck's own validation
errors when that happens.

## Usage Example
\`\`\`
acl_validate({
  acl_definition: "description: Admin\\ncontext:\\n  application: rundeck\\nfor:\\n  resource:\\n    - equals:\\n        kind: system\\n      allow: [read, admin]\\nby:\\n  group: admin"
})
\`\`\`

## Resources
- ACL Policy format: \`rundeck://docs/manual\` (see aclpolicy-v10.md)
- ACL Policy administration: \`rundeck://docs/administration\` (see acl-policy-editor.md)`;
}

export function getAclManageGuidance(): string {
  return `# Managing Rundeck ACL Policies

## Overview
ACL Policies control who can do what in Rundeck. This tool wraps the CRUD endpoints Rundeck
exposes for **stored** ACL policy files — it does not touch policy files on the server's local
filesystem (those can only be managed by editing them directly on disk).

## Scopes
- \`scope: "system"\` → \`system/acl/*\` — applies instance/cluster-wide
- \`scope: "project"\` → \`project/{project}/acl/*\` — applies to a single project only (requires \`project\`)

## Actions
- **list**: \`GET .../acl/\` — list policy file names in scope
- **get**: \`GET .../acl/{name}\` — fetch a policy's YAML contents
- **create**: \`POST .../acl/{name}\` — create a new policy (requires \`content\`); fails with 409 if it already exists
- **update**: \`PUT .../acl/{name}\` — replace an existing policy (requires \`content\`); fails with 404 if it doesn't exist
- **delete**: \`DELETE .../acl/{name}\` — remove a policy

## Required Parameters
- **action** ("list" | "get" | "create" | "update" | "delete")
- **scope** ("system" | "project")
- **project** (string): required when scope is "project"
- **name** (string): required for all actions except "list". The \`.aclpolicy\` suffix is added automatically if omitted.
- **content** (string): required for "create"/"update" — the ACL policy YAML

## Recommended workflow
1. Draft the policy YAML.
2. Call \`acl_validate({ acl_definition })\` to catch structural mistakes offline.
3. Call \`acl_manage({ action: "create" | "update", ... , content })\`.
4. If Rundeck rejects it (HTTP 400), the response body includes a \`policies\` list with per-document
   validation errors straight from the server — fix and retry.

## Examples

### List system-scoped policies
\`\`\`
acl_manage({ action: "list", scope: "system" })
\`\`\`

### Create a project-scoped policy
\`\`\`
acl_manage({
  action: "create",
  scope: "project",
  project: "my-project",
  name: "read-only",
  content: "description: Read-only access\\ncontext:\\n  project: 'my-project'\\nfor:\\n  job:\\n    - allow: read\\n  node:\\n    - allow: read\\nby:\\n  group: readonly"
})
\`\`\`

### Delete a system-scoped policy
\`\`\`
acl_manage({ action: "delete", scope: "system", name: "old-policy" })
\`\`\`

### Create a read-only Runner Management policy for a group
\`\`\`
acl_manage({
  action: "create",
  scope: "system",
  name: "qa-runner-readonly",
  content: "description: Read-only access to Runner Management\\ncontext:\\n  application: 'rundeck'\\nfor:\\n  resource:\\n    - equals:\\n        kind: runner\\n      allow: [read]\\nby:\\n  group: qa"
})
\`\`\`

## Resources
- ACL Policy format: \`rundeck://docs/manual\` (see aclpolicy-v10.md)
- ACL Policy administration: \`rundeck://docs/administration\` (see acl-policy-editor.md)` + renderFallbackGuidance("acl_manage");
}

export function getPluginCreationGuidance(): string {
  return `# Creating a Rundeck Plugin

## Overview
Rundeck plugins extend functionality by implementing specific service interfaces. Plugins can be written in Java or Groovy.

## Plugin Types

### 1. Node Step Plugin (\`node-step\`)
- **Purpose**: Executes on each node in a workflow
- **Interface**: \`NodeStepPlugin\`
- **Service Name**: \`WorkflowNodeStep\`
- **Method**: \`executeNodeStep(PluginStepContext, Map<String, Object>, INodeEntry)\`
- **Use Case**: Operations that need to run on each targeted node (e.g., node-specific commands, node status updates)

### 2. Workflow Step Plugin (\`workflow-step\`)
- **Purpose**: Executes once per workflow
- **Interface**: \`StepPlugin\`
- **Service Name**: \`WorkflowStep\`
- **Method**: \`executeStep(PluginStepContext, Map<String, Object>)\`
- **Use Case**: Operations that run once regardless of node count (e.g., HTTP requests, database operations)

### 3. Remote Script Node Step Plugin (\`remote-script-node-step\`)
- **Purpose**: Generates script/command for remote execution
- **Interface**: \`RemoteScriptNodeStepPlugin\`
- **Service Name**: \`RemoteScriptNodeStep\`
- **Method**: \`generateScript(PluginStepContext, Map<String, Object>, INodeEntry)\`
- **Use Case**: Simplified interface for generating scripts/commands executed remotely

### 4. File Copier Plugin (\`file-copier\`)
- **Purpose**: Copies files/scripts to remote nodes
- **Interface**: \`FileCopier\`
- **Service Name**: \`FileCopier\`
- **Methods**: \`copyFile\`, \`copyFileStream\`, \`copyScriptContent\`
- **Use Case**: Custom file transfer mechanisms (e.g., SCP, FTP, cloud storage)

### 5. Notification Plugin (\`notification\`)
- **Purpose**: Sends notifications on job events
- **Interface**: \`NotificationPlugin\`
- **Service Name**: \`Notification\`
- **Method**: \`postNotification(String trigger, Map<String, Object> executionData, Map<String, Object> config)\`
- **Use Case**: Custom notification channels (e.g., Slack, Teams, custom webhooks)

## Required Parameters

- **plugin_type** (string): Type of plugin to create
  - Options: \`node-step\`, \`workflow-step\`, \`remote-script-node-step\`, \`file-copier\`, \`notification\`
- **name** (string): Plugin name (provider name)
  - Must be unique and follow Java naming conventions (lowercase, alphanumeric with hyphens/underscores)
  - Example: \`my-custom-step\`, \`email-notification\`
- **class_name** (string): Java class name
  - Must start with uppercase letter and follow Java naming conventions
  - Example: \`MyCustomStep\`, \`EmailNotification\`

## Optional Parameters

- **description** (string): Plugin description
- **package_name** (string): Java package name (default: \`com.rundeck.plugins\`)
- **properties** (array): Plugin configuration properties
  - Each property has: \`name\`, \`type\` (String/Integer/Boolean/Long/Select), \`description\`, \`required\`, \`default\`, \`values\` (for Select type)
- **language** (string): Target language - \`java\` (default) or \`groovy\`

## Plugin Structure

All plugins require:
1. **@Plugin annotation**: Defines service type and provider name
2. **@PluginDescription annotation**: Provides title and description
3. **@PluginProperty annotations**: For configuration properties
4. **Interface implementation**: Implements the appropriate service interface
5. **Method implementation**: Implements required methods

## Next Steps

1. Follow plugin documentation resources below (Phase 1 does not expose an MCP plugin generator tool)
2. Review plugin documentation: \`rundeck://docs/developer/plugins\`
3. Review specific plugin type docs (e.g. \`rundeck://docs/developer/plugin/step-plugins\`, \`rundeck://docs/developer/plugin/notification-plugins\`)
4. Implement plugin logic and tests in your project
5. Package as .jar file with proper manifest entries
6. Deploy to \`$RDECK_BASE/libext\` directory

## Resources

- Plugin Development Guide: \`rundeck://docs/developer\`
- Plugin Overview: \`rundeck://plugins\`
- Step Plugins: \`rundeck://docs/developer/plugin/step-plugins\`
- File Copier Plugins: \`rundeck://docs/developer/plugin/file-copier-plugins\`
- Notification Plugins: \`rundeck://docs/developer/plugin/notification-plugins\`
- Plugin Configuration: \`rundeck://config/plugins\`

## Example shape (reference)

When plugin codegen is re-enabled, parameters follow the schema in \`src/tools/plugins.ts\`. For Phase 1, implement from the resources above.

\`\`\`text
plugin_type: node-step
name: my-custom-step
class_name: MyCustomStep
\`\`\``;
}

