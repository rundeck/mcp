/**
 * Discover which authorization server Rundeck trusts from Rundeck's own
 * Protected Resource Metadata (RFC 9728), so the MCP does not need OIDC_ISSUER.
 *
 * The metadata is public and holds no credentials (resource id, issuer URL, scopes).
 * Because it decides where users are sent to sign in, it is only read from the
 * configured RUNDECK_URL, over HTTPS, and the issuer can be pinned with
 * MCP_OAUTH_ALLOWED_ISSUERS.
 */

import { configManager } from "../config.js";
import { logger } from "../utils/logger.js";

export const RUNDECK_PRM_WELL_KNOWN = "/.well-known/oauth-protected-resource";
const DISCOVERY_TIMEOUT_MS = 10_000;

export interface RundeckAuthDiscovery {
  issuer: string;
  scopes?: string[];
  resource: string;
  metadataUrl: string;
}

/** `MCP_OAUTH_ISSUER_DISCOVERY=rundeck` opts in; an explicit OIDC_ISSUER always wins. */
export function isRundeckIssuerDiscoveryEnabled(): boolean {
  return process.env.MCP_OAUTH_ISSUER_DISCOVERY?.trim().toLowerCase() === "rundeck";
}

function allowInsecure(): boolean {
  return process.env.MCP_DANGEROUSLY_ALLOW_INSECURE_ISSUER_URL === "1";
}

function allowedIssuers(): string[] {
  return (process.env.MCP_OAUTH_ALLOWED_ISSUERS ?? "")
    .split(/[\s,]+/)
    .filter(Boolean)
    .map(stripTrailingSlash);
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function requireSecureUrl(raw: string, what: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`Rundeck auth discovery: ${what} is not a valid URL: ${raw}`);
  }
  if (url.protocol !== "https:" && !allowInsecure()) {
    throw new Error(
      `Rundeck auth discovery: ${what} must use https (${raw}); ` +
        "set MCP_DANGEROUSLY_ALLOW_INSECURE_ISSUER_URL=1 for local development only"
    );
  }
  return url;
}

/**
 * Candidate metadata URLs for a resource (RFC 9728 §3.1): the path-inserted form first
 * (`/.well-known/oauth-protected-resource/<path>`), then the origin root.
 */
export function rundeckMetadataUrls(rundeckUrl: URL): string[] {
  const path = stripTrailingSlash(rundeckUrl.pathname);
  const urls = [];
  if (path) {
    urls.push(`${rundeckUrl.origin}${RUNDECK_PRM_WELL_KNOWN}${path}`);
  }
  urls.push(`${rundeckUrl.origin}${RUNDECK_PRM_WELL_KNOWN}`);
  return urls;
}

/** Validates a metadata document against the Rundeck URL it was fetched for. */
export function parseRundeckMetadata(
  doc: Record<string, unknown>,
  rundeckUrl: URL,
  metadataUrl: string
): RundeckAuthDiscovery {
  const resource = typeof doc.resource === "string" ? doc.resource : undefined;
  if (!resource) {
    throw new Error(`Rundeck auth discovery: ${metadataUrl} has no "resource"`);
  }
  // RFC 9728 §3.3: a document describing some other resource must be ignored. Rundeck may
  // name its API (`/api`) rather than the base URL, so the origin is what has to match.
  let resourceOrigin: string | undefined;
  try {
    resourceOrigin = new URL(resource).origin;
  } catch {
    resourceOrigin = undefined;
  }
  if (resourceOrigin !== rundeckUrl.origin) {
    throw new Error(
      `Rundeck auth discovery: resource ${resource} does not match RUNDECK_URL ${rundeckUrl.href}`
    );
  }

  const servers = Array.isArray(doc.authorization_servers)
    ? doc.authorization_servers.filter((s): s is string => typeof s === "string")
    : [];
  if (servers.length === 0) {
    throw new Error(`Rundeck auth discovery: ${metadataUrl} lists no authorization_servers`);
  }
  if (servers.length > 1) {
    logger.warn(
      `Rundeck auth discovery: ${servers.length} authorization servers listed; using ${servers[0]}`
    );
  }
  const issuer = stripTrailingSlash(requireSecureUrl(servers[0], "authorization server").href);

  const pinned = allowedIssuers();
  if (pinned.length > 0 && !pinned.includes(issuer)) {
    throw new Error(
      `Rundeck auth discovery: issuer ${issuer} is not in MCP_OAUTH_ALLOWED_ISSUERS`
    );
  }

  const scopes = Array.isArray(doc.scopes_supported)
    ? doc.scopes_supported.filter((s): s is string => typeof s === "string")
    : undefined;

  return { issuer, scopes: scopes?.length ? scopes : undefined, resource, metadataUrl };
}

/** Reads Rundeck's Protected Resource Metadata and returns the issuer it trusts. */
export async function discoverRundeckAuth(): Promise<RundeckAuthDiscovery> {
  const raw = configManager.getConfig().rundeckUrl;
  if (!raw) {
    throw new Error("Rundeck auth discovery: RUNDECK_URL is required");
  }
  const rundeckUrl = requireSecureUrl(raw, "RUNDECK_URL");

  const failures: string[] = [];
  for (const metadataUrl of rundeckMetadataUrls(rundeckUrl)) {
    let response: Response;
    try {
      response = await fetch(metadataUrl, {
        headers: { Accept: "application/json" },
        redirect: "error",
        signal: AbortSignal.timeout(DISCOVERY_TIMEOUT_MS),
      });
    } catch (error) {
      failures.push(`${metadataUrl}: ${error instanceof Error ? error.message : String(error)}`);
      continue;
    }
    if (!response.ok) {
      failures.push(`${metadataUrl}: HTTP ${response.status}`);
      continue;
    }
    const discovered = parseRundeckMetadata(
      (await response.json()) as Record<string, unknown>,
      rundeckUrl,
      metadataUrl
    );
    logger.info(
      `Rundeck auth discovery: issuer ${discovered.issuer} from ${metadataUrl}` +
        (discovered.scopes ? ` (scopes ${discovered.scopes.join(" ")})` : "")
    );
    return discovered;
  }
  throw new Error(
    "Rundeck auth discovery failed — Rundeck does not publish Protected Resource Metadata " +
      `(${failures.join("; ")}). Set OIDC_ISSUER instead.`
  );
}
