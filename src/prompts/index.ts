/**
 * Prompt definitions for common Rundeck tasks
 * Enhanced with proper types, validation, and error handling
 */

import { z } from "zod";

export interface PromptArgument {
  name: string;
  description: string;
  required: boolean;
  type?: "string" | "number" | "boolean";
  enum?: string[];
  default?: string | number | boolean;
  example?: string;
}

export interface Prompt {
  name: string;
  description: string;
  arguments?: PromptArgument[];
  argumentSchema?: z.ZodSchema;
  getContent: (args?: Record<string, unknown>) => string;
  examples?: Array<{
    description: string;
    arguments?: Record<string, unknown>;
  }>;
}

/**
 * Create job prompt
 */
export const createJobPromptSchema = z.object({
  job_type: z.enum(["simple", "multi-step", "scheduled", "with-options"]).optional().default("simple"),
});

export const createJobPrompt: Prompt = {
  name: "create-job",
  description: "Guide user through creating a Rundeck job. Provides step-by-step instructions for job creation with examples and best practices.",
  arguments: [
    {
      name: "job_type",
      description: "Type of job to create. Options: 'simple' (default), 'multi-step', 'scheduled', 'with-options'",
      required: false,
      type: "string",
      enum: ["simple", "multi-step", "scheduled", "with-options"],
      default: "simple",
      example: "multi-step",
    },
  ],
  argumentSchema: createJobPromptSchema,
  examples: [
    {
      description: "Create a simple command job",
      arguments: { job_type: "simple" },
    },
    {
      description: "Create a scheduled job",
      arguments: { job_type: "scheduled" },
    },
  ],
  getContent: (args) => {
    const jobType = (args?.job_type as string) || "simple";
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

## Next Steps for "${jobType}" Job Type
1. Review the job schema with \`rundeck://jobs/schema\` resource
2. Use \`job_create\` tool to create your job definition (call without params for guidance)
3. Validate with \`job_validate\` before importing
4. See examples at \`rundeck://docs/manual/jobs\`

## Resources
- Job Schema: \`rundeck://jobs/schema\`
- Job Documentation: \`rundeck://docs/manual/jobs\`
- Workflow Strategies: \`rundeck://jobs/workflows\`
- Job Options: \`rundeck://jobs/options\`

## Tools
- \`job_create\`: Generate job definition (call without params for guidance)
- \`job_validate\`: Validate job definition before importing`;
  },
};

/**
 * Call API prompt
 */
export const callApiPromptSchema = z.object({
  endpoint_category: z.enum(["jobs", "projects", "executions", "system", "authentication", "general"]).optional(),
});

export const callApiPrompt: Prompt = {
  name: "call-api",
  description: "Guide user through making Rundeck API calls. Includes authentication setup, endpoint discovery, and example usage.",
  arguments: [
    {
      name: "endpoint_category",
      description: "Filter by endpoint category to focus on specific API areas. Options: 'jobs', 'projects', 'executions', 'system', 'authentication', 'general'",
      required: false,
      type: "string",
      enum: ["jobs", "projects", "executions", "system", "authentication", "general"],
      example: "jobs",
    },
  ],
  argumentSchema: callApiPromptSchema,
  examples: [
    {
      description: "Learn how to call job-related APIs",
      arguments: { endpoint_category: "jobs" },
    },
    {
      description: "Learn how to call project APIs",
      arguments: { endpoint_category: "projects" },
    },
  ],
  getContent: (args) => {
    const category = args?.endpoint_category as string | undefined;
    const categorySection = category 
      ? `\n## ${category.charAt(0).toUpperCase() + category.slice(1)} Endpoints\nUse \`api_list\` with category: "${category}" to discover ${category}-related endpoints.\n`
      : "";
    
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
Use \`api_list\` tool to discover available API endpoints.${categorySection}

### Step 2: Execute API Call
Use \`api_call\` tool with:
- \`endpoint\`: API path (e.g., "/api/46/projects" or "projects")
- \`method\`: HTTP method (GET, POST, PUT, DELETE, PATCH)
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

## Tools
- \`api_list\`: List available API endpoints (call with category to filter)
- \`api_call\`: Execute API calls (call without params for guidance)

## Resources
- API Documentation: \`rundeck://api\`
- Authentication Guide: \`rundeck://docs/administration/security\`
- API Examples: \`rundeck://api/examples\``;
  },
};

/**
 * Configure project prompt
 */
export const configureProjectPromptSchema = z.object({
  configuration_area: z.enum(["settings", "node-execution", "resource-sources", "scm", "plugins"]).optional(),
});

export const configureProjectPrompt: Prompt = {
  name: "configure-project",
  description: "Guide user through project configuration. Covers settings, node execution, resource sources, SCM integration, and plugins.",
  arguments: [
    {
      name: "configuration_area",
      description: "Focus on specific configuration area. Options: 'settings', 'node-execution', 'resource-sources', 'scm', 'plugins'",
      required: false,
      type: "string",
      enum: ["settings", "node-execution", "resource-sources", "scm", "plugins"],
      example: "plugins",
    },
  ],
  argumentSchema: configureProjectPromptSchema,
  examples: [
    {
      description: "Configure project plugins",
      arguments: { configuration_area: "plugins" },
    },
    {
      description: "Configure resource model sources",
      arguments: { configuration_area: "resource-sources" },
    },
  ],
  getContent: (args) => {
    const area = args?.configuration_area as string | undefined;
    const areaSection = area 
      ? `\n## Focus: ${area.charAt(0).toUpperCase() + area.slice(1).replace("-", " ")}\nThis guide focuses on ${area} configuration.\n`
      : "";
    
    return `# Configuring a Rundeck Project${areaSection}

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
Use \`api_call\` with endpoint: \`PUT /api/{version}/project/{project}/config\`

### Via CLI
Use \`rd projects configure set\` command

## Tools
- \`api_call\`: Make API calls to configure projects programmatically

## Resources
- Project Configuration: \`rundeck://docs/administration/configuration\`
- System Configuration: \`rundeck://docs/administration/configuration\`
- Plugin Configuration: \`rundeck://docs/developer/plugins\``;
  },
};

