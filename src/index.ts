#!/usr/bin/env node

/**
 * Rundeck Documentation MCP Server
 * stdio entry point — used by Claude Desktop and stdio-based clients.
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createRundeckMcpServer } from "./create-server.js";
import { configManager } from "./config.js";
import { logger } from "./utils/logger.js";

// Initialize configuration
configManager.initialize();

const server = createRundeckMcpServer();

process.on("SIGINT", async () => {
  await server.close();
  process.exit(0);
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info("Rundeck Documentation MCP server running on stdio");
}

main().catch((error) => {
  logger.error("Fatal error starting server", error);
  process.exit(1);
});