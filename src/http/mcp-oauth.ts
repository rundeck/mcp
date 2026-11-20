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
import { discoverRundeckAuth, isRundeckIssuerDiscoveryEnabled } from "./rundeck-auth-discovery.js";
import {
  fetchClientMetadataDocument,
  isCimdClientId,
  isCimdEnabled,
  setDiscoveredCimdAllowedHosts,
  type CimdFetchOptions,
} from "./cimd.js";
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
  /** Pre-registered IdP client for RFC 7591-style registration at `/oauth/register`. */
  registeredClientId?: string;
  /** IdP client secret injected server-side on token exchange (never exposed to MCP clients). */
  registeredClientSecret?: string;
  /** True when proxy is on, a client id is known and DCR is turned on (off by default). */
  dcrEnabled: boolean;
}

export const OAUTH_AUTHORIZE_PATH = "/oauth/authorize";
export const OAUTH_CALLBACK_PATH = "/oauth/callback";
export const OAUTH_TOKEN_PATH = "/oauth/token";
export const OAUTH_REGISTER_PATH = "/oauth/register";

/** Client id read from Rundeck's metadata at startup; MCP_OAUTH_CLIENT_ID overrides it. */
let discoveredClientId: string | undefined;

export function setDiscoveredClientId(clientId: string | undefined): void {
  discoveredClientId = clientId;
}

export function mcpOAuthRegisteredClientId(): string | undefined {
  const id = process.env.MCP_OAUTH_CLIENT_ID?.trim();
  return id && id.length > 0 ? id : discoveredClientId;
}

export function mcpOAuthRegisteredClientSecret(): string | undefined {
  const secret = process.env.MCP_OAUTH_CLIENT_SECRET?.trim();
  return secret && secret.length > 0 ? secret : undefined;
}

/** DCR setting read from Rundeck's metadata (`rundeck_mcp_dcr_enabled`); MCP_OAUTH_DCR overrides it. */
let discoveredDcrEnabled: boolean | undefined;

export function setDiscoveredDcrEnabled(enabled: boolean | undefined): void {
  discoveredDcrEnabled = enabled;
}

function dcrSetting(): boolean {
  const raw = process.env.MCP_OAUTH_DCR?.trim().toLowerCase();
  if (raw === "1" || raw === "true") {
    return true;
  }
  if (raw === "0" || raw === "false") {
    return false;
  }
  return discoveredDcrEnabled ?? false;
}

/**
 * The DCR stub hands every caller the same IdP client id, so it is a fallback for clients that
 * support neither CIMD nor a pre-configured client id. Off unless MCP_OAUTH_DCR (or Rundeck) turns it on.
 */
export function isMcpDcrEnabled(): boolean {
  return isMcpOAuthProxyEnabled() && !!mcpOAuthRegisteredClientId() && dcrSetting();
}

/** CIMD needs the proxy and a pre-registered IdP client the MCP signs in with on the client's behalf. */
export function isMcpCimdEnabled(): boolean {
  return isMcpOAuthProxyEnabled() && isCimdEnabled() && !!mcpOAuthRegisteredClientId();
}

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

const DCR_TOKEN_AUTH_METHODS = ["none", "client_secret_post", "client_secret_basic"] as const;

/** Proxy + optional DCR fields for OIDC discovery and OAuth AS metadata. */
export function mcpOAuthDiscoveryOverrides(resourceServerUrl: URL): Record<string, unknown> {
  const merged: Record<string, unknown> = {
    ...mcpOAuthProxyMetadataOverrides(resourceServerUrl),
    code_challenge_methods_supported: ["S256"],
  };
  if (isMcpCimdEnabled()) {
    merged.client_id_metadata_document_supported = true;
  }
  if (isMcpDcrEnabled()) {
    merged.registration_endpoint = `${resourceServerUrl.origin}${OAUTH_REGISTER_PATH}`;
    merged.token_endpoint_auth_methods_supported = [...DCR_TOKEN_AUTH_METHODS];
  } else if (isMcpOAuthProxyEnabled()) {
    merged.registration_endpoint = undefined;
  }
  return merged;
}

