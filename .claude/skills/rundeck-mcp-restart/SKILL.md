---
name: rundeck-mcp-restart
description: Restart the Rundeck MCP HTTP server without recompiling. Use after changing .env variables (RUNDECK_URL, RUNDECK_TOKEN, MCP_HTTP_PORT, etc.). Stops the running server and starts it again picking up the new environment.
user-invocable: true
allowed-tools:
  - Bash
  - TaskCreate
  - TaskUpdate
---

# Rundeck MCP — Restart Skill

**Purpose:** Restart the MCP server to pick up new `.env` values, without rebuilding.

**When to use:**
- After editing `.env` (changed URL, token, port, API version)

**When NOT to use:**
- After editing `src/` code → use `/rundeck-mcp-rebuild` instead (needs recompile)

---

## Steps

### Before Starting: Create Task List

```
TaskCreate "Verify environment"
TaskCreate "Stop server"
TaskCreate "Start server"
TaskCreate "Verify server"
```

Store all returned task IDs.

---

### Step 1: Verify Working Directory

```
TaskUpdate taskId=<verify_id> status="in_progress"
```

```bash
ls package.json dist/http.js .env 2>/dev/null
```

If `dist/http.js` is missing, stop:
> "`dist/http.js` not found — run `/rundeck-mcp-rebuild` first to compile the project."

If `.env` is missing, stop:
> "`.env` not found — copy `.env.example` to `.env`, fill in your credentials, then run `/rundeck-mcp-setup`."

```
TaskUpdate taskId=<verify_id> status="completed"
```

---

### Step 2: Stop the Running Server

```
TaskUpdate taskId=<stop_id> status="in_progress"
```

```bash
pkill -f "dist/http.js" 2>/dev/null && echo "stopped" || echo "was not running"
```

```
TaskUpdate taskId=<stop_id> status="completed"
```

---

### Step 3: Start the Server

```
TaskUpdate taskId=<start_id> status="in_progress"
```

```bash
bash .claude/skills/rundeck-mcp-setup/start.sh
```

```
TaskUpdate taskId=<start_id> status="completed"
```

---

### Step 4: Verify

```
TaskUpdate taskId=<verify_server_id> status="in_progress"
```

```bash
sleep 2 && curl -s -o /dev/null -w "%{http_code}" http://localhost:$(grep MCP_HTTP_PORT .env | cut -d= -f2)/mcp -X POST -H "Content-Type: application/json" -d '{}' 2>/dev/null
```

A `400` response confirms the server is listening. Any other result means it failed to start — tell the user to check `.env` values.

```
TaskUpdate taskId=<verify_server_id> status="completed"
```

---

### Report

```
Restarted with updated environment.

  URL:      http://localhost:<PORT>/mcp
  Rundeck:  <RUNDECK_URL>
```

Read both values from `.env` to fill in the report (mask the token, show the URL).
