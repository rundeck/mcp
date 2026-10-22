import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createMcpHandler, type AuthInfo } from "@modelcontextprotocol/server";
import {
  localhostHostValidation,
  localhostOriginValidation,
  toNodeHandler,
} from "@modelcontextprotocol/node";
import { createMcpServer } from "../create-server.js";
import { bindRequestAuthToServer } from "../auth/request-auth.js";
import {
  bearerTokenFromAuthorizationHeader,
  decodeJwtPayload,
} from "../auth/jwt-payload.js";
import { getRundeckAuthMode } from "../auth/rundeck-auth-mode.js";
import { logger } from "../utils/logger.js";
import { isOidcDiscoveryEnabled, serveOidcDiscovery } from "./oidc-discovery-proxy.js";

export interface HttpServerHandle {
  url: string;
  close(): Promise<void>;
}

function parsePort(): number {
  const raw = process.env.MCP_HTTP_PORT?.trim();
  if (!raw) {
    return 3000;
  }
  const port = Number(raw);
  if (!Number.isFinite(port) || port <= 0 || port > 65535) {
    throw new Error(`MCP_HTTP_PORT must be a valid port number, got "${raw}"`);
  }
  return port;
}

function parseHost(): string {
  return process.env.MCP_HTTP_HOST?.trim() || "127.0.0.1";
}

function clientIdFromBearerToken(token: string): string {
  const payload = decodeJwtPayload(token);
  if (typeof payload?.sub === "string" && payload.sub.length > 0) {
    return payload.sub;
  }
  const azp = payload?.azp;
  if (typeof azp === "string" && azp.length > 0) {
    return azp;
  }
  return "bearer";
}

function authInfoFromRequest(req: IncomingMessage): AuthInfo | undefined {
  const token = bearerTokenFromAuthorizationHeader(req.headers.authorization);
  if (!token) {
    return undefined;
  }
  return {
    token,
    clientId: clientIdFromBearerToken(token),
    scopes: [],
  };
}

/** Node adapter reads validated auth from `req.auth`, not the handler's third argument. */
type NodeIncomingWithAuth = IncomingMessage & { auth?: AuthInfo };

function requireBearerForJwtMode(req: IncomingMessage, res: ServerResponse): boolean {
  if (getRundeckAuthMode() !== "jwt_bearer") {
    return true;
  }
  if (process.env.MCP_REQUIRE_BEARER === "0" || process.env.MCP_REQUIRE_BEARER === "false") {
    return true;
  }
  const token = bearerTokenFromAuthorizationHeader(req.headers.authorization);
  if (token) {
    return true;
  }
  res.writeHead(401, { "content-type": "application/json" });
  res.end(
    JSON.stringify({
      error: "missing_bearer",
      message:
        "Authorization: Bearer <jwt> is required when RUNDECK_AUTH_MODE=jwt_bearer. " +
        "Obtain a Rundeck/OIDC access token and send it on every MCP HTTP request.",
    })
  );
  return false;
}

export async function startHttpServer(): Promise<HttpServerHandle> {
  const host = parseHost();
  const port = parsePort();
  const loopback = host === "127.0.0.1" || host === "::1" || host === "localhost";
  const validateHost = localhostHostValidation();
  const validateOrigin = localhostOriginValidation();

  const mcpHandler = createMcpHandler((ctx) => {
    const token =
      ctx.authInfo?.token ??
      bearerTokenFromAuthorizationHeader(ctx.requestInfo?.headers.get("authorization") ?? undefined);

    const server = createMcpServer();
    if (token) {
      bindRequestAuthToServer(server, token);
      if (process.env.RUNDECK_JWT_DECODE_FOR_TELEMETRY !== "0") {
        const sub = decodeJwtPayload(token)?.sub;
        if (sub) {
          logger.debug(`MCP HTTP request authenticated (enduser.id=${sub})`);
        }
      }
    }
    return server;
  });

  const nodeHandler = toNodeHandler(mcpHandler);
  const path = process.env.MCP_HTTP_PATH?.trim() || "/mcp";

  const httpServer = createServer((req, res) => {
    if (loopback && (!validateHost(req, res) || !validateOrigin(req, res))) {
      return;
    }
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

    if (url.pathname !== path) {
      void serveOidcDiscovery(url.pathname, res).then((handled) => {
        if (!handled) {
          res.writeHead(404, { "content-type": "text/plain" });
          res.end("Not found");
        }
      });
      return;
    }
    if (!requireBearerForJwtMode(req, res)) {
      return;
    }
    const authInfo = authInfoFromRequest(req);
    if (authInfo) {
      (req as NodeIncomingWithAuth).auth = authInfo;
    }
    void nodeHandler(req, res);
  });

  await new Promise<void>((resolve, reject) => {
    httpServer.once("error", reject);
    httpServer.listen(port, host, () => resolve());
  });

  const displayHost = host.includes(":") ? `[${host}]` : host;
  const url = `http://${displayHost}:${port}${path}`;
  if (isOidcDiscoveryEnabled()) {
    logger.info(
      `OIDC discovery proxy enabled (OIDC_ISSUER) — MCP clients can OAuth via /.well-known/openid-configuration`
    );
  }
  logger.info(`Rundeck MCP HTTP listening at ${url} (Streamable HTTP; Bearer JWT → Rundeck API)`);

  return {
    url,
    close: async () => {
      await mcpHandler.close();
      await new Promise<void>((resolve, reject) => {
        httpServer.close((err) => (err ? reject(err) : resolve()));
      });
    },
  };
}
