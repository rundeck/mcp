# Rundeck MCP Server

> **⚠️ Alpha software.** This project is under active development and its tools, resources, and prompts are still changing release to release. Expect breaking changes between versions — pin a version in production and check the changelog before upgrading.

Give any MCP-compatible AI assistant (Claude Desktop, Claude Code, Cursor, VS Code, and others) direct, authenticated access to your Rundeck instance. Point it at your Rundeck URL and API token, and your assistant can:

- **Answer Rundeck questions on the spot** — API usage, job schemas, node filters, plugin configuration, and more, pulled straight from the official docs.
- **Query and drive your real Rundeck instance** — look up projects, jobs, executions, and nodes, or trigger a job run, without leaving the chat.
- **Generate and validate job definitions** — describe a job in plain language and get back a ready-to-import YAML/JSON definition, checked against Rundeck's schema before you deploy it.
- **Provision runners** — create system- or project-scoped Rundeck Runners on demand.

The result: faster job authoring, fewer trial-and-error API calls, and troubleshooting help that already knows how Rundeck works — all from inside the AI assistant your team already uses.

For the full breakdown of resources, tools, and prompts exposed by the server, see [TECHNICAL-CAPABILITIES.md](./TECHNICAL-CAPABILITIES.md).

## Using with MCP Clients

Once published, the server is available as the [`@rundeck/mcp`](https://www.npmjs.com/package/@rundeck/mcp) npm package, exposing the `rundeck-mcp` binary over stdio.

### Cursor Integration

You can configure this MCP server directly within Cursor's `settings.json` file, by following these steps:

1.  Open Cursor settings (Cursor Settings > Tools > Add MCP, or `Cmd+,` on Mac, or `Ctrl+,` on Windows/Linux).
2.  Add the following configuration:

    ```json
    {
      "mcpServers": {
        "rundeck-mcp": {
          "command": "npx",
          "args": ["-y", "@rundeck/mcp"],
          "env": {
            "RUNDECK_URL": "https://your-rundeck-instance.example.com",
            "RUNDECK_TOKEN": "your-rundeck-api-token-here"
          }
        }
      }
    }
    ```

### VS Code Integration

You can configure this MCP server directly within Visual Studio Code's `settings.json` file, allowing VS Code to manage the server lifecycle.

1.  Open VS Code settings (File > Preferences > Settings, or `Cmd+,` on Mac, or `Ctrl+,` on Windows/Linux).
2.  Search for "mcp" and ensure "Mcp: Enabled" is checked under Features > Chat.
3.  Click "Edit in settings.json" under "Mcp > Discovery: Servers".
4.  Add the following configuration:

    ```json
    {
        "mcp": {
            "inputs": [
                {
                    "type": "promptString",
                    "id": "rundeck-url",
                    "description": "Rundeck Instance URL"
                },
                {
                    "type": "promptString",
                    "id": "rundeck-token",
                    "description": "Rundeck API Token",
                    "password": true
                }
            ],
            "servers": {
                "rundeck-mcp": {
                    "type": "stdio",
                    "command": "npx",
                    "args": ["-y", "@rundeck/mcp"],
                    "env": {
                        "RUNDECK_URL": "${input:rundeck-url}",
                        "RUNDECK_TOKEN": "${input:rundeck-token}"
                    }
                }
            }
        }
    }
    ```

### Claude Desktop Integration

You can configure this MCP server to work with Claude Desktop by adding it to Claude's configuration file.

1.  **Locate your Claude Desktop configuration file:**
    -   **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
    -   **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

2.  **Create or edit the configuration file** and add the following configuration:

    ```json
    {
      "mcpServers": {
        "rundeck-mcp": {
          "command": "npx",
          "args": ["-y", "@rundeck/mcp"],
          "env": {
            "RUNDECK_URL": "https://your-rundeck-instance.example.com",
            "RUNDECK_TOKEN": "your-rundeck-api-token-here"
          }
        }
      }
    }
    ```

3.  **Restart Claude Desktop** completely for the changes to take effect.

### Claude Code Integration

Add the server via the CLI:

```bash
claude mcp add rundeck-mcp -e RUNDECK_URL=https://your-rundeck-instance.example.com -e RUNDECK_TOKEN=your-rundeck-api-token-here -- npx -y @rundeck/mcp
```

### Docker Integration

No Node.js required — only Docker. The server is also published as the [`rundeck/mcp`](https://hub.docker.com/r/rundeck/mcp) image, exposed the same way over stdio.

> **Prerequisite:** the Docker daemon needs to be running (Docker Desktop, Rancher Desktop, etc.) — not just installed — since your MCP client starts a container on demand each time it connects.

For Cursor, Claude Desktop, or any client using an `mcpServers` JSON block:

```json
{
  "mcpServers": {
    "rundeck-mcp": {
      "command": "docker",
      "args": [
        "run", "-i", "--rm",
        "-e", "RUNDECK_URL=https://your-rundeck-instance.example.com",
        "-e", "RUNDECK_TOKEN=your-rundeck-api-token-here",
        "rundeck/mcp:latest"
      ]
    }
  }
}
```

For Claude Code, add via the CLI:

```bash
claude mcp add rundeck-mcp -- docker run -i --rm -e RUNDECK_URL=https://your-rundeck-instance.example.com -e RUNDECK_TOKEN=your-rundeck-api-token-here rundeck/mcp:latest
```

---

## Local Development

> **Note:** `npm install` authenticates against PagerDuty's private Cloudsmith npm mirror via the committed `.npmrc` (PagerDuty employees need a `CLOUDSMITH_NPM_TOKEN`). External contributors without Cloudsmith access should delete `.npmrc` and `package-lock.json` first — see [SETUP.md](./SETUP.md#local-development).

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
