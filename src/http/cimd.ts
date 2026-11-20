/**
 * OAuth Client ID Metadata Documents (CIMD, draft-ietf-oauth-client-id-metadata-document).
 *
 * A client such as claude.ai identifies itself with an https URL as `client_id`; the document at
 * that URL lists its `redirect_uris`. The MCP only accepts documents from allowlisted hosts and
 * fetches them defensively (no private addresses, no redirects, timeout, size cap, cache), since
 * the URL comes from an unauthenticated request.
 */

import { lookup as dnsLookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";
import { logger } from "../utils/logger.js";

export interface ClientMetadataDocument {
  client_id: string;
  redirect_uris: string[];
  client_name?: string;
}

export interface CimdFetchOptions {
  fetchImpl?: typeof fetch;
  /** Resolves a hostname to every address it maps to. */
  resolve?: (hostname: string) => Promise<string[]>;
  now?: () => number;
}

const FETCH_TIMEOUT_MS = 5_000;
/** The draft recommends documents stay small; 5 KB is the limit it suggests servers may apply. */
const MAX_DOCUMENT_BYTES = 5 * 1024;
const CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_CACHE_ENTRIES = 100;

/** Hosts allowed by Rundeck's Protected Resource Metadata (`rundeck_mcp_allowed_clients`). */
let discoveredAllowedHosts: string[] | undefined;

export function setDiscoveredCimdAllowedHosts(hosts: string[] | undefined): void {
  discoveredAllowedHosts = hosts;
}

/** `MCP_OAUTH_CIMD=0|false` turns CIMD off; it is on by default (still needs an allowlist). */
export function isCimdEnabled(): boolean {
  const raw = process.env.MCP_OAUTH_CIMD?.trim().toLowerCase();
  return raw !== "0" && raw !== "false";
}

/** `MCP_OAUTH_CIMD_ALLOWED_HOSTS` overrides the list Rundeck publishes; empty allows none. */
export function cimdAllowedHosts(): string[] {
  const env = process.env.MCP_OAUTH_CIMD_ALLOWED_HOSTS;
  const hosts = env !== undefined ? env.split(/[\s,]+/) : (discoveredAllowedHosts ?? []);
  return hosts.map((h) => h.trim().toLowerCase()).filter(Boolean);
}

/** Local development only: allow http documents and private/loopback addresses. */
function allowPrivate(): boolean {
  return process.env.MCP_OAUTH_CIMD_DANGEROUSLY_ALLOW_PRIVATE === "1";
}

/** A CIMD client id is an https URL with a path (not a bare origin), no fragment or credentials. */
export function isCimdClientId(clientId: string | null | undefined): clientId is string {
  if (!clientId) {
    return false;
  }
  let url: URL;
  try {
    url = new URL(clientId);
  } catch {
    return false;
  }
  const schemeOk = url.protocol === "https:" || (allowPrivate() && url.protocol === "http:");
  return schemeOk && url.pathname !== "/" && !url.hash && !url.username && !url.password;
}

/** Exact host match, or `*.example.com` for any subdomain of example.com. */
export function isCimdHostAllowed(hostname: string, allowed: string[] = cimdAllowedHosts()): boolean {
  const host = hostname.toLowerCase();
  return allowed.some((entry) =>
    entry.startsWith("*.") ? host.endsWith(entry.slice(1)) && host !== entry.slice(2) : host === entry
  );
}

const privateRanges = new BlockList();
for (const [net, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const) {
  privateRanges.addSubnet(net, prefix, "ipv4");
}
for (const [net, prefix] of [
  ["::", 128],
  ["::1", 128],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
] as const) {
  privateRanges.addSubnet(net, prefix, "ipv6");
}

/** True for loopback, private, link-local, CGNAT, multicast and reserved addresses. */
export function isPrivateAddress(address: string): boolean {
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address);
  if (mapped) {
    return privateRanges.check(mapped[1], "ipv4");
  }
  const family = isIP(address);
  if (family === 4) {
    return privateRanges.check(address, "ipv4");
  }
  if (family === 6) {
    return privateRanges.check(address, "ipv6");
  }
  return true;
}

async function defaultResolve(hostname: string): Promise<string[]> {
  const records = await dnsLookup(hostname, { all: true });
  return records.map((r) => r.address);
}

async function readLimited(response: Response): Promise<string> {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_DOCUMENT_BYTES) {
    throw new Error(`document is larger than ${MAX_DOCUMENT_BYTES} bytes`);
  }
  if (!response.body) {
    return "";
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    total += value.byteLength;
    if (total > MAX_DOCUMENT_BYTES) {
      await reader.cancel();
      throw new Error(`document is larger than ${MAX_DOCUMENT_BYTES} bytes`);
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

/** Validates a fetched document against the URL it was fetched from. */
export function parseClientMetadataDocument(
  doc: unknown,
  clientIdUrl: string
): ClientMetadataDocument {
  if (!doc || typeof doc !== "object") {
    throw new Error("document is not a JSON object");
  }
  const record = doc as Record<string, unknown>;
  if (record.client_id !== clientIdUrl) {
    throw new Error("document client_id does not match the URL it was fetched from");
  }
  const redirectUris = record.redirect_uris;
  if (
    !Array.isArray(redirectUris) ||
    redirectUris.length === 0 ||
    !redirectUris.every((u) => typeof u === "string" && u.length > 0)
  ) {
    throw new Error("document has no redirect_uris");
  }
  // The proxy only supports public clients; a document asking for a shared secret is invalid.
  const authMethod = record.token_endpoint_auth_method;
  if (authMethod !== undefined && authMethod !== "none") {
    throw new Error(`token_endpoint_auth_method ${String(authMethod)} is not supported`);
  }
  return {
    client_id: clientIdUrl,
    redirect_uris: redirectUris as string[],
    ...(typeof record.client_name === "string" ? { client_name: record.client_name } : {}),
  };
}

const cache = new Map<string, { doc: ClientMetadataDocument; expiresAt: number }>();

export function clearCimdCache(): void {
  cache.clear();
}

/**
 * Fetches and validates the client's metadata document. The host must be allowlisted and resolve
 * only to public addresses; redirects are refused so the checked host is the one fetched.
 */
export async function fetchClientMetadataDocument(
  clientIdUrl: string,
  options: CimdFetchOptions = {}
): Promise<ClientMetadataDocument> {
  const now = (options.now ?? Date.now)();
  const cached = cache.get(clientIdUrl);
  if (cached && cached.expiresAt > now) {
    return cached.doc;
  }

  if (!isCimdClientId(clientIdUrl)) {
    throw new Error("client_id is not a valid client metadata document URL");
  }
  const url = new URL(clientIdUrl);
  if (!isCimdHostAllowed(url.hostname)) {
    throw new Error(`client host ${url.hostname} is not allowed (MCP_OAUTH_CIMD_ALLOWED_HOSTS)`);
  }
  if (!allowPrivate()) {
    const hostname = url.hostname.replace(/^\[|\]$/g, "");
    const addresses = isIP(hostname) ? [hostname] : await (options.resolve ?? defaultResolve)(hostname);
    if (addresses.length === 0 || addresses.some(isPrivateAddress)) {
      throw new Error(`client host ${url.hostname} resolves to a private address`);
    }
  }

  const response = await (options.fetchImpl ?? fetch)(clientIdUrl, {
    headers: { Accept: "application/json" },
    redirect: "error",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`fetching the client metadata document returned HTTP ${response.status}`);
  }
  const text = await readLimited(response);
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error("client metadata document is not valid JSON");
  }
  const doc = parseClientMetadataDocument(json, clientIdUrl);

  if (cache.size >= MAX_CACHE_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) {
      cache.delete(oldest);
    }
  }
  cache.set(clientIdUrl, { doc, expiresAt: now + CACHE_TTL_MS });
  logger.info(`CIMD: accepted client ${clientIdUrl}${doc.client_name ? ` (${doc.client_name})` : ""}`);
  return doc;
}
