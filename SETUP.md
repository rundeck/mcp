# Setup Guide

## Prerequisites

- Node.js 18+ 
- npm or yarn
- TypeScript 5.5+

## Installation

1. Install dependencies:
```bash
npm install
```

2. Build the project:
```bash
npm run build
```

## Configuration

### Documentation Path

The server automatically searches for the docs directory in these locations (in order):
1. `./docs` (relative to current working directory)
2. `../docs` (parent directory)
3. `./docs` (fallback)

You can override this by setting the `RUNDECK_DOCS_PATH` environment variable:

```bash
export RUNDECK_DOCS_PATH=/path/to/rundeck/docs
```

### Rundeck Connection (Optional)

If you want to use API tools, configure your Rundeck instance:

```bash
export RUNDECK_URL=https://your-rundeck-instance.com
export RUNDECK_TOKEN=your-api-token
export RUNDECK_API_VERSION=46
```

Or use the `auth_setup` tool after starting the server.

## Running the Server

The server communicates via stdio using the MCP protocol:

```bash
node dist/index.js
```

## Testing

To test the server, you can use an MCP client or connect it to a compatible application like Claude Desktop.

### Example MCP Client Configuration

For Claude Desktop, add to your MCP settings:

```json
{
  "mcpServers": {
    "rundeck-docs": {
      "command": "node",
      "args": ["/path/to/rundeck-mcp/dist/index.js"],
      "env": {
        "RUNDECK_DOCS_PATH": "/path/to/rundeck/docs"
      }
    }
  }
}
```

## Development

```bash
# Watch mode for development
npm run dev

# Build for production
npm run build
```

## Troubleshooting

### Docs Not Found

If you get "Resource not found" errors, verify:
1. The docs directory exists at the expected location
2. The `RUNDECK_DOCS_PATH` environment variable is set correctly
3. The docs directory contains the expected markdown files

### API Calls Failing

If API calls fail:
1. Verify Rundeck URL is correct and accessible
2. Check that API token is valid and has proper permissions
3. Ensure API version matches your Rundeck instance version

### TypeScript Errors

If you see TypeScript errors:
1. Run `npm install` to ensure all dependencies are installed
2. Check that TypeScript version matches requirements
3. Run `npm run build` to see detailed error messages


