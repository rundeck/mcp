#!/usr/bin/env node

/**
 * Rundeck MCP HTTP Server
 *
 * Exposes the Rundeck MCP server over Streamable HTTP (MCP spec).
 * Claude Code connects via: http://localhost:<PORT>/mcp
 *
 * Usage:
 *   MCP_HTTP_PORT=3456 node dist/http.js
 *
 * Then add to .mcp.json:
 *   "rundeck-mcp": { "url": "http://localhost:3456/mcp" }
 */

import type { Express, Request, Response } from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { createRundeckMcpServer } from "./create-server.js";
import { logger } from "./utils/logger.js";

/** Build and return the configured MCP express app (exported for testing). */
export function createHttpApp(): Express {
  // Express app pre-configured for MCP (includes DNS-rebinding protection for localhost)
  const app = createMcpExpressApp();

  // Session map: sessionId → transport (null-prototype avoids prototype-pollution via header values)
  const transports: Record<string, StreamableHTTPServerTransport> = Object.create(null);

  // ── POST /mcp — initialize or forward to existing session ──────────────────

  app.post("/mcp", async (req: Request, res: Response) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;

    if (sessionId && transports[sessionId]) {
      await transports[sessionId].handleRequest(req, res, req.body);
      return;
    }

    if (!sessionId && isInitializeRequest(req.body)) {
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (sid) => {
          transports[sid] = transport;
          logger.info(`MCP session initialized: ${sid}`);
        },
      });

      const server = createRundeckMcpServer();

      transport.onclose = () => {
        const sid = transport.sessionId;
        if (sid && transports[sid]) {
          delete transports[sid];
          logger.info(`MCP session closed: ${sid}`);
        }
        server.close().catch(() => {});
      };

      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
      return;
    }

    res.status(400).json({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Bad Request: missing or invalid session" },
      id: null,
    });
  });

  // ── GET /mcp — SSE stream for an existing session ─────────────────────────

  app.get("/mcp", async (req: Request, res: Response) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    if (!sessionId || !transports[sessionId]) {
      res.status(400).send("Invalid or missing session ID");
      return;
    }
    await transports[sessionId].handleRequest(req, res);
  });

  // ── DELETE /mcp — session termination ─────────────────────────────────────

  app.delete("/mcp", async (req: Request, res: Response) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    if (!sessionId || !transports[sessionId]) {
      res.status(400).send("Invalid or missing session ID");
      return;
    }
    await transports[sessionId].handleRequest(req, res);
  });

  return app;
}

// ── Entry point — only runs when invoked directly (not when imported in tests) ──

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  const rawPort = process.env.MCP_HTTP_PORT ?? "3456";
  const PORT = parseInt(rawPort, 10);
  if (isNaN(PORT) || PORT < 1 || PORT > 65535) {
    console.error(`[rundeck-mcp] Invalid MCP_HTTP_PORT: "${rawPort}". Must be a number between 1 and 65535.`);
    process.exit(1);
  }

  const app = createHttpApp();

  app.listen(PORT, "127.0.0.1", () => {
    logger.info(`Rundeck MCP HTTP server → http://localhost:${PORT}/mcp`);
    console.log(`[rundeck-mcp] HTTP server running on http://localhost:${PORT}/mcp`);
  });

  process.on("SIGINT", async () => {
    logger.info("Shutting down rundeck-mcp HTTP server…");
    process.exit(0);
  });
}
