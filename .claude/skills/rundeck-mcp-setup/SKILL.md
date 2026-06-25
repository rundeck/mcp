---
name: rundeck-mcp-setup
description: Set up and start the Rundeck MCP HTTP server locally. Installs dependencies, builds the project, configures .env with Rundeck credentials, registers the server in .mcp.json, and starts it. Use when a user clones this repo and wants to run the MCP server for the first time, or when restarting after a reboot.
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

**Purpose:** Get the Rundeck MCP HTTP server running on the user's machine, fully wired into Claude Code.

**When to use:**
- After cloning the repo for the first time
- When the server is not running and `claude mcp list` shows `rundeck-mcp` as disconnected
- When the user wants to restart the server

**When NOT to use:**
- If the server is already running (`claude mcp list` shows `rundeck-mcp` as connected)

---

## What This Skill Does

1. Checks Node.js is available
2. Installs npm dependencies (if needed)
3. Builds TypeScript → `dist/`
4. Prompts for Rundeck credentials and configures `.env`
5. Creates `.mcp.json` in the repo root (registers the server with Claude Code)
6. Adds `rundeck-mcp` to `enabledMcpjsonServers` in `~/.claude/settings.json`
7. Starts the HTTP server via `start.sh`

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
TaskCreate "Verify .env"
TaskCreate "Configure .mcp.json"
TaskCreate "Register in ~/.claude/settings.json"
TaskCreate "Start server"
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
ls $REPO/package.json $REPO/src/http.ts $REPO/.claude/skills/rundeck-mcp-setup/start.sh 2>/dev/null
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
test -f dist/http.js && echo "built" || echo "needs build"
```

If `dist/http.js` does not exist:

```bash
npm run build
```

If the build fails, show the error output and stop.

```
TaskUpdate taskId=<build_id> status="completed"
```

---

### Step 4: Verify `.env`

```
TaskUpdate taskId=<verify_env_file_id> status="in_progress"
```

```bash
test -f .env && echo "exists" || echo "missing"
```

**If `.env` does not exist**, stop and tell the user:

> "`.env` not found. Create it from the template before continuing:
>
> ```bash
> cp .env.example .env
> ```
>
> Then open `.env` and fill in your `RUNDECK_URL` and `RUNDECK_TOKEN`. When done, run `/rundeck-mcp-setup` again."

**If `.env` exists**, verify required variables are not placeholder values:

```bash
grep -E "^RUNDECK_URL|^RUNDECK_TOKEN" .env
```

If either is empty or still contains `your-` placeholder text, stop:
> "`.env` has unfilled values. Open `.env` and set `RUNDECK_URL` and `RUNDECK_TOKEN`, then run `/rundeck-mcp-setup` again."

Show the non-secret config to confirm:

```bash
grep -E "^RUNDECK_URL|^MCP_HTTP_PORT|^RUNDECK_API_VERSION" .env
```

```
TaskUpdate taskId=<verify_env_file_id> status="completed"
```

---

### Step 5: Configure `.mcp.json`

```
TaskUpdate taskId=<mcp_json_id> status="in_progress"
```

Get the port:

```bash
grep "MCP_HTTP_PORT" .env | cut -d= -f2
```

Store as `PORT` (default `3456`).

```bash
test -f .mcp.json && echo "exists" || echo "missing"
```

**If missing**, create it:

```json
{
  "mcpServers": {
    "rundeck-mcp": {
      "url": "http://localhost:<PORT>/mcp"
    }
  }
}
```

**If exists**, check if entry is present:

```bash
grep -q "rundeck-mcp" .mcp.json && echo "present" || echo "missing"
```

If missing, use Edit to add `"rundeck-mcp": { "url": "http://localhost:<PORT>/mcp" }` inside `mcpServers`.

```
TaskUpdate taskId=<mcp_json_id> status="completed"
```

---

### Step 6: Register in `~/.claude/settings.json`

```
TaskUpdate taskId=<settings_id> status="in_progress"
```

This step does two things: registers the server globally (so it's available in **any** project) and enables it via `enabledMcpjsonServers`.

**6a — Global `mcpServers` registration:**

Check if already registered:

```bash
claude mcp list 2>/dev/null | grep -q "rundeck-mcp" && echo "registered" || echo "not registered"
```

If not registered, add it using the CLI (replace `<PORT>` with the value from `.env`):

```bash
claude mcp add rundeck-mcp --transport http http://localhost:<PORT>/mcp
```

If the `claude mcp add` command fails or is unavailable, fall back to editing `~/.claude/settings.json` directly: Read the file, then use Edit to add the following inside the top-level JSON object:

```json
"mcpServers": {
  "rundeck-mcp": {
    "url": "http://localhost:<PORT>/mcp"
  }
}
```

If `mcpServers` already exists, add `"rundeck-mcp"` inside it.

**6b — `enabledMcpjsonServers`:**

```bash
grep -q "rundeck-mcp" ~/.claude/settings.json && echo "enabled" || echo "not enabled"
```

If not present, Read the file then use Edit to add `"rundeck-mcp"` to the `enabledMcpjsonServers` array. If the array doesn't exist yet, add it.

```
TaskUpdate taskId=<settings_id> status="completed"
```

---

### Step 7: Start the Server

```
TaskUpdate taskId=<start_id> status="in_progress"
```

```bash
pgrep -f "dist/http.js" && echo "running" || echo "not running"
```

If running, stop the old instance first:

```bash
pkill -f "dist/http.js" 2>/dev/null; sleep 1
```

Start in the background:

```bash
bash .claude/skills/rundeck-mcp-setup/start.sh
```

Verify it started:

```bash
sleep 2 && curl -s -o /dev/null -w "%{http_code}" http://localhost:<PORT>/mcp -X POST -H "Content-Type: application/json" -d '{}' 2>/dev/null || echo "unreachable"
```

A `400` response confirms the server is listening. Any connection error means it failed — tell the user to check `.env` and run `bash .claude/skills/rundeck-mcp-setup/start.sh` manually.

```
TaskUpdate taskId=<start_id> status="completed"
```

---

### Final Report

```
Rundeck MCP server is running.

  URL:      http://localhost:<PORT>/mcp
  Rundeck:  <RUNDECK_URL>
  Config:   .mcp.json  →  "rundeck-mcp"
  Settings: ~/.claude/settings.json  →  enabledMcpjsonServers

To stop:     /rundeck-mcp-stop
To restart:  /rundeck-mcp-restart
To rebuild:  /rundeck-mcp-rebuild
```

---

## Notes for the MCP Server to Persist Across Reboots

The server process is not daemonized. After a system restart, the user must run this skill again (or `bash .claude/skills/rundeck-mcp-setup/start.sh` manually) to restart it.

---

## Error Reference

| Symptom | Likely cause | Fix |
|---|---|---|
| `npm install` fails | Missing Node.js or network issues | Check `node --version`; fix npm registry if behind proxy |
| `npm run build` fails | TypeScript errors | Check `src/` for recent edits; run `npm run build` manually |
| Server not reachable | Wrong port or `.env` not loaded | Check `MCP_HTTP_PORT` in `.env`; check `start.sh` output |
| `rundeck-mcp` not showing in Claude | Not in `enabledMcpjsonServers` | Re-run Step 7; restart Claude Code |