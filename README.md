# Rundeck MCP Server

## Quick Start

```bash
# Install dependencies
npm install

# Develop (runs server with auto-restart)
npm run dev

# Test with Inspector GUI
npm run inspect

# Run tests
npm test

# Full check (build + tests + MCP validation scripts)
npm run validate
```

**See [SCRIPTS.md](./SCRIPTS.md) and [COMMANDS.md](./COMMANDS.md)** | **See [SETUP.md](./SETUP.md) for detailed setup**

---

## Overview

The Rundeck Model Context Protocol (MCP) Server exposes Rundeck's documentation, APIs, and capabilities to AI assistants through the Model Context Protocol standard. This document covers technical capabilities, architecture, and features of the MCP server implementation.

## Architecture

The MCP server is built using TypeScript and follows the [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk) patterns. It communicates via stdio using the MCP protocol, enabling integration with any MCP-compatible client (Claude Desktop, custom clients, etc.).

### Core Components

1. **Resource Handlers** - Expose documentation as accessible resources
2. **Tools** - Enable AI assistants to perform actions (API calls, job generation, validation)
3. **Prompts** - Provide guided workflows for common Rundeck tasks (`create-job`, `call-api`, `setup-authentication`, and others)

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

Tools enable AI assistants to perform actions beyond reading documentation. Inputs are validated with Zod; missing required fields return validation errors. Use MCP **prompts** for guided walkthroughs.

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

### Plugin Tools

#### `plugin_create` (BETA)
**Purpose**: Generate Rundeck plugin code in Java or Groovy.

**Capabilities**:
- Support for 5 plugin types:
  - `node-step`: Executes on each node in a workflow
  - `workflow-step`: Executes once per workflow
  - `remote-script-node-step`: Generates script/command for remote execution
  - `file-copier`: Copies files to nodes
  - `notification`: Sends notifications on job events
- Code generation following Rundeck conventions
- Configuration property definition
- Input validation and warnings

**When to use**:
- Creating new Rundeck plugins
- Generating plugin code following best practices
- Building plugins programmatically

### Documentation tools

#### `docs_search`
**Purpose**: Search local Rundeck markdown documentation (`RUNDECK_DOCS_PATH`) by keywords, with optional category filters.

#### `docs_example`
**Purpose**: Extract code blocks for topic slugs such as `api-job-run`, `job-yaml-basic`, and `node-filter`. Use with `docs_search` or resources for full context.

## Prompts

Prompts provide pre-configured, guided workflows for common Rundeck tasks. They combine documentation references and step-by-step instructions.

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

## Technical Specifications

### Dependencies

- **@modelcontextprotocol/sdk**: MCP protocol implementation (see `package.json` for the pinned version)
- **marked**: ^12.0.0 - Markdown parsing
- **yaml**: ^2.4.2 - YAML parsing and generation
- **zod**: ^3.23.8 - Schema validation
- **TypeScript**: ^5.5.0 - Type safety and modern JavaScript features

### Configuration

The server is configured via environment variables:

- `RUNDECK_DOCS_PATH`: Path to documentation directory (default: `./docs`)
- `RUNDECK_URL`: Default Rundeck instance URL
- `RUNDECK_TOKEN`: Default API token (optional, can be set via environment)
- `RUNDECK_API_VERSION`: Default API version (default: "46")
- `MCP_DEBUG`: Enable verbose logging ("1" or "true")

### Security

- **Token Storage**: API tokens stored in memory only (not persisted to disk)
- **Input Validation**: All tool inputs validated using Zod schemas
- **Error Handling**: Sensitive information not exposed in error messages
- **File System Access**: Read-only access to documentation files

### Testing

- **Jest**: `npm test` — unit and integration tests (see `src/__tests__/`)
- **Full pipeline**: `npm run validate` — build, Jest, then `run-all-validations.js` (browser / tools / inspector / subagent scripts under `dist/__tests__/`)

### Deployment

The server can be deployed in multiple ways:

- **Local Development**: Direct Node.js execution
- **Claude Desktop**: Via MCP configuration file
- **Docker**: Containerized deployment
- **Systemd/PM2**: Production service deployment