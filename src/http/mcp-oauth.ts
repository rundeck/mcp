/**
 * MCP Resource Server OAuth discovery (RFC 9728) + Bearer challenges for HTTP clients.
 * Does not replace Rundeck token validation — forwards the access token to Rundeck after login.
 */

import {
  OAuthError,
  OAuthErrorCode,
  bearerAuthChallengeResponse,
  getOAuthProtectedResourceMetadataUrl,
  oauthMetadataResponse,
  verifyBearerToken,
  type AuthInfo,
  type AuthMetadataOptions,
  type OAuthMetadata,
  type OAuthTokenVerifier,
} from "@modelcontextprotocol/server";
import { decodeJwtPayload } from "../auth/jwt-payload.js";
import { getRundeckAuthMode } from "../auth/rundeck-auth-mode.js";
import { logger } from "../utils/logger.js";
import type { IncomingMessage } from "node:http";
import { writeWebResponse } from "./write-node-response.js";

export { writeWebResponse };

export interface McpOAuthRuntime {
  authMetadata: AuthMetadataOptions;
  resourceMetadataUrl: string;
  verifier: OAuthTokenVerifier;
  /** Upstream IdP token URL (Google, Auth0, …) — clients must not call this directly. */
  upstreamTokenEndpoint: string;
}

const OAUTH_TOKEN_PATH = "/oauth/token";

export function mcpOAuthTokenEndpointUrl(resourceServerUrl: URL): string {
  return `${resourceServerUrl.origin}${OAUTH_TOKEN_PATH}`;
}

/** Three-segment base64url shape; does not verify signature. */
export function isJwtFormat(token: string): boolean {
  const parts = token.split(".");
  return parts.length === 3 && parts.every((p) => p.length > 0);
}

/**
 * Google (and some IdPs) return an opaque `access_token` plus a JWT `id_token`.
 * Rundeck OAuth RS expects a JWT Bearer — swap when upstream access_token is not JWT-shaped.
 * Override with MCP_OAUTH_ACCESS_TOKEN=id_token|upstream|auto (default auto).
 */
export function resolveMcpAccessToken(upstreamBody: Record<string, unknown>): void {
  const mode = process.env.MCP_OAUTH_ACCESS_TOKEN?.trim().toLowerCase() ?? "auto";
  const access = asString(upstreamBody.access_token);
  const idToken = asString(upstreamBody.id_token);

  if (mode === "upstream") {
    return;
  }
  if (mode === "id_token") {
    if (idToken) {
      upstreamBody.access_token = idToken;
    }
    return;
  }
  if (idToken && access && !isJwtFormat(access)) {
    upstreamBody.access_token = idToken;
  }
}

export function applyMcpTokenEndpointProxy(
  metadata: OAuthMetadata,
  resourceServerUrl: URL
): OAuthMetadata {
  if (process.env.MCP_OAUTH_PROXY_TOKEN === "0" || process.env.MCP_OAUTH_PROXY_TOKEN === "false") {
    return metadata;
  }
  return {
    ...metadata,
    token_endpoint: mcpOAuthTokenEndpointUrl(resourceServerUrl),
  };
}

function issuerBase(): string | undefined {
  const raw = process.env.OIDC_ISSUER?.trim();
  if (!raw) {
    return undefined;
  }
  return raw.replace(/\/+$/, "");
}

function allowInsecureIssuer(): boolean {
  return process.env.MCP_DANGEROUSLY_ALLOW_INSECURE_ISSUER_URL === "1";
}

export function isMcpClientOAuthEnabled(): boolean {
  if (process.env.MCP_OAUTH === "0" || process.env.MCP_OAUTH === "false") {
    return false;
  }
  return !!issuerBase();
}

async function fetchOidcDiscovery(issuer: string): Promise<Record<string, unknown>> {
  const url = `${issuer}/.well-known/openid-configuration`;
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) {
    throw new Error(`OIDC discovery failed: GET ${url} → ${response.status}`);
  }
  return (await response.json()) as Record<string, unknown>;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/** Map OIDC discovery JSON to RFC 8414 metadata the MCP SDK expects. */