/**
 * Setup authentication prompt
 */
export const setupAuthenticationPromptSchema = z.object({});

export const setupAuthenticationPrompt: Prompt = {
  name: "setup-authentication",
  description: "Guide user through setting up API authentication using environment variables. Includes token generation and security best practices.",
  arguments: [],
  argumentSchema: setupAuthenticationPromptSchema,
  examples: [
    {
      description: "Set up authentication for API calls",
    },
  ],
  getContent: () => {
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

## Tools
- \`api_call\`: Execute API calls (requires RUNDECK_URL and RUNDECK_TOKEN environment variables)
- Call \`api_call\` without parameters for detailed setup guidance

## Resources
- Authentication Methods: \`rundeck://api/auth\`
- API Basics: \`rundeck://api/examples\`
- Configuration Guide: \`rundeck://docs/administration/configuration\``;
  },
};

/**
 * Write node filter prompt
 */
export const writeNodeFilterPromptSchema = z.object({
  filter_complexity: z.enum(["simple", "complex"]).optional().default("simple"),
});

export const writeNodeFilterPrompt: Prompt = {
  name: "write-node-filter",
  description: "Guide user through writing node filter expressions. Includes syntax, operators, examples, and common patterns.",
  arguments: [
    {
      name: "filter_complexity",
      description: "Filter complexity level. Options: 'simple' (default), 'complex'",
      required: false,
      type: "string",
      enum: ["simple", "complex"],
      default: "simple",
      example: "complex",
    },
  ],
  argumentSchema: writeNodeFilterPromptSchema,
  examples: [
    {
      description: "Learn simple node filter syntax",
      arguments: { filter_complexity: "simple" },
    },
    {
      description: "Learn complex node filter expressions",
      arguments: { filter_complexity: "complex" },
    },
  ],
  getContent: (args) => {
    const complexity = (args?.filter_complexity as string) || "simple";
    const complexitySection = complexity === "complex" 
      ? `\n## Advanced Filter Patterns\nThis guide focuses on complex filter expressions with boolean operators and multiple conditions.\n`
      : `\n## Basic Filter Patterns\nThis guide focuses on simple filter expressions.\n`;
    
    return `# Writing Node Filter Expressions${complexitySection}

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

## Resources
- Node Filter Reference: \`rundeck://docs/manual/nodes\`
- Node Documentation: \`rundeck://docs/manual/nodes\`
- Job Creation: Use \`job_create\` tool and set \`node_filter\` parameter`;
  },
};

/**
 * Integrate plugin prompt
 */
export const integratePluginPromptSchema = z.object({
  plugin_type: z.enum(["node-step", "workflow-step", "file-copier", "notification", "executor"]).optional(),
  configuration_level: z.enum(["system", "project", "job"]).optional(),
});

export const integratePluginPrompt: Prompt = {
  name: "integrate-plugin",
  description: "Guide user through plugin integration. Covers plugin types, configuration levels, and common plugins.",
  arguments: [
    {
      name: "plugin_type",
      description: "Type of plugin to integrate. Options: 'node-step', 'workflow-step', 'file-copier', 'notification', 'executor'",
      required: false,
      type: "string",
      enum: ["node-step", "workflow-step", "file-copier", "notification", "executor"],
      example: "node-step",
    },
    {
      name: "configuration_level",
      description: "Configuration level. Options: 'system', 'project', 'job'",
      required: false,
      type: "string",
      enum: ["system", "project", "job"],
      example: "project",
    },
  ],
  argumentSchema: integratePluginPromptSchema,
  examples: [
    {
      description: "Integrate a node step plugin at project level",
      arguments: { plugin_type: "node-step", configuration_level: "project" },
    },
    {
      description: "Integrate a notification plugin",
      arguments: { plugin_type: "notification" },
    },
  ],
  getContent: (args) => {
    const pluginType = args?.plugin_type as string | undefined;
    const configLevel = args?.configuration_level as string | undefined;
    
    let focusSection = "";
    if (pluginType) {
      focusSection += `\n## Focus: ${pluginType.charAt(0).toUpperCase() + pluginType.slice(1).replace("-", " ")} Plugins\n`;
    }
    if (configLevel) {
      focusSection += `## Configuration Level: ${configLevel.charAt(0).toUpperCase() + configLevel.slice(1)}\n`;
    }
    
    return `# Integrating Rundeck Plugins${focusSection}

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

## Resources
- Plugin Overview: \`rundeck://docs/developer/plugins\`
- Node Step Plugins: \`rundeck://docs/developer/plugins\`
- Workflow Step Plugins: \`rundeck://docs/developer/plugins\`
- Plugin Configuration: \`rundeck://docs/administration/configuration\`
- Plugin Creation: Use \`plugin_create\` tool (when available) to generate plugin code`;
  },
};

/**
 * All prompts
 */
export const prompts: Prompt[] = [
  createJobPrompt,
  callApiPrompt,
  configureProjectPrompt,
  setupAuthenticationPrompt,
  writeNodeFilterPrompt,
  integratePluginPrompt,
];

/**
 * Get prompt by name
 */
export function getPrompt(name: string): Prompt | undefined {
  return prompts.find((p) => p.name === name);
}


