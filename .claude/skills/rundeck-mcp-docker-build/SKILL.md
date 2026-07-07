---
name: rundeck-mcp-docker-build
description: Build the Rundeck MCP Docker image. Compiles TypeScript in a multi-stage build and produces a production-ready image that downloads Rundeck docs at container startup. Use after changes to src/, Dockerfile, or docker-entrypoint.sh.
user-invocable: true
allowed-tools:
  - Bash
  - TaskCreate
  - TaskUpdate
---

# Rundeck MCP — Docker Build Skill

**Purpose:** Build the `rundeck-mcp` Docker image from the local source.

**When to use:**
- After changes to `src/`, `Dockerfile`, or `docker-entrypoint.sh`
- To produce an image ready for local testing or publishing

**When NOT to use:**
- Just want to run the server locally → use `/rundeck-mcp-rebuild` instead (faster, no Docker)

---

## Steps

### Before Starting: Create Task List

```
TaskCreate "Verify environment"
TaskCreate "Build Docker image"
TaskCreate "Verify image"
```

Store all returned task IDs.

---

### Step 1: Verify Prerequisites

```
TaskUpdate taskId=<verify_id> status="in_progress"
```

```bash
ls Dockerfile docker-entrypoint.sh 2>/dev/null
```

If either file is missing, stop:
> "Dockerfile or docker-entrypoint.sh not found. Make sure you're on the `feat/docker-delivery` branch."

Check Docker is available:

```bash
docker info --format '{{.ServerVersion}}' 2>/dev/null || echo "unavailable"
```

If Docker is unavailable, stop:
> "Docker daemon is not running. Start Docker Desktop and try again."

```
TaskUpdate taskId=<verify_id> status="completed"
```

---

### Step 2: Build the Image

```
TaskUpdate taskId=<build_id> status="in_progress"
```

Build with a `local` tag and today's date as a secondary tag:

```bash
docker build -t rundeck-mcp:local -t rundeck-mcp:$(date +%Y%m%d) . 2>&1
```

If the build fails, show the full output and stop:
> "Docker build failed — see errors above."

```
TaskUpdate taskId=<build_id> status="completed"
```

---

### Step 3: Verify Image

```
TaskUpdate taskId=<verify_image_id> status="in_progress"
```

```bash
docker image inspect rundeck-mcp:local --format 'Size: {{.Size}} bytes | Created: {{.Created}}'
```

Print usage instructions:

```
TaskUpdate taskId=<verify_image_id> status="completed"
```

---

### Report

```
Docker image built successfully.

  Image:   rundeck-mcp:local
  
Run locally (docs downloaded on first start):
  docker run --rm \
    -e RUNDECK_URL=https://your-rundeck.example.com \
    -e RUNDECK_TOKEN=your-token \
    -p 3456:3456 \
    rundeck-mcp:local

Skip docs download (server only):
  docker run --rm \
    -e RUNDECK_URL=... \
    -e RUNDECK_TOKEN=... \
    -e SKIP_RUNDECK_DOCS_DOWNLOAD=1 \
    -p 3456:3456 \
    rundeck-mcp:local

Mount pre-downloaded docs (fastest startup):
  docker run --rm \
    -e RUNDECK_URL=... \
    -e RUNDECK_TOKEN=... \
    -v /path/to/docs:/app/docs/docs:ro \
    -p 3456:3456 \
    rundeck-mcp:local

Then add to .mcp.json:
  "rundeck-mcp": { "type": "http", "url": "http://localhost:3456/mcp" }
```