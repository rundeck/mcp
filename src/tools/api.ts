/**
 * API interaction tools
 */

import { z } from "zod";
import { configManager } from "../config.js";
import { listApiEndpoints } from "../resources/api.js";
import { loadOpenApiDocument, validateOpenApiRequest } from "../utils/openapi-validate.js";

/**
 * Node's `fetch` (undici) collapses every network-level failure into a generic
 * `TypeError: fetch failed`, with the actual reason nested one level down in
 * `error.cause` (e.g. a `code: "ECONNREFUSED"` error). Unwrap that so the tool's
 * error output — and the server log line index.ts prints from it — say what
 * actually went wrong instead of just "fetch failed".
 */
const NETWORK_ERROR_HINTS: Record<string, string> = {
  ECONNREFUSED: "the target refused the connection — is Rundeck actually running and listening there?",
  ENOTFOUND: "DNS lookup failed — check RUNDECK_URL for typos, or that the hostname resolves from where this server runs.",
  EHOSTUNREACH: "the host is unreachable — check network routing/VPN from where this server runs.",
  ETIMEDOUT: "the connection attempt timed out — check firewalls and that the host/port are correct.",
  ECONNRESET: "the connection was reset mid-request — Rundeck may have restarted, or a proxy/load balancer dropped it.",
  CERT_HAS_EXPIRED: "the server's TLS certificate has expired.",
  DEPTH_ZERO_SELF_SIGNED_CERT: "the server presented a self-signed TLS certificate that isn't trusted.",
  UNABLE_TO_VERIFY_LEAF_SIGNATURE: "the server's TLS certificate couldn't be verified against a trusted CA.",
};

function describeApiCallFailure(error: unknown, method: string, url: string): string {
  const err = error instanceof Error ? error : undefined;
  const cause = err && "cause" in err ? (err as { cause?: unknown }).cause : undefined;
  const causeErr = cause instanceof Error ? cause : undefined;
  const code = causeErr && "code" in causeErr ? (causeErr as NodeJS.ErrnoException).code : undefined;

  const reason = (code && NETWORK_ERROR_HINTS[code]) || causeErr?.message || err?.message || String(error);

  // The most common way to hit ECONNREFUSED/ENOTFOUND against "localhost" is running this
  // server inside Docker, where "localhost"/"127.0.0.1" resolves to the container itself.
  const dockerHint =
    (code === "ECONNREFUSED" || code === "ENOTFOUND") && /:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(url)
      ? " If this server is running inside Docker, 'localhost'/'127.0.0.1' points at the container itself, not " +
        "your host machine — use 'host.docker.internal' in RUNDECK_URL instead."
      : "";

  return `API call ${method} ${url} failed: ${code ? `${code} — ` : ""}${reason}${dockerHint}`;
}

/**
 * Execute a Rundeck API call
 */
export async function rundeckApiCall(params: {
  endpoint: string;
  method?: string;
  body?: unknown;
  query_params?: Record<string, string>;
  content_type?: string;
}): Promise<{
  status: number;
  headers: Record<string, string>;
  body: unknown;
}> {
  // Refresh config from environment if needed (getConfig() does this automatically)
  const config = configManager.getConfig();

  if (!config.rundeckUrl || !config.apiToken) {
    const missing = [];
    if (!config.rundeckUrl) missing.push("RUNDECK_URL");
    if (!config.apiToken) missing.push("RUNDECK_TOKEN");
    
    // Check if environment variables exist but weren't loaded
    const envCheck = [];
    if (process.env.RUNDECK_URL && !config.rundeckUrl) {
      envCheck.push("RUNDECK_URL exists in environment but wasn't loaded");
    }
    if (process.env.RUNDECK_TOKEN && !config.apiToken) {
      envCheck.push("RUNDECK_TOKEN exists in environment but wasn't loaded");
    }
    
    let errorMsg = `Rundeck not configured. Missing environment variables: ${missing.join(", ")}.\n\n`;
    errorMsg += "Set the required environment variables:\n";
    errorMsg += "  export RUNDECK_URL=https://rundeck.example.com\n";
    errorMsg += "  export RUNDECK_TOKEN=your-api-token\n\n";
    
    if (envCheck.length > 0) {
      errorMsg += `Note: ${envCheck.join("; ")}. The server may need to be restarted.\n\n`;
    }
    
    errorMsg +=
      "For a guided checklist, open the MCP prompt `setup-authentication` (or configure RUNDECK_URL and RUNDECK_TOKEN and retry).\n";

    throw new Error(errorMsg);
  }

  if (process.env.RUNDECK_SKIP_OPENAPI_VALIDATE !== "1") {
    const openApiDoc = loadOpenApiDocument(config.docsPath);
    if (openApiDoc) {
      const check = validateOpenApiRequest(openApiDoc, {
        method: params.method || "GET",
        endpoint: params.endpoint,
        query_params: params.query_params,
        body: params.body,
      });
      if (!check.ok && check.message) {
        throw new Error(`API request validation failed: ${check.message}`);
      }
    }
  }

  const apiBaseUrl = configManager.getApiBaseUrl();
  // Ensure apiBaseUrl ends with '/' and endpoint doesn't start with '/'
  // This prevents new URL() from discarding the /api/{version} path
  const baseUrlWithSlash = apiBaseUrl.endsWith('/') ? apiBaseUrl : apiBaseUrl + '/';
  const endpointWithoutSlash = params.endpoint.startsWith('/') ? params.endpoint.slice(1) : params.endpoint;
  const url = new URL(endpointWithoutSlash, baseUrlWithSlash);

  // Add query parameters
  if (params.query_params) {
    for (const [key, value] of Object.entries(params.query_params)) {
      url.searchParams.append(key, value);
    }
  }

  const headers: Record<string, string> = {
    "X-Rundeck-Auth-Token": config.apiToken,
    "Accept": "application/json",
    "Content-Type": params.content_type || "application/json",
  };

  const options: RequestInit = {
    method: params.method || "GET",
    headers,
  };

  const method = (params.method || "GET").toUpperCase();
  if (params.body && (method === "POST" || method === "PUT" || method === "PATCH")) {
    const effectiveContentType = params.content_type || "application/json";
    if (typeof params.body === "string") {
      options.body = params.body;
    } else if (effectiveContentType.includes("application/json")) {
      options.body = JSON.stringify(params.body);
    } else {
      throw new Error(
        `Non-JSON Content-Type '${effectiveContentType}' requires a pre-serialized string body. ` +
        "Use job_create (format: 'yaml') to generate the YAML string, then pass it as the body."
      );
    }
  }

  const timeoutMs = config.apiTimeoutMs;
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url.toString(), { ...options, signal: controller.signal });
    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });

    let body: unknown;
    const contentType = response.headers.get("content-type");
    if (contentType && contentType.includes("application/json")) {
      body = await response.json();
    } else {
      body = await response.text();
    }

    return {
      status: response.status,
      headers: responseHeaders,
      body,
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(
        `API call timed out after ${timeoutMs}ms calling ${params.method || "GET"} ${params.endpoint}. ` +
        "The Rundeck instance may be unreachable or overloaded. Set RUNDECK_API_TIMEOUT_MS to adjust the timeout."
      );
    }
    throw new Error(describeApiCallFailure(error, params.method || "GET", url.toString()));
  } finally {
    clearTimeout(timeoutHandle);
  }
}

