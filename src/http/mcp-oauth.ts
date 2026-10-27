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
import { logger } from "../utils/logger.js";
import { writeWebResponse } from "./write-node-response.js";

export { writeWebResponse };

export interface McpOAuthRuntime {
  authMetadata: AuthMetadataOptions;
  resourceMetadataUrl: string;
  verifier: OAuthTokenVerifier;
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
  const oauthMetadata = oauthMetadataFromDiscovery(issuer, doc);
  const authMetadata: AuthMetadataOptions = {
    oauthMetadata,
    resourceServerUrl,
    resourceName: process.env.MCP_OAUTH_RESOURCE_NAME?.trim() || "Rundeck MCP",
    scopesSupported: process.env.MCP_OAUTH_SCOPES?.split(/[\s,]+/).filter(Boolean),
    dangerouslyAllowInsecureIssuerUrl: allowInsecureIssuer(),
  };
  const resourceMetadataUrl = getOAuthProtectedResourceMetadataUrl(resourceServerUrl);
  logger.info(
    `MCP client OAuth enabled — Protected Resource Metadata at ${resourceMetadataUrl}, AS ${oauthMetadata.issuer}`
  );
  return {
    authMetadata,
    resourceMetadataUrl,
    verifier: rundeckJwtPassthroughVerifier,
  };
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
