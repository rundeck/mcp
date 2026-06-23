#!/usr/bin/env node

/**
 * Rundeck Documentation MCP Server — stdio entry point
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createRundeckMcpServer } from "./create-server.js";
import { logger } from "./utils/logger.js";

process.on("SIGINT", async () => {
  process.exit(0);
});

async function main() {
  const server = createRundeckMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info("Rundeck Documentation MCP server running on stdio");
}

main().catch((error) => {
  logger.error("Fatal error starting server", error);
  process.exit(1);
});