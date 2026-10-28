import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createMcpHandler, type AuthInfo } from "@modelcontextprotocol/server";
import {
  localhostHostValidation,
  localhostOriginValidation,
  toNodeHandler,
  toWebRequest,
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
import {
  OAUTH_AUTHORIZE_PATH,
  OAUTH_CALLBACK_PATH,
  OAUTH_TOKEN_PATH,
  handleOAuthAuthorize,
  handleOAuthCallback,
  isMcpClientOAuthEnabled,
  isMcpOAuthProxyEnabled,
  loadMcpOAuthRuntime,
  mcpOAuthProxyMetadataOverrides,
  missingBearerChallenge,
  proxyOAuthTokenRequest,
  serveMcpOAuthMetadata,
  verifyMcpRequestBearer,
  writeWebResponse,
  type McpOAuthRuntime,
} from "./mcp-oauth.js";

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

function publicResourceUrl(host: string, port: number, mcpPath: string): URL {
  const override = process.env.MCP_PUBLIC_URL?.trim();
  if (override) {
    return new URL(override);
  }
  const displayHost = host.includes(":") ? `[${host}]` : host;
  return new URL(`http://${displayHost}:${port}${mcpPath}`);
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
  const resourceServerUrl = publicResourceUrl(host, port, path);

  let mcpOAuth: McpOAuthRuntime | undefined;
  if (isMcpClientOAuthEnabled()) {
    mcpOAuth = await loadMcpOAuthRuntime(resourceServerUrl);
  }

  const jwtBearerMode = getRundeckAuthMode() === "jwt_bearer";
  const requireBearer =
    (jwtBearerMode || mcpOAuth !== undefined) &&
    process.env.MCP_REQUIRE_BEARER !== "0" &&
    process.env.MCP_REQUIRE_BEARER !== "false";

  const httpServer = createServer((req, res) => {
    void (async () => {
      if (loopback && (!validateHost(req, res) || !validateOrigin(req, res))) {
        return;
      }
      const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

      if (mcpOAuth && url.pathname === OAUTH_AUTHORIZE_PATH && req.method?.toUpperCase() === "GET") {
        await writeWebResponse(res, handleOAuthAuthorize(url, mcpOAuth));
        return;
      }

      if (mcpOAuth && url.pathname === OAUTH_CALLBACK_PATH && req.method?.toUpperCase() === "GET") {
        await writeWebResponse(res, handleOAuthCallback(url, mcpOAuth));
        return;
      }

      if (mcpOAuth && url.pathname === OAUTH_TOKEN_PATH) {
        const tokenResponse = await proxyOAuthTokenRequest(
          req,
          mcpOAuth.upstreamTokenEndpoint,
          mcpOAuth.callbackUrl
        );
        await writeWebResponse(res, tokenResponse);
        return;
      }

      if (url.pathname !== path) {
        if (mcpOAuth && req.method?.toUpperCase() !== "POST") {
          const webRequest = await toWebRequest(req);
          const metaResponse = await serveMcpOAuthMetadata(webRequest, mcpOAuth);
          if (metaResponse) {
            await writeWebResponse(res, metaResponse);
            return;
          }
        }
        const handled = await serveOidcDiscovery(url.pathname, res, {
          overrides:
            mcpOAuth && isMcpOAuthProxyEnabled()
              ? mcpOAuthProxyMetadataOverrides(resourceServerUrl)
              : undefined,
        });
        if (!handled) {
          res.writeHead(404, { "content-type": "text/plain" });
          res.end("Not found");
        }
        return;
      }

      if (requireBearer) {
        const header = req.headers.authorization;
        const hasToken = !!bearerTokenFromAuthorizationHeader(header);
        if (mcpOAuth) {
          if (!hasToken) {
            await writeWebResponse(res, missingBearerChallenge(mcpOAuth));
            return;
          }
          const verified = await verifyMcpRequestBearer(header, mcpOAuth);
          if (verified instanceof Response) {
            await writeWebResponse(res, verified);
            return;
          }
          (req as NodeIncomingWithAuth).auth = verified;
        } else if (!hasToken) {
          res.writeHead(401, { "content-type": "application/json" });
          res.end(
            JSON.stringify({
              error: "missing_bearer",
              message:
                "Authorization: Bearer <jwt> is required when RUNDECK_AUTH_MODE=jwt_bearer. " +
                "Set OIDC_ISSUER to enable MCP client OAuth (Authenticate in Cursor).",
            })
          );
          return;
        } else {
          const authInfo = authInfoFromRequest(req);
          if (authInfo) {
            (req as NodeIncomingWithAuth).auth = authInfo;
          }
        }
      } else {
        const authInfo = authInfoFromRequest(req);
        if (authInfo) {
          (req as NodeIncomingWithAuth).auth = authInfo;
        }
      }

      await nodeHandler(req, res);
    })().catch((error) => {
      logger.error("HTTP request handler error", error);
      if (!res.headersSent) {
        res.writeHead(500, { "content-type": "text/plain" });
        res.end("Internal Server Error");
      }
    });
  });

  await new Promise<void>((resolve, reject) => {
    httpServer.once("error", reject);
    httpServer.listen(port, host, () => resolve());
  });

  const displayHost = host.includes(":") ? `[${host}]` : host;
  const url = `http://${displayHost}:${port}${path}`;
  if (mcpOAuth) {
    logger.info(
      "MCP client OAuth: unauthenticated POST /mcp returns 401 + WWW-Authenticate; use Authenticate in Cursor/Inspector"
    );
  } else if (isOidcDiscoveryEnabled()) {
    logger.info(
      `OIDC discovery proxy enabled (OIDC_ISSUER) — legacy proxy at /.well-known/openid-configuration`
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