/**
 * Setup Rundeck API token
 */
export function rundeckSetupToken(params: {
  rundeck_url: string;
  api_token: string;
  api_version?: string;
}): { success: boolean; message: string } {
  try {
    configManager.setRundeckConnection(
      params.rundeck_url,
      params.api_token,
      params.api_version
    );
    return {
      success: true,
      message: `Rundeck connection configured: ${params.rundeck_url} (API v${params.api_version || "59"})`,
    };
  } catch (error) {
    return {
      success: false,
      message: `Failed to configure connection: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * List available API endpoints
 */
export function rundeckListEndpoints(params?: {
  category?: string;
}): Array<{
  path: string;
  method: string;
  description?: string;
  category?: string;
}> {
  return listApiEndpoints(params?.category);
}

/**
 * True for `POST .../runnerManagement/runner/{id}/regenerateCreds` (system or project scoped) —
 * the only way to revoke a Runner's current credentials via the API. It immediately invalidates
 * the old token, so it's treated as destructive even though it's a POST, not a DELETE.
 */
export function isRunnerCredentialRegenerationEndpoint(endpoint: string): boolean {
  const path = endpoint
    .split("?")[0]
    .replace(/^\//, "")
    .replace(/^api\/\d+\//i, "");
  return /^(?:project\/[^/]+\/)?runnermanagement\/runner\/[^/]+\/regeneratecreds\/?$/i.test(path);
}

// Zod schemas for validation
export const rundeckApiCallSchema = z.object({
  endpoint: z.string().describe(
    "API endpoint path. Can be full path (e.g., '/api/59/projects') or relative (e.g., 'projects'). " +
    "Examples: 'projects', '/api/59/projects', 'job/{job-id}/run', 'execution/{execution-id}'"
  ),
  method: z.enum(["GET", "POST", "PUT", "DELETE", "PATCH"])
    .optional()
    .default("GET")
    .describe(
      "HTTP method. GET for retrieving data, POST for creating/triggering, PUT for updating, DELETE for removing, PATCH for partial updates. " +
      "Default: GET"
    ),
  body: z.union([z.record(z.unknown()), z.array(z.unknown()), z.string()])
    .optional()
    .describe(
      "Request body for POST/PUT/PATCH requests. Accepts a JSON object, a JSON array, or a pre-serialized JSON string (sent verbatim). " +
      "Example (run a job): {\"options\": {\"option-name\": \"value\"}, \"nodeFilters\": {\"name\": \"web-*\"}}. " +
      "Example (import jobs): [{\"name\": \"my-job\", \"project\": \"MyProject\", \"sequence\": {\"commands\": []}}] — the jobs import endpoint requires a JSON array."
    ),
  query_params: z.record(z.string())
    .optional()
    .describe(
      "Query parameters as key-value pairs. Names must match the OpenAPI definition for this route (validation uses docs/.vuepress/public/files/rundeck-api.yml). " +
      "Example: { max: '20', offset: '0' } for pagination"
    ),
  content_type: z.string()
    .optional()
    .describe(
      "Content-Type header for the request body. Default: 'application/json'. " +
      "Use 'application/yaml' when importing job definitions generated by job_create (YAML format). " +
      "Example: 'application/yaml' for POST project/{project}/jobs/import with a YAML body."
    ),
});

export const rundeckSetupTokenSchema = z.object({
  rundeck_url: z.string().url().describe("Base URL of Rundeck instance (e.g., 'https://rundeck.example.com')"),
  api_token: z.string().describe("API token for authentication"),
  api_version: z.string().optional().default("59").describe("API version to use"),
});

export const rundeckListEndpointsSchema = z.object({
  category: z.enum(["jobs", "projects", "executions", "system", "authentication", "general"])
    .optional()
    .describe(
      "Filter endpoints by category. " +
      "Options: 'jobs' (job management), 'projects' (project operations), 'executions' (execution history), " +
      "'system' (system info/metrics), 'authentication' (auth endpoints), 'general' (general endpoints). " +
      "If omitted, returns all endpoints."
    ),
});


