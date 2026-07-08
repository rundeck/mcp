---
name: rundeck-mcp-rebuild
description: Install dependencies, recompile TypeScript, and restart the Rundeck MCP HTTP server. Use after making source code changes in src/ or updating package.json.
user-invocable: true
allowed-tools:
  - Bash
  - TaskCreate
  - TaskUpdate
---

# Rundeck MCP — Rebuild & Restart Skill

**Purpose:** Recompile TypeScript source and restart the MCP server.

**When to use:**
- After editing any file in `src/`
- After adding or updating dependencies in `package.json`

**When NOT to use:**
- Only changed `.env` variables → use `/rundeck-mcp-restart` instead (faster, no build)

---

## Steps

### Before Starting: Create Task List

```
TaskCreate "Verify repository"
TaskCreate "Stop server"
TaskCreate "Install dependencies"
TaskCreate "Build TypeScript"
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
ls package.json src/http.ts 2>/dev/null
```

If missing, stop:
> "Run this skill from the root of the `rundeck_mcp` repository."

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

### Step 3: Install Dependencies

```
TaskUpdate taskId=<install_id> status="in_progress"
```

```bash
npm install
```

If this fails, show the error and stop.

```
TaskUpdate taskId=<install_id> status="completed"
```

---

### Step 4: Build

```
TaskUpdate taskId=<build_id> status="in_progress"
```

```bash
npm run build
```

If the build fails, show the full error output and stop:
> "Build failed — fix the TypeScript errors above and run `/rundeck-mcp-rebuild` again."

```
TaskUpdate taskId=<build_id> status="completed"
```

---

### Step 5: Start the Server

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

### Step 6: Verify

```
TaskUpdate taskId=<verify_server_id> status="in_progress"
```

```bash
sleep 2 && curl -s -o /dev/null -w "%{http_code}" http://localhost:$(grep MCP_HTTP_PORT .env | cut -d= -f2)/mcp -X POST -H "Content-Type: application/json" -d '{}' 2>/dev/null
```

A `400` response confirms the server is listening. Any other result means it failed to start — tell the user to check the output of `start.sh`.

```
TaskUpdate taskId=<verify_server_id> status="completed"
```

---

### Report

```
Rebuilt and restarted.

  URL: http://localhost:<PORT>/mcp
```
