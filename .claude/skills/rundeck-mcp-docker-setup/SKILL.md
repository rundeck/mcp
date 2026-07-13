---
name: rundeck-mcp-docker-setup
description: Install and configure the Rundeck MCP server using Docker. Pulls the image, collects Rundeck credentials, and writes the .mcp.json entry so Claude Code connects via stdio. No Node.js required — Docker is the only prerequisite.
user-invocable: true
allowed-tools:
  - Bash
  - Read
  - Write
  - Edit
  - TaskCreate
  - TaskUpdate
---

# Rundeck MCP — Docker Setup Skill

**Purpose:** Get the Rundeck MCP server running via Docker and wired into Claude Code — without cloning the repo or installing Node.js.

**When to use:**
- User wants to use the MCP server without installing Node.js
- Setting up on a new machine with Docker already available
- On-premise client installing from the published Docker image

**When NOT to use:**
- Developing or modifying the MCP server source → use `/rundeck-mcp-setup` instead
- Docker is not available

---

## What This Skill Does

1. Verifies Docker is running
2. Pulls `rundeck/rundeck-mcp:latest` from Docker Hub
3. Asks for Rundeck URL and API token
4. Writes the `rundeck-mcp` entry into `.mcp.json` (stdio transport via `docker run`)
5. Registers the server in `~/.claude/settings.json`
6. Verifies the connection with a smoke test

---

## Steps

### Before Starting: Create Task List

```
TaskCreate "Verify Docker"
TaskCreate "Pull image"
TaskCreate "Collect credentials"
TaskCreate "Configure .mcp.json"
TaskCreate "Register in settings"
TaskCreate "Smoke test"
```

Store all returned task IDs.

---

### Step 1: Verify Docker

```
TaskUpdate taskId=<verify_id> status="in_progress"
```

```bash
docker info --format '{{.ServerVersion}}' 2>/dev/null || echo "unavailable"
```

If unavailable, stop:
> "Docker is not running. Start Docker Desktop (or Rancher Desktop) and try again."

```
TaskUpdate taskId=<verify_id> status="completed"
```

---

### Step 2: Pull the Image

```
TaskUpdate taskId=<pull_id> status="in_progress"
```

```bash
docker pull rundeck/rundeck-mcp:latest 2>&1
```

If the pull fails, stop and tell the user:
> "Could not pull `rundeck/rundeck-mcp:latest`. Check your internet connection or confirm the image is published to Docker Hub."

Show the image size:

```bash
docker image inspect rundeck/rundeck-mcp:latest --format '{{.Size}}' 2>/dev/null | awk '{printf "Image size: %.0f MB\n", $1/1024/1024}'
```

```
TaskUpdate taskId=<pull_id> status="completed"
```

---

### Step 3: Collect Credentials

```
TaskUpdate taskId=<creds_id> status="in_progress"
```

Ask the user:
> "To connect to Rundeck I need two values:
>
> 1. **RUNDECK_URL** — the base URL of your Rundeck instance (e.g. `https://rundeck.example.com`)
> 2. **RUNDECK_TOKEN** — your API token (generate it in Rundeck → User Profile → API Tokens)
>
> Please provide both."

Wait for the user's response. Store `RUNDECK_URL` and `RUNDECK_TOKEN`.

```
TaskUpdate taskId=<creds_id> status="completed"
```

---

### Step 4: Configure `.mcp.json`

```
TaskUpdate taskId=<mcp_json_id> status="in_progress"
```

Determine the `.mcp.json` path. Look for it in this order:
1. Current working directory (`pwd`)
2. Home directory (`~/.mcp.json`)

Use whichever exists. If neither exists, create it in the current directory.

```bash
test -f .mcp.json && echo "found: $(pwd)/.mcp.json" || (test -f ~/.mcp.json && echo "found: $HOME/.mcp.json" || echo "will create: $(pwd)/.mcp.json")
```

**If the file does not exist**, create it:

```json
{
  "mcpServers": {
    "rundeck-mcp": {
      "command": "docker",
      "args": [
        "run", "-i", "--rm",
        "-e", "RUNDECK_URL=<RUNDECK_URL>",
        "-e", "RUNDECK_TOKEN=<RUNDECK_TOKEN>",
        "rundeck/rundeck-mcp:latest"
      ]
    }
  }
}
```

**If the file exists**, Read it and use Edit to add (or update) the `rundeck-mcp` key inside `mcpServers` with the same structure above.

Replace `<RUNDECK_URL>` and `<RUNDECK_TOKEN>` with the values from Step 3.

```
TaskUpdate taskId=<mcp_json_id> status="completed"
```

---

### Step 5: Register in `~/.claude/settings.json`

```
TaskUpdate taskId=<settings_id> status="in_progress"
```

Check if already registered:

```bash
claude mcp list 2>/dev/null | grep -q "rundeck-mcp" && echo "registered" || echo "not registered"
```

If not registered:

```bash
claude mcp add rundeck-mcp --transport stdio -- docker run -i --rm -e RUNDECK_URL=<RUNDECK_URL> -e RUNDECK_TOKEN=<RUNDECK_TOKEN> rundeck/rundeck-mcp:latest
```

Check `enabledMcpjsonServers`:

```bash
grep -q "rundeck-mcp" ~/.claude/settings.json && echo "enabled" || echo "not enabled"
```

If not present, Read `~/.claude/settings.json` and use Edit to add `"rundeck-mcp"` to the `enabledMcpjsonServers` array. If the array doesn't exist, add it.

```
TaskUpdate taskId=<settings_id> status="completed"
```

---

### Step 6: Smoke Test

```
TaskUpdate taskId=<smoke_id> status="in_progress"
```

Run the container for 5 seconds and send an MCP `initialize` request via stdin:

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"smoke-test","version":"0.0.1"}}}' \
  | docker run -i --rm \
      -e RUNDECK_URL=<RUNDECK_URL> \
      -e RUNDECK_TOKEN=<RUNDECK_TOKEN> \
      rundeck/rundeck-mcp:latest 2>/dev/null \
  | head -1
```

If the output contains `"result"`, the server is working correctly.

If the output is empty or contains an error, warn the user:
> "Smoke test returned unexpected output. Check that RUNDECK_URL and RUNDECK_TOKEN are correct, then reload Claude Code."

```
TaskUpdate taskId=<smoke_id> status="completed"
```

---

### Final Report

```
Rundeck MCP server configured via Docker.

  Image:     rundeck/rundeck-mcp:latest
  Transport: stdio (docker run -i --rm)
  Rundeck:   <RUNDECK_URL>
  Config:    .mcp.json → "rundeck-mcp"

Reload Claude Code (Cmd+Shift+P → "Reload Window") to connect.

To update the image later:
  docker pull rundeck/rundeck-mcp:latest
```