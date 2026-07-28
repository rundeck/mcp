# Rundeck MCP Server: Technical Capabilities

> **Alpha software.** Tools, resources, and prompts documented here reflect the current release and are still subject to change.

## Overview

The Rundeck Model Context Protocol (MCP) Server is a comprehensive integration that exposes Rundeck's documentation, APIs, and capabilities to AI assistants through the Model Context Protocol standard. This document outlines the technical capabilities, architecture, and features of the MCP server implementation.

## Architecture

The MCP server is built using TypeScript and follows the [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk) patterns. It communicates via stdio using the MCP protocol, enabling integration with any MCP-compatible client (Claude Desktop, custom clients, etc.).

### Core Components

1. **Resource Handlers** - Expose documentation as accessible resources
2. **Tools** - Enable AI assistants to perform actions (API calls, job generation, validation, runner provisioning)
3. **Prompts** - Provide guided workflows for common Rundeck tasks
4. **Guidance System** - Interactive help when tools are called without required parameters

## Resources

Resources provide AI assistants with read-only access to Rundeck documentation. All resources use the `rundeck://` URI scheme for easy discovery and access.

### Documentation Categories

#### API Documentation (`rundeck://api/*`)
- Complete API reference (`rundeck://api`)
- Authentication methods (`rundeck://api/auth`)
- API usage examples (`rundeck://api/examples`)
- Endpoint-specific documentation

#### Job Definitions (`rundeck://jobs/*`)
- YAML job schema (`rundeck://jobs/schema?format=yaml`)
- JSON job schema (`rundeck://jobs/schema?format=json`)
- XML job schema (`rundeck://jobs/schema?format=xml`) - legacy support
- Workflow strategies (`rundeck://jobs/workflows`)
- Job options documentation (`rundeck://jobs/options`)
- Job examples

#### Configuration (`rundeck://config/*`)
- System configuration (`rundeck://config/system`)
- Project configuration (`rundeck://config/project`)
- Plugin configuration (`rundeck://config/plugins`)
- Configuration examples

#### Learning Resources (`rundeck://learn/*`)
- Getting started guide (`rundeck://learn`)
- How-to guides by topic
- Tutorial lessons
- Runners overview

#### Plugin Documentation (`rundeck://plugins/*`)
- Plugin overview (`rundeck://plugins`)
- Node step plugins (`rundeck://plugins/node-steps`)
- Workflow step plugins (`rundeck://plugins/workflow-steps`)
- Specific plugin documentation

#### Reference Materials (`rundeck://ref/*`)
- Node filter syntax (`rundeck://ref/filters`)
- Rundeck terminology (`rundeck://ref/terms`)

#### Comprehensive Documentation (`rundeck://docs/*`)
- Manual sections (jobs, nodes, executions, calendars)
- Administration guides (installation, security, configuration, clustering)
- Developer documentation (plugin development, API usage)
- RD-CLI documentation
- Integration guides

### Resource Features

- **Hierarchical Structure**: Resources are organized in a logical, discoverable hierarchy
- **Summarization**: Large documentation sets are automatically summarized to optimize context usage
- **Format Support**: Job schemas available in YAML, JSON, and XML formats
- **Context Optimization**: Content is structured to provide maximum value within token limits

## Tools

Tools enable AI assistants to perform actions beyond reading documentation. Inputs are validated with Zod. For **`api_call`**, **`job_create`**, **`job_validate`**, **`runner_create`**, and **`rundeck_connect`**, omitting required arguments (or leaving string fields blank) returns **markdown guidance** in the normal tool response so the agent can steer the user; malformed types, enums, and other invalid input still return **validation errors**. Use MCP **prompts** for full guided workflows.

### API Tools

#### `api_call`
**Purpose**: Execute Rundeck API calls to interact with a Rundeck instance.

**Capabilities**:
- Support for all HTTP methods (GET, POST, PUT, DELETE, PATCH)
- Query parameter support
- Request body handling
- Authentication via environment variables (`RUNDECK_URL`, `RUNDECK_TOKEN`)

**When to use**:
- Making API requests to Rundeck
- Querying projects, jobs, executions, nodes, or system information
- Triggering job executions via API
- Managing Rundeck resources programmatically

**Guidance Mode**: Call without `endpoint` parameter for setup guidance.

