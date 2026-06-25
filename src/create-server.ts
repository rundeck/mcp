/**
 * Rundeck MCP Server factory
 * Creates and configures a Server instance with all handlers.
 * Used by both the stdio (index.ts) and HTTP (http.ts) entry points.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { handleResource, listResources } from "./resources/index.js";
import {
  rundeckApiCall,
  rundeckListEndpoints,
  rundeckApiCallSchema,
  rundeckListEndpointsSchema,
} from "./tools/api.js";
import {
  rundeckGenerateJob,
  rundeckValidateJob,
  rundeckGenerateJobSchema,
  rundeckValidateJobSchema,
} from "./tools/jobs.js";
import { rundeckSearchDocs, rundeckSearchDocsSchema } from "./tools/search.js";
import { configManager } from "./config.js";
import { logger } from "./utils/logger.js";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import {
  getJobCreationGuidance,
  getApiCallGuidance,
} from "./utils/guidance.js";
import { prompts, getPrompt } from "./prompts/index.js";

// Convert Zod schemas to JSON Schema (lazy conversion to avoid memory issues)
function convertSchema(schema: any): any {
  try {
    return zodToJsonSchema(schema);
  } catch (error) {
    logger.error("Error converting schema", error);
    return { type: "object", properties: {} };
  }
}

function needsGuidance(params: unknown, requiredFields: string[]): boolean {
  if (!params || typeof params !== "object") return true;
  const args = params as Record<string, unknown>;
  return requiredFields.some(
    (field) => !(field in args) || args[field] === undefined || args[field] === null
  );
}

function returnGuidance(guidanceContent: string) {
  return { content: [{ type: "text", text: guidanceContent }] };
}

/**
 * Creates and returns a fully configured Rundeck MCP Server.
 * Call once per transport connection.
 */
