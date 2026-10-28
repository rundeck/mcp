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
import { randomBytes } from "node:crypto";
import type { IncomingMessage } from "node:http";
import { writeWebResponse } from "./write-node-response.js";

export { writeWebResponse };

export interface McpOAuthRuntime {
  authMetadata: AuthMetadataOptions;
  resourceMetadataUrl: string;
  verifier: OAuthTokenVerifier;
  /** Upstream IdP token URL (Google, Auth0, …) — clients must not call this directly. */
  upstreamTokenEndpoint: string;
  /** Upstream IdP authorization URL; the MCP `/oauth/authorize` redirects here when proxying. */
  upstreamAuthorizationEndpoint: string;
  /** MCP `/oauth/callback` URL registered with the IdP; undefined when the proxy is off. */
  callbackUrl?: string;
}

export const OAUTH_AUTHORIZE_PATH = "/oauth/authorize";
export const OAUTH_CALLBACK_PATH = "/oauth/callback";
export const OAUTH_TOKEN_PATH = "/oauth/token";

export function mcpOAuthTokenEndpointUrl(resourceServerUrl: URL): string {
  return `${resourceServerUrl.origin}${OAUTH_TOKEN_PATH}`;
}

export function isMcpOAuthProxyEnabled(): boolean {
  return (
    process.env.MCP_OAUTH_PROXY_TOKEN !== "0" && process.env.MCP_OAUTH_PROXY_TOKEN !== "false"
  );
}

/**
 * Metadata fields the MCP rewrites to its own origin when proxying OAuth. Clients must see
 * this server as the authorization server end to end: PRM `authorization_servers` derives
 * from `issuer`, and RFC 9207 clients compare the callback `iss` against it.
 */
export function mcpOAuthProxyMetadataOverrides(resourceServerUrl: URL): {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  authorization_response_iss_parameter_supported: true;
} {
  const origin = resourceServerUrl.origin;
  return {
    issuer: origin,
    authorization_endpoint: `${origin}${OAUTH_AUTHORIZE_PATH}`,
    token_endpoint: `${origin}${OAUTH_TOKEN_PATH}`,
    authorization_response_iss_parameter_supported: true,
  };
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
  if (!isMcpOAuthProxyEnabled()) {
    return metadata;
  }
  return {
    ...metadata,
    ...mcpOAuthProxyMetadataOverrides(resourceServerUrl),
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
  const upstreamAuthorizationEndpoint = discovered.authorization_endpoint;
  const callbackUrl = isMcpOAuthProxyEnabled()
    ? `${resourceServerUrl.origin}${OAUTH_CALLBACK_PATH}`
    : undefined;
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
      (callbackUrl
        ? `, OAuth proxied via ${oauthMetadata.authorization_endpoint} → ${upstreamAuthorizationEndpoint}` +
          ` (register ${callbackUrl} as a redirect URI with the IdP)`
        : "")
  );
  return {
    authMetadata,
    resourceMetadataUrl,
    verifier: rundeckJwtPassthroughVerifier,
    upstreamTokenEndpoint,
    upstreamAuthorizationEndpoint,
    callbackUrl,
  };
}

interface PendingAuthorization {
  clientRedirectUri: string;
  clientState?: string;
  expiresAt: number;
}

const PENDING_AUTHORIZATION_TTL_MS = 10 * 60 * 1000;
const pendingAuthorizations = new Map<string, PendingAuthorization>();

function prunePendingAuthorizations(now: number): void {
  for (const [key, entry] of pendingAuthorizations) {
    if (entry.expiresAt <= now) {
      pendingAuthorizations.delete(key);
    }
  }
}

/**
 * Codes are only redeemable with the client's secret/PKCE verifier, but still limit where they
 * are sent: loopback redirect URIs (Claude Code, Inspector) plus MCP_OAUTH_ALLOWED_REDIRECT_URIS.
 */
export function isAllowedClientRedirectUri(redirectUri: string): boolean {
  const extra = (process.env.MCP_OAUTH_ALLOWED_REDIRECT_URIS ?? "")
    .split(/[\s,]+/)
    .filter(Boolean);
  if (extra.includes(redirectUri)) {
    return true;
  }
  let parsed: URL;
  try {
    parsed = new URL(redirectUri);
  } catch {
    return false;
  }
  return (
    parsed.protocol === "http:" &&
    (parsed.hostname === "localhost" ||
      parsed.hostname === "127.0.0.1" ||
      parsed.hostname === "[::1]")
  );
}