#### `api_list`
**Purpose**: List available Rundeck API endpoints with descriptions and categories.

**Capabilities**:
- Category filtering (jobs, projects, executions, system, etc.)
- Endpoint descriptions and methods
- Parameter information

**When to use**:
- Discovering available API endpoints
- Finding endpoints for specific categories
- Understanding API structure before making calls

### Job Tools

#### `job_create`
**Purpose**: Generate Rundeck job definitions in YAML or JSON format.

**Capabilities**:
- Generate valid job definitions from structured parameters
- Support for complex workflows (multi-step, conditional, parallel)
- Job options definition
- Node filter configuration
- Format selection (YAML or JSON)

**When to use**:
- Creating new job definitions programmatically
- Generating job YAML/JSON for import into Rundeck
- Building jobs with AI assistance

**Guidance Mode**: Call without required parameters (`name`, `project`, `workflow_steps`) for step-by-step guidance.

#### `job_validate`
**Purpose**: Validate Rundeck job definitions against Rundeck schemas.

**Capabilities**:
- Syntax validation
- Schema compliance checking
- Error and warning reporting
- Support for YAML and JSON formats

**When to use**:
- Validating job definitions before importing
- Checking job syntax and structure
- Debugging job definition errors

**Guidance Mode**: Call without required parameters (`job_definition`, `format`) for validation guidance.

### Runner Tools

#### `runner_create`
**Purpose**: Create a Rundeck Runner at system or project scope, on any supported platform (Docker, Kubernetes, Linux, or Windows).