function applyProxyAndDcrToOAuthMetadata(
  metadata: OAuthMetadata,
  resourceServerUrl: URL
): OAuthMetadata {
  const overrides = mcpOAuthDiscoveryOverrides(resourceServerUrl);
  const next: OAuthMetadata = {
    ...metadata,
    issuer: overrides.issuer as string,
    authorization_endpoint: overrides.authorization_endpoint as string,
    token_endpoint: overrides.token_endpoint as string,
    authorization_response_iss_parameter_supported: true,
    code_challenge_methods_supported: ["S256"],
  };
  if (isMcpCimdEnabled()) {
    (next as Record<string, unknown>).client_id_metadata_document_supported = true;
  }
  if (isMcpDcrEnabled()) {
    next.registration_endpoint = overrides.registration_endpoint as string;
    next.token_endpoint_auth_methods_supported = [...DCR_TOKEN_AUTH_METHODS];
  } else if (isMcpOAuthProxyEnabled()) {
    delete next.registration_endpoint;
  }
  return next;
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
  return applyProxyAndDcrToOAuthMetadata(metadata, resourceServerUrl);
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
  return !!issuerBase() || isRundeckIssuerDiscoveryEnabled();
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
  // An explicit OIDC_ISSUER wins; otherwise ask Rundeck which issuer it trusts.
  let issuer = issuerBase();
  let discoveredScopes: string[] | undefined;
  if (!issuer && isRundeckIssuerDiscoveryEnabled()) {
    const discovered = await discoverRundeckAuth();
    issuer = discovered.issuer;
    discoveredScopes = discovered.scopes;
    setDiscoveredClientId(discovered.clientId);
    setDiscoveredCimdAllowedHosts(discovered.allowedClients);
    setDiscoveredDcrEnabled(discovered.dcrEnabled);
  }
  if (!issuer) {
    throw new Error("OIDC_ISSUER (or MCP_OAUTH_ISSUER_DISCOVERY=rundeck) is required for MCP client OAuth");
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
    scopesSupported:
      process.env.MCP_OAUTH_SCOPES?.split(/[\s,]+/).filter(Boolean) ?? discoveredScopes,
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
  const registeredClientId = mcpOAuthRegisteredClientId();
  const registeredClientSecret = mcpOAuthRegisteredClientSecret();
  const dcrEnabled = isMcpDcrEnabled();
  if (dcrEnabled) {
    logger.info(
      `MCP OAuth DCR enabled at ${resourceServerUrl.origin}${OAUTH_REGISTER_PATH} ` +
        `(client_id=${registeredClientId}; IdP secret stays on server)`
    );
  }
  if (isMcpCimdEnabled()) {
    logger.info(
      `MCP OAuth CIMD enabled — https client ids from allowed hosts sign in through IdP client ${registeredClientId}`
    );
  }
  return {
    authMetadata,
    resourceMetadataUrl,
    verifier: rundeckJwtPassthroughVerifier,
    upstreamTokenEndpoint,
    upstreamAuthorizationEndpoint,
    callbackUrl,
    registeredClientId,
    registeredClientSecret,
    dcrEnabled,
  };
}

interface PendingAuthorization {
  clientId?: string;
  clientRedirectUri: string;
  clientState?: string;
  expiresAt: number;
}

/** A code the IdP returned through `/oauth/callback`, bound to the client that asked for it. */
interface IssuedCode {
  clientId?: string;
  clientRedirectUri: string;
  expiresAt: number;
}

const PENDING_AUTHORIZATION_TTL_MS = 10 * 60 * 1000;
const pendingAuthorizations = new Map<string, PendingAuthorization>();
const issuedCodes = new Map<string, IssuedCode>();

function prunePendingAuthorizations(now: number): void {
  for (const store of [pendingAuthorizations, issuedCodes]) {
    for (const [key, entry] of store) {
      if (entry.expiresAt <= now) {
        store.delete(key);
      }
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
 * Checks who may receive the code. A CIMD client id (https URL) must come from an allowed host and
 * its metadata document must list the redirect_uri; any other client gets loopback redirect URIs
 * only (Claude Code, Inspector) plus MCP_OAUTH_ALLOWED_REDIRECT_URIS. Returns an error, or undefined.
 */
async function checkAuthorizeClient(
  clientId: string | null,
  redirectUri: string,
  cimdOptions?: CimdFetchOptions
): Promise<string | undefined> {
  if (isCimdClientId(clientId)) {
    if (!isMcpCimdEnabled()) {
      return "invalid_client: client metadata documents are not enabled on this server";
    }
    try {
      const doc = await fetchClientMetadataDocument(clientId, cimdOptions);
      if (!doc.redirect_uris.includes(redirectUri)) {
        return `invalid_request: redirect_uri ${redirectUri} is not registered for ${clientId}`;
      }
      return undefined;
    } catch (error) {
      logger.warn(`CIMD: rejected client ${clientId}: ${error instanceof Error ? error.message : String(error)}`);
      return `invalid_client: ${error instanceof Error ? error.message : "client metadata document rejected"}`;
    }
  }
  if (!isAllowedClientRedirectUri(redirectUri)) {
    return (
      `invalid_request: redirect_uri ${redirectUri} is not allowed ` +
      "(loopback only; add it to MCP_OAUTH_ALLOWED_REDIRECT_URIS)"
    );
  }
  return undefined;
}

/**
 * `GET /oauth/authorize`: check the client, remember its client_id/redirect_uri/state, then send the
 * browser to the IdP with this server's callback. PKCE (S256) is required and passes through to the IdP.
 */
export async function handleOAuthAuthorize(
  url: URL,
  runtime: McpOAuthRuntime,
  cimdOptions?: CimdFetchOptions
): Promise<Response> {
  if (!runtime.callbackUrl) {
    return oauthErrorPage(404, "OAuth authorization proxy is disabled");
  }
  const clientRedirectUri = url.searchParams.get("redirect_uri");
  if (!clientRedirectUri) {
    return oauthErrorPage(400, "invalid_request: redirect_uri is required");
  }
  if (!url.searchParams.get("code_challenge") || url.searchParams.get("code_challenge_method") !== "S256") {
    return oauthErrorPage(400, "invalid_request: PKCE with code_challenge_method=S256 is required");
  }
  const clientId = url.searchParams.get("client_id");
  const clientError = await checkAuthorizeClient(clientId, clientRedirectUri, cimdOptions);
  if (clientError) {
    return oauthErrorPage(400, clientError);
  }
  const cimdClient = isCimdClientId(clientId);

  const now = Date.now();
  prunePendingAuthorizations(now);
  const key = randomBytes(24).toString("base64url");
  pendingAuthorizations.set(key, {
    clientId: clientId ?? undefined,
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
  if (runtime.registeredClientId) {
    const incomingClientId = upstream.searchParams.get("client_id");
    // A CIMD client is not known to the IdP: the MCP signs in with its own registered client.
    if (cimdClient || !incomingClientId || incomingClientId === runtime.registeredClientId) {
      upstream.searchParams.set("client_id", runtime.registeredClientId);
    }
  }
  return new Response(null, { status: 302, headers: { Location: upstream.toString() } });
}

export interface OAuthRegisterRequestBody {
  redirect_uris?: unknown;
  client_name?: unknown;
}

/** RFC 7591 registration stub: all dynamic clients share the pre-registered IdP client_id. */
export function handleOAuthRegister(
  body: OAuthRegisterRequestBody,
  runtime: McpOAuthRuntime
): Response {
  if (!runtime.dcrEnabled || !runtime.registeredClientId) {
    return new Response(JSON.stringify({ error: "not_found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }
  const redirectUris = body.redirect_uris;
  if (!Array.isArray(redirectUris) || redirectUris.length === 0) {
    return new Response(JSON.stringify({ error: "invalid_redirect_uri" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  for (const uri of redirectUris) {
    if (typeof uri !== "string" || !isAllowedClientRedirectUri(uri)) {
      return new Response(JSON.stringify({ error: "invalid_redirect_uri" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
  }
  const clientName =
    typeof body.client_name === "string" && body.client_name.length > 0
      ? body.client_name
      : undefined;
  return new Response(
    JSON.stringify({
      client_id: runtime.registeredClientId,
      client_id_issued_at: Math.floor(Date.now() / 1000),
      redirect_uris: redirectUris,
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
      ...(clientName ? { client_name: clientName } : {}),
    }),
    { status: 201, headers: { "Content-Type": "application/json; charset=utf-8" } }
  );
}

export async function readOAuthRegisterBody(req: IncomingMessage): Promise<OAuthRegisterRequestBody> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  if (chunks.length === 0) {
    return {};
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as OAuthRegisterRequestBody;
  } catch {
    return {};
  }
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

  const code = url.searchParams.get("code");
  if (code) {
    issuedCodes.set(code, {
      clientId: pending.clientId,
      clientRedirectUri: pending.clientRedirectUri,
      expiresAt: Date.now() + PENDING_AUTHORIZATION_TTL_MS,
    });
  }

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

function tokenError(error: string, description: string): Response {
  return new Response(JSON.stringify({ error, error_description: description }), {
    status: 400,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

/**
 * Binds the token request to its authorize request: the code must have come through this server's
 * callback, and client_id, redirect_uri and a PKCE code_verifier must match it. A CIMD client id is
 * then replaced with the MCP's registered IdP client id, the one the IdP issued the code to.
 * Returns the (possibly rewritten) body or an error response.
 */
export function checkTokenRequest(
  body: Buffer,
  contentType: string | undefined,
  registeredClientId: string | undefined
): Buffer | Response {
  if (!contentType?.toLowerCase().includes("application/x-www-form-urlencoded")) {
    return tokenError("invalid_request", "token requests must be application/x-www-form-urlencoded");
  }
  const params = new URLSearchParams(body.toString("utf8"));
  const grantType = params.get("grant_type");
  const clientId = params.get("client_id");

  if (grantType === "authorization_code") {
    prunePendingAuthorizations(Date.now());
    const code = params.get("code");
    const issued = code ? issuedCodes.get(code) : undefined;
    if (!code || !issued) {
      return tokenError("invalid_grant", "unknown or expired authorization code");
    }
    issuedCodes.delete(code);
    if (issued.clientId && clientId !== issued.clientId) {
      return tokenError("invalid_grant", "client_id does not match the authorization request");
    }
    if (params.get("redirect_uri") !== issued.clientRedirectUri) {
      return tokenError("invalid_grant", "redirect_uri does not match the authorization request");
    }
    if (!params.get("code_verifier")) {
      return tokenError("invalid_request", "code_verifier is required (PKCE)");
    }
  }

  if (isCimdClientId(clientId)) {
    if (!isMcpCimdEnabled() || !registeredClientId) {
      return tokenError("invalid_client", "client metadata documents are not enabled on this server");
    }
    params.set("client_id", registeredClientId);
    return Buffer.from(params.toString(), "utf8");
  }
  return body;
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

/**
 * Inject IdP client_secret for DCR clients that use `token_endpoint_auth_method: none`.
 * Skips when the client already sent a secret or Authorization header (handled by caller).
 */
export function injectClientSecret(
  body: Buffer,
  contentType: string | undefined,
  registeredClientId: string | undefined,
  clientSecret: string | undefined
): Buffer {
  if (
    !registeredClientId ||
    !clientSecret ||
    !contentType?.toLowerCase().includes("application/x-www-form-urlencoded")
  ) {
    return body;
  }
  const params = new URLSearchParams(body.toString("utf8"));
  const grantType = params.get("grant_type");
  if (grantType !== "authorization_code" && grantType !== "refresh_token") {
    return body;
  }
  if (params.has("client_secret")) {
    return body;
  }
  const clientId = params.get("client_id");
  if (clientId && clientId !== registeredClientId) {
    return body;
  }
  if (!clientId) {
    params.set("client_id", registeredClientId);
  }
  params.set("client_secret", clientSecret);
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
  callbackUrl?: string,
  runtime?: Pick<McpOAuthRuntime, "registeredClientId" | "registeredClientSecret">
): Promise<Response> {
  if (req.method?.toUpperCase() !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  const contentType = req.headers["content-type"];
  const contentTypeStr = typeof contentType === "string" ? contentType : undefined;
  let body: Buffer = Buffer.concat(chunks);
  if (callbackUrl) {
    const checked = checkTokenRequest(body, contentTypeStr, runtime?.registeredClientId);
    if (checked instanceof Response) {
      return checked;
    }
    body = checked;
  }
  body = rewriteTokenRequestRedirectUri(body, contentTypeStr, callbackUrl);
  const authorization = req.headers.authorization;
  if (
    typeof authorization !== "string" &&
    runtime?.registeredClientId &&
    runtime.registeredClientSecret
  ) {
    body = injectClientSecret(
      body,
      contentTypeStr,
      runtime.registeredClientId,
      runtime.registeredClientSecret
    );
  }
  const grantType = oauthGrantTypeFromFormBody(body);

  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(contentTypeStr ? { "Content-Type": contentTypeStr } : {}),
  };
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