export function oauthMetadataFromDiscovery(
  issuer: string,
  doc: Record<string, unknown>
): OAuthMetadata {
  const resolvedIssuer = asString(doc.issuer) ?? issuer;
  const authorizationEndpoint = asString(doc.authorization_endpoint);
  const tokenEndpoint = asString(doc.token_endpoint);
  if (!authorizationEndpoint || !tokenEndpoint) {
    throw new Error(
      "OIDC discovery document is missing authorization_endpoint or token_endpoint"
    );
  }
  const responseTypes = Array.isArray(doc.response_types_supported)
    ? doc.response_types_supported.filter((s): s is string => typeof s === "string")
    : ["code"];

  return {
    issuer: resolvedIssuer,
    authorization_endpoint: authorizationEndpoint,
    token_endpoint: tokenEndpoint,
    jwks_uri: asString(doc.jwks_uri),
    registration_endpoint: asString(doc.registration_endpoint),
    response_types_supported: responseTypes,
    ...(Array.isArray(doc.scopes_supported)
      ? {
          scopes_supported: doc.scopes_supported.filter(
            (s): s is string => typeof s === "string"
          ),
        }
      : {}),
    ...(Array.isArray(doc.code_challenge_methods_supported)
      ? {
          code_challenge_methods_supported: doc.code_challenge_methods_supported.filter(
            (s): s is string => typeof s === "string"
          ),
        }
      : {}),
  };
}

/** Accept Bearer tokens for MCP; Rundeck validates them on api_call. */
export const rundeckJwtPassthroughVerifier: OAuthTokenVerifier = {
  async verifyAccessToken(token: string): Promise<AuthInfo> {
    const trimmed = token.trim();
    if (!trimmed) {
      throw new OAuthError(OAuthErrorCode.InvalidToken, "Missing access token");
    }
    const jwtShaped = isJwtFormat(trimmed);
    if (process.env.MCP_DEBUG === "1" || process.env.MCP_DEBUG === "true") {
      const segments = trimmed.split(".").length;
      const prefix = trimmed.slice(0, Math.min(4, trimmed.length));
      logger.debug(
        `MCP Bearer token shape: segments=${segments} prefix=${prefix}… jwt=${jwtShaped}`
      );
    }
    if (getRundeckAuthMode() === "jwt_bearer" && !jwtShaped) {
      throw new OAuthError(
        OAuthErrorCode.InvalidToken,
        "Bearer must be a JWT for Rundeck (Google opaque access_token is not valid). " +
          "In Claude Code: /mcp → Clear authentication → Authenticate (browser login) so token exchange uses this server's /oauth/token proxy."
      );
    }
    const payload = decodeJwtPayload(trimmed);
    const exp = payload?.exp;
    if (typeof exp === "number" && exp < Date.now() / 1000) {
      throw new OAuthError(OAuthErrorCode.InvalidToken, "Token has expired");
    }
    const sub = payload?.sub;
    const azp = payload?.azp;
    const clientId =
      (typeof sub === "string" && sub.length > 0 && sub) ||
      (typeof azp === "string" && azp.length > 0 && azp) ||
      "bearer";
    const expiresAt =
      typeof exp === "number" && !Number.isNaN(exp)
        ? exp
        : Math.floor(Date.now() / 1000) + 86_400;
    return {
      token: trimmed,
      clientId,
      scopes: [],
      expiresAt,
    };
  },
};

export async function loadMcpOAuthRuntime(resourceServerUrl: URL): Promise<McpOAuthRuntime> {
  const issuer = issuerBase();
  if (!issuer) {
    throw new Error("OIDC_ISSUER is required for MCP client OAuth");
  }
  const doc = await fetchOidcDiscovery(issuer);
  const discovered = oauthMetadataFromDiscovery(issuer, doc);
  const upstreamTokenEndpoint = discovered.token_endpoint;
  const oauthMetadata = applyMcpTokenEndpointProxy(discovered, resourceServerUrl);
  const authMetadata: AuthMetadataOptions = {
    oauthMetadata,
    resourceServerUrl,
    resourceName: process.env.MCP_OAUTH_RESOURCE_NAME?.trim() || "Rundeck MCP",
    scopesSupported: process.env.MCP_OAUTH_SCOPES?.split(/[\s,]+/).filter(Boolean),
    dangerouslyAllowInsecureIssuerUrl: allowInsecureIssuer(),
  };
  const resourceMetadataUrl = getOAuthProtectedResourceMetadataUrl(resourceServerUrl);
  logger.info(
    `MCP client OAuth enabled — Protected Resource Metadata at ${resourceMetadataUrl}, AS ${oauthMetadata.issuer}` +
      (oauthMetadata.token_endpoint !== upstreamTokenEndpoint
        ? `, token exchange proxied at ${oauthMetadata.token_endpoint}`
        : "")
  );
  return {
    authMetadata,
    resourceMetadataUrl,
    verifier: rundeckJwtPassthroughVerifier,
    upstreamTokenEndpoint,
  };
}

