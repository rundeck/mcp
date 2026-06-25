---
name: rundeck-mcp-stop
description: Stop the running Rundeck MCP HTTP server. Use when you want to shut it down without restarting.
user-invocable: true
allowed-tools:
  - Bash
  - TaskCreate
  - TaskUpdate
---

# Rundeck MCP — Stop Skill

## Steps

### Before Starting: Create Task List

```
TaskCreate "Check server status"
TaskCreate "Stop server"
TaskCreate "Confirm stopped"
```

Store all returned task IDs.

---

### Step 1: Check if Running

```
TaskUpdate taskId=<check_id> status="in_progress"
```

```bash
pgrep -f "dist/http.js" && echo "running" || echo "not running"
```

If not running:
```
TaskUpdate taskId=<check_id> status="completed"
```
Report: "Rundeck MCP server is not running — nothing to stop." and stop.

```
TaskUpdate taskId=<check_id> status="completed"
```

---

### Step 2: Stop

```
TaskUpdate taskId=<stop_id> status="in_progress"
```

```bash
pkill -f "dist/http.js"
```

```
TaskUpdate taskId=<stop_id> status="completed"
```

---

### Step 3: Confirm

```
TaskUpdate taskId=<confirm_id> status="in_progress"
```

```bash
sleep 1 && pgrep -f "dist/http.js" && echo "still running" || echo "stopped"
```

If still running, force kill:

```bash
pkill -9 -f "dist/http.js"
```

```
TaskUpdate taskId=<confirm_id> status="completed"
```

---

### Report

> "Rundeck MCP server stopped."
