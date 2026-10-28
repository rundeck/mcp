/**
 * Proxies OIDC/OAuth authorization-server metadata from OIDC_ISSUER so MCP clients
 * (e.g. Cursor) can discover token endpoints from the MCP host without implementing
 * MCP Authorization (RFC 9728) on this server.
 */

import { logger } from "../utils/logger.js";

let cachedMetadata: Record<string, unknown> | undefined;
let cachedAt = 0;
const CACHE_MS = 5 * 60 * 1000;

function issuerBase(): string | undefined {
  const raw = process.env.OIDC_ISSUER?.trim();
  if (!raw) {
    return undefined;
  }
  return raw.replace(/\/+$/, "");
}

export function isOidcDiscoveryEnabled(): boolean {
  return !!issuerBase();
}

async function fetchDiscoveryDocument(): Promise<Record<string, unknown>> {
  const issuer = issuerBase();
  if (!issuer) {
    throw new Error("OIDC_ISSUER is not set");
  }
  const now = Date.now();
  if (cachedMetadata && now - cachedAt < CACHE_MS) {
    return cachedMetadata;
  }
  const url = `${issuer}/.well-known/openid-configuration`;
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) {
    throw new Error(`OIDC discovery failed: GET ${url} → ${response.status}`);
  }
  const doc = (await response.json()) as Record<string, unknown>;
  cachedMetadata = doc;
  cachedAt = now;
  logger.info(`OIDC discovery loaded from ${url}`);
  return doc;
}

const WELL_KNOWN_PATHS = new Set([
  "/.well-known/openid-configuration",
  "/.well-known/oauth-authorization-server",
]);

export function isWellKnownDiscoveryPath(pathname: string): boolean {
  return WELL_KNOWN_PATHS.has(pathname);
}

export interface OidcDiscoveryServeOptions {
  /** When set, replaces IdP issuer/endpoints with the MCP OAuth proxy's (see mcp-oauth.ts). */
  overrides?: Record<string, unknown>;
}

/** Serve cached OIDC metadata JSON for Cursor / MCP client OAuth discovery. */
export async function serveOidcDiscovery(
  pathname: string,
  res: import("node:http").ServerResponse,
  options?: OidcDiscoveryServeOptions
): Promise<boolean> {
  if (!WELL_KNOWN_PATHS.has(pathname)) {
    return false;
  }
  if (!issuerBase()) {
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "OIDC_ISSUER is not configured on this MCP server" }));
    return true;
  }
  try {
    const doc = { ...(await fetchDiscoveryDocument()), ...options?.overrides };
    res.writeHead(200, {
      "content-type": "application/json",
      "cache-control": "public, max-age=300",
    });
    res.end(JSON.stringify(doc));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("OIDC discovery proxy error", error);
    res.writeHead(502, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "oidc_discovery_failed", message }));
  }
  return true;
}
