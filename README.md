# Rundeck MCP Server: Technical Capabilities

## Overview

The Rundeck Model Context Protocol (MCP) Server is a comprehensive integration that exposes Rundeck's documentation, APIs, and capabilities to AI assistants through the Model Context Protocol standard. This document outlines the technical capabilities, architecture, and features of the MCP server implementation.

## Architecture

The MCP server is built using TypeScript and follows the [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk) patterns. It communicates via stdio using the MCP protocol, enabling integration with any MCP-compatible client (Claude Desktop, custom clients, etc.).

### Core Components

1. **Resource Handlers** - Expose documentation as accessible resources
2. **Tools** - Enable AI assistants to perform actions (API calls, job generation, validation)
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

Tools enable AI assistants to perform actions beyond reading documentation. All tools support "guidance mode" - when called without required parameters, they return step-by-step guidance instead of executing.

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

**Guidance Mode**: Call without required parameters (`plugin_type`, `name`, `class_name`) for step-by-step guidance.

### Utility Tools

#### `tool_recommend` 
**Purpose**: Recommend which tool to use based on user intent or goal. 
**Important:** this tool will be used mainly by the entity calling the mcp

**Capabilities**:
- Intent-based tool recommendation
- Ranked list of recommended tools
- Reasoning for each recommendation
- Guidance on when to use each tool

**When to use**:
- Unsure which tool to use for a task
- Want to discover available tools for a specific goal
- Need guidance on tool selection

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
- `plugin_create` - Plugin development guidance

## Technical Specifications

### Dependencies

- **@modelcontextprotocol/sdk**: ^1.0.4 - MCP protocol implementation
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

- **Unit Tests**: 131 tests covering all components
- **Integration Tests**: 21 tests validating cross-component functionality
- **MCP Inspector Validation**: Protocol compliance testing
- **Browser Validation**: Client integration testing
- **Subagent Validation**: Real-world AI assistant testing

### Deployment

The server can be deployed in multiple ways:

- **Local Development**: Direct Node.js execution
- **Claude Desktop**: Via MCP configuration file
- **Docker**: Containerized deployment
- **Systemd/PM2**: Production service deployment

## Integration Points

### MCP Protocol Integration

The server implements the MCP protocol specification and communicates via stdio transport:

- **Protocol**: MCP (Model Context Protocol) standard
- **Transport**: stdio (standard input/output)
- **Communication**: JSON-RPC 2.0 messages
- **Compatibility**: Works with any MCP-compatible client

### Client Integration Options

#### 1. Direct MCP Client Integration
Any MCP-compatible client can connect to the server:
- **Claude Desktop**: Configure via MCP settings file
- **Custom MCP Clients**: Use MCP SDK to connect via stdio transport
- **Command-Line Clients**: Direct stdio communication

#### 2. Rundeck Plugin Integration
A Rundeck UI plugin provides native integration:
- **Plugin**: Rundeck UI plugin that embeds MCP client functionality
- **Bridge Connection**: Plugin connects to bridge server for MCP communication
- **User Interface**: Chat widget within Rundeck UI for AI-assisted operations

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

## Current Status

### Completed Features ✅

- ✅ Comprehensive resource structure (all documentation categories)
- ✅ 6 tools (API, job, plugin, utility)
- ✅ 6 prompts (guided workflows)
- ✅ Guidance system (interactive help)
- ✅ Input validation and error handling
- ✅ Testing infrastructure (131 unit tests, 21 integration tests)
- ✅ Documentation and onboarding guides
- ✅ MCP protocol compliance
- ✅ Multiple deployment options

### In Development 🔄

- 🔄 Further testing and iteration for production readiness
- 🔄 Performance optimization
- 🔄 Enhanced error messages
- 🔄 Additional use case validation

### Possible Future Enhancements 🚀

*Note: These are potential enhancements that may be considered based on user feedback and requirements. No commitment to these features at this time.*

- 🚀 Caching for frequently accessed documentation
- 🚀 Vector search for semantic documentation search
- 🚀 Support for multiple Rundeck instances
- 🚀 Job execution monitoring tools
- 🚀 Project management tools
- 🚀 Enhanced plugin discovery

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