function oauthErrorPage(status: number, message: string): Response {
  return new Response(message, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

/**
 * `GET /oauth/authorize`: remember the client's redirect_uri/state, then send the browser to the
 * IdP with this server's callback. PKCE and every other parameter pass through untouched.
 */
export function handleOAuthAuthorize(url: URL, runtime: McpOAuthRuntime): Response {
  if (!runtime.callbackUrl) {
    return oauthErrorPage(404, "OAuth authorization proxy is disabled");
  }
  const clientRedirectUri = url.searchParams.get("redirect_uri");
  if (!clientRedirectUri) {
    return oauthErrorPage(400, "invalid_request: redirect_uri is required");
  }
  if (!isAllowedClientRedirectUri(clientRedirectUri)) {
    return oauthErrorPage(
      400,
      `invalid_request: redirect_uri ${clientRedirectUri} is not allowed ` +
        "(loopback only; add it to MCP_OAUTH_ALLOWED_REDIRECT_URIS)"
    );
  }

  const now = Date.now();
  prunePendingAuthorizations(now);
  const key = randomBytes(24).toString("base64url");
  pendingAuthorizations.set(key, {
    clientRedirectUri,
    clientState: url.searchParams.get("state") ?? undefined,
    expiresAt: now + PENDING_AUTHORIZATION_TTL_MS,
  });

  const upstream = new URL(runtime.upstreamAuthorizationEndpoint);
  for (const [name, value] of url.searchParams) {
    upstream.searchParams.append(name, value);
  }
  upstream.searchParams.set("redirect_uri", runtime.callbackUrl);
  upstream.searchParams.set("state", key);
  return new Response(null, { status: 302, headers: { Location: upstream.toString() } });
}

/**
 * `GET /oauth/callback`: return the IdP's code (or error) to the client's redirect_uri with its
 * original state and this server as `iss` (RFC 9207).
 */
export function handleOAuthCallback(url: URL, runtime: McpOAuthRuntime): Response {
  const key = url.searchParams.get("state");
  const pending = key ? pendingAuthorizations.get(key) : undefined;
  if (!key || !pending || pending.expiresAt <= Date.now()) {
    if (key) {
      pendingAuthorizations.delete(key);
    }
    return oauthErrorPage(
      400,
      "invalid_request: unknown or expired OAuth state — restart the login from your MCP client"
    );
  }
  pendingAuthorizations.delete(key);

  const target = new URL(pending.clientRedirectUri);
  for (const name of ["code", "error", "error_description", "error_uri"]) {
    const value = url.searchParams.get(name);
    if (value !== null) {
      target.searchParams.set(name, value);
    }
  }
  if (pending.clientState !== undefined) {
    target.searchParams.set("state", pending.clientState);
  }
  target.searchParams.set("iss", runtime.authMetadata.oauthMetadata.issuer);
  return new Response(null, { status: 302, headers: { Location: target.toString() } });
}

/**
 * The IdP issued the code for this server's callback, so the code exchange must present that
 * redirect_uri (not the client's) or the IdP rejects it.
 */
export function rewriteTokenRequestRedirectUri(
  body: Buffer,
  contentType: string | undefined,
  callbackUrl: string | undefined
): Buffer {
  if (!callbackUrl || !contentType?.toLowerCase().includes("application/x-www-form-urlencoded")) {
    return body;
  }
  const params = new URLSearchParams(body.toString("utf8"));
  if (params.get("grant_type") !== "authorization_code" || !params.has("redirect_uri")) {
    return body;
  }
  params.set("redirect_uri", callbackUrl);
  return Buffer.from(params.toString(), "utf8");
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
  upstreamTokenEndpoint: string,
  callbackUrl?: string
): Promise<Response> {
  if (req.method?.toUpperCase() !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  const contentType = req.headers["content-type"];
  const body = rewriteTokenRequestRedirectUri(
    Buffer.concat(chunks),
    typeof contentType === "string" ? contentType : undefined,
    callbackUrl
  );
  const grantType = oauthGrantTypeFromFormBody(body);

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
    body: new Uint8Array(body),
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
