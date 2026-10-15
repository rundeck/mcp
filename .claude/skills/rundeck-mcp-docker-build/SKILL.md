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
TaskCreate "Run Docker smoke tests"
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
> "Dockerfile or docker-entrypoint.sh not found. Both ship on `main` — make sure your branch is up to date with `main`."

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

Build with the same tag CircleCI publishes (`rundeck/mcp-ci`) plus today's date as a secondary tag. `.npmrc` points npm at a private Cloudsmith mirror, so `CLOUDSMITH_NPM_TOKEN` must be set in your shell and forwarded in as a build secret (not a build-arg, to avoid leaking it into the image's layer history):

```bash
docker build --secret id=cloudsmith_token,env=CLOUDSMITH_NPM_TOKEN \
  -t rundeck/mcp-ci:latest -t rundeck/mcp-ci:$(date +%Y%m%d) . 2>&1
```

If `CLOUDSMITH_NPM_TOKEN` isn't set in the environment, the build will fail with an `npm ci` 401 error.

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
docker image inspect rundeck/mcp-ci:latest --format 'Size: {{.Size}} bytes | Created: {{.Created}}'
```

Print usage instructions:

```
TaskUpdate taskId=<verify_image_id> status="completed"
```

---

### Step 4: Run Docker Smoke Tests

```
TaskUpdate taskId=<smoke_id> status="in_progress"
```

Verifies the entrypoint's docs fetch, the resulting `/app/docs` layout (including that the media-heavy `.vuepress/public` tree stays excluded except for the carved-out `rundeck-api.yml` OpenAPI spec `api_call` validates against), the `RUNDECK_DOCS_PATH` bypass, the restart/skip-fetch path, and that the server answers a real MCP `initialize` request:

```bash
sh ci/docker-smoke-test.sh rundeck/mcp-ci:latest
```

If any check reports `FAIL`, show the full output and stop:
> "Docker smoke tests failed — see output above. Do not publish this image."

```
TaskUpdate taskId=<smoke_id> status="completed"
```

---

### Report

```
Docker image built successfully.

  Image:        rundeck/mcp-ci:latest
  Smoke tests:  PASSED

Add to .mcp.json (stdio transport — docs downloaded on first start):
  "rundeck-mcp": {
    "command": "docker",
    "args": ["run", "-i", "--rm",
      "-e", "RUNDECK_URL=https://your-rundeck.example.com",
      "-e", "RUNDECK_TOKEN=your-token",
      "rundeck/mcp-ci:latest"]
  }
```