**Capabilities**:
- Project-scoped runners (`POST project/{project}/runnerManagement/runners`) for isolation
- System-scoped runners (`POST runnerManagement/runners`) shared across projects
- Installation types: `docker`, `kubernetes`, `linux`, `windows`
- `installation_type` (platform) and `replica_type` (`ephemeral`/`manual`) are independent — default pairing is `linux`/`windows` → `manual` and `docker`/`kubernetes` → `ephemeral` (matching Rundeck's own default), but any combination is valid and can be set explicitly

**When to use**:
- Creating a runner for a specific project or global to the system
- Provisioning a runner on any platform: Docker, Kubernetes, Linux, or Windows
- Overriding the default replica type when the default pairing doesn't fit (e.g. a manual Docker runner, or an ephemeral Kubernetes runner)

**When NOT to use**:
- Expecting the runner to be downloaded, installed, or started automatically — this tool only registers the runner; fetching/starting it is always a separate, later step

**Important**: The response includes a one-time `token` and `downloadTk` — they cannot be retrieved again, so surface them to the user immediately.

**Guidance Mode**: Call without required parameters (`name`, `scope`) for step-by-step guidance.

### Documentation Tools

#### `docs_search`
**Purpose**: Search local Rundeck markdown documentation (`RUNDECK_DOCS_PATH`) by keywords and phrases, with optional category filters.

**When to use**:
- Finding where a topic, term, or feature is documented before opening a resource
- Exploring the docs when the exact `rundeck://` URI is unknown
- Getting ranked excerpts and file paths to narrow which resource to read next

**Follow-up**: Prefer `resources/read` on the best match for complete, authoritative content.

### Connection Tools

#### `rundeck_connect`
**Purpose**: Switch the active Rundeck instance by name, when multiple instances are registered via `RUNDECK_INSTANCES`.

**Availability**: Only listed/callable when a `RUNDECK_INSTANCES` registry is configured — with a single `RUNDECK_URL`/`RUNDECK_TOKEN` setup, this tool doesn't exist. See [SETUP.md](./SETUP.md#multiple-rundeck-instances-optional).

**When to use**:
- The user asks to use a different registered Rundeck instance (e.g. "switch to staging")

**When NOT to use**:
- Only one Rundeck instance is configured (the tool won't be available)
- Making API calls (use `api_call` — it uses whichever instance is currently active)

**Input**: Only a registered instance **name** — never a URL or token.

**Guidance Mode**: Call without `instance` to see the list of registered instance names.

### ACL Tools

#### `acl_validate`
**Purpose**: Validate a Rundeck ACL Policy YAML document offline against the aclpolicy v1.0 format.

**When to use**:
- Checking ACL policy structure (context, for, by/notBy, allow/deny) before creating or updating it
- Debugging why a policy might be silently rejecting access (missing match clause, missing by/notBy, etc.)

**When NOT to use**:
- Actually creating/updating/deleting a policy on the server (use `acl_manage` instead)
- Making generic API calls (use `api_call` instead)

**Note**: This is a local structural check, not a substitute for Rundeck's own server-side validation.

**Guidance Mode**: Call without `acl_definition` for guidance.

#### `acl_manage`
**Purpose**: List, get, create, update, or delete a Rundeck ACL Policy file at system or project scope.

**When to use**:
- Managing stored ACL policies (`system/acl/*` or `project/{project}/acl/*`) without hand-building `api_call` requests
- Auditing which ACL policies exist in a scope, or reading one's current contents
- Creating/updating a policy after validating it with `acl_validate`

**When NOT to use**:
- Editing ACL policy files on the server's local filesystem (not supported by this or any Rundeck API)
- Validating policy structure only, without submitting it (use `acl_validate` instead)

**Scopes**:
- `scope: "system"` → `system/acl/*` (instance/cluster-wide)
- `scope: "project"` → `project/{project}/acl/*` (single project, requires `project`)

**Guidance Mode**: Call without required parameters (`action`, `scope`) for step-by-step guidance.

### Not Yet Exposed

A plugin code generator (Java/Groovy scaffolding for node-step, workflow-step, file-copier, and notification plugins) exists in the codebase but is **not** currently wired up as an MCP tool. Use `resources/read` (`rundeck://docs/developer/*`) and `docs_search` for plugin documentation and examples in the meantime.

## Prompts

Prompts provide pre-configured, guided workflows for common Rundeck tasks. They combine documentation references, tool recommendations, and step-by-step instructions.

### Available Prompts

1. **`create-job`** - Guide for creating Rundeck jobs
   - Supports job types: simple, multi-step, scheduled, with-options
   - Includes schema references and examples

2. **`call-api`** - Guide for making Rundeck API calls
   - Authentication setup instructions
   - Endpoint discovery guidance
   - Category filtering (jobs, projects, executions, etc.)

3. **`configure-project`** - Guide for project configuration
   - Covers settings, node execution, resource sources, SCM, plugins
   - Configuration methods (UI, API, CLI)

4. **`setup-authentication`** - Guide for API authentication setup
   - Token generation instructions
   - Environment variable configuration
   - Security best practices

5. **`write-node-filter`** - Guide for writing node filter expressions
   - Syntax reference
   - Common patterns and examples
   - Filter testing guidance

6. **`integrate-plugin`** - Guide for plugin integration
   - Plugin types overview
   - Configuration instructions
   - Usage examples

### Prompt Features

- **Argument Support**: Prompts accept optional arguments to customize content
- **Resource Integration**: Prompts reference relevant resources and tools
- **Examples**: Each prompt includes usage examples
- **Validation**: Prompt arguments are validated using Zod schemas

## Guidance System

The guidance system provides interactive help when tools are called without required parameters. Instead of returning errors, tools return comprehensive, step-by-step guidance.

### Guidance Features

- **Context-Aware**: Guidance references relevant resources and documentation
- **Actionable**: Provides clear next steps and examples
- **Tool-Specific**: Each tool has tailored guidance content
- **Resource Links**: Guidance includes links to relevant documentation resources

### Tools with Guidance Mode

- `api_call` - API usage and authentication setup guidance
- `job_create` - Job creation workflow guidance
- `job_validate` - Validation process guidance
- `runner_create` - Runner provisioning guidance
- `rundeck_connect` - Lists registered instance names when called without `instance` (only available when `RUNDECK_INSTANCES` is set)
- `acl_validate` - ACL policy validation guidance
- `acl_manage` - ACL policy management guidance

## Technical Specifications

### Dependencies

- **@modelcontextprotocol/sdk**: MCP protocol implementation (see `package.json` for the pinned version)
- **marked**: ^12.0.0 - Markdown parsing
- **yaml**: 2.8.3 - YAML parsing and generation
- **zod**: ^3.23.8 - Schema validation
- **TypeScript**: ^5.5.0 - Type safety and modern JavaScript features

### Configuration

The server is configured via environment variables:

- `RUNDECK_URL`: Default Rundeck instance URL
- `RUNDECK_TOKEN`: Default API token (optional, can be set via environment)
- `RUNDECK_API_VERSION`: Default API version (default: "46")
- `RUNDECK_API_TIMEOUT_MS`: Timeout in ms for `api_call`'s underlying HTTP request, also bounding `runner_create` and `acl_manage` (default: `30000`). Aborts with a distinct timeout error past this limit; invalid/non-positive values fall back to the default.
- `RUNDECK_INSTANCES`: JSON registry for switching between multiple Rundeck instances mid-session (optional — most setups don't need this; see [SETUP.md](./SETUP.md#multiple-rundeck-instances-optional))
- `RUNDECK_DOCS_PATH`: Path to a documentation directory on disk. Auto-detected relative to cwd when launched from inside the repo — but required when launched by an MCP client (Claude Desktop, Cursor, etc.), since their working directory isn't the repo and docs auto-downloaded via `npm install` or Docker startup won't be found by cwd-relative auto-detection. See [SETUP.md](./SETUP.md#available-environment-variables).
- `RUNDECK_DOCS_BRANCH`: Docs branch to auto-download when none is present (default: `4.0.x`) — applies to both the npm `postinstall` download and the Docker container-startup download
- `SKIP_RUNDECK_DOCS_DOWNLOAD`: Set to `1` to skip the npm-install-time docs download (no effect on Docker)
- `MCP_DEBUG`: Enable verbose logging ("1" or "true")

### Security

- **Token Storage**: API tokens stored in memory only (not persisted to disk)
- **Input Validation**: All tool inputs validated using Zod schemas
- **Error Handling**: Sensitive information not exposed in error messages
- **File System Access**: Read-only access to documentation files

### Testing

- **Jest**: `npm test` — unit and integration tests (see `src/__tests__/`)
- **Full pipeline**: `npm run validate` — build, Jest, then `run-all-validations.js` (browser / tools / inspector / subagent scripts under `dist/__tests__/`)
- Coverage thresholds enforced at 70% for branches, functions, lines, and statements

### Deployment

The server can be deployed in multiple ways:

- **Local Development**: Direct Node.js execution
- **Claude Desktop / Cursor / VS Code / Claude Code**: Via MCP configuration file or CLI
- **Docker**: Containerized deployment (`rundeck/mcp` image)
- **Systemd/PM2**: Production service deployment

## Integration Points

### MCP Protocol Integration

The server implements the MCP protocol specification and communicates via stdio transport:

- **Protocol**: MCP (Model Context Protocol) standard
- **Transport**: stdio (standard input/output)
- **Communication**: JSON-RPC 2.0 messages
- **Compatibility**: Works with any MCP-compatible client

### Rundeck API Integration

The server integrates directly with Rundeck instances:

- **API Calls**: Via `api_call` tool, the server can execute any Rundeck API endpoint
- **Authentication**: Uses Rundeck API tokens (configured via environment variables)
- **API Version**: Supports Rundeck API version 46 (configurable)
- **Capabilities**: Full Rundeck API functionality (jobs, projects, executions, nodes, system)

### Documentation Integration

The server provides comprehensive access to Rundeck documentation:

- **Documentation Sources**: Reads from local documentation directory
- **Format Support**: Markdown parsing and rendering
- **Resource Structure**: Hierarchical URI-based access to documentation sections
- **Content Optimization**: Summarization and context optimization for AI consumption

## Status

This project is in **beta**. The tool set, resource structure, and prompts documented above reflect the current release but should be expected to change — including additions, removals, and breaking changes to tool schemas — as the project matures.

## Use Cases

### For Internal Teams
- **Development**: Faster access to Rundeck documentation and API guidance
- **Support**: Quick answers to customer inquiries via AI-assisted documentation search
- **QA**: Automated job validation and testing

### For Customers
- **Job Troubleshooting**: AI-assisted debugging of job definitions
- **Job Validation**: Validate jobs before deployment to prevent errors
- **Cost Savings**: Catch issues early (e.g., infinite loops causing infrastructure overload)
- **Learning**: Interactive guidance for Rundeck features and best practices

### For Rundeck Platform
- **Market Positioning**: Official MCP integration establishes leadership
- **Competitive Differentiation**: First-mover advantage in MCP ecosystem
- **Foundation**: Base for future AI-powered features and capabilities