function oauthGrantTypeFromFormBody(body: Buffer): string | undefined {
  try {
    return new URLSearchParams(body.toString("utf8")).get("grant_type") ?? undefined;
  } catch {
    return undefined;
  }
}

function tokenShapeForLog(token: unknown): string {
  if (typeof token !== "string" || token.length === 0) {
    return "missing";
  }
  return isJwtFormat(token) ? "jwt" : "opaque";
}

/** Forward OAuth token requests to the IdP; expose JWT as access_token for MCP/Rundeck clients. */
export async function proxyOAuthTokenRequest(
  req: IncomingMessage,
  upstreamTokenEndpoint: string
): Promise<Response> {
  if (req.method?.toUpperCase() !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  const body = Buffer.concat(chunks);
  const grantType = oauthGrantTypeFromFormBody(body);

  const contentType = req.headers["content-type"];
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(typeof contentType === "string" ? { "Content-Type": contentType } : {}),
  };
  const authorization = req.headers.authorization;
  if (typeof authorization === "string") {
    headers.Authorization = authorization;
  }

  const upstream = await fetch(upstreamTokenEndpoint, {
    method: "POST",
    headers,
    body,
  });

  const responseText = await upstream.text();
  const responseContentType =
    upstream.headers.get("content-type") ?? "application/json; charset=utf-8";

  if (!upstream.ok) {
    logger.info(
      `OAuth token proxy: grant_type=${grantType ?? "?"} upstream=${upstream.status} (no swap)`
    );
    return new Response(responseText, {
      status: upstream.status,
      headers: { "Content-Type": responseContentType },
    });
  }

  try {
    const json = JSON.parse(responseText) as Record<string, unknown>;
    const upstreamAccessShape = tokenShapeForLog(json.access_token);
    const hadIdToken = typeof json.id_token === "string" && json.id_token.length > 0;
    resolveMcpAccessToken(json);
    const clientAccessShape = tokenShapeForLog(json.access_token);
    logger.info(
      `OAuth token proxy: grant_type=${grantType ?? "?"} upstream=200 ` +
        `upstream_access=${upstreamAccessShape} had_id_token=${hadIdToken} ` +
        `client_access=${clientAccessShape} swapped=${upstreamAccessShape !== clientAccessShape}`
    );
    return new Response(JSON.stringify(json), {
      status: upstream.status,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  } catch {
    return new Response(responseText, {
      status: upstream.status,
      headers: { "Content-Type": responseContentType },
    });
  }
}

export async function serveMcpOAuthMetadata(
  request: Request,
  runtime: McpOAuthRuntime
): Promise<Response | undefined> {
  return oauthMetadataResponse(request, runtime.authMetadata);
}

/** 401/403 with WWW-Authenticate so MCP clients open the browser OAuth flow. */
export async function verifyMcpRequestBearer(
  authorizationHeader: string | undefined,
  runtime: McpOAuthRuntime
): Promise<AuthInfo | Response> {
  try {
    return await verifyBearerToken(authorizationHeader, {
      verifier: runtime.verifier,
      resourceMetadataUrl: runtime.resourceMetadataUrl,
    });
  } catch (error) {
    return bearerAuthChallengeResponse(error, {
      resourceMetadataUrl: runtime.resourceMetadataUrl,
    });
  }
}

export function missingBearerChallenge(runtime: McpOAuthRuntime): Response {
  return bearerAuthChallengeResponse(
    new OAuthError(OAuthErrorCode.InvalidToken, "Authorization required"),
    { resourceMetadataUrl: runtime.resourceMetadataUrl }
  );
}
