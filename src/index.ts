#!/usr/bin/env node

import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { configManager } from "./config.js";
import { createMcpServer } from "./create-server.js";
import {
  getMcpTransport,
  validateTransportAndAuthMode,
} from "./auth/rundeck-auth-mode.js";
import { startHttpServer, type HttpServerHandle } from "./http/start-http-server.js";
import { logger } from "./utils/logger.js";
import { REGISTERED_TOOL_NAMES } from "./tools/registered-tool-names.js";

export { REGISTERED_TOOL_NAMES };

configManager.initialize();
validateTransportAndAuthMode();

let stdioHandle: { close(): Promise<void> } | undefined;
let httpHandle: HttpServerHandle | undefined;

process.on("SIGINT", async () => {
  await stdioHandle?.close();
  await httpHandle?.close();
  process.exit(0);
});

async function main() {
  const transport = getMcpTransport();

  if (transport === "stdio" || transport === "both") {
    stdioHandle = serveStdio(() => createMcpServer(), {
      onerror: (error) => logger.error("MCP stdio opening error", error),
    });
    logger.info("Rundeck MCP server running on stdio");
  }

  if (transport === "http" || transport === "both") {
    httpHandle = await startHttpServer();
  }
}

main().catch((error) => {
  logger.error("Fatal error starting server", error);
  process.exit(1);
});
