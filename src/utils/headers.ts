/**
 * Validation for user-configured extra HTTP headers (RUNDECK_EXTRA_HEADERS and
 * per-instance "headers" in RUNDECK_INSTANCES), e.g. the Cloudflare Access
 * headers some Rundeck deployments sit behind.
 *
 * Header values are frequently secrets, so no error message here ever includes
 * a value — only the (non-secret) name, JSON-quoted and length-capped so that a
 * malformed name can't smuggle control characters into a log line.
 */

export type ExtraHeaders = Record<string, string>;

export const MAX_EXTRA_HEADERS = 20;
const MAX_NAME_LENGTH = 128;
const MAX_VALUE_LENGTH = 4096;

// RFC 9110 `token`: the only characters allowed in a header field name.
const HEADER_NAME_PATTERN = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;
// Visible ASCII, space and tab. Rejects CR/LF (header injection), NUL and
// every other control or non-ASCII character.
const HEADER_VALUE_PATTERN = /^[\t\x20-\x7e]+$/;

// Names that could be used to replace the server's own auth/framing headers or
// to desync the request (smuggling), so they can never be user-supplied.
const RESERVED_HEADER_NAMES = new Set([
  "x-rundeck-auth-token",
  "content-type",
  "accept",
  "user-agent",
  "host",
  "content-length",
  "transfer-encoding",
  "connection",
  "keep-alive",
  "proxy-authorization",
  "proxy-connection",
  "te",
  "trailer",
  "upgrade",
  "expect",
]);

const UNSAFE_KEYS = new Set(["__proto__", "constructor", "prototype"]);

function describeName(name: string): string {
  return JSON.stringify(name.length > 40 ? `${name.slice(0, 40)}…` : name);
}

/**
 * Validates an untrusted value as a map of header name → value. Returns a
 * null-prototype copy on success, so the result is safe to spread or iterate.
 */
export function validateExtraHeaders(
  input: unknown,
  source: string
): { ok: true; headers: ExtraHeaders } | { ok: false; error: string } {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return { ok: false, error: `${source} must be a JSON object of header names to string values` };
  }

  const entries = Object.entries(input as Record<string, unknown>);
  if (entries.length > MAX_EXTRA_HEADERS) {
    return { ok: false, error: `${source} has more than ${MAX_EXTRA_HEADERS} headers` };
  }

  const headers: ExtraHeaders = Object.create(null);
  const seen = new Set<string>();
  for (const [name, value] of entries) {
    if (!name || name.length > MAX_NAME_LENGTH || !HEADER_NAME_PATTERN.test(name)) {
      return { ok: false, error: `${source} has an invalid header name ${describeName(name)}` };
    }
    const lower = name.toLowerCase();
    if (UNSAFE_KEYS.has(lower)) {
      return { ok: false, error: `${source} header name ${describeName(name)} is not allowed` };
    }
    if (RESERVED_HEADER_NAMES.has(lower)) {
      return {
        ok: false,
        error: `${source} header ${describeName(name)} is managed by the server and cannot be overridden`,
      };
    }
    if (seen.has(lower)) {
      return { ok: false, error: `${source} defines header ${describeName(name)} more than once` };
    }
    seen.add(lower);
    if (
      typeof value !== "string" ||
      value.length > MAX_VALUE_LENGTH ||
      !HEADER_VALUE_PATTERN.test(value)
    ) {
      return {
        ok: false,
        error:
          `${source} header ${describeName(name)} must be a non-empty string of printable ASCII ` +
          `(max ${MAX_VALUE_LENGTH} characters, no line breaks or control characters)`,
      };
    }
    headers[name] = value;
  }
  return { ok: true, headers };
}

/**
 * Overlay `override` on `base`, matching names case-insensitively (HTTP header
 * names are), so an instance's header replaces the global one of the same name
 * instead of both being sent.
 */
export function mergeExtraHeaders(base: ExtraHeaders, override: ExtraHeaders): ExtraHeaders {
  const byLower = new Map<string, [string, string]>();
  for (const source of [base, override]) {
    for (const [name, value] of Object.entries(source)) {
      byLower.set(name.toLowerCase(), [name, value]);
    }
  }
  const merged: ExtraHeaders = Object.create(null);
  for (const [name, value] of byLower.values()) {
    merged[name] = value;
  }
  return merged;
}
