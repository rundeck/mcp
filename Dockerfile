# ── Stage 1: build ────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app

# Install all deps (dev included — TypeScript compiler needed for build)
# Skip postinstall to avoid downloading docs during image build
COPY package*.json ./
RUN npm ci --ignore-scripts

# Compile TypeScript
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

# Prune to production deps only
RUN npm prune --omit=dev

# ── Stage 2: production image ─────────────────────────────────────────────────
FROM node:22-alpine AS production
WORKDIR /app

# curl is used by the entrypoint to download Rundeck docs on first start
RUN apk add --no-cache curl tar

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

# Verify the server module loads correctly
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node --input-type=module --eval "import('/app/dist/create-server.js').then(()=>process.exit(0)).catch(()=>process.exit(1))"

# stdio transport — the MCP client launches this container and pipes stdin/stdout
ENTRYPOINT ["./docker-entrypoint.sh"]
