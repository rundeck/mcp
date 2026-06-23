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

import type { Request, Response } from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { randomUUID } from "node:crypto";
import { createRundeckMcpServer } from "./create-server.js";
import { logger } from "./utils/logger.js";

const PORT = parseInt(process.env.MCP_HTTP_PORT ?? "3456", 10);

// Express app pre-configured for MCP (includes DNS-rebinding protection for localhost)
const app = createMcpExpressApp();

// Session map: sessionId → transport
const transports: Record<string, StreamableHTTPServerTransport> = {};

// ── POST /mcp — initialize or forward to existing session ──────────────────

app.post("/mcp", async (req: Request, res: Response) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;

  if (sessionId && transports[sessionId]) {
    // Forward to existing session transport
    await transports[sessionId].handleRequest(req, res, req.body);
    return;
  }

  if (!sessionId && isInitializeRequest(req.body)) {
    // New session — create transport + server
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (sid) => {
        transports[sid] = transport;
        logger.info(`MCP session initialized: ${sid}`);
      },
    });

    transport.onclose = () => {
      const sid = transport.sessionId;
      if (sid && transports[sid]) {
        delete transports[sid];
        logger.info(`MCP session closed: ${sid}`);
      }
    };

    const server = createRundeckMcpServer();
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

// ── Start ─────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  logger.info(`Rundeck MCP HTTP server → http://localhost:${PORT}/mcp`);
  console.log(`[rundeck-mcp] HTTP server running on http://localhost:${PORT}/mcp`);
});

// ── Graceful shutdown ─────────────────────────────────────────────────────

process.on("SIGINT", async () => {
  logger.info("Shutting down rundeck-mcp HTTP server…");
  for (const sid of Object.keys(transports)) {
    try {
      await transports[sid].close();
    } catch (_) {
      // ignore
    }
    delete transports[sid];
  }
  process.exit(0);
});