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

## Job Format
Jobs can be defined in YAML or JSON format. YAML is recommended for readability.

## Next Steps
1. Review the job schema with \`rundeck://jobs/schema\` resource
2. Review job examples at \`rundeck://docs/manual/jobs\`
3. Use \`job_create\` with required parameters to create your job definition
4. Validate with \`job_validate\` before importing

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

## Resources
- Job Schema: \`rundeck://jobs/schema\`
- Workflow Strategies: \`rundeck://jobs/workflows\`
- Job Options: \`rundeck://jobs/options\``;
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
- \`endpoint\`: API path (e.g., "/api/46/projects" or "projects")
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
The API version is specified in the URL path (e.g., /api/46/...). Current default version is 46.

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
export RUNDECK_API_VERSION=46  # Optional, defaults to 46
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

1. Use \`plugin_create\` with required parameters to generate plugin code
2. Review plugin documentation: \`rundeck://docs/developer/plugins\`
3. Review specific plugin type docs: \`rundeck://docs/developer/plugin/{type}\`
4. Implement the TODO sections in generated code
5. Package as .jar file with proper manifest entries
6. Deploy to \`$RDECK_BASE/libext\` directory

## Resources

- Plugin Development Guide: \`rundeck://docs/developer\`
- Plugin Overview: \`rundeck://plugins\`
- Step Plugins: \`rundeck://docs/developer/plugin/step-plugins\`
- File Copier Plugins: \`rundeck://docs/developer/plugin/file-copier-plugins\`
- Notification Plugins: \`rundeck://docs/developer/plugin/notification-plugins\`
- Plugin Configuration: \`rundeck://config/plugins\`

## Example Usage

\`\`\`
plugin_create({
  plugin_type: "node-step",
  name: "my-custom-step",
  class_name: "MyCustomStep",
  description: "A custom node step plugin",
  package_name: "com.example.rundeck",
  properties: [
    {
      name: "timeout",
      type: "Integer",
      description: "Timeout in seconds",
      required: true,
      default: 30
    },
    {
      name: "environment",
      type: "Select",
      description: "Target environment",
      required: true,
      values: ["dev", "staging", "production"]
    }
  ]
})
\`\`\``;
}