export function createRundeckMcpServer(): Server {
  configManager.initialize();

  const server = new Server(
    { name: "rundeck-docs", version: "1.0.0" },
    { capabilities: { resources: {}, tools: {}, prompts: {} } }
  );

  // ── Resources ──────────────────────────────────────────────────────────────

  server.setRequestHandler(ListResourcesRequestSchema, async (request) => {
    logger.logRequest("resources/list", request.params);
    const resources = listResources();
    const result = {
      resources: resources.map((r) => ({
        uri: r.uri,
        name: r.description,
        mimeType: "text/markdown",
        description: r.description,
      })),
    };
    logger.logResponse("resources/list", result);
    return result;
  });

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const uri = request.params.uri;
    logger.logRequest("resources/read", request.params);
    logger.logResourceAccess(uri);
    const content = handleResource(uri);
    const result = {
      contents: [{ uri, mimeType: "text/markdown", text: content }],
    };
    logger.logResponse("resources/read", result);
    return result;
  });

  // ── Tools ──────────────────────────────────────────────────────────────────

  server.setRequestHandler(ListToolsRequestSchema, async (request) => {
    logger.logRequest("tools/list", request.params);
    const tools = [
      {
        name: "api_call",
        description: `Execute a Rundeck API call to interact with a Rundeck instance.

**When to use:**
- Making API requests to Rundeck (GET, POST, PUT, DELETE, PATCH)
- Querying projects, jobs, executions, nodes, or system information
- Triggering job executions via API
- Managing Rundeck resources programmatically

**When NOT to use:**
- Reading documentation (use resources instead: rundeck://docs/*)
- Creating job definitions (use job_create instead)
- Validating job definitions (use job_validate instead)

**Authentication:** Set RUNDECK_URL and RUNDECK_TOKEN environment variables before calling.
Call without required params for setup guidance.`,
        inputSchema: convertSchema(rundeckApiCallSchema),
      },
      {
        name: "api_list",
        description: `List available Rundeck API endpoints with descriptions and categories.

**When to use:**
- Discovering available API endpoints
- Finding endpoints for specific categories (jobs, projects, executions, etc.)
- Understanding API structure before making calls

**When NOT to use:**
- Making actual API calls (use api_call instead)
- Reading API documentation (use rundeck://api resource instead)

**Example:** List all job-related endpoints by calling with category: "jobs"`,
        inputSchema: convertSchema(rundeckListEndpointsSchema),
      },
      {
        name: "job_create",
        description: `Generate a Rundeck job definition in YAML or JSON format.

**When to use:**
- Creating new job definitions from structured parameters
- Generating job YAML/JSON for import into Rundeck
- Building jobs programmatically

**When NOT to use:**
- Validating existing job definitions (use job_validate instead)
- Making API calls (use api_call instead)
- Reading job documentation (use rundeck://docs/manual/jobs resource instead)

**Guidance Mode:** Call without required params (name, project, workflow_steps) to get step-by-step guidance on job creation.
**Resources:** See rundeck://docs/manual/jobs for comprehensive job documentation.`,
        inputSchema: convertSchema(rundeckGenerateJobSchema),
      },
      {
        name: "job_validate",
        description: `Validate a Rundeck job definition against Rundeck schemas.

**When to use:**
- Validating job YAML/JSON before importing
- Checking job syntax and structure
- Debugging job definition errors

**When NOT to use:**
- Creating job definitions (use job_create instead)
- Making API calls (use api_call instead)
- Reading job schema (use rundeck://jobs/schema resource instead)

**Guidance Mode:** Call without required params (job_definition, format) to get validation guidance.
**Output:** Returns validation result with errors and warnings.`,
        inputSchema: convertSchema(rundeckValidateJobSchema),
      },
      {
        name: "docs_search",
        description: `Search local Rundeck documentation (markdown under RUNDECK_DOCS_PATH) by keywords and phrases.

**When to use:**
- Finding where a topic, term, or feature is documented before opening a resource
- Exploring the docs when you do not know the exact \`rundeck://\` URI
- Getting ranked excerpts and file paths to narrow which resource to read next

**When NOT to use:**
- Reading a full document you already identified (use resources/read with the \`rundeck://...\` URI)
- Making API calls to a Rundeck server (use api_call)
- Generating jobs (use job_create)

**Follow-up:** Prefer \`resources/read\` on the best match for complete, authoritative content.`,
        inputSchema: convertSchema(rundeckSearchDocsSchema),
      },
    ];
    logger.info(`Returning ${tools.length} tools`);
    const result = { tools };
    logger.logResponse("tools/list", result);
    return result;
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    logger.logRequest("tools/call", request.params);
    logger.logToolCall(name, args);

    try {
      switch (name) {
        case "api_call":
          if (needsGuidance(args, ["endpoint"])) {
            logger.info("api_call called without required params - returning guidance");
            return returnGuidance(getApiCallGuidance());
          }
          const apiResult = await rundeckApiCall(args as any);
          return { content: [{ type: "text", text: JSON.stringify(apiResult, null, 2) }] };

        case "api_list":
          const endpoints = rundeckListEndpoints(args as any);
          return { content: [{ type: "text", text: JSON.stringify(endpoints, null, 2) }] };

        case "job_create":
          if (needsGuidance(args, ["name", "project", "workflow_steps"])) {
            logger.info("job_create called without required params - returning guidance");
            return returnGuidance(getJobCreationGuidance());
          }
          const jobDef = rundeckGenerateJob(args as any);
          return { content: [{ type: "text", text: jobDef }] };

        case "job_validate":
          if (needsGuidance(args, ["job_definition", "format"])) {
            logger.info("job_validate called without required params - returning guidance");
            return returnGuidance(`# Validating a Rundeck Job

## Overview
Validate a Rundeck job definition to ensure it follows the correct schema and format.

## Required Parameters
- **job_definition** (string): The job definition as a YAML or JSON string
- **format** ("yaml" | "json"): The format of the job definition

## Usage Example
\`\`\`
job_validate({
  job_definition: "name: My Job\\nproject: my-project\\n...",
  format: "yaml"
})
\`\`\`

## Resources
- Job Schema: \`rundeck://jobs/schema\`
- Job Creation Guide: Call \`job_create\` without parameters`);
          }
          const validation = rundeckValidateJob(args as any);
          return { content: [{ type: "text", text: JSON.stringify(validation, null, 2) }] };

        case "docs_search": {
          const parsed = rundeckSearchDocsSchema.parse(args ?? {});
          const searchHits = rundeckSearchDocs(parsed);
          return { content: [{ type: "text", text: JSON.stringify(searchHits, null, 2) }] };
        }

        default:
          logger.warn(`Unknown tool requested: ${name}`);
          throw new Error(
            `Unknown tool: ${name}. Available tools: api_call, api_list, job_create, job_validate, docs_search.`
          );
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Tool error for ${name}`, error);
      return {
        content: [{ type: "text", text: `Error executing tool '${name}': ${errorMessage}` }],
        isError: true,
      };
    }
  });

  // ── Prompts ────────────────────────────────────────────────────────────────

  server.setRequestHandler(ListPromptsRequestSchema, async (request) => {
    logger.logRequest("prompts/list", request.params);
    const promptList = prompts.map((prompt) => ({
      name: prompt.name,
      description: prompt.description,
      arguments: (prompt.arguments ?? []).map((arg) => ({
        name: arg.name,
        description: arg.description,
        required: arg.required,
      })),
    }));
    logger.info(`Returning ${promptList.length} prompts`);
    const result = { prompts: promptList };
    logger.logResponse("prompts/list", result);
    return result;
  });

  server.setRequestHandler(GetPromptRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    logger.logRequest("prompts/get", request.params);

    try {
      const prompt = getPrompt(name);
      if (!prompt) {
        const availablePrompts = prompts.map((p) => p.name).join(", ");
        const errorMessage = `Prompt "${name}" not found. Available prompts: ${availablePrompts}`;
        logger.warn(errorMessage);
        return { content: [{ type: "text", text: errorMessage }], isError: true };
      }

      if (prompt.argumentSchema && args) {
        try {
          prompt.argumentSchema.parse(args);
        } catch (validationError) {
          if (validationError instanceof z.ZodError) {
            const errorMessages = validationError.errors
              .map((err) => `${err.path.join(".")}: ${err.message}`)
              .join("; ");
            const errorMessage = `Invalid arguments for prompt "${name}": ${errorMessages}`;
            logger.warn(errorMessage);
            return { content: [{ type: "text", text: errorMessage }], isError: true };
          }
        }
      }

      if (prompt.arguments) {
        const missingRequired = prompt.arguments
          .filter((arg) => arg.required && (!args || !(arg.name in args)))
          .map((arg) => arg.name);
        if (missingRequired.length > 0) {
          const errorMessage = `Missing required arguments for prompt "${name}": ${missingRequired.join(", ")}`;
          logger.warn(errorMessage);
          return { content: [{ type: "text", text: errorMessage }], isError: true };
        }
      }

      const content = prompt.getContent(args || {});
      logger.logResponse("prompts/get", { name, hasContent: !!content });
      return { messages: [{ role: "user", content: { type: "text", text: content } }] };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Error getting prompt "${name}":`, errorMessage);
      return {
        content: [{ type: "text", text: `Error retrieving prompt "${name}": ${errorMessage}` }],
        isError: true,
      };
    }
  });

  // ── Error handler ──────────────────────────────────────────────────────────

  server.onerror = (error) => {
    logger.error("MCP server error", error);
  };

  return server;
}