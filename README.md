# Rundeck Documentation MCP Server

A Model Context Protocol (MCP) server that exposes Rundeck documentation as resources and provides tools for interacting with Rundeck APIs and generating job definitions.

## Features

- **Documentation Resources**: Access Rundeck documentation via MCP resources
- **API Tools**: Execute Rundeck API calls directly from the MCP client
- **Job Generation**: Generate and validate Rundeck job definitions with guidance mode
- **Documentation Search**: Search through Rundeck documentation
- **Interactive Guidance**: Call tools without required parameters to get step-by-step guidance

## Installation

```bash
npm install
npm run build
```

## Configuration

The server can be configured via environment variables:

- `RUNDECK_DOCS_PATH`: Path to documentation directory (default: `./docs`)
- `RUNDECK_URL`: Default Rundeck instance URL
- `RUNDECK_TOKEN`: Default API token (optional, can be set via tool)
- `RUNDECK_API_VERSION`: Default API version (default: "46")

## Usage

### As MCP Server

The server runs on stdio and communicates via the MCP protocol:

```bash
node dist/index.js
```

### Resources

Resources are accessed via simplified URIs:

- `rundeck://api` - Complete API reference
- `rundeck://api/auth` - Authentication methods
- `rundeck://api/examples` - API usage examples
- `rundeck://jobs/schema` - Job schema (use `?format=yaml|json|xml`)
- `rundeck://jobs/workflows` - Workflow strategies
- `rundeck://jobs/options` - Job options documentation
- `rundeck://config` - Configuration index
- `rundeck://config/system` - System configuration
- `rundeck://config/project` - Project configuration
- `rundeck://learn` - Getting started guide
- `rundeck://plugins` - Plugin overview
- `rundeck://ref/filters` - Node filter syntax
- `rundeck://ref/terms` - Rundeck terminology

### Tools

Call any tool without required parameters to get step-by-step guidance.

#### API Tools

- `api_call` - Execute Rundeck API calls (call without params for guidance)
- `auth_setup` - Configure Rundeck API token (call without params for guidance)
- `api_list` - List available API endpoints

#### Job Tools

- `job_create` - Generate job definitions (call without params for guidance)
- `job_validate` - Validate job definitions (call without params for guidance)
- `job_template` - Get job templates

#### Search Tools

- `docs_search` - Search documentation
- `docs_example` - Get code examples

### Guidance Mode

Tools provide interactive guidance when called without required parameters:

```bash
# Get guidance for creating a job
Call job_create without parameters

# Get guidance for API calls
Call api_call without parameters

# Get guidance for authentication setup
Call auth_setup without parameters
```

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Development with hot reload
npm run dev:server

# Watch TypeScript files
npm run dev:watch

# Run
npm start

# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Validate (build + test)
npm run validate
```

See [DEVELOPMENT.md](./DEVELOPMENT.md) for detailed development workflow and [TESTING_WORKFLOW.md](./TESTING_WORKFLOW.md) for testing procedures.

## Testing

See [TESTING.md](./TESTING.md) for detailed testing information.

Run tests:
```bash
npm test
```

## Deployment

See [DEPLOYMENT.md](./DEPLOYMENT.md) for deployment instructions including:
- Local development setup
- Claude Desktop configuration
- Docker deployment
- Production deployment (systemd, PM2)
- Security considerations
- Monitoring and troubleshooting

## Validation

See [VALIDATION.md](./VALIDATION.md) for implementation validation report.

## Onboarding

**New to the MCP server?** Start here! See [ONBOARDING.md](./ONBOARDING.md) for a step-by-step guide to get the most out of the server.

## License

Apache 2.0

