/**
 * API interaction tools
 */

import { z } from "zod";
import { configManager } from "../config.js";
import { listApiEndpoints } from "../resources/api.js";

/**
 * Execute a Rundeck API call
 */
export async function rundeckApiCall(params: {
  endpoint: string;
  method?: string;
  body?: unknown;
  query_params?: Record<string, string>;
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
    
    errorMsg += "Or call api_call without parameters for detailed setup guidance.";
    
    throw new Error(errorMsg);
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
    "Content-Type": "application/json",
  };

  const options: RequestInit = {
    method: params.method || "GET",
    headers,
  };

  if (params.body && (params.method === "POST" || params.method === "PUT" || params.method === "PATCH")) {
    options.body = JSON.stringify(params.body);
  }

  try {
    const response = await fetch(url.toString(), options);
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
    throw new Error(
      `API call failed: ${error instanceof Error ? error.message : String(error)}`
    );
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
      message: `Rundeck connection configured: ${params.rundeck_url} (API v${params.api_version || "46"})`,
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

// Zod schemas for validation
export const rundeckApiCallSchema = z.object({
  endpoint: z.string().describe(
    "API endpoint path. Can be full path (e.g., '/api/46/projects') or relative (e.g., 'projects'). " +
    "Examples: 'projects', '/api/46/projects', 'job/{job-id}/run', 'execution/{execution-id}'"
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
      "Request body for POST/PUT/PATCH requests. Can be a JSON object, a JSON array, or a pre-serialized JSON string. " +
      "Example (run a job): { options: { 'option-name': 'value' }, nodeFilters: { name: 'web-*' } }. " +
      "Example (import jobs): [ { id: '...', name: '...', ... }, { ... } ] — the jobs import endpoint requires a raw JSON array."
    ),
  query_params: z.record(z.string())
    .optional()
    .describe(
      "Query parameters as key-value pairs. " +
      "Example: { max: '20', offset: '0' } for pagination"
    ),
});

export const rundeckSetupTokenSchema = z.object({
  rundeck_url: z.string().url().describe("Base URL of Rundeck instance (e.g., 'https://rundeck.example.com')"),
  api_token: z.string().describe("API token for authentication"),
  api_version: z.string().optional().default("46").describe("API version to use"),
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


