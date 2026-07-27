# syntax=docker/dockerfile:1
# ── Stage 1: build ────────────────────────────────────────────────────────────
FROM node:24-alpine AS builder
WORKDIR /app

# Install all deps (dev included — TypeScript compiler needed for build)
# Skip postinstall to avoid downloading docs during image build
# .npmrc points the registry at a private Cloudsmith mirror; package-lock.json's
# "resolved" URLs point there too, so it must be present even though the
# registry itself isn't referenced by name in most installs.
COPY package*.json .npmrc ./
RUN --mount=type=secret,id=cloudsmith_token \
    CLOUDSMITH_NPM_TOKEN="$(cat /run/secrets/cloudsmith_token 2>/dev/null || true)" \
    npm ci --ignore-scripts

# Compile TypeScript
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

# Prune to production deps only
RUN npm prune --omit=dev

# ── Stage 2: production image ─────────────────────────────────────────────────
FROM node:24-alpine AS production
WORKDIR /app

# git is used by the entrypoint for a sparse partial clone of Rundeck docs,
# skipping the media-heavy .vuepress/public tree (~4s/~2MB vs ~35s/~200MB
# for the old full tarball download)
# procps provides pgrep, used by the HEALTHCHECK
RUN apk add --no-cache git procps

# Copy build artifacts and pruned production dependencies
COPY --from=builder /app/dist            ./dist
COPY --from=builder /app/node_modules    ./node_modules
COPY --from=builder /app/package.json    ./package.json

# Copy the entrypoint script
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

# Use the built-in non-root user from node:alpine (node, UID 1000)
RUN chown -R node:node /app
USER node

ENV NODE_ENV=production \
    RUNDECK_API_VERSION=46

# Verify the stdio server process is still running
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD pgrep -f "[d]ist/index\\.js" || exit 1

# stdio transport — the MCP client launches this container and pipes stdin/stdout
ENTRYPOINT ["./docker-entrypoint.sh"]
