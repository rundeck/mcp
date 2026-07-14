---
name: rundeck-mcp-setup
description: Set up the Rundeck MCP server locally over stdio. Installs dependencies, builds the project, configures .mcp.json with Rundeck credentials, and registers it with Claude Code. Use when a user clones this repo and wants to run the MCP server for the first time.
user-invocable: true
allowed-tools:
  - Bash
  - Read
  - Write
  - Edit
  - TaskCreate
  - TaskUpdate
---

# Rundeck MCP — Local Setup Skill

**Purpose:** Get the Rundeck MCP server built and wired into Claude Code over stdio.

**When to use:**
- After cloning the repo for the first time
- When the server is not registered, or `claude mcp list` shows `rundeck-mcp` as disconnected

**When NOT to use:**
- If the server is already registered and connected (`claude mcp list` shows `rundeck-mcp` as connected)

---

## What This Skill Does

1. Checks Node.js is available
2. Installs npm dependencies (if needed)
3. Builds TypeScript → `dist/`
4. Prompts for Rundeck credentials
5. Creates `.mcp.json` in the repo root with a stdio entry (`command`/`args`/`env`)
6. Adds `rundeck-mcp` to `enabledMcpjsonServers` in `~/.claude/settings.json`

---

## Execution Steps

**IMPORTANT:** Follow these steps in order. Do NOT skip steps.

---

### Before Starting: Create Task List

Create all tasks upfront so the user can track progress. Use TaskCreate for each — store the real IDs returned:

```
TaskCreate "Verify environment"
TaskCreate "Install dependencies"
TaskCreate "Build project"
TaskCreate "Collect credentials"
TaskCreate "Configure .mcp.json"
TaskCreate "Register in ~/.claude/settings.json"
```

---

### Step 1: Verify Working Directory

```
TaskUpdate taskId=<verify_env_id> status="in_progress"
```

Locate the repo root via git — this works regardless of which directory the shell is currently in:

```bash
git rev-parse --show-toplevel 2>/dev/null
```

Store the result as `REPO`. If the command fails, stop:
> "Not inside a git repository. Clone `rundeck_mcp` and try again."

Confirm it is the correct repo:

```bash
ls $REPO/package.json $REPO/src/index.ts 2>/dev/null
```

If any file is missing, stop:
> "This does not appear to be the `rundeck_mcp` repository."

Change into the repo root so all subsequent relative paths work correctly:

```bash
cd "$REPO"
```

Check Node.js:

```bash
node --version && npm --version
```

If Node.js is not found, stop:
> "Node.js is required. Please install Node.js 20+ from https://nodejs.org and try again."

```
TaskUpdate taskId=<verify_env_id> status="completed"
```

---

### Step 2: Install Dependencies (if needed)

```
TaskUpdate taskId=<install_deps_id> status="in_progress"
```

```bash
test -d node_modules && echo "exists" || echo "missing"
```

If missing:

```bash
npm install
```

If `npm install` fails, report the error and stop.

```
TaskUpdate taskId=<install_deps_id> status="completed"
```

---

### Step 3: Build the Project (if needed)

```
TaskUpdate taskId=<build_id> status="in_progress"
```

```bash
test -f dist/index.js && echo "built" || echo "needs build"
```

If `dist/index.js` does not exist:

```bash
npm run build
```

If the build fails, show the error output and stop.

```
TaskUpdate taskId=<build_id> status="completed"
```

---

### Step 4: Collect Credentials

```
TaskUpdate taskId=<credentials_id> status="in_progress"
```

Ask the user for their Rundeck instance URL and API token (generated from their Rundeck user profile). Never echo the token back or log it.

```
TaskUpdate taskId=<credentials_id> status="completed"
```

---

### Step 5: Configure `.mcp.json`

```
TaskUpdate taskId=<mcp_json_id> status="in_progress"
```

```bash
test -f .mcp.json && echo "exists" || echo "missing"
```

**If missing**, create it (use `Write`), filling in the absolute path to `dist/index.js` and the credentials collected in Step 4:

```json
{
  "mcpServers": {
    "rundeck-mcp": {
      "command": "node",
      "args": ["<REPO>/dist/index.js"],
      "env": {
        "RUNDECK_URL": "<RUNDECK_URL>",
        "RUNDECK_TOKEN": "<RUNDECK_TOKEN>",
        "RUNDECK_API_VERSION": "46"
      }
    }
  }
}
```

**If exists**, check if the entry is present:

```bash
grep -q "rundeck-mcp" .mcp.json && echo "present" || echo "missing"
```

If missing, use Edit to add the `"rundeck-mcp"` entry above inside `mcpServers`. If present, use Edit to update its `env` values with the credentials from Step 4.

```
TaskUpdate taskId=<mcp_json_id> status="completed"
```

---

### Step 6: Register in `~/.claude/settings.json`

```
TaskUpdate taskId=<settings_id> status="in_progress"
```

```bash
grep -q "rundeck-mcp" ~/.claude/settings.json && echo "enabled" || echo "not enabled"
```

If not present, Read the file then use Edit to add `"rundeck-mcp"` to the `enabledMcpjsonServers` array. If the array doesn't exist yet, add it.

```
TaskUpdate taskId=<settings_id> status="completed"
```

---

### Final Report

```
Rundeck MCP server is configured.

  Rundeck:  <RUNDECK_URL>
  Config:   .mcp.json  →  "rundeck-mcp"
  Settings: ~/.claude/settings.json  →  enabledMcpjsonServers

Reload Claude Code (or restart your session) to connect.

To rebuild after source changes:  /rundeck-mcp-rebuild
```

---

## Error Reference

| Symptom | Likely cause | Fix |
|---|---|---|
| `npm install` fails | Missing Node.js or network issues | Check `node --version`; fix npm registry if behind proxy |
| `npm run build` fails | TypeScript errors | Check `src/` for recent edits; run `npm run build` manually |
| `rundeck-mcp` not showing in Claude | Not in `enabledMcpjsonServers`, or `.mcp.json` path wrong | Re-run Step 5/6; restart Claude Code